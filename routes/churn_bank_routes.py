import os
import sys
import logging
# 修正: 新增 make_response 確保批次下載功能正常
from flask import Blueprint, jsonify, request, send_file, make_response
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
import matplotlib.font_manager as fm # 保留 fm，但不再用於快取清理
import shap

# --- 導入 config.py 以取得模型路徑 ---
# 設定專案根路徑 (Web_Model_Prediction)，導入 config.py 和 services
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PROJECT_ROOT)

# 導入 config 和 Service
from config import Config
from services.churn_bank_service import ChurnBankService

# -------------------------------------


# --- 日誌設定 (移動到頂部) ---
logger = logging.getLogger('ChurnBankRoute')
logger.setLevel(logging.INFO)
# -----------------------------


# =======================================================================
# 📌 已移除：強制清除 Matplotlib 字體快取的邏輯 (避免本地或容器環境問題)
# =======================================================================
# 整個 try...except 區塊已移除，以避免在不需要中文字體的環境中嘗試快取清理。
logger.info("Matplotlib font cache cleanup logic has been removed for stability.")

# =======================================================================
# 📌 全局設定 Matplotlib (已移除中文字體配置，僅保留基礎設定)
# 確保在任何環境下圖表都能穩定生成，不依賴特定字體。
# =======================================================================
# 註釋掉或移除所有中文字體配置，僅保留基礎設定
# plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'PingFang HK', 'Heiti TC', 'SimHei', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False # 確保負號正常顯示
# =======================================================================

# --- 模型與資源路徑定義 (從 Config 讀取並重新組裝) ---
# 假設 MODEL_BANK_PATH 是 'data/models/...'，因此 MODEL_DIR 應該是 'data/models'
# 為了穩定性，我們將其重新計算為絕對路徑
MODEL_PATH_RELATIVE = Config.MODEL_BANK_PATH
# 假設模型檔案在 'data/models' 裡面
MODEL_DIR = os.path.join(PROJECT_ROOT, os.path.dirname(MODEL_PATH_RELATIVE))

