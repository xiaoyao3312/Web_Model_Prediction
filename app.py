from flask import Flask, render_template
from routes.customer_churn_bank_routes import customer_churn_bank_blueprint
from flask_cors import CORS
import os
from config import DevelopmentConfig, ProductionConfig # 導入配置類

# --- Flask 應用程式 ---
app = Flask(__name__)

# 🚨 載入配置：根據環境變數決定使用開發或生產配置
if os.environ.get('FLASK_ENV') == 'production':
    app.config.from_object(ProductionConfig)
else:
    # 預設使用開發配置 (本地運行)
    app.config.from_object(DevelopmentConfig)

CORS(app) # 啟用 CORS

# 註冊 Blueprint
app.register_blueprint(customer_churn_bank_blueprint, url_prefix='/api/customer_churn_bank')

# --- 前端頁面路由 ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/customer_churn_bank_model')
def customer_churn_bank_page():
    return render_template('customer_churn_bank.html')

# --- 啟動服務 (Gunicorn 會忽略此區塊，但保留供本地開發使用) ---
if __name__ == '__main__':
    print("服務器啟動...")
    # host='0.0.0.0' 允許伺服器監聽所有網路接口
    app.run(host='0.0.0.0', port=5000)