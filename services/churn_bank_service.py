# services/churn_bank_service.py

import joblib
import numpy as np
import os
import pandas as pd
from typing import Dict, Any

class ChurnBankService:
    def __init__(self, model_path: str):
        self.model = self._load_model(model_path)
        # ⚠️ 這裡應定義模型訓練時使用的特徵順序和編碼
        self.feature_order = [
            'CreditScore', 'Gender', 'Age', 'Tenure', 'Balance', 
            'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary', 
            'Geography_Germany', 'Geography_Spain', 'Gender_Male'
        ]

    def _load_model(self, model_path: str) -> Any:
        """載入預訓練的機器學習模型 (例如 CatBoost 或 Scikit-learn 模型)"""
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"模型檔案未找到: {model_path}")
        try:
            # 使用 joblib 或 pickle 載入模型
            model = joblib.load(model_path)
            print(f"模型 {model_path} 載入成功。")
            return model
        except Exception as e:
            raise RuntimeError(f"載入模型失敗: {e}")

    def preprocess_and_predict(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        處理輸入數據，進行 One-Hot 編碼，然後進行預測。
        
        Args:
            input_data: 來自前端的客戶特徵字典。
            
        Returns:
            包含預測結果、機率和模擬特徵重要性的字典。
        """
        
        # 1. 建立 Pandas DataFrame
        df = pd.DataFrame([input_data])
        
        # 2. One-Hot 編碼 (只針對 'Geography' 和 'Gender')
        # ⚠️ 必須與模型訓練時的編碼方式完全一致
        df['Geography_Germany'] = (df['Geography'] == 'Germany').astype(int)
        df['Geography_Spain'] = (df['Geography'] == 'Spain').astype(int)
        # 預設法國是 0, 0
        df['Gender_Male'] = (df['Gender'] == 'Male').astype(int)
        
        # 3. 確保特徵順序與模型訓練一致
        # 移除原始分類列
        df = df.drop(columns=['Geography', 'Gender'])
        
        # 確保所有模型所需特徵存在，並按照順序排列
        final_features = []
        for feat in self.feature_order:
            if feat in df.columns:
                final_features.append(df[feat].iloc[0])
            else:
                # 處理未在原始輸入中但模型需要的欄位（例如 Geography_France 預設為 0）
                final_features.append(0) 

        # 4. 轉換為 NumPy 陣列
        X = np.array([final_features])

        # 5. 進行預測
        # 流失機率 (假設模型輸出流失的機率，即類別 1 的機率)
        probability_class_1 = self.model.predict_proba(X)[:, 1][0]
        
        # 預測類別 (0: 未流失, 1: 流失)
        prediction = int(probability_class_1 >= 0.5)

        # 6. 模擬/計算特徵重要性 (⚠️ 實際應用中請使用 SHAP 或 LIME 庫來計算)
        mock_feature_importance = (
            f"前 3 大影響因素:\n"
            f"1. 餘額 (Balance): 高餘額影響係數 (+0.2)\n"
            f"2. 年齡 (Age): 較高年齡影響係數 (+0.15)\n"
            f"3. 活躍會員 (IsActiveMember): 狀態為否影響係數 (-0.1)"
        )

        return {
            "prediction": prediction,
            "probability": round(probability_class_1 * 100, 2),
            "feature_importance": mock_feature_importance,
            # 這裡可以加入 Base64 圖表數據
            "charts": [
                 "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" # 1x1 透明像素
            ]
        }