# 重新定義完整模型路徑
MODEL_PATH_FULL = os.path.join(PROJECT_ROOT, MODEL_PATH_RELATIVE)
# 定義全局 SHAP 圖表路徑 (假定與模型檔案在同一個目錄)
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
        # 由於前端單一預測使用 0/1/2，CSV 批次可能使用名稱，這裡確保能處理數值
        # 處理 'Gender'，假設 'Male'/'Female' 或 0/1
        if df_copy['Gender'].dtype in ['int64', 'float64']:
            df_copy['Gender'] = df_copy['Gender'].replace({0: 'Male', 1: 'Female'})
        df_copy['Gender'] = df_copy['Gender'].astype('category')

        # 處理 'Geography'，假設 'France'/'Spain'/'Germany' 或 0/1/2
        geo_map = {0: 'France', 1: 'Spain', 2: 'Germany'}
        if df_copy['Geography'].dtype in ['int64', 'float64']:
            df_copy['Geography'] = df_copy['Geography'].replace(geo_map)
        df_copy['Geography'] = df_copy['Geography'].astype('category')

        # 特徵工程 V1
        df_copy['Age_bin'] = pd.cut(df_copy['Age'], bins=[0, 25, 35, 45, 60, np.inf],
                                       labels=['very_young', 'young', 'mid', 'mature', 'senior'],
                                       right=False).astype('category') # 修正：設置 right=False
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
    SHAP 影響力文本已改為英文。
    """
    if not shap_data:
        logger.warning("SHAP data is empty, unable to draw chart.")
        return ""

    try:
        # 根據 SHAP 值的絕對值降序排列，取前N個
        # 由於 SHAP 值數量不多，取全部並排序
        sorted_data = dict(sorted(shap_data.items(), key=lambda item: abs(item[1]), reverse=True))
        
        # 準備繪圖數據
        features = list(sorted_data.keys())
        importances = list(sorted_data.values())

        # 顏色設置：正值（推高流失）為紅色，負值（推低流失）為綠色
        colors = ['#EF5350' if imp > 0 else '#66BB6A' for imp in importances]
        
        # 繪圖
        plt.style.use('seaborn-v0_8-whitegrid')
        
        fig, ax = plt.subplots(figsize=(10, len(features) * 0.7 + 1))
        
        ax.barh(features, importances, color=colors)
        
        # 添加中心線 (0 軸)
        ax.axvline(0, color='grey', linestyle='--', linewidth=0.8)

        # 將標籤改為英文
        ax.set_xlabel("SHAP Impact (Positive Pushes for Churn / Negative Against)")
        ax.set_title(title, fontsize=14)
        ax.invert_yaxis() # 讓最重要的特徵在頂部

        # 處理 Base64 轉換
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close(fig)
        
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    except Exception as e:
        logger.error(f"Failed to generate local SHAP chart: {e}")
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
        # 注意: 這裡使用了單一預測的數值對應，與 FE 函數中的 replace/map 邏輯一致
        input_data = {
            # 確保所有數字輸入都有預設值，且為浮點數，以處理潛在的空值或非數字輸入
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
            
            # 3. 繪製局部 SHAP 圖表 (保持圖表內部標題為英文)
            chart_base64_local = generate_local_shap_chart(
                local_shap_values, 
                f"Individual SHAP Local Influence (Churn Probability: {proba_churn:.4f})"
            )
            
            # 4. 組裝圖表列表 (局部 SHAP 在前，將返回給前端的 title 改回中文)
            if chart_base64_local:
                final_charts.append({
                    "type": "image/png", 
                    "base64_data": chart_base64_local,
                    "title": f"單一客戶局部 SHAP 影響力分析 ( 流失機率 : {proba_churn:.4f} )" # 改回中文標題
                })

        # 5. 無論是否成功預測，如果全局圖已載入，就將其加入列表 (通常在第二個位置，將返回給前端的 title 改回中文)
        if GLOBAL_SHAP_BASE64:
            final_charts.append({
                "type": "image/png", 
                "base64_data": GLOBAL_SHAP_BASE64,
                "title": "模型全局 SHAP 摘要圖 (整體特徵重要性)" # 改回中文標題
            })
            
        # 6. 可讀性輸出 (保持中文)
        geography_map = {0: "法國 (France)", 1: "西班牙 (Spain)", 2: "德國 (Germany)"}
        gender_map = {0: "男性 (Male)", 1: "女性 (Female)"}
        readable_data = {
            '信用分數': data.get('CreditScore', 0),
            '年齡': data.get('Age', 0),
            '服務年限': data.get('Tenure', 0), # 建議新增預設值
            '餘額': f"${float(data.get('Balance',0)):.2f}",
            '產品數量': data.get('NumOfProducts', 0), # 建議新增預設值
            '持有信用卡': "是" if data.get('HasCrCard', 0) == 1 else "否", # 建議新增預設值
            '活躍會員': "是" if data.get('IsActiveMember', 0) == 1 else "否", # 建議新增預設值
            '估計薪資': f"${float(data.get('EstimatedSalary',0)):.2f}",
            '國家/地區': geography_map.get(data.get('Geography', -1), '未知'), # 使用 -1 作為預設鍵
            '性別': gender_map.get(data.get('Gender', -1), '未知')            # 使用 -1 作為預設鍵
        }
        
        # 7. 組裝用於 AI 解釋的 Prompt 片段 (保持中文)
        explanation_prompt_snippet = f"模型預測的客戶流失機率為 {proba_churn:.4f}。\n關鍵特徵資訊:\n{feature_importance_text}"
        
        return jsonify({
            "status": "success",
            "prediction": float(proba_churn),
            "readable_features": readable_data, 
            "explanation_prompt": explanation_prompt_snippet, 
            "charts": final_charts # 返回包含圖表的列表
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


@churn_bank_bp.route('/predict_batch', methods=['POST'])
def predict_batch():
    """
    處理 CSV 檔案上傳，進行批次流失預測，並返回結果 JSON 數據。
    """
    logger.info("接收到批次預測請求。")
    if CHURN_BANK_SERVICE is None or CHURN_BANK_SERVICE.model is None:
        logger.error("模型服務未啟動，無法進行批次預測。")
        return jsonify({"error": "模型服務未啟動，無法進行批次預測。"}), 503

    # 1. 檢查檔案是否上傳
    if 'file' not in request.files:
        raise BadRequest("請求中未包含檔案。請上傳 CSV 檔案。")
    
    file = request.files['file']

    # 修正 Pylance 警告：檢查 file.filename 是否為 None 或空字串
    if not file.filename:
        raise BadRequest("未選擇檔案或檔案名無效。")

    # 檢查副檔名 (使用 lower() 確保大小寫不敏感)
    if not file.filename.lower().endswith('.csv'):
        raise BadRequest("檔案格式錯誤。請上傳 CSV 檔案。")

    try:
        # 2. 讀取 CSV 檔案至 DataFrame
        # 使用 io.StringIO 處理檔案流，避免寫入磁碟
        # 讀取時強制使用 utf-8 解碼
        data_io = io.StringIO(file.read().decode('utf-8'))
        
        # 讀取 CSV 時，讓 Pandas 處理可能出現的空值/NaN
        input_df = pd.read_csv(data_io)
        
        if input_df.empty:
            raise ValueError("CSV 檔案為空。")

        # 檢查 CSV 欄位是否包含 CustomerId
        if 'CustomerId' not in input_df.columns:
            # 這是批次預測的必要欄位，如果沒有，就拋出錯誤
            raise ValueError("CSV 檔案中缺少必要的 'CustomerId' 欄位。")

        # 3. 呼叫 Service 層進行批次預測
        # Service 層會處理特徵工程和對齊，返回包含 'CustomerId' 和 'Exited_Probability' 的 DataFrame
        result_df = CHURN_BANK_SERVICE.predict_batch_csv(
            input_df=input_df, 
            fe_pipeline_func=FeatureEngineerForAPI.run_v2_preprocessing
        )
        
        # 4. 準備 JSON 回應：只保留需要的欄位，並處理 NaN
        
        # 僅保留 CustomerId 和 Exited_Probability 欄位
        result_df_cleaned = result_df[['CustomerId', 'Exited_Probability']].copy()
        
        # ★★★ 關鍵修正：處理 NaN 值，替換為 0.0 以避免產生非法的 JSON 元素 'NaN' ★★★
        # 這確保了所有數值在轉換為 JSON 前都是合法的 float/int
        result_df_cleaned['CustomerId'] = result_df_cleaned['CustomerId'].fillna(0.0)
        result_df_cleaned['Exited_Probability'] = result_df_cleaned['Exited_Probability'].fillna(0.0)
        
        # 將欄位名稱轉換為前端期望的鍵名 (camelCase)
        result_list = result_df_cleaned.rename(columns={
            'CustomerId': 'customerId', 
            'Exited_Probability': 'probability'
        }).to_dict('records')
        
        # 5. 作為 JSON 回應給前端
        return jsonify({
            "status": "success",
            "message": f"成功預測 {len(result_list)} 筆資料。",
            "data": result_list # 返回預測結果列表
        })

    except BadRequest as e:
        logger.error(f"批次 API 請求錯誤: {e}")
        return jsonify({"error": str(e)}), 400
    except ValueError as e:
        logger.error(f"批次數據處理錯誤 (CSV 內容): {e}")
        return jsonify({"error": f"CSV 內容格式錯誤: {e}"}), 400
    except RuntimeError as e:
        logger.error(f"模型預測失敗: {e}")
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        logger.error(f"批次預測過程發生錯誤: {e}", exc_info=True)
        return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500