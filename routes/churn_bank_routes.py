# C:\Users\user\Desktop\Web_Model_Prediction\routes\churn_bank_routes.py

import os
import sys
import logging
from flask import Blueprint, jsonify, request
import pandas as pd
import numpy as np
from werkzeug.exceptions import BadRequest
from typing import Any, Dict, List, Tuple, Callable
import matplotlib
# 設置 Matplotlib 為非互動式後端，以確保在伺服器環境中運行
matplotlib.use('Agg') 

import io
import base64

import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

# =======================================================================
# 📌 修正：全局設定 Matplotlib 使用 Dockerfile 中安裝的字體
# =======================================================================
plt.rcParams['font.sans-serif'] = ['WenQuanYi Zen Hei', 'sans-serif'] # 確保使用新安裝的字體
plt.rcParams['axes.unicode_minus'] = False # 解決負號亂碼問題

# --- 路徑配置與服務導入 ---
# 設定專案路徑，導入 config.py
# 假設 config.py 在上層目錄
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# from config import DevelopmentConfig # 假設您有這個配置檔案

# 導入 Service
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'services'))
from services.churn_bank_service import ChurnBankService 

# --- 日誌設定 ---
logger = logging.getLogger('ChurnBankRoute')
logger.setLevel(logging.INFO)

# --- 模型與資源路徑定義 ---
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                         'projects', 'Churn_Bank_code')
MODEL_PATH_FULL = os.path.join(MODEL_DIR, "churn_bank_model.joblib")
# ⭐⭐⭐ 根據您的要求，更新全局 SHAP 圖的檔案名稱 ⭐⭐⭐
GLOBAL_SHAP_FILE = os.path.join(MODEL_DIR, "shap_summary_plot.png") 

# --- 特徵工程類 (保持不變) ---
class FeatureEngineerForAPI:
    @staticmethod
    def cast_columns(df: pd.DataFrame, int_cols: Any = None, cat_cols: Any = None) -> pd.DataFrame:
        df_copy = df.copy()
        if int_cols:
            for col in int_cols:
                if col in df_copy.columns:
                    # 處理 NaN/None，防止轉換失敗
                    df_copy[col] = pd.to_numeric(df_copy[col], errors='coerce').fillna(0).astype(int)
        if cat_cols:
            for col in cat_cols:
                if col in df_copy.columns:
                    df_copy[col] = df_copy[col].astype('category')
        return df_copy

    @staticmethod
    def run_v1_preprocessing(df: pd.DataFrame) -> pd.DataFrame:
        df_copy = df.copy()
        
        # 轉換數值輸入的 Geography/Gender 為類別名稱
        df_copy['Gender'] = df_copy['Gender'].map({0: 'Male', 1: 'Female'}).astype('category')
        geo_map = {0: 'France', 1: 'Spain', 2: 'Germany'}
        df_copy['Geography'] = df_copy['Geography'].map(geo_map).astype('category') 

        # 特徵工程 V1
        df_copy['Age_bin'] = pd.cut(df_copy['Age'], bins=[0, 25, 35, 45, 60, np.inf],
                                    labels=['very_young', 'young', 'mid', 'mature', 'senior']).astype('category')
        df_copy['Is_two_products'] = (df_copy['NumOfProducts'] == 2).astype(int)
        df_copy['Germany_Female'] = ((df_copy['Geography'] == 'Germany') & (df_copy['Gender'] == 'Female')).astype(int)
        df_copy['Germany_Inactive'] = ((df_copy['Geography'] == 'Germany') & (df_copy['IsActiveMember'] == 0)).astype(int)
        df_copy['Has_Zero_Balance'] = (df_copy['Balance'] == 0).astype(int)
        df_copy['Tenure_log'] = np.log1p(df_copy['Tenure'])

        int_cols = ['HasCrCard', 'IsActiveMember', 'NumOfProducts', 'Is_two_products',
                    'Has_Zero_Balance', 'Germany_Female', 'Germany_Inactive']
        cat_cols = ['Geography', 'Age_bin', 'Gender']
        df_copy = FeatureEngineerForAPI.cast_columns(df_copy, int_cols=int_cols, cat_cols=cat_cols)

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

# --- 圖表生成輔助函式 (局部 SHAP 圖) ---
def generate_local_shap_chart(shap_data: Dict[str, float], title: str) -> str:
    """
    使用 Matplotlib 繪製局部 SHAP 影響力水平柱狀圖並轉換為 Base64 圖片字串。
    """
    if not shap_data:
        logger.warning("SHAP 數據為空，無法繪製圖表。")
        return ""

    try:
        # 根據 SHAP 值的絕對值降序排列，取前N個
        sorted_data = dict(sorted(shap_data.items(), key=lambda item: abs(item[1]), reverse=True))
        
        # 準備繪圖數據
        features = list(sorted_data.keys())
        importances = list(sorted_data.values())

        # 顏色設置：正值（推高流失）為紅色，負值（推低流失）為綠色
        colors = ['#EF5350' if imp > 0 else '#66BB6A' for imp in importances] 
        
        # 繪圖
        plt.style.use('seaborn-v0_8-whitegrid')
        
        # =======================================================================
        # 📌 修正：移除這裡的字體設定，改用檔案開頭的全局設定 (WenQuanYi Zen Hei)
        # =======================================================================
        # plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'Arial Unicode MS'] 
        # plt.rcParams['axes.unicode_minus'] = False # 正常顯示負號
        
        fig, ax = plt.subplots(figsize=(10, len(features) * 0.7 + 1)) 
        
        ax.barh(features, importances, color=colors)
        
        # 添加中心線 (0 軸)
        ax.axvline(0, color='grey', linestyle='--', linewidth=0.8)

        ax.set_xlabel("SHAP 影響力 (正值推高流失機率 / 負值推低)")
        ax.set_title(title, fontsize=14)
        ax.invert_yaxis() # 讓最重要的特徵在頂部

        # 處理 Base64 轉換
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close(fig) 
        
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    except Exception as e:
        logger.error(f"生成局部 SHAP 圖表失敗: {e}")
        return "" 

