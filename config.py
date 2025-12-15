# config.py
# 應用程式配置設定
import os

# 獲取 config.py 所在的目錄
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a_hard_to_guess_string'
    GEMINI_API_KEY_ENV = 'GEMINI_API_KEY' # 環境變數名稱
    
    # 使用 os.path.join 構建從 config.py 所在目錄 (即專案根目錄) 出發的絕對路徑
    MODEL_BANK_PATH = os.path.join(
        BASE_DIR, 
        'projects', 
        'customer_churn_bank_code', 
        'customer_churn_bank_model.joblib'
    )

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False