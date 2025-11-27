from flask import Flask, render_template, jsonify, request
# 匯入您的 Blueprint
from routes.churn_bank_routes import churn_bank_bp

# 設置應用程式實例
app = Flask(__name__)
# 假設您使用 config.py，此處省略，但請注意實際部署中應設定 SECRET_KEY 等配置。

# --- 註冊 Blueprint (重要) ---
app.register_blueprint(churn_bank_bp, url_prefix='/api/churn_bank')


# --- 路由：前端頁面 (保持不變) ---

@app.route('/')
def index():
    """網站主頁/入口頁面模板"""
    return render_template('index.html')

@app.route('/customer_churn_bank_model')
def bank_churn_page():
    """銀行客戶流失頁面"""
    # 這裡不再傳遞 feature_names 參數
    return render_template('Churn_Bank.html')

@app.route('/customer_churn_telco_model')
def telco_churn_page():
    """電信客戶流失頁面 (目前為佔位符)"""
    return render_template('Churn_Telco.html')


if __name__ == '__main__':
    # ⚠️ 確保您的 'data/models/' 目錄中放置了實際的模型檔案
    print("服務器啟動...")
    # 實際運行時，建議從環境變數讀取 DEBUG 模式
    app.run(debug=True, port=5000)