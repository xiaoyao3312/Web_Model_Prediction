# C:\Users\user\Desktop\Web_Model_Prediction\projects\Churn_Bank_code\churn_bank_train.py
# 銀行客戶流失預測 - XGBoost Optuna/SHAP 整合版 (訓練部分)

import logging
import warnings
import argparse
import sys
import os 
from typing import Any, Callable, Tuple, Dict, List
import joblib 

# 設置警告和日誌
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('MainScript')

# 檢查必要的庫是否已安裝
try:
    import numpy as np
    import pandas as pd
    from xgboost import XGBClassifier
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import roc_auc_score
    from sklearn.base import clone
    import optuna
except ImportError as e:
    print(f"錯誤: 缺少必要的庫。請執行 pip install numpy pandas xgboost optuna scikit-learn shap: {e}")
    sys.exit(1)


# --- 配置 ---
class Config:
    TARGET_COL = 'Exited'
    N_SPLITS = 5
    RANDOM_STATE = 42
    # 模型將輸出到當前執行目錄 (即 CWD)
    MODEL_DIR = './' 
    FE_PIPELINE_FILE = os.path.join(MODEL_DIR, 'feature_engineer_pipeline.joblib')

# --- 特徵工程類別 (FeatureEngineer) ---
class FeatureEngineer:
    """
    用於特徵工程的工具類別。
    """
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
                    # 避免轉換 NaN，填充為 0
                    df_copy[col] = df_copy[col].fillna(0).astype(int) 
        return df_copy

    @staticmethod
    def run_v1_preprocessing(df: pd.DataFrame, is_train: bool) -> pd.DataFrame:
        df_copy = df.copy()
        gender_map = {'Male': 0, 'Female': 1}
        
        # 1. 處理 Gender: 將 'Male'/'Female' 轉換為 0/1
        df_copy = FeatureEngineer.map_columns(df_copy, {'Gender': gender_map}) 
        
        # ⭐ 修正：在強制轉換為 int 之前，將映射後產生的 NaN 填充為 0。
        if 'Gender' in df_copy.columns:
            # 訓練集和測試集都可能有 NaN
            df_copy['Gender'] = df_copy['Gender'].fillna(0)
            df_copy['Gender'] = df_copy['Gender'].astype(int) # 確保 Gender 類型是 int

        # 2. 處理 Geography: 確保它是字串
        if 'Geography' in df_copy.columns and df_copy['Geography'].dtype.name != 'object':
             df_copy['Geography'] = df_copy['Geography'].astype(str)
        
        # 年齡分箱
        if 'Age' in df_copy.columns:
            df_copy['Age_bin'] = pd.cut(df_copy['Age'], bins=[0, 25, 35, 45, 60, np.inf],
                                     labels=['very_young', 'young', 'mid', 'mature', 'senior']).astype(str)
        else:
            df_copy['Age_bin'] = 'unknown'
        
        # 創建基礎特徵旗標 (保持 int 類型)
        # 確保涉及 Balance, IsActiveMember 的欄位存在
        if 'NumOfProducts' in df_copy.columns:
            df_copy['Is_two_products'] = (df_copy['NumOfProducts'] == 2)
        else:
            df_copy['Is_two_products'] = 0
            
        if 'Geography' in df_copy.columns and 'Gender' in df_copy.columns:
            df_copy['Germany_Female'] = ((df_copy['Geography'] == 'Germany') & (df_copy['Gender'] == 1))
        else:
            df_copy['Germany_Female'] = 0

        if 'Geography' in df_copy.columns and 'IsActiveMember' in df_copy.columns:
            df_copy['Germany_Inactive'] = ((df_copy['Geography'] == 'Germany') & (df_copy['IsActiveMember'] == 0))
        else:
            df_copy['Germany_Inactive'] = 0
            
        if 'Balance' in df_copy.columns:
            df_copy['Has_Zero_Balance'] = (df_copy['Balance'] == 0)
        else:
            df_copy['Has_Zero_Balance'] = 0

        # 對 Tenure 進行 Log 轉換 (確保 Tenure 存在)
        if 'Tenure' in df_copy.columns:
            df_copy['Tenure_log'] = np.log1p(df_copy['Tenure'])
        else:
            df_copy['Tenure_log'] = 0.0

        # 將布林類型轉換為 int
        for col in ['Is_two_products', 'Germany_Female', 'Germany_Inactive', 'Has_Zero_Balance']:
            if col in df_copy.columns:
                 df_copy[col] = df_copy[col].astype(int)

        int_cols = ['HasCrCard', 'IsActiveMember', 'NumOfProducts', 'Is_two_products', 'Has_Zero_Balance',
                    'Germany_Female', 'Germany_Inactive', 'Gender'] # Gender 已經是 0/1

        df_copy = FeatureEngineer.cast_columns(df_copy, int_cols=int_cols, cat_cols=None) 


        # 移除不必要的原始欄位
        cols_to_drop = ['id','CustomerId', 'Tenure','Surname', 'RowNumber' ] 
        if is_train and 'Exited' in df_copy.columns:
            cols_to_drop.append('Exited') 

        df_copy.drop(columns=[col for col in cols_to_drop if col in df_copy.columns], inplace=True, errors='ignore')
        
        # 確保所有數值列都是浮點數
        for col in df_copy.columns:
            if df_copy[col].dtype.name not in ['object', 'category', 'str']:
                 if col not in int_cols: 
                      df_copy[col] = df_copy[col].astype(float) 

        return df_copy

    @staticmethod
    def run_v2_preprocessing(df: pd.DataFrame, is_train: bool) -> pd.DataFrame:
        """
        版本 2：V1 + 新旗標 is_mature_inactive_transit。
        """
        original_df = df.copy() 
        
        # 使用 V1 管道作為基礎
        df_copy = FeatureEngineer.run_v1_preprocessing(original_df.copy(), is_train=is_train)

        # 創建新的交互特徵 (確保 Balance, IsActiveMember, Age 存在)
        if all(col in original_df.columns for col in ['Balance', 'IsActiveMember', 'Age']):
            df_copy['is_mature_inactive_transit'] = (
                                                        (original_df['Balance'] == 0) & 
                                                        (original_df['IsActiveMember'] == 0) & 
                                                        (original_df['Age'] > 40)).astype(int)
        else:
            df_copy['is_mature_inactive_transit'] = 0 # 缺失則設為 0
        
        # 確保新的旗標是 int
        df_copy['is_mature_inactive_transit'] = df_copy['is_mature_inactive_transit'].astype(int)
        
        # 移除目標欄位
        if Config.TARGET_COL in df_copy.columns: 
             df_copy.drop(columns=[Config.TARGET_COL], inplace=True, errors='ignore')
        
        return df_copy
    
    # 將所有 FE 管道的名稱對應到函數本身，用於保存 FE 邏輯
    FE_PIPELINES: Dict[str, Callable] = {
        'run_v2_preprocessing': run_v2_preprocessing,
        'run_v1_preprocessing': run_v1_preprocessing,
    }


# --- Optuna 超參數調優 (HyperparameterTuner) ---
class HyperparameterTuner:
    """超參數調優類別，使用 Optuna 進行優化。專注於 XGBoost 的調優。"""
    
    @staticmethod
    def _objective(trial: optuna.Trial, X: pd.DataFrame, y: pd.Series) -> float:
        """Optuna 的目標函數：使用交叉驗證評估一組超參數。"""
        params = {
            'n_estimators': trial.suggest_int('n_estimators', 500, 3000),
            'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'max_depth': trial.suggest_int('max_depth', 3, 10),
            'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
            'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
            'subsample': trial.suggest_float('subsample', 0.5, 1.0),
            'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0),
        }

        fixed_params = {
            'random_state': Config.RANDOM_STATE,
            'verbose': 0,
            'eval_metric': 'logloss',
            'n_jobs': -1,
            'early_stopping_rounds': 50,
            'enable_categorical': False, 
        }

        full_params = {**params, **fixed_params}
        model = XGBClassifier(**full_params)
        skf = StratifiedKFold(n_splits=Config.N_SPLITS, shuffle=True, random_state=fixed_params['random_state'])
        roc_auc_scores = []

        for fold, (train_idx, val_idx) in enumerate(skf.split(X, y)):
            X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
            y_tr, y_val = y.iloc[train_idx], y.iloc[val_idx]

            fit_params = {'eval_set': [(X_val, y_val)], 'verbose': False}

            try:
                model.fit(X_tr, y_tr, **fit_params)

                best_iteration = model.get_booster().best_iteration
                proba_val = model.predict_proba(X_val, iteration_range=(0, best_iteration))[:, 1]
                roc_auc_scores.append(roc_auc_score(y_val, proba_val))
            except Exception as e:
                logger.error(f"Optuna Fold {fold} 訓練錯誤: {e}")
                return 0.0

        return float(np.mean(roc_auc_scores))

    @staticmethod
    def tune(X: pd.DataFrame, y: pd.Series, n_trials: int) -> dict:
        """執行 Optuna 調優並返回最佳參數。"""
        optuna.logging.set_verbosity(optuna.logging.WARNING) 
        study = optuna.create_study(direction='maximize')
        objective_with_args = lambda trial: HyperparameterTuner._objective(trial, X, y)

        study.optimize(objective_with_args, n_trials=n_trials, show_progress_bar=True)

        logger.info(f"調優完成。最佳 ROC AUC: {study.best_value:.5f}")
        logger.info("最佳參數:")
        for key, value in study.best_params.items():
            logger.info(f"  {key}: {value}")

        return study.best_params

# --- 模型訓練器類別 (ModelTrainer) ---
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
                         target_col: str = Config.TARGET_COL) -> Tuple[pd.DataFrame, Dict[str, Any], Any, List[str]]: 
        """
        啟動完整的實驗週期：特徵工程 (FE)、訓練、生成提交文件，並返回最佳模型。
        """
        self.logger.info(f"--- 啟動新實驗 (FE: {feature_engineering_pipeline.__name__}) ---")

        test_ids = test_df['id'].copy()
        y_train = train_df[target_col].astype(int)

        # 1. 特徵工程
        self.logger.info("步驟 1: 應用特徵工程...")
        # 訓練集：丟棄目標列
        X_train_processed = feature_engineering_pipeline(train_df.drop(columns=[target_col], errors='ignore').copy(), is_train=True)
        # 測試集
        X_test_processed = feature_engineering_pipeline(test_df.copy(), is_train=False)

        # 🎯 處理類別欄位的 OHE
        
        # 找出訓練集和測試集中的類別欄位 (應該只有 object/str)
        cat_cols_train = [col for col in X_train_processed.columns if X_train_processed[col].dtype.name in ['object', 'str']]
        cat_cols_test = [col for col in X_test_processed.columns if X_test_processed[col].dtype.name in ['object', 'str']]
        cat_cols = list(set(cat_cols_train + cat_cols_test)) # 合併並去重

        # 對訓練集和測試集進行 One-Hot Encoding
        X_train_oh = pd.get_dummies(X_train_processed, columns=cat_cols, dummy_na=False)
        X_test_oh = pd.get_dummies(X_test_processed, columns=cat_cols, dummy_na=False)
        
        # 嚴格對齊 (這是必須的，確保測試集和訓練集有相同的 OHE 欄位)
        feature_names = X_train_oh.columns.tolist()
        
        # 補齊測試集缺少的欄位
        missing_cols_test = set(feature_names) - set(X_test_oh.columns)
        for c in missing_cols_test:
            X_test_oh[c] = 0
            
        # 移除多餘的欄位，並確保順序一致
        X_test_processed = X_test_oh[[col for col in feature_names if col in X_test_oh.columns]] # 確保順序
        X_train_processed = X_train_oh
        
        # 確保所有數據都是 float
        # 這是關鍵步驟，確保所有特徵 (包括 int 類型) 在進入模型前都是浮點數
        X_train_processed = X_train_processed.astype(float)
        X_test_processed = X_test_processed.astype(float)
        
        self.logger.info(f"最終特徵數 (OHE後): {len(feature_names)}")
        
        # 2. 訓練與評估模型
        self.logger.info("步驟 2: 在交叉驗證上訓練模型...")
        
        models_no_cat = {}
        for name, model in models.items():
            if isinstance(model, XGBClassifier):
                # 再次確認禁用內建類別特徵處理
                model.set_params(enable_categorical=False) 
            models_no_cat[name] = model

        all_results, trained_models = self._evaluate_models(models_no_cat, X_train_processed, y_train, X_test_processed)

        # 3. 確定最佳模型名稱
        self.logger.info("步驟 3: 確定性能最佳的模型名稱...")
        best_roc_auc = -1.0
        best_model_name = None
        best_model = None

        for name, result in all_results.items():
            if not result['metrics_df'].empty:
                current_auc = result['metrics_df']['ROC AUC'].mean()
                if current_auc > best_roc_auc:
                    best_roc_auc = current_auc
                    best_model_name = name
                    best_model = trained_models.get(name)

        if not best_model_name:
            self.logger.error("沒有模型成功訓練或評估。")
            return pd.DataFrame(), all_results, None, [] 

        self.logger.info(f"最佳模型: {best_model_name} (CV ROC AUC: {best_roc_auc:.4f})")

        # 4. 生成提交文件
        self.logger.info("步驟 4: 生成提交文件...")
        submission_df = self._generate_submission(
            f"submission_{best_model_name}_{feature_engineering_pipeline.__name__}.csv",
            test_ids,
            all_results[best_model_name]['test_preds']
        )

        self.logger.info("--- 實驗成功完成 ---")
        # 返回訓練模型使用的特徵集，用於後續 SHAP
        return submission_df, all_results, best_model, feature_names


    def _evaluate_models(self, models: Dict[str, Any], X_train: pd.DataFrame, y_train: pd.Series, X_test: pd.DataFrame) -> Tuple[Dict, Dict]: 
        """使用交叉驗證訓練和驗證模型，並返回每個模型的最終訓練實例。"""
        self.logger.info("啟動交叉驗證...")
        skf = StratifiedKFold(n_splits=self.n_splits, shuffle=True, random_state=self.random_state)
        results = {}
        trained_models = {}

        for name, model in models.items():
            self.logger.info(f"正在訓練模型: {name}")
            oof_preds = np.zeros(len(X_train))
            test_preds_folds, fold_metrics_list = [], []
            final_model_instance = None # 保存最後一個折疊訓練的模型實例

            # 進行 K 折交叉驗證
            for fold, (train_idx, val_idx) in enumerate(skf.split(X_train, y_train)):
                X_tr, X_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
                y_tr, y_val = y_train.iloc[train_idx], y_train.iloc[val_idx]

                current_model = clone(model)
                fit_params = {}

                try:
                    # --- XGBoost 特定邏輯 ---
                    if isinstance(current_model, XGBClassifier):
                        fit_params['eval_set'] = [(X_val, y_val)]
                        fit_params['verbose'] = False # 設置 XGBoost 靜默模式
                        
                        current_model.fit(X_tr, y_tr, **fit_params)

                        best_iteration = current_model.get_booster().best_iteration
                        proba_val = current_model.predict_proba(X_val, iteration_range=(0, best_iteration))[:, 1]
                        proba_test = current_model.predict_proba(X_test, iteration_range=(0, best_iteration))[:, 1]
                    else:
                        current_model.fit(X_tr, y_tr)
                        proba_val = current_model.predict_proba(X_val)[:, 1]
                        proba_test = current_model.predict_proba(X_test)[:, 1]
                    # -------------------------

                    oof_preds[val_idx] = proba_val
                    test_preds_folds.append(proba_test)

                    # 收集指標
                    fold_metrics_list.append(
                        {'ROC AUC': roc_auc_score(y_val, proba_val)}
                    ) 
                    
                    final_model_instance = current_model

                except Exception as e:
                    self.logger.error(f"模型 {name} 在折疊 {fold} 訓練時發生錯誤: {e}")
                    continue

            # 儲存結果
            results[name] = {
                'oof_preds': oof_preds,
                'test_preds': np.mean(test_preds_folds, axis=0) if test_preds_folds else np.zeros(len(X_test)),
                'metrics_df': pd.DataFrame(fold_metrics_list),
            }
            if final_model_instance:
                trained_models[name] = final_model_instance 
                
            if not results[name]['metrics_df'].empty:
                self.logger.info(
                    f" 模型 {name} | CV ROC AUC: {results[name]['metrics_df']['ROC AUC'].mean():.4f} ± {results[name]['metrics_df']['ROC AUC'].std():.4f}")
            else:
                 self.logger.warning(f"模型 {name} 訓練失敗，無法計算 CV ROC AUC。")

        return results, trained_models

    def _generate_submission(self, filename: str, df_test_id: pd.Series, test_preds: np.ndarray) -> pd.DataFrame:
        """生成提交文件。"""
        # 簡化提交文件名
        if 'submission_XGBoost_Final_Tuned_run_v2_preprocessing' in filename:
             filename = 'submission.csv' 
        
        submission_df = pd.DataFrame({'id': df_test_id, 'Exited': test_preds})
        submission_df.to_csv(filename, index=False)
        self.logger.info(f"提交文件成功保存: {filename}")
        return submission_df

    def save_model_and_params(self, 
                              model: Any, 
                              fe_pipeline_name: str, 
                              model_name: str, 
                              best_params: Dict[str, Any], 
                              output_path: str = Config.MODEL_DIR) -> None:
        """保存模型、特徵工程管道名稱和最佳參數。"""
        model_filename = "churn_bank_model.joblib" 
        
        # 1. 保存模型
        full_model_path = os.path.join(output_path, model_filename)
        try:
            joblib.dump(model, full_model_path)
            self.logger.info(f"模型成功保存至: {full_model_path}")
        except Exception as e:
            self.logger.error(f"保存模型時發生錯誤: {e}")
        
        # 2. 保存特徵工程管道名稱
        fe_pipeline_name_path = os.path.join(output_path, 'fe_pipeline_name.txt')
        try:
            with open(fe_pipeline_name_path, 'w') as f:
                f.write(fe_pipeline_name)
            self.logger.info(f"特徵工程管道名稱 '{fe_pipeline_name}' 成功保存至: {fe_pipeline_name_path}")
        except Exception as e:
            self.logger.error(f"保存 FE 管道名稱時發生錯誤: {e}")
            

# --- 主執行函數 ---
def main(train_file: str, test_file: str, tune: bool, n_trials: int):
    
    logger.info(f"開始執行腳本。訓練文件: {train_file}, 測試文件: {test_file}")
    
    # 數據加載
    try:
        df_train = pd.read_csv(train_file)
        
        # 🎯 方案 A 修正：假設 test.csv 包含標頭 (Header)
        df_test = pd.read_csv(
            test_file, 
            header=0, # 假設 test.csv 包含標頭行，使用第 0 行作為欄位名稱
            # 移除 names 參數，讓 pandas 自動使用標頭
            # 輔助：嘗試在讀取時就將數值欄位讀取為 float
            dtype={'CreditScore': float, 'Age': float, 'Tenure': float, 
                   'Balance': float, 'NumOfProducts': float, 'HasCrCard': float, 
                   'IsActiveMember': float, 'EstimatedSalary': float}
        ) 
        
        logger.info(f"訓練數據大小: {df_train.shape}, 測試數據大小: {df_test.shape}")
        
    except FileNotFoundError:
        logger.error("錯誤：請確保訓練和測試文件存在於指定路徑。")
        return
    except Exception as e:
        logger.error(f"數據加載時發生錯誤: {e}")
        # 如果修正後仍然報錯，將額外打印 DataFrame 的前幾行資訊以供進一步調試
        # if 'df_train' in locals() and 'df_test' in locals():
        #     logger.error(f"df_train columns: {df_train.columns.tolist()}")
        #     logger.error(f"df_test columns: {df_test.columns.tolist()}")
        return

    trainer = ModelTrainer()
    
    # 選擇最佳特徵工程管道
    best_fe_pipeline = FeatureEngineer.run_v2_preprocessing
    FE_PIPELINE_NAME = best_fe_pipeline.__name__
    MODEL_NAME = 'XGBoost_Final_Tuned'

    # --- 超參數調優（可選）---
    if tune:
        logger.info("--- 啟動 Optuna 超參數調優模式 ---")
        
        # 臨時處理數據以進行調優
        X_train_temp = best_fe_pipeline(df_train.drop(columns=[Config.TARGET_COL], errors='ignore').copy(), is_train=True)
        y_train_temp = df_train[Config.TARGET_COL].astype(int)
        
        # OHE 數據以進行調優
        cat_cols = [col for col in X_train_temp.columns if X_train_temp[col].dtype.name in ['object', 'str']]
        X_train_oh = pd.get_dummies(X_train_temp, columns=cat_cols, dummy_na=False)
        X_train_temp = X_train_oh.astype(float) # 確保是浮點數
        
        final_best_params = HyperparameterTuner.tune(X_train_temp, y_train_temp, n_trials)
        
        # 設置 Optuna 參數為最終模型參數
        final_best_params['random_state'] = Config.RANDOM_STATE
        final_best_params['eval_metric'] = 'logloss'
        final_best_params['n_jobs'] = -1
        final_best_params['early_stopping_rounds'] = final_best_params.get('early_stopping_rounds', 50)
        final_best_params['enable_categorical'] = False 
        final_best_params['verbose'] = 0

    else:
        # 使用硬編碼的最佳參數
        logger.info("--- 使用硬編碼的最佳參數 ---")
        final_best_params = {
            'n_estimators': 2692,
            'learning_rate': 0.05786197845936901,
            'max_depth': 3,
            'reg_lambda': 1.0628185137032307e-08,
            'reg_alpha': 3.255737505871401,
            'subsample': 0.8409191153520594,
            'colsample_bytree': 0.7834673458794292,
            # 固定的參數
            'random_state': Config.RANDOM_STATE,
            'eval_metric': 'logloss',
            'n_jobs': -1,
            'early_stopping_rounds': 50,
            'enable_categorical': False, 
            'verbose': 0
        }

    # 實例化最終模型
    final_tuned_model = XGBClassifier(**final_best_params)
    models_final = {MODEL_NAME: final_tuned_model}

    # 運行最終實驗 (run_experiment 內部會進行 OHE 並轉換為 float)
    submission_final, results_final, best_model_cv, feature_cols = trainer.run_experiment(
        train_df=df_train,
        test_df=df_test,
        feature_engineering_pipeline=best_fe_pipeline,
        models=models_final
    )
    
    if submission_final.empty or not best_model_cv:
        logger.error("實驗失敗，無法生成提交文件或獲取訓練模型。腳本終止。")
        return

    # --- 步驟 5: 保存模型、特徵工程管道名稱和特徵列表 --- 
    trainer.save_model_and_params(
        model=best_model_cv, 
        fe_pipeline_name=FE_PIPELINE_NAME, 
        model_name=MODEL_NAME, 
        best_params=final_best_params
    )
    
    # 額外保存特徵欄位列表
    feature_list_path = os.path.join(Config.MODEL_DIR, 'feature_columns.joblib')
    joblib.dump(feature_cols, feature_list_path) 
    logger.info(f"特徵欄位列表成功保存至: {feature_list_path}")


# --- 腳本入口點 ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="銀行客戶流失預測 - XGBoost Optuna/SHAP 整合版訓練腳本")
    
    # 預設路徑 (請根據實際情況修改)
    default_root = os.path.dirname(os.path.abspath(__file__))
    default_train_path = os.path.join(default_root, "train.csv") 
    default_test_path = os.path.join(default_root, "test.csv")

    parser.add_argument("--train_file", type=str, default=default_train_path, help="訓練數據文件路徑")
    parser.add_argument("--test_file", type=str, default=default_test_path, help="測試數據文件路徑")
    parser.add_argument("--tune", action="store_true", help="是否執行 Optuna 超參數調優")
    parser.add_argument("--n_trials", type=int, default=50, help="Optuna 調優的迭代次數")
    
    args = parser.parse_args()
    
    # 執行主函數
    main(args.train_file, args.test_file, args.tune, args.n_trials)