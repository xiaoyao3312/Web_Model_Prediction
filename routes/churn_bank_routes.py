import json
import requests
from flask import Blueprint, request, jsonify

# 初始化 Blueprint
churn_bank_bp = Blueprint('churn_bank_bp', __name__)

# --- 模型和 API 配置 ---
GEMINI_API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/"
MODEL_NAME = "gemini-2.5-flash-preview-09-2025"
# 確保此處的特徵名稱順序與 app.py 和前端的輸入順序一致
FEATURE_NAMES = [
    'CreditScore', 'Age', 'Tenure', 'Balance', 'NumOfProducts', 
    'HasCrCard', 'IsActiveMember', 'EstimatedSalary', 'Geography', 'Gender'
]

# 模擬模型預測函數
def mock_bank_churn_prediction(input_data):
    """
    模擬深度學習模型 (例如，一個已訓練的 Keras 模型) 的預測過程。
    在實際應用中，此處會載入模型並進行推論。
    """
    # 將輸入數組轉換為易於分析的字典
    input_map = dict(zip(FEATURE_NAMES, input_data))

    # 模擬簡單的流失風險邏輯
    churn_risk = 0.15 # 基礎風險

    # 根據關鍵特徵調整風險
    if input_map['Age'] > 45: churn_risk += 0.25
    if input_map['IsActiveMember'] == 0: churn_risk += 0.30
    if input_map['CreditScore'] < 650: churn_risk += 0.20
    if input_map['Balance'] > 150000 and input_map['NumOfProducts'] == 1: churn_risk += 0.15
    
    # 確保機率在 0 到 1 之間
    churn_probability = round(min(0.95, max(0.05, churn_risk)), 4)
    
    # 返回原始輸入地圖和預測機率
    return input_map, churn_probability

# --- API 路由：預測與 AI 解釋 ---
@churn_bank_bp.route('/predict_and_explain', methods=['POST'])
def predict_and_explain():
    """
    接收客戶特徵輸入，執行模擬模型預測，並呼叫 Gemini API 進行解釋。
    """
    data = request.get_json()
    input_values = data.get('input_values')
    api_key = data.get('api_key')

    if not input_values or not api_key:
        return jsonify({'error': '缺少必要的輸入資料或 API Key'}), 400

    # 1. 執行模型預測
    try:
        input_data_map, churn_probability = mock_bank_churn_prediction(input_values)
    except Exception as e:
        return jsonify({'error': f'模型預測失敗: {str(e)}'}), 500

    # 2. 準備 Gemini 提示詞
    prediction_status = "高風險 (High Risk)" if churn_probability > 0.5 else "低風險 (Low Risk)"
    churn_percentage = f"{churn_probability * 100:.2f}%"

    system_prompt = (
        "您是一位資深的金融風控和客戶關係管理 (CRM) 專家。您的任務是根據深度學習模型的預測結果，"
        "對客戶的流失風險進行解釋，並提供具體的、可執行的挽留建議。請使用中文（繁體）回覆。 "
        "將重點放在解釋風險原因和實用建議上。"
    )
    
    user_query = f"""
        模型類型: 銀行客戶流失預測
        預測結果: 客戶流失機率為 {churn_percentage} ({prediction_status})。
        客戶特徵資料:
        {json.dumps(input_data_map, indent=2, ensure_ascii=False)}

        請完成以下任務：
        1. 根據提供的特徵和預測機率，詳細解釋客戶為何被判定為當前的風險級別。
        2. 提供至少三條針對性的、可立即實施的客戶挽留行動建議。
        3. 請以專業且具說服力的語氣撰寫，重點突出對銀行的價值。
    """

    # 3. 呼叫 Gemini API
    try:
        apiUrl = f"{GEMINI_API_URL_BASE}{MODEL_NAME}:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": user_query}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]},
        }

        # 實際應用中應實現指數退避和錯誤處理
        response = requests.post(apiUrl, json=payload, timeout=60)
        response.raise_for_status() # 對 HTTP 錯誤碼拋出異常

        result = response.json()
        explanation_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'AI 解釋生成失敗。')

        return jsonify({
            'success': True,
            'churn_probability': churn_probability,
            'prediction_status': prediction_status,
            'explanation': explanation_text,
            'input_data_used': input_data_map
        })

    except requests.exceptions.HTTPError as http_err:
        error_msg = f"Gemini API HTTP 錯誤: {http_err}. 請檢查您的 API Key 是否正確或服務是否可用。"
        return jsonify({'error': error_msg}), 502
    except requests.exceptions.RequestException as req_err:
        error_msg = f"網路連線錯誤: {req_err}"
        return jsonify({'error': error_msg}), 503
    except Exception as e:
        error_msg = f"未知錯誤: {str(e)}"
        return jsonify({'error': error_msg}), 500