# --- Service 實例化與全局資源載入 ---
CHURN_BANK_SERVICE = None
GLOBAL_SHAP_BASE64 = ""

try:
    # 1. 初始化模型服務
    CHURN_BANK_SERVICE = ChurnBankService(
        model_path=MODEL_PATH_FULL, 
        model_dir=MODEL_DIR
    )
    logger.info("ChurnBankService 成功初始化。")

    # 2. 載入離線生成的全局 SHAP 圖表
    if os.path.exists(GLOBAL_SHAP_FILE):
        with open(GLOBAL_SHAP_FILE, "rb") as f:
            GLOBAL_SHAP_BASE64 = base64.b64encode(f.read()).decode('utf-8')
        logger.info(f"全局 SHAP 摘要圖 ({os.path.basename(GLOBAL_SHAP_FILE)}) 載入成功。")
    else:
        logger.warning(f"全局 SHAP 圖表檔案未找到: {GLOBAL_SHAP_FILE}。無法提供全局解釋圖。")

except Exception as e:
    logger.error(f"初始化服務或載入全局資源失敗: {e}")

# --- Blueprint ---
churn_bank_bp = Blueprint('churn_bank_bp', __name__)

@churn_bank_bp.route('/predict', methods=['POST'])
def predict_churn():
    try:
        data = request.get_json()
        if not data:
            raise BadRequest("無效的 JSON 請求")

        # 1. 整理輸入數據 
        input_data = {
            'id': 0, 
            'CreditScore': float(data.get('CreditScore', 650)),
            'Age': float(data.get('Age', 40)),
            'Tenure': float(data.get('Tenure', 5)),
            'Balance': float(data.get('Balance', 0)),
            'NumOfProducts': float(data.get('NumOfProducts', 1)),
            'HasCrCard': float(data.get('HasCrCard', 1)),
            'IsActiveMember': float(data.get('IsActiveMember', 1)),
            'EstimatedSalary': float(data.get('EstimatedSalary', 100000)),
            'Geography': float(data.get('Geography', 0)), 
            'Gender': float(data.get('Gender', 0)),      
            'CustomerId': 0,
            'Surname': 'A',
            'RowNumber': 0
        }

        input_df = pd.DataFrame([input_data])
        
        proba_churn = 0.5
        chart_base64_local = ""
        feature_importance_text = "模型未初始化，使用模擬預測，無法提供 AI 解釋。"
        final_charts = [] # 用於收集所有圖表的列表

        if CHURN_BANK_SERVICE and CHURN_BANK_SERVICE.model:
            # 2. 呼叫 Service 層處理數據、預測和 SHAP 分析 (局部)
            prediction_results = CHURN_BANK_SERVICE.preprocess_and_predict(
                input_df=input_df, 
                fe_pipeline_func=FeatureEngineerForAPI.run_v2_preprocessing 
            )
            
            # 從 Service 獲取結果
            proba_churn = prediction_results['probability']
            feature_importance_text = prediction_results['feature_importance']
            local_shap_values = prediction_results['local_shap_values']
            
            # 3. 繪製局部 SHAP 圖表
            chart_base64_local = generate_local_shap_chart(
                local_shap_values, 
                f"單一客戶 SHAP 局部影響力 (流失機率: {proba_churn:.2f})"
            )
            
            # 4. 組裝圖表列表 (局部 SHAP 在前)
            if chart_base64_local:
                final_charts.append({
                    "type": "image/png", 
                    "base64_data": chart_base64_local,
                    "title": "單一客戶局部 SHAP 影響力分析"
                })

        # 5. 無論是否成功預測，如果全局圖已載入，就將其加入列表 (通常在第二個位置)
        if GLOBAL_SHAP_BASE64:
            final_charts.append({
                "type": "image/png", 
                "base64_data": GLOBAL_SHAP_BASE64,
                "title": "模型全局 SHAP 摘要圖 (整體特徵重要性)"
            })
            
        # 6. 可讀性輸出
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
        
        # 7. 組裝用於 AI 解釋的 Prompt 片段
        explanation_prompt_snippet = f"模型預測的客戶流失機率為 {proba_churn:.4f}。\n關鍵特徵資訊:\n{feature_importance_text}"
        
        return jsonify({
            "status": "success",
            "prediction": float(proba_churn),
            "readable_features": readable_data, 
            "explanation_prompt": explanation_prompt_snippet, 
            "charts": final_charts # 返回包含兩個圖表的列表
        })

    except BadRequest as e:
        logger.error(f"API 請求錯誤: {e}")
        return jsonify({"error": str(e)}), 400
    except ValueError as e:
        logger.error(f"數據處理錯誤: {e}")
        return jsonify({"error": f"數據處理失敗: {e}"}), 400
    except Exception as e:
        logger.error(f"預測過程發生錯誤: {e}", exc_info=True)
        return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500