# services/gemini_service.py

import os
from google import genai
from google.genai.errors import APIError

class GeminiService:
    def __init__(self, api_key: str):
        # 初始化 Gemini Client
        if not api_key:
            raise ValueError("Gemini API Key 缺失。")
        
        try:
            self.client = genai.Client(api_key=api_key)
        except Exception as e:
            raise RuntimeError(f"初始化 Gemini Client 失敗: {e}")

    def generate_churn_explanation(self, input_features: dict, prediction_result: dict, feature_importance: str) -> str:
        """
        根據輸入數據、預測結果和特徵重要性，生成友好的流失解釋。
        
        Args:
            input_features: 原始客戶輸入數據。
            prediction_result: 包含 'probability' (流失機率) 和 'prediction' (是否流失) 的字典。
            feature_importance: 模型（如 CatBoost）計算出的 SHAP 或特徵重要性文本。
        
        Returns:
            AI 生成的解釋文本。
        """
        
        # 格式化客戶特徵
        formatted_features = "\n".join([f"- {k}: {v}" for k, v in input_features.items()])
        
        # 定義 Prompt
        prompt = f"""
        你是一位專業的金融風險分析師，請根據以下客戶資訊、流失模型預測結果和關鍵因素，為客戶提供一個簡潔、專業且友善的解釋報告，並給出明確的行動建議。

        --- 客戶輸入數據 ---
        {formatted_features}

        --- 模型預測結果 ---
        客戶流失機率: {prediction_result.get('probability', 'N/A')}%
        模型預測: {'流失 (Exited)' if prediction_result.get('prediction', 0) == 1 else '未流失 (Retained)'}

        --- 關鍵影響因素 (特徵重要性) ---
        {feature_importance}

        請注意報告要求：
        1. 報告應包含**風險摘要**（流失機率）。
        2. 簡潔分析**主要流失或留存原因**（結合特徵重要性）。
        3. 提供**一項具體且可執行的行動建議**。
        4. 報告總長度不超過 150 字。
        """

        try:
            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text.strip()
        except APIError as e:
            return f"Gemini API 呼叫失敗: {e}"
        except Exception as e:
            return f"AI 解釋生成過程中發生未知錯誤: {e}"