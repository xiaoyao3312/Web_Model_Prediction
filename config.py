# 應用程式配置設定

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'a_hard_to_guess_string'
    GEMINI_API_KEY_ENV = 'GEMINI_API_KEY' # 環境變數名稱
    MODEL_BANK_PATH = 'data/models/catboost_bank_model.pkl'

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False