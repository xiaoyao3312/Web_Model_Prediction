# config.py
# 應用程式配置設定

import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a_hard_to_guess_string'
    GEMINI_API_KEY_ENV = 'GEMINI_API_KEY' # 環境變數名稱
    # 🚨 更新模型路徑以匹配您的新模型檔案
    MODEL_BANK_PATH = 'projects/customer_churn_bank_code/customer_churn_bank_model.joblib' 

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False