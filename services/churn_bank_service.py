# services/churn_bank_service.py

import joblib
import numpy as np
import os
import pandas as pd
from typing import Dict, Any, List, Callable
import shap
import logging
# 🚨 為了讓服務能獨立運行，我們不直接從 train.py 導入 FeatureEngineer，而是假設
# 外部會提供 FE 函數（例如 routes.py 中的 FeatureEngineerForAPI）

logger = logging.getLogger('ChurnBankService')
logger.setLevel(logging.INFO)

class ChurnBankService:
    def __init__(self, model_path: str, model_dir: str):
        self.model = self._load_model(model_path)
        self.model_dir = model_dir
        
        # 載入訓練時保存的特徵列表和 FE 管道名稱
        self.feature_cols, self.fe_pipeline_name = self._load_model_artifacts(model_dir)
        
        # 建立 SHAP Explainer (在服務啟動時一次性完成)
        # 僅當模型成功載入時才初始化 Explainer
        if self.model:
            try:
                self.explainer = shap.TreeExplainer(self.model)
                logger.info("SHAP TreeExplainer 成功初始化。")
            except Exception as e:
                logger.warning(f"初始化 SHAP TreeExplainer 失敗: {e}")
                self.explainer = None
        else:
            self.explainer = None

    def _load_model_artifacts(self, model_dir: str) -> tuple[List[str], str]:
        """載入訓練腳本產生的特徵列表和 FE 管道名稱。"""
        feature_cols_path = os.path.join(model_dir, 'feature_columns.joblib')
        fe_name_path = os.path.join(model_dir, 'fe_pipeline_name.txt')
        
        if not os.path.exists(feature_cols_path) or not os.path.exists(fe_name_path):
             logger.warning(f"模型工件 (feature_columns/fe_pipeline_name) 未找到於 {model_dir}")
             return [], "" # 返回空列表和空字符串，以便後續使用模擬預測

        try:
            feature_cols = joblib.load(feature_cols_path)
            with open(fe_name_path, 'r') as f:
                fe_pipeline_name = f.read().strip()
            logger.info(f"特徵列 ({len(feature_cols)}) 和 FE 管道名稱 ({fe_pipeline_name}) 載入成功。")
            return feature_cols, fe_pipeline_name
        except Exception as e:
            logger.error(f"載入模型工件失敗: {e}")
            return [], ""

    def _load_model(self, model_path: str) -> Any:
        """載入預訓練的機器學習模型。"""
        if not os.path.exists(model_path):
            logger.warning(f"模型檔案未找到: {model_path}")
            return None
        try:
            model = joblib.load(model_path)
            logger.info(f"模型 {model_path} 載入成功。")
            return model
        except Exception as e:
            logger.error(f"載入模型失敗: {e}")
            return None

    def _align_features(self, df_processed: pd.DataFrame) -> pd.DataFrame:
        """根據訓練時的特徵列表進行 OHE 和欄位對齊。"""
        if not self.feature_cols:
            raise RuntimeError("特徵欄位列表未載入。")

        # 找出類別欄位 (Geography, Age_bin 等)
        # 'category' 類型是 pandas 推薦的 FE 輸出類型
        cat_cols = [col for col in df_processed.columns if df_processed[col].dtype.name in ['object', 'str', 'category']]
        
        # 對數據進行 One-Hot Encoding
        X_oh = pd.get_dummies(df_processed, columns=cat_cols, dummy_na=False)
        
        # 補齊訓練集缺少的欄位 (當前單一請求可能缺少某個 OHE 欄位)
        missing_cols = set(self.feature_cols) - set(X_oh.columns)
        for c in missing_cols:
             X_oh[c] = 0.0
        
        # 移除多餘的欄位，並確保順序一致
        # 這一步是關鍵：確保預測數據的欄位名稱和順序與訓練模型時完全相同
        X_predict = X_oh[[col for col in self.feature_cols if col in X_oh.columns]]
        X_predict = X_predict.astype(float)

        if X_predict.shape[1] != len(self.feature_cols):
             raise ValueError(f"特徵數量不匹配。預期 {len(self.feature_cols)}，實際 {X_predict.shape[1]}")
        
        return X_predict

    def get_local_shap(self, X_predict: pd.DataFrame) -> Dict[str, float]:
        """計算單一樣本的局部 SHAP 值，並轉換為可讀的字典。"""
        if not self.explainer:
             return {} # Explainer 未初始化則返回空

        try:
            # 計算 SHAP 值
            # shap_values 可能是 (1, num_features) 的 numpy array
            shap_values = self.explainer.shap_values(X_predict, check_additivity=False)
            
            # 由於 XGBoost 是二分類，shap_values 是兩個陣列的列表 (list of arrays)，取類別 1 的值
            # 確保 shap_values_row 是一個一維陣列
            shap_values_row = shap_values[1][0] if isinstance(shap_values, list) else shap_values[0] 
            
            feature_names = X_predict.columns
            shap_dict = dict(zip(feature_names, shap_values_row))
            
            # 排序 (以 SHAP 值的絕對值降序排列)
            sorted_shap = dict(sorted(shap_dict.items(), key=lambda item: abs(item[1]), reverse=True))
            
            # 為了簡化 API 輸出，我們只返回前 7 個最有影響力的特徵
            top_n_shap = {k: float(v) for k, v in list(sorted_shap.items())[:7]}
            
            return top_n_shap
        except Exception as e:
            logger.error(f"計算局部 SHAP 值失敗: {e}")
            return {}


    def preprocess_and_predict(self, input_df: pd.DataFrame, fe_pipeline_func: Callable) -> Dict[str, Any]:
        """
        處理輸入數據，進行特徵工程，然後進行預測。
        
        Args:
            input_df: 已經包含原始特徵的 DataFrame (單行)。
            fe_pipeline_func: 從 routes 層傳遞下來的 FE 函數 (e.g., run_v2_preprocessing)。
            
        Returns:
            包含預測結果、機率和局部 SHAP 數據的字典。
        """
        
        if self.model is None:
            # 返回模擬結果
            return {
                "prediction": 0,
                "probability": 0.5,
                "feature_importance": "模型服務未啟動，使用模擬預測。",
                "local_shap_values": {}
            }
        
        # 1. 特徵工程 (使用 routes 層提供的 FE 函數)
        processed_df = fe_pipeline_func(input_df.copy())
        
        # 2. OHE 和特徵對齊
        X_predict = self._align_features(processed_df)

        # 3. 進行預測
        probability_class_1 = self.model.predict_proba(X_predict)[:, 1][0]
        prediction = int(probability_class_1 >= 0.5)

        # 4. 進行局部 SHAP 分析
        local_shap_values = self.get_local_shap(X_predict)
        
        # 5. 轉換為可讀的特徵重要性文本 (用於 AI 解釋)
        feature_importance_text = "主要影響因素 (局部 SHAP 值):\n"
        if local_shap_values:
            for feature, shap_value in local_shap_values.items():
                # SHAP 值 > 0 表示推高流失機率
                sign = "推高流失機率 (+)" if shap_value > 0 else "推低流失機率 (-)"
                feature_importance_text += f"- {feature}: {sign} (影響值: {abs(shap_value):.4f})\n"
        else:
             feature_importance_text = "SHAP 分析工具未成功初始化或計算失敗。"

        return {
            "prediction": prediction,
            "probability": float(probability_class_1),
            "feature_importance": feature_importance_text,
            "local_shap_values": local_shap_values
        }