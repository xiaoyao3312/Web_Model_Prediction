from flask import Flask, render_template
from routes.churn_bank_routes import churn_bank_bp  # Blueprint
from flask_cors import CORS # 1. 導入 CORS 模組
import os

# --- Flask 應用程式 ---
app = Flask(__name__)
CORS(app) # 2. 啟用 CORS

# 註冊 Blueprint
app.register_blueprint(churn_bank_bp, url_prefix='/api/churn_bank')

# --- 前端頁面路由 ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/customer_churn_bank_model')
def bank_churn_page():
    return render_template('churn_bank.html')

# --- 啟動服務 ---
if __name__ == '__main__':
    print("服務器啟動...")
    # host='0.0.0.0' 允許伺服器監聽所有網路接口
    app.run(debug=True, host='0.0.0.0', port=5000)
