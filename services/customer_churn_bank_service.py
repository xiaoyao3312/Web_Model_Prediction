# services\customer_churn_bank_service.py
import pandas as pd
import numpy as np
import logging
import joblib
import shap
import os
import sys  # 🚨 導入 sys 用於強制打印到 stderr

from typing import Dict, Any, List, Callable

# 🚨 為了讓服務能獨立運行，我們不直接從 train.py 導入 FeatureEngineer，而是假設
# 外部會提供 FE 函數（例如 routes.py 中的 FeatureEngineerForAPI）

logger = logging.getLogger('CustomerChurnBankService')
logger.setLevel(logging.INFO)

class CustomerChurnBankService:
    def __init__(self, model_path: str, model_dir: str):
        # 🚨 _load_model 裡面現在有強制錯誤處理
        self.model = self._load_model(model_path)
        # 🚨 [新增] 如果模型成功載入，打印成功訊息
        if self.model is not None:
            logger.info("模型載入成功，準備初始化 SHAP Explainer。") # 🚨 新增
        self.model_dir = model_dir
        
        # 載入訓練時保存的特徵列表和 FE 管道名稱
        self.feature_cols, self.fe_pipeline_name = self._load_model_artifacts(model_dir)
        
        # 建立 SHAP Explainer (在服務啟動時一次性完成)
        if self.model:
            try:
                # 🚨 [修改] 暫時註釋掉 SHAP 初始化，以確認載入是否成功
                self.explainer = shap.TreeExplainer(self.model) 
                logger.info("SHAP TreeExplainer 成功初始化。")
                
                # # 🚨 [新增] 臨時設定 Explainer 為 None，並打印跳過訊息
                # self.explainer = None
                # logger.warning("!!! SHAP 初始化暫時跳過，用於模型載入測試 !!!") 
            
            except Exception as e:
                # 🚨 【重要】如果 SHAP 失敗，打印嚴重錯誤
                print(f"!!! 嚴重錯誤 !!! SHAP 初始化失敗: {e}", file=sys.stderr) 
                raise RuntimeError(f"SHAP 初始化失敗，服務無法啟動: {e}") 
        else:
            # 這應該在 _load_model 裡面已經處理，但作為最終保障
            raise RuntimeError("模型載入失敗，無法初始化服務。")

    def _load_model_artifacts(self, model_dir: str) -> tuple[List[str], str]:
        """載入訓練腳本產生的特徵列表和 FE 管道名稱。"""
        feature_cols_path = os.path.join(model_dir, 'feature_columns.joblib')
        fe_name_path = os.path.join(model_dir, 'fe_pipeline_name.txt')
        
        # 🚨 強制打印路徑，確保這些檔案工件路徑也沒問題
        print(f"DEBUG: 嘗試載入特徵欄位路徑: {feature_cols_path}", file=sys.stderr)
        print(f"DEBUG: 嘗試載入 FE 名稱路徑: {fe_name_path}", file=sys.stderr)
        
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
            logger.error(f"載入模型工件失敗: {e}", exc_info=True)
            # 🚨 遇到錯誤，強制拋出
            raise RuntimeError(f"模型工件載入致命錯誤. 原因: {e}") from e

    def _load_model(self, model_path: str) -> Any:
        """載入預訓練的機器學習模型。"""
        # 🚨 強制打印路徑，確保即使是 Worker Process 也能將此信息輸出到 Render 日誌
        print(f"DEBUG: 嘗試載入模型路徑: {model_path}", file=sys.stderr) 

        if not os.path.exists(model_path):
            logger.error(f"!!! 嚴重錯誤 !!! 模型檔案未找到: {model_path}")
            # 🚨 遇到錯誤，強制拋出 FileNotFoundError
            raise FileNotFoundError(f"模型檔案不存在於指定路徑: {model_path}")
        
        try:
            model = joblib.load(model_path)
            logger.info(f"模型 {model_path} 載入成功。")
            return model
        except Exception as e:
            logger.error(f"!!! 嚴重錯誤 !!! 載入模型失敗: {e}", exc_info=True)
            # 🚨 遇到錯誤，強制拋出 RuntimeError
            raise RuntimeError(f"模型載入致命錯誤: {model_path} 載入失敗. 原因: {e}") from e


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
            # 只有當缺失的欄位不在 X_oh.columns 也不在 feature_cols 中時才會出錯，但為了健壯性保留
            raise ValueError(f"特徵數量不匹配。預期 {len(self.feature_cols)}，實際 {X_predict.shape[1]}")
        
        return X_predict

    def get_local_shap(self, X_predict: pd.DataFrame) -> Dict[str, float]:
        """計算單一樣本的局部 SHAP 值，並轉換為可讀的字典。"""
        if not self.explainer:
            return {} # Explainer 未初始化則返回空

        try:
            # 計算 SHAP 值
            # shap_values 可能是 (1, num_features) 的 numpy array
            # 由於 X_predict 是一個單行 DataFrame，這裡的計算結果應該是單一樣本的
            shap_values = self.explainer.shap_values(X_predict, check_additivity=False)
            
            # 由於 XGBoost 是二分類，shap_values 是兩個陣列的列表 (list of arrays)，取類別 1 的值
            # 確保 shap_values_row 是一個一維陣列 (對於單行輸入)
            shap_values_row = shap_values[1][0] if isinstance(shap_values, list) and len(shap_values) == 2 else shap_values[0]
            
            # 如果是單一樣本，確保是從二維陣列中取出一維數組
            if len(shap_values_row.shape) > 1 and shap_values_row.shape[0] == 1:
                shap_values_row = shap_values_row[0]


            feature_names = X_predict.columns
            # 確保長度匹配
            if len(feature_names) != len(shap_values_row):
                 logger.error(f"SHAP 值數量 ({len(shap_values_row)}) 與特徵數量 ({len(feature_names)}) 不匹配。")
                 return {}


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
        處理輸入數據，進行特徵工程，然後進行單一預測。
        
        Args:
            input_df: 已經包含原始特徵的 DataFrame (單行)。
            fe_pipeline_func: 從 routes 層傳遞下來的 FE 函數 (e.g., run_v2_preprocessing)。
            
        Returns:
            包含預測結果、風險和局部 SHAP 數據的字典。
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
        # predict_proba 返回的是 (n_samples, n_classes)，取第二個類別 (流失) 的風險
        probability_class_1 = self.model.predict_proba(X_predict)[:, 1][0]
        prediction = int(probability_class_1 >= 0.5)

        # 4. 進行局部 SHAP 分析
        local_shap_values = self.get_local_shap(X_predict)
        
        # 5. 轉換為可讀的特徵重要性文本 (用於 AI 解釋)
        feature_importance_text = "主要影響因素 (局部 SHAP 值):\n"
        if local_shap_values:
            for feature, shap_value in local_shap_values.items():
                # SHAP 值 > 0 表示推高流失風險
                sign = "推高流失風險 (+)" if shap_value > 0 else "推低流失風險 (-)"
                feature_importance_text += f"- {feature}: {sign} (影響值: {abs(shap_value):.4f})\n"
        else:
            feature_importance_text = "SHAP 分析工具未成功初始化或計算失敗。"

        return {
            "prediction": prediction,
            "probability": float(probability_class_1),
            "feature_importance": feature_importance_text,
            "local_shap_values": local_shap_values
        }
    
    def predict_batch_csv(self, input_df: pd.DataFrame, fe_pipeline_func: Callable) -> pd.DataFrame:
        """
        對批次 CSV 數據進行預測，並返回帶有預測結果的 DataFrame。
        
        Args:
            input_df: 原始客戶數據的 DataFrame。
            fe_pipeline_func: 來自 routes 層的特徵工程函數。
            
        Returns:
            DataFrame: 包含原始數據和 'Exited_Prediction', 'Exited_Probability' 兩欄的結果。
        """
        logger.info(f"開始批次預測，共 {len(input_df)} 筆資料。")
        
        if self.model is None:
            raise RuntimeError("模型服務未啟動，無法進行批次預測。")

        # 1. 保存原始的 CustomerId (用於最終結果)
        customer_ids = input_df['CustomerId'] if 'CustomerId' in input_df.columns else range(len(input_df))
        
        # 2. 特徵工程
        processed_df = fe_pipeline_func(input_df.copy())
        
        # 3. OHE 和特徵對齊
        X_predict = self._align_features(processed_df)
        
        logger.info(f"特徵對齊後，預測數據形狀: {X_predict.shape}")
        # 4. 進行預測
        probabilities = self.model.predict_proba(X_predict)[:, 1]
        
        predictions = (probabilities >= 0.5).astype(int)

        # 5. 構建結果 DataFrame (保持原始數據，並添加結果)
        result_df = pd.DataFrame({
        'CustomerId': customer_ids, # 使用 CustomerId (大寫 D)
        'Exited_Prediction': predictions,
        'Exited_Probability': probabilities
    })

        
        # 確保 Column 命名清晰
        result_df['Exited_Probability'] = probabilities
        result_df['Exited_Prediction'] = predictions 
        
        logger.info(f"Service: 批次預測完成，返回筆數: {len(result_df)}")
        return result_df
    

    def calculate_roi_batch(self, df_with_prob: pd.DataFrame) -> Dict[str, Any]:
        """
        基於預測結果計算 LTV 與 ROI (邏輯來自 customer_churn_bank_roi.ipynb)
        """
        df = df_with_prob.copy()
        
        # --- 1. 定義常數 (來自 Notebook) ---
        NIM_RATE = 0.02
        PRODUCT_PROFIT = 50.0
        ACTIVE_CARD_PROFIT = 30.0
        L_MAX = 10.0
        USER_RETENTION_COST = 500.0
        USER_SUCCESS_RATE = 0.20

        # --- 2. LTV 計算 ---
        # 確保風險欄位存在 (Route 層傳入時應為 'Exited_Probability' 或 'probability')
        prob_col = 'Exited_Probability' if 'Exited_Probability' in df.columns else 'probability'
        if prob_col not in df.columns:
            return {} # 無法計算

        df['Churn_Prob'] = df[prob_col]
        
        # 計算 ActiveCard_Flag
        df['ActiveCard_Flag'] = ((df['HasCrCard'] == 1) & (df['IsActiveMember'] == 1)).astype(int)

        # 計算年利潤
        df['Annual_Profit'] = (
            (df['Balance'] * NIM_RATE) +
            (df['NumOfProducts'] * PRODUCT_PROFIT) +
            (df['ActiveCard_Flag'] * ACTIVE_CARD_PROFIT)
        )

        # 計算預期壽命 (防止除以 0)
        df['Expected_Lifespan'] = np.minimum(1 / np.maximum(df['Churn_Prob'], 1e-6), L_MAX)
        
        # 計算 LTV
        df['LTV'] = df['Annual_Profit'] * df['Expected_Lifespan']

        # --- 3. ROI 最佳化模型 (Profit Ranking) ---
        # ENR = LTV * P(churn) * SR - RC
        df['ENR'] = (df['LTV'] * df['Churn_Prob'] * USER_SUCCESS_RATE) - USER_RETENTION_COST
        
        # 篩選出值得挽留的客戶 (ENR > 0)
        actionable = df[df['ENR'] > 0].copy()
        actionable = actionable.sort_values(by='ENR', ascending=False)

        # --- 4. 統計結果 ---
        total_ltv_all = df['LTV'].sum()
        actionable_count = len(actionable)
        total_enr = actionable['ENR'].sum() if not actionable.empty else 0.0
        total_cost = actionable_count * USER_RETENTION_COST
        
        # 計算整體 ROI
        total_roi = (total_enr / total_cost) if total_cost > 0 else 0.0

        return {
            'total_ltv': total_ltv_all,
            'actionable_count': actionable_count,
            'total_net_enr': total_enr,
            'retention_cost': total_cost,
            'total_roi': total_roi,
            # 這裡不回傳 top_targets，讓前端純顯示統計
        }