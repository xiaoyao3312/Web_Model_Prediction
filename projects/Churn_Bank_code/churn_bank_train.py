# churn_bank_train.py
# 銀行客戶流失預測 - XGBoost 兼容版 (適用於 xgboost==1.7.6)
# 確保環境已安裝必要的庫: pip install numpy pandas optuna xgboost==1.7.6 joblib

import logging
import warnings
import argparse
import sys
import os # 新增: 處理文件路徑和保存
from typing import Any, Callable, Tuple, Dict, List

# 檢查必要的庫是否已安裝
try:
    import numpy as np
    import pandas as pd
    # 注意: 如果不需要繪圖，可以移除 matplotlib 的檢查
    from xgboost import XGBClassifier
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import roc_auc_score, average_precision_score
    from sklearn.base import clone
    import joblib # 導入 joblib 用於模型保存
    import optuna
except ImportError as e:
    print(f"錯誤: 缺少必要的庫。請執行 pip install numpy pandas xgboost==1.7.6 joblib scikit-learn: {e}")
    sys.exit(1)

# 設置警告和日誌
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('MainScript')

# --- 配置 ---
class Config:
    TARGET_COL = 'Exited'
    N_SPLITS = 5
    RANDOM_STATE = 42

# --- 特徵工程類別 (內容不變，為保持簡潔省略細節) ---
class FeatureEngineer:
    # ... (map_columns, cast_columns, run_v1_preprocessing, run_v2_preprocessing 保持不變)
    @staticmethod
    def map_columns(df: pd.DataFrame, mappings: dict) -> pd.DataFrame:
        df_copy = df.copy()
        for col, mapping in mappings.items():
            if col in df_copy.columns:
                df_copy[col] = df_copy[col].map(mapping)
        return df_copy

    @staticmethod
    def cast_columns(df: pd.DataFrame, int_cols: Any = None,
                     cat_cols: Any = None) -> pd.DataFrame:
        df_copy = df.copy()
        if int_cols:
            for col in int_cols:
                if col in df_copy.columns:
                    df_copy[col] = df_copy[col].astype(int)
        if cat_cols:
            for col in cat_cols:
                if col in df_copy.columns:
                    df_copy[col] = df_copy[col].astype('category')
        return df_copy

    @staticmethod
    def run_v1_preprocessing(df: pd.DataFrame, is_train: bool) -> pd.DataFrame:
        df_copy = df.copy()
        gender_map = {'Male': 0, 'Female': 1}
        df_copy = FeatureEngineer.map_columns(df_copy, {'Gender': gender_map})

        df_copy['Age_bin'] = pd.cut(df_copy['Age'], bins=[0, 25, 35, 45, 60, np.inf],
                                     labels=['very_young', 'young', 'mid', 'mature', 'senior'])

        df_copy['Is_two_products'] = (df_copy['NumOfProducts'] == 2).astype(int)
        df_copy['Germany_Female'] = ((df_copy['Geography'] == 'Germany') & (df_copy['Gender'] == 1)).astype(int)
        df_copy['Germany_Inactive'] = ((df_copy['Geography'] == 'Germany') & (df_copy['IsActiveMember'] == 0)).astype(int)
        df_copy['Has_Zero_Balance'] = (df_copy['Balance'] == 0).astype(int)

        df_copy['Tenure_log'] = np.log1p(df_copy['Tenure'])

        int_cols = ['HasCrCard', 'IsActiveMember', 'NumOfProducts', 'Is_two_products', 'Has_Zero_Balance',
                    'Germany_Female', 'Germany_Inactive']
        cat_cols = ['Geography', 'Age_bin']

        df_copy = FeatureEngineer.cast_columns(df_copy, int_cols=int_cols, cat_cols=cat_cols)

        cols_to_drop = ['CustomerId', 'Tenure','Surname', 'RowNumber' ]
        if is_train and 'Exited' in df_copy.columns:
            cols_to_drop.append('Exited')

        df_copy.drop(columns=[col for col in cols_to_drop if col in df_copy.columns], inplace=True, errors='ignore')
        return df_copy

    @staticmethod
    def run_v2_preprocessing(df: pd.DataFrame, is_train: bool) -> pd.DataFrame:
        """版本 2：V1 + 新旗標 is_mature_inactive_transit。"""
        df_copy = FeatureEngineer.run_v1_preprocessing(df.copy(), is_train=False)

        df_copy['is_mature_inactive_transit'] = (
                    (df_copy['Has_Zero_Balance'] == 1) & (df_copy['IsActiveMember'] == 0) & (
                    df_copy['Age'] > 40)).astype(int)
        
        if is_train and 'Exited' in df.columns:
            df_copy.drop(columns=['Exited'], inplace=True, errors='ignore')

        return df_copy
    
# --- Optuna 超參數調優 (保持 dummy 結構) ---
class HyperparameterTuner:
    @staticmethod
    def _objective(trial: optuna.Trial, X: pd.DataFrame, y: pd.Series, cat_feature_names: List[str]) -> float:
        logger.warning("Optuna objective 函數尚未實現。")
        return 0.5 

    @staticmethod
    def tune(X: pd.DataFrame, y: pd.Series, cat_feature_names: List[str], n_trials: int) -> dict:
        logger.warning("HyperparameterTuner.tune 函數尚未實現。")
        return {}


# --- 模型訓練器類別 ---
class ModelTrainer:
    """協調器類別，用於統一模型訓練、評估和預測的流程。"""

    def __init__(self, n_splits: int = Config.N_SPLITS, random_state: int = Config.RANDOM_STATE):
        self.n_splits = n_splits
        self.random_state = random_state
        self.logger = logging.getLogger(self.__class__.__name__)

    def run_experiment(self,
                       train_df: pd.DataFrame,
                       test_df: pd.DataFrame,
                       feature_engineering_pipeline: Callable,
                       models: Dict[str, Any],
                       target_col: str = Config.TARGET_COL) -> Tuple[pd.DataFrame, Dict, Any]: # 新增返回訓練好的模型
        """啟動完整的實驗週期：特徵工程 (FE)、訓練、生成提交文件，並返回最佳模型。"""
        self.logger.info(f"--- 啟動新實驗 (特徵工程 FE: {feature_engineering_pipeline.__name__}) ---")

        if train_df.empty:
            self.logger.error("訓練數據為空，無法運行實驗。")
            return pd.DataFrame(), {}, None

        if 'id' not in test_df.columns:
             self.logger.error("測試集缺少 'id' 欄位，無法生成提交文件。")
             return pd.DataFrame(), {}, None
             
        test_ids = test_df['id'].copy()
        y_train = train_df[target_col].astype(int)

        # 1. 特徵工程
        self.logger.info("步驟 1: 應用特徵工程...")
        X_train_processed = feature_engineering_pipeline(train_df.drop(columns=[target_col], errors='ignore'), is_train=True)
        X_test_processed = feature_engineering_pipeline(test_df, is_train=False)
        
        # 對齊欄位
        train_cols = set(X_train_processed.columns)
        test_cols = set(X_test_processed.columns)
        shared_cols = list(train_cols.intersection(test_cols))
        
        X_train_processed = X_train_processed[shared_cols]
        X_test_processed = X_test_processed[shared_cols]
        self.logger.info(f"最終特徵數: {len(shared_cols)}")
        
        # 2. 訓練與評估模型 (調整返回的結果以包含完整的訓練模型)
        self.logger.info("步驟 2: 在交叉驗證上訓練模型...")
        all_results, trained_models = self._evaluate_models(models, X_train_processed, y_train, X_test_processed)

        # 3. 確定最佳模型名稱
        best_roc_auc = -1.0
        best_model_name = None
        best_model = None

        for name, result in all_results.items():
            if not result['metrics_df'].empty:
                current_auc = result['metrics_df']['ROC AUC'].mean()
                if current_auc > best_roc_auc:
                    best_roc_auc = current_auc
                    best_model_name = name
                    best_model = trained_models.get(name) # 獲取訓練好的模型

        if best_model_name is None or best_model is None:
            self.logger.error("沒有模型成功訓練或評估。")
            return pd.DataFrame(), all_results, None
            
        self.logger.info(f"步驟 3: 性能最佳的模型名稱: {best_model_name} (CV ROC AUC: {best_roc_auc:.4f})")

        # 4. 生成提交文件
        self.logger.info("步驟 4: 生成提交文件...")
        submission_df = self._generate_submission(
            f"submission_{best_model_name}_{feature_engineering_pipeline.__name__}.csv",
            test_ids,
            all_results[best_model_name]['test_preds']
        )

        self.logger.info("--- 實驗成功完成 ---")
        return submission_df, all_results, best_model # 返回訓練好的模型

    def _evaluate_models(self, models: Dict[str, Any], X_train: pd.DataFrame, y_train: pd.Series, X_test: pd.DataFrame) -> Tuple[Dict, Dict]:
        """
        使用交叉驗證訓練和驗證模型，並返回每個模型的最終訓練實例。
        """
        self.logger.info("啟動交叉驗證...")
        skf = StratifiedKFold(n_splits=self.n_splits, shuffle=True, random_state=self.random_state)
        results = {}
        trained_models = {} # 新增: 用於保存訓練完成的模型實例

        for name, model in models.items():
            self.logger.info(f"正在訓練模型: {name}")
            oof_preds = np.zeros(len(X_train))
            test_preds_folds, fold_metrics_list, importances_folds = [], [], []
            final_model_instance = None # 保存最後一個折疊訓練的模型實例（通常用於單模型輸出）

            for fold, (train_idx, val_idx) in enumerate(skf.split(X_train, y_train)):
                X_tr, X_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
                y_tr, y_val = y_train.iloc[train_idx], y_train.iloc[val_idx]

                current_model = clone(model)
                fit_params = {}

                # 兼容 XGBoost 1.7.6
                if isinstance(current_model, XGBClassifier):
                    fit_params['eval_set'] = [(X_val, y_val)]
                    fit_params['verbose'] = False

                try:
                    current_model.fit(X_tr, y_tr, **fit_params)

                    best_iteration = current_model.get_booster().best_iteration

                    proba_val = current_model.predict_proba(X_val, iteration_range=(0, best_iteration))[:, 1]
                    proba_test = current_model.predict_proba(X_test, iteration_range=(0, best_iteration))[:, 1]

                    oof_preds[val_idx] = proba_val
                    test_preds_folds.append(proba_test)
                    fold_metrics_list.append(
                        {'ROC AUC': roc_auc_score(y_val, proba_val), 'PR AUC': average_precision_score(y_val, proba_val)})
                    
                    if hasattr(current_model, 'feature_importances_'):
                        importances_folds.append(current_model.feature_importances_)
                    
                    final_model_instance = current_model # 暫存此折疊模型
                    
                except Exception as e:
                    self.logger.error(f"模型 {name} 在折疊 {fold} 訓練時發生錯誤: {e}")
                    continue

            # 儲存結果
            results[name] = {
                'oof_preds': oof_preds,
                'test_preds': np.mean(test_preds_folds, axis=0) if test_preds_folds else np.zeros(len(X_test)),
                'metrics_df': pd.DataFrame(fold_metrics_list),
                'feature_importances': np.mean(importances_folds, axis=0) if importances_folds else None,
                'feature_names': X_train.columns
            }
            if final_model_instance:
                # 為了部署目的，我們通常需要一個在**完整數據集上重新訓練**的模型，或者使用 CV 中表現最佳或最後一個折疊的模型。
                # 為了簡化，這裡我們使用在**最後一個 CV 折疊**上訓練的模型作為代表。
                # **更嚴謹的做法是在 CV 結束後，用全部訓練數據重新訓練一次模型。**
                trained_models[name] = final_model_instance
            
            if not results[name]['metrics_df'].empty:
                self.logger.info(
                    f" 模型 {name} | CV ROC AUC: {results[name]['metrics_df']['ROC AUC'].mean():.4f} ± {results[name]['metrics_df']['ROC AUC'].std():.4f}")
            else:
                 self.logger.warning(f"模型 {name} 訓練失敗，無法計算 CV ROC AUC。")
        return results, trained_models

    def _generate_submission(self, filename: str, df_test_id: pd.Series, test_preds: np.ndarray) -> pd.DataFrame:
        submission_df = pd.DataFrame({'id': df_test_id, 'Exited': test_preds})
        submission_df.to_csv(filename, index=False)
        self.logger.info(f"提交文件成功保存: {filename}")
        return submission_df
    
    def save_model(self, model: Any, fe_pipeline_name: str, model_name: str, output_path: str = './') -> str:
        """使用 joblib 保存模型，並返回文件路徑。"""
        filename = f"{model_name}_{fe_pipeline_name}.joblib"
        full_path = os.path.join(output_path, filename)
        try:
            joblib.dump(model, full_path)
            self.logger.info(f"模型成功保存至: {full_path}")
            return full_path
        except Exception as e:
            self.logger.error(f"保存模型時發生錯誤: {e}")
            return ""

# --- 主執行函數 ---
def main(train_file: str, test_file: str):
    
    logger.info(f"開始執行腳本。訓練文件: {train_file}, 測試文件: {test_file}")
    
    # 數據加載
    try:
        df_train = pd.read_csv(train_file)
        df_test = pd.read_csv(test_file)
        logger.info(f"訓練數據大小: {df_train.shape}, 測試數據大小: {df_test.shape}")
    except FileNotFoundError:
        logger.error("錯誤：請確保訓練和測試文件存在於指定路徑。")
        return
    except Exception as e:
        logger.error(f"數據加載時發生錯誤: {e}")
        return

    # 實例化訓練器
    trainer = ModelTrainer()

    # 模型參數
    final_best_params = {
        'n_estimators': 2692,
        'learning_rate': 0.05786197845936901,
        'max_depth': 3,
        'reg_lambda': 1.0628185137032307e-08,
        'reg_alpha': 3.255737505871401,
        'subsample': 0.8409191153520594,
        'colsample_bytree': 0.7834673458794292,
        'random_state': Config.RANDOM_STATE,
        'eval_metric': 'logloss',
        'n_jobs': -1,
        'early_stopping_rounds': 50,
        'enable_categorical': True, 
        'verbose': 0
    }

    final_tuned_model = XGBClassifier(**final_best_params)
    MODEL_NAME = 'XGBoost_Final_Tuned'
    models_final = {MODEL_NAME: final_tuned_model}
    best_fe_pipeline = FeatureEngineer.run_v2_preprocessing
    FE_PIPELINE_NAME = best_fe_pipeline.__name__

    # 運行最終實驗 (現在會返回 best_model)
    submission_final, results_final, best_model = trainer.run_experiment(
        train_df=df_train,
        test_df=df_test,
        feature_engineering_pipeline=best_fe_pipeline,
        models=models_final
    )

    if not submission_final.empty and best_model:
        logger.info("腳本執行完畢，提交文件已生成。")
        
        # --- 步驟 5: 保存模型 ---
        trainer.save_model(
            model=best_model, 
            fe_pipeline_name=FE_PIPELINE_NAME, 
            model_name=MODEL_NAME, 
            output_path='./' # 保存到當前目錄 (Churn_Bank_code)
        )
        # ------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="銀行客戶流失預測 - XGBoost 兼容版訓練腳本")
    parser.add_argument("--train_file", type=str, default="train.csv", help="訓練數據文件路徑")
    parser.add_argument("--test_file", type=str, default="test.csv", help="測試數據文件路徑")
    
    args = parser.parse_args()
    
    # 執行主函數
    main(args.train_file, args.test_file)