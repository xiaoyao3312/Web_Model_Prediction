from flask import Flask, render_template, jsonify, request
import os

# 設置應用程式實例
app = Flask(__name__)

# --- 模擬數據和服務 ---
# ⚠️ 實際應用中，應從 config.py 載入配置，並從 services/ 或 src/ 載入業務邏輯

# 模擬銀行模型所需的特徵名稱
MOCK_FEATURE_NAMES = ['CreditScore', 'Gender', 'Age', 'Tenure', 'Balance', 
                      'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary', 
                      'Geography']

# 模擬模型執行和 Gemini API 呼叫的 API 端點
@app.route('/api/churn_bank_execute', methods=['POST'])
def mock_execute_bank_analysis():
    # 這裡只返回一個成功的模擬響應
    try:
        # 接收前端數據
        data = request.get_json()
        input_data = data.get('input_features')
        
        # 模擬計算和解釋
        mock_prob = 75.25 # 模擬流失機率
        mock_explanation = f"AI 模擬解釋：客戶流失機率為 {mock_prob}%。主要因素是高餘額但為非活躍成員。建議立即採取優惠挽留行動。"
        
        # 模擬一個 Base64 編碼的圖表（使用一個簡單的佔位符）
        mock_chart_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" # 1x1 透明像素
        
        return jsonify({
            "status": "success",
            "churn_probability": mock_prob,
            "explanation": mock_explanation,
            "charts": [mock_chart_base64]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400

# --- 路由：前端頁面 ---

@app.route('/')
def index():
    """網站主頁/入口頁面"""
    return render_template('index.html')

@app.route('/customer_churn_bank_model')
def bank_churn_page():
    """銀行客戶流失頁面"""
    # 傳遞特徵名稱給 JS
    return render_template('Churn_Bank.html', feature_names=MOCK_FEATURE_NAMES)

@app.route('/customer_churn_telco_model')
def telco_churn_page():
    """電信客戶流失頁面"""
    return render_template('Churn_Telco.html')


if __name__ == '__main__':
    print("服務器啟動...")
    # 確保 Flask 能夠找到靜態文件和模板
    app.run(debug=True, port=5000)