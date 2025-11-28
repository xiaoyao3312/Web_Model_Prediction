import os
import sys
import logging
from flask import Blueprint, jsonify, request
import joblib
import pandas as pd
import numpy as np
from werkzeug.exceptions import BadRequest
from typing import Any

# ✅ 導入繪圖與圖表處理庫
import matplotlib.pyplot as plt
import io
import base64

# 設定專案路徑，導入 config.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DevelopmentConfig

# --- 特徵工程類 ---
class FeatureEngineerForAPI:
    @staticmethod
    def cast_columns(df: pd.DataFrame, int_cols: Any = None, cat_cols: Any = None) -> pd.DataFrame:
        df_copy = df.copy()
        if int_cols:
            for col in int_cols:
                if col in df_copy.columns:
                    df_copy[col] = df_copy[col].astype(int)
        if cat_cols:
            for col in cat_cols:
                if col in df_copy.columns:
                    df_copy[col] = df_copy[col].astype('category')
        return df_copy

    @staticmethod
    def run_v1_preprocessing(df: pd.DataFrame) -> pd.DataFrame:
        df_copy = df.copy()
        df_copy['Gender'] = df_copy['Gender'].astype(int)
        df_copy['Age_bin'] = pd.cut(df_copy['Age'], bins=[0, 25, 35, 45, 60, np.inf],
                                    labels=['very_young', 'young', 'mid', 'mature', 'senior']).astype('category')
        df_copy['Is_two_products'] = (df_copy['NumOfProducts'] == 2).astype(int)

        geo_map = {0: 'France', 1: 'Spain', 2: 'Germany'}
        df_copy['Geography'] = df_copy['Geography'].map(geo_map).astype('category')

        df_copy['Germany_Female'] = ((df_copy['Geography'] == 'Germany') & (df_copy['Gender'] == 1)).astype(int)
        df_copy['Germany_Inactive'] = ((df_copy['Geography'] == 'Germany') & (df_copy['IsActiveMember'] == 0)).astype(int)
        df_copy['Has_Zero_Balance'] = (df_copy['Balance'] == 0).astype(int)
        df_copy['Tenure_log'] = np.log1p(df_copy['Tenure'])

        int_cols = ['HasCrCard', 'IsActiveMember', 'NumOfProducts', 'Is_two_products',
                    'Has_Zero_Balance', 'Germany_Female', 'Germany_Inactive']
        cat_cols = ['Geography', 'Age_bin']
        df_copy = FeatureEngineerForAPI.cast_columns(df_copy, int_cols=int_cols, cat_cols=cat_cols)

        # 不刪除 id，保留與模型一致
        cols_to_drop = ['CustomerId', 'Tenure', 'Surname', 'RowNumber']
        df_copy.drop(columns=[col for col in cols_to_drop if col in df_copy.columns], inplace=True, errors='ignore')

        return df_copy

    @staticmethod
    def run_v2_preprocessing(df: pd.DataFrame) -> pd.DataFrame:
        df_copy = FeatureEngineerForAPI.run_v1_preprocessing(df.copy())
        df_copy['is_mature_inactive_transit'] = (
                (df_copy['Has_Zero_Balance'] == 1) & (df_copy['IsActiveMember'] == 0) & (df_copy['Age'] > 40)
        ).astype(int)
        return df_copy

# --- 日誌 ---
logger = logging.getLogger('ChurnBankRoute')
logger.setLevel(logging.INFO)

# --- 載入模型 ---
MODEL = None
FEATURE_COLUMNS = None
try:
    MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              DevelopmentConfig.MODEL_BANK_PATH)
    if os.path.exists(MODEL_PATH):
        MODEL = joblib.load(MODEL_PATH)
        FEATURE_COLUMNS = getattr(MODEL, 'get_booster', lambda: None)()
        if FEATURE_COLUMNS:
            FEATURE_COLUMNS = MODEL.get_booster().feature_names
        logger.info(f"成功加載模型: {MODEL_PATH}")
    else:
        logger.warning(f"模型文件不存在: {MODEL_PATH}, 將使用模擬預測")
except Exception as e:
    logger.error(f"載入模型失敗: {e}")

# --- Blueprint ---
churn_bank_bp = Blueprint('churn_bank_bp', __name__)

@churn_bank_bp.route('/predict', methods=['POST'])
def predict_churn():
    try:
        data = request.get_json()
        if not data:
            raise BadRequest("無效的 JSON 請求")

        # 數值轉換，補上 id
        input_data = {
            'id': 0,  # ✅ 補 id
            'CreditScore': float(data.get('CreditScore', 0)),
            'Age': float(data.get('Age', 0)),
            'Tenure': float(data.get('Tenure', 0)),
            'Balance': float(data.get('Balance', 0)),
            'NumOfProducts': float(data.get('NumOfProducts', 0)),
            'HasCrCard': float(data.get('HasCrCard', 0)),
            'IsActiveMember': float(data.get('IsActiveMember', 0)),
            'EstimatedSalary': float(data.get('EstimatedSalary', 0)),
            'Geography': float(data.get('Geography', 0)),
            'Gender': float(data.get('Gender', 0)),
            'CustomerId': 0,
            'Surname': 'A',
            'RowNumber': 0
        }

        input_df = pd.DataFrame([input_data])
        processed_df = FeatureEngineerForAPI.run_v2_preprocessing(input_df)

        # 模型存在則預測
        if MODEL is not None and FEATURE_COLUMNS is not None:
            missing_cols = set(FEATURE_COLUMNS) - set(processed_df.columns)
            if missing_cols:
                raise ValueError(f"缺少必要欄位: {missing_cols}")
            X_predict = processed_df[FEATURE_COLUMNS]
            proba_churn = MODEL.predict_proba(X_predict)[:, 1][0]
        else:
            # 模型不存在 → 模擬
            score_risk = (850 - float(data.get('CreditScore', 650))) / 250
            age_risk = (float(data.get('Age', 40)) - 30) / 40
            proba_churn = float(np.clip(0.1 + score_risk * 0.4 + age_risk * 0.3, 0.01, 0.99))
            logger.info("使用模擬預測")

        # 可讀性輸出
        geography_map = {0: "法國 (France)", 1: "西班牙 (Spain)", 2: "德國 (Germany)"}
        gender_map = {0: "男性 (Male)", 1: "女性 (Female)"}
        readable_data = {
            '信用分數': data.get('CreditScore'),
            '年齡': data.get('Age'),
            '服務年限': data.get('Tenure'),
            '餘額': f"${float(data.get('Balance',0)):.2f}",
            '產品數量': data.get('NumOfProducts'),
            '持有信用卡': "是" if data.get('HasCrCard') == 1 else "否",
            '活躍會員': "是" if data.get('IsActiveMember') == 1 else "否",
            '估計薪資': f"${float(data.get('EstimatedSalary',0)):.2f}",
            '國家/地區': geography_map.get(data.get('Geography'), '未知'),
            '性別': gender_map.get(data.get('Gender'), '未知')
        }

        explanation_prompt = f"客戶特徵: {readable_data}。\n模型預測的客戶流失機率為 {proba_churn:.4f}。"

        return jsonify({
            "status": "success",
            "prediction": float(proba_churn),
            "explanation_prompt": explanation_prompt
        })

    except BadRequest as e:
        logger.error(f"API 請求錯誤: {e}")
        return jsonify({"error": str(e)}), 400
    except ValueError as e:
        logger.error(f"數據處理錯誤: {e}")
        return jsonify({"error": f"數據處理失敗: {e}"}), 400
    except Exception as e:
        logger.error(f"預測過程發生錯誤: {e}")
        return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500
