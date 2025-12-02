# C:\Users\user\Desktop\Web_Model_Prediction\projects\Churn_Bank_code\churn_bank_shap.py
# 銀行客戶流失預測 - SHAP 值分析 (最終修復版：物理文件修復與正確載入)

import logging
import warnings
import argparse
import sys
import os 
import json
import re # 引入正則表達式用於文件修復
from typing import Callable, Dict, Any, List
import joblib 

# 設置警告和日誌
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('SHAPScript')

# 檢查必要的庫是否已安裝
try:
    import numpy as np
    import pandas as pd
    import xgboost as xgb # 引入 xgboost 作為 xgb，用於載入修復後的 Booster
    from xgboost import XGBClassifier
    import shap
    import matplotlib.pyplot as plt
    # 導入訓練腳本中的 FeatureEngineer 類和 Config
    from churn_bank_train import FeatureEngineer, Config 
except ImportError as e:
    logger.error(f"錯誤: 缺少必要的庫。請執行 pip install numpy pandas xgboost shap matplotlib scikit-learn: {e}")
    sys.exit(1)


# --- SHAP 視覺化類別 (ShapAnalyzer) ---
class ShapAnalyzer:
    """用於加載模型、處理數據並進行 SHAP 分析的類別。"""

    def __init__(self, model_dir: str = Config.MODEL_DIR):
        self.model_dir = model_dir
        self.logger = logging.getLogger(self.__class__.__name__)
        self.model = None
        self.feature_cols = None
        self.fe_pipeline_name = None
        self.fe_pipeline = None

    def load_artifacts(self) -> bool:
        """加載模型、FE 管道名稱和特徵列表。"""
        model_path = os.path.join(self.model_dir, "churn_bank_model.joblib")
        fe_name_path = os.path.join(self.model_dir, 'fe_pipeline_name.txt')
        feature_cols_path = os.path.join(self.model_dir, 'feature_columns.joblib')

        # 1. 加載模型
        try:
            self.model = joblib.load(model_path)
            self.logger.info(f"模型成功加載自: {model_path}")
        except Exception as e:
            self.logger.error(f"加載模型失敗: {e}")
            return False

        # 2. 加載 FE 管道名稱
        try:
            with open(fe_name_path, 'r') as f:
                self.fe_pipeline_name = f.read().strip()
            self.fe_pipeline = FeatureEngineer.FE_PIPELINES.get(self.fe_pipeline_name)
            if not self.fe_pipeline:
                self.logger.error(f"FE 管道名稱 '{self.fe_pipeline_name}' 無法在 FeatureEngineer 中找到。")
                return False
            self.logger.info(f"FE 管道名稱加載成功: {self.fe_pipeline_name}")
        except Exception as e:
            self.logger.error(f"加載 FE 管道名稱失敗: {e}")
            return False
            
        # 3. 加載特徵列表
        try:
            self.feature_cols = joblib.load(feature_cols_path)
            self.logger.info(f"特徵列表成功加載自: {feature_cols_path} ({len(self.feature_cols)} 個特徵)")
        except Exception as e:
            self.logger.error(f"加載特徵列表失敗: {e}")
            return False

        return True

    def process_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """使用訓練時的 FE 管道和欄位對齊方式處理數據。"""
        if not self.fe_pipeline or not self.feature_cols:
            self.logger.error("模型或特徵管道未加載。")
            return pd.DataFrame()
            
        # 1. 應用特徵工程管道
        df_processed = self.fe_pipeline(df.copy(), is_train=True) 
        
        # 2. 找出類別欄位並進行 OHE
        cat_cols = [col for col in df_processed.columns if df_processed[col].dtype.name in ['object', 'str']]
        X_oh = pd.get_dummies(df_processed, columns=cat_cols, dummy_na=False)
        
        # 3. 嚴格對齊訓練時的欄位順序和存在性
        missing_cols = set(self.feature_cols) - set(X_oh.columns)
        for c in missing_cols:
            X_oh[c] = 0.0 # 確保為浮點數
            
        # 移除多餘的欄位，並確保順序一致
        X_aligned = X_oh[[col for col in self.feature_cols if col in X_oh.columns]] 
        
        # 4. 確保所有數據都是 float
        X_aligned = X_aligned.astype(float)
        
        self.logger.info(f"數據對齊完成。最終特徵數: {X_aligned.shape[1]}")
        
        return X_aligned

    def run_shap_analysis(self, X_data: pd.DataFrame, n_samples: int = 1000) -> None:
        """執行 SHAP 分析並生成摘要圖。"""
        if self.model is None or X_data.empty:
            self.logger.error("模型未加載或輸入數據為空。")
            return

        self.logger.info(f"開始計算 {n_samples} 個樣本的 SHAP 值...")
        
        if X_data.shape[0] > n_samples:
            X_sample = X_data.sample(n=n_samples, random_state=Config.RANDOM_STATE)
        else:
            X_sample = X_data

        
        booster = self.model.get_booster()
        temp_model_path = os.path.join(self.model_dir, "shap_temp_model.json")
        
        # 預設使用原始模型，如果修復失敗，將回退到這個
        final_model_for_shap = self.model 
        
        try:
            # 1. 保存為 JSON 文件
            booster.save_model(temp_model_path)
            
            # 2. 讀取並手動替換字串 (RegEx 替換)
            with open(temp_model_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 3. 使用正則表達式尋找並修復 "base_score": "[...]" 格式
            #    將 "base_score": "[0.123]" 替換為 "base_score": "0.123"
            new_content = re.sub(r'"base_score":\s*"\[(.*?)\]"', r'"base_score": "\1"', content)
            
            # 4. 寫回文件
            with open(temp_model_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
                
            self.logger.info(f"已手動修復臨時模型文件中的 base_score 格式: {temp_model_path}")
            
            # 5. 載入這個修復後的文件到一個**新的純淨 Booster** 實例中
            clean_booster = xgb.Booster()
            clean_booster.load_model(temp_model_path)
            
            # 將修復後的 Booster 設定為用於 SHAP 的最終模型
            final_model_for_shap = clean_booster 
            self.logger.info("已成功載入修復後的 Booster。")

        except Exception as e:
            self.logger.error(f"嘗試物理修復模型文件失敗: {e}。將嘗試使用原始模型（預計會失敗）。")
            
        finally:
            # 清理臨時文件
            if os.path.exists(temp_model_path):
                os.remove(temp_model_path)
                
        # 創建 SHAP Explainer
        # ⭐ 將修復後或原始的 final_model_for_shap (XGBClassifier 或 xgb.Booster) 傳入 ⭐
        explainer = shap.TreeExplainer(final_model_for_shap)
        self.logger.info("SHAP Explainer 初始化成功！開始計算 SHAP 值...")

        # 計算 SHAP 值
        shap_values = explainer.shap_values(X_sample)

        # 生成摘要圖
        shap.summary_plot(shap_values, X_sample, show=False)
        
        output_file = os.path.join(self.model_dir, 'shap_summary_plot.png')
        plt.tight_layout()
        plt.savefig(output_file)
        plt.close() 
        
        self.logger.info(f"SHAP 摘要圖已保存至: {output_file}")


def main_shap(train_file: str):
    
    analyzer = ShapAnalyzer()

    if not analyzer.load_artifacts():
        logger.error("無法加載所有必要的模型工件，SHAP 分析中止。")
        return

    # 數據加載
    try:
        df_train = pd.read_csv(train_file)
        if Config.TARGET_COL in df_train.columns:
            df_train.drop(columns=[Config.TARGET_COL], inplace=True, errors='ignore')
            
        logger.info(f"用於 SHAP 分析的原始數據大小: {df_train.shape}")
        
    except FileNotFoundError:
        logger.error(f"錯誤：訓練文件 {train_file} 不存在。")
        return
    except Exception as e:
        logger.error(f"數據加載時發生錯誤: {e}")
        return

    # 數據預處理
    X_aligned = analyzer.process_data(df_train)
    
    if X_aligned.empty:
        logger.error("數據預處理和對齊失敗，SHAP 分析中止。")
        return

    # 運行 SHAP 分析
    analyzer.run_shap_analysis(X_aligned, n_samples=2000)


# --- 腳本入口點 ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="銀行客戶流失預測 - SHAP 分析腳本")
    
    default_root = os.path.dirname(os.path.abspath(__file__))
    default_train_path = os.path.join(default_root, "churn_bank_train.csv") 

    parser.add_argument("--train_file", type=str, default=default_train_path, help="訓練數據文件路徑")
    
    args = parser.parse_args()
    
    main_shap(args.train_file)