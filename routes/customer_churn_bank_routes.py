# routes\customer_churn_bank_routes.py
import matplotlib
import matplotlib.font_manager as fm
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
import logging
import base64
import shap
import sys
import os
import io

from flask import Blueprint, jsonify, request, send_file, make_response
from services.customer_churn_bank_service import CustomerChurnBankService
from typing import Any, Dict, List, Tuple, Callable
from werkzeug.exceptions import BadRequest
from config import Config

# 設置 Matplotlib 為非互動式後端，確保在伺服器環境中穩定運行
matplotlib.use('Agg')

# --- 專案路徑與模組導入 ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PROJECT_ROOT)

# --- 日誌設定 ---
logger = logging.getLogger('CustomerChurnBankRoute')
logger.setLevel(logging.INFO)

logger.info("Matplotlib font cache cleanup logic has been removed for stability.")

# --- Matplotlib 全局設定 ---
plt.rcParams['axes.unicode_minus'] = False # 確保負號正常顯示

# --- 模型與資源路徑定義 ---
# 直接從 Config 類別中獲取已計算好的絕對路徑
MODEL_PATH_FULL = Config.MODEL_BANK_PATH

# MODEL_DIR 應該是模型檔案所在的目錄
MODEL_DIR = os.path.dirname(MODEL_PATH_FULL)

# 全局 SHAP 摘要圖路徑，用於載入預先計算的全局特徵重要性圖
GLOBAL_SHAP_FILE = os.path.join(MODEL_DIR, "shap_summary_plot.png")

# --- 預期核心預測特徵列表 (必須存在且數據無缺失) ---
REQUIRED_PREDICT_COLUMNS = [
    'CreditScore', 'Age', 'Tenure', 'Balance', 'NumOfProducts',
    'HasCrCard', 'IsActiveMember', 'EstimatedSalary',
    'Geography', 'Gender'
]

# --- 必須存在的欄位 (ID + 核心預測欄位) ---
CRITICAL_COLUMNS = ['id'] + REQUIRED_PREDICT_COLUMNS


# --- 預期原始特徵列表 (包含所有可選和必須的欄位) ---
REQUIRED_RAW_FEATURES = CRITICAL_COLUMNS + [
    'CustomerId', 'Surname', 'RowNumber'
]

# --- 輔助函式：補齊缺失欄位 ---
def ensure_required_columns(df: pd.DataFrame, required_cols: List[str]) -> pd.DataFrame:
    """
    檢查並補齊 DataFrame 中缺失的輔助欄位 ('CustomerId', 'Surname', 'RowNumber')。
    
    【注意】: 核心欄位 ('id' 和 REQUIRED_PREDICT_COLUMNS) 的缺失性檢查已在 predict_batch 中完成，
             一旦發現缺失會立即拋出錯誤，不會進入這裡。
    """
    df_copy = df.copy()
    
    # 這裡只專注於處理非核心但可能需要的欄位 (CustomerId, RowNumber, Surname)
    auxiliary_cols = [col for col in required_cols if col not in CRITICAL_COLUMNS]
    missing_auxiliary_cols = set(auxiliary_cols) - set(df_copy.columns)
    
    # 處理 'id' 欄位（雖然在路由層已檢查，這裡為保險起見再確保處理類型）
    # 確保 'id' 已經存在且類型正確 (此時不應有 NaN)
    if 'id' in df_copy.columns:
        df_copy['id'] = pd.to_numeric(df_copy['id'], errors='coerce').fillna(0).astype(int)
    
    if missing_auxiliary_cols:
        logger.warning(f"CSV 檔案中缺少 {len(missing_auxiliary_cols)} 個輔助欄位，已自動補齊: {missing_auxiliary_cols}")
        
        sequential_id = df_copy.index.to_series() + 1
        
        for col in missing_auxiliary_cols:
            
            if col in ['CustomerId', 'RowNumber']:
                df_copy[col] = sequential_id
                
            elif col == 'Surname':
                df_copy[col] = ''
                
        # 確保這些輔助 ID 欄位也是整數
        for id_col in ['CustomerId', 'RowNumber']:
            if id_col in df_copy.columns:
                df_copy[id_col] = pd.to_numeric(df_copy[id_col], errors='coerce').fillna(0).astype(int)

    return df_copy


# --- 特徵工程類別 (保持不變) ---
class FeatureEngineerForAPI:
    """用於單一或批次預測前，進行數據清洗和特徵轉換的類別。"""
    @staticmethod
    def cast_columns(df: pd.DataFrame, int_cols: Any = None, cat_cols: Any = None) -> pd.DataFrame:
        """將指定欄位轉換為整數 (int) 或類別 (category) 類型，處理缺失值為 0。"""
        df_copy = df.copy()
        if int_cols:
            for col in int_cols:
                if col in df_copy.columns:
                    # 這裡假設輸入數據已經過 NaN 檢查，所以 fillna(0) 處理的是強制轉換引起的錯誤
                    df_copy[col] = pd.to_numeric(df_copy[col], errors='coerce').fillna(0).astype(int)
        if cat_cols:
            for col in cat_cols:
                if col in df_copy.columns:
                    df_copy[col] = df_copy[col].astype('category')
        return df_copy

    @staticmethod
    def run_v1_preprocessing(df: pd.DataFrame) -> pd.DataFrame:
        """執行第一階段的特徵工程：處理類別映射、新增基礎衍生特徵。"""
        df_copy = df.copy()
        
        # 處理 Gender (將數值 0/1 轉換為 Male/Female)
        if df_copy['Gender'].dtype in ['int64', 'float64']:
            df_copy['Gender'] = df_copy['Gender'].replace({0: 'Male', 1: 'Female'})
        df_copy['Gender'] = df_copy['Gender'].astype('category')

        # 處理 Geography (將數值 0/1/2 轉換為 France/Spain/Germany)
        geo_map = {0: 'France', 1: 'Spain', 2: 'Germany'}
        if df_copy['Geography'].dtype in ['int64', 'float64']:
            df_copy['Geography'] = df_copy['Geography'].replace(geo_map)
        df_copy['Geography'] = df_copy['Geography'].astype('category')

        # 衍生特徵：Age 分箱
        df_copy['Age_bin'] = pd.cut(df_copy['Age'], bins=[0, 25, 35, 45, 60, np.inf],
                                     labels=['very_young', 'young', 'mid', 'mature', 'senior'],
                                     right=False).astype('category')
        # 衍生特徵：是否擁有 2 個產品
        df_copy['Is_two_products'] = (df_copy['NumOfProducts'] == 2).astype(int)
        # 衍生特徵：德國女性、德國非活躍會員、餘額為零、Tenure 取對數
        df_copy['Germany_Female'] = ((df_copy['Geography'] == 'Germany') & (df_copy['Gender'] == 'Female')).astype(int)
        df_copy['Germany_Inactive'] = ((df_copy['Geography'] == 'Germany') & (df_copy['IsActiveMember'] == 0)).astype(int)
        df_copy['Has_Zero_Balance'] = (df_copy['Balance'] == 0).astype(int)
        df_copy['Tenure_log'] = np.log1p(df_copy['Tenure'])

        # 轉換欄位類型
        int_cols = ['HasCrCard', 'IsActiveMember', 'NumOfProducts', 'Is_two_products',
                    'Has_Zero_Balance', 'Germany_Female', 'Germany_Inactive']
        cat_cols = ['Geography', 'Age_bin', 'Gender']
        df_copy = FeatureEngineerForAPI.cast_columns(df_copy, int_cols=int_cols, cat_cols=cat_cols)

        # 移除不必要的欄位
        cols_to_drop = ['CustomerId', 'Tenure', 'Surname', 'RowNumber']
        df_copy.drop(columns=[col for col in cols_to_drop if col in df_copy.columns], inplace=True, errors='ignore')

        return df_copy

    @staticmethod
    def run_v2_preprocessing(df: pd.DataFrame) -> pd.DataFrame:
        """執行第二階段特徵工程：在 V1 基礎上新增更複雜的互動特徵。"""
        df_copy = FeatureEngineerForAPI.run_v1_preprocessing(df.copy())
        # 新增互動特徵：成熟、非活躍且餘額為零的客戶
        df_copy['is_mature_inactive_transit'] = (
            (df_copy['Has_Zero_Balance'] == 1) & (df_copy['IsActiveMember'] == 0) & (df_copy['Age'] > 40)
        ).astype(int)
        return df_copy

# --- 圖表生成輔助函式 (保持不變) ---
def generate_local_shap_chart(shap_data: Dict[str, float], title: str) -> str:
    """
    使用 Matplotlib 繪製局部 SHAP 影響力水平柱狀圖，並轉換為 Base64 圖片字串。
    用於解釋單一預測的特徵貢獻。
    """
    if not shap_data:
        logger.warning("SHAP data is empty, unable to draw chart.")
        return ""

    try:
        # 根據 SHAP 值的絕對值降序排列
        sorted_data = dict(sorted(shap_data.items(), key=lambda item: abs(item[1]), reverse=True))
        
        features = list(sorted_data.keys())
        importances = list(sorted_data.values())

        # 顏色設置：紅色推高流失，綠色推低流失
        colors = ['#EF5350' if imp > 0 else '#66BB6A' for imp in importances]
        
        plt.style.use('seaborn-v0_8-whitegrid')
        
        fig, ax = plt.subplots(figsize=(10, len(features) * 0.7 + 1))
        
        ax.barh(features, importances, color=colors)
        
        ax.axvline(0, color='grey', linestyle='--', linewidth=0.8)

        ax.set_xlabel("SHAP Impact (Positive Pushes for Churn / Negative Against)")
        ax.set_title(title, fontsize=14)
        ax.invert_yaxis()

        # 轉換為 Base64
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight')
        plt.close(fig)
        
        return base64.b64encode(buf.getvalue()).decode('utf-8')

    except Exception as e:
        logger.error(f"Failed to generate local SHAP chart: {e}")
        return ""


# --- Service 實例化與全局資源載入 (保持不變) ---
CUSTOMER_CHURN_BANK_SERVICE = None
GLOBAL_SHAP_BASE64 = "" # 用於儲存預先載入的全局 SHAP 圖

try:
    # 打印路徑信息
    logger.info(f"模型路徑: {MODEL_PATH_FULL}")
    logger.info(f"模型目錄: {MODEL_DIR}")
    logger.info(f"全局 SHAP 路徑: {GLOBAL_SHAP_FILE}")

    # 1. 初始化模型服務
    CUSTOMER_CHURN_BANK_SERVICE = CustomerChurnBankService(
        model_path=MODEL_PATH_FULL,
        model_dir=MODEL_DIR
    )
    logger.info("CustomerChurnBankService 成功初始化。")

    # 2. 載入離線生成的全局 SHAP 圖表
    if os.path.exists(GLOBAL_SHAP_FILE):
        with open(GLOBAL_SHAP_FILE, "rb") as f:
            GLOBAL_SHAP_BASE64 = base64.b64encode(f.read()).decode('utf-8')
        logger.info(f"全局 SHAP 摘要圖 ({os.path.basename(GLOBAL_SHAP_FILE)}) 載入成功。")
    else:
        logger.warning(f"全局 SHAP 圖表檔案未找到: {GLOBAL_SHAP_FILE}。無法提供全局解釋圖。")

except Exception as e:
    # 這裡是最關鍵的修正：不僅記錄錯誤，還將錯誤信息打印出來
    error_message = f"!!! 嚴重錯誤 !!! 初始化服務或載入全局資源失敗: {e}"
    logger.error(error_message, exc_info=True)
    
    # 為了確保錯誤訊息能被捕捉，我們在這裡強制讓應用程式啟動失敗，並打印錯誤路徑
    # 這一行在 Production 中應該避免，但在診斷時非常有用
    # 檢查是否為FileNotFoundError
    if isinstance(e, FileNotFoundError):
        logger.error(f"路徑錯誤：模型或資源檔案未找到。檢查路徑：{MODEL_PATH_FULL} 或 {GLOBAL_SHAP_FILE}")
        # 為了讓 Gunicorn/Render 捕捉到錯誤，重新拋出異常
        raise RuntimeError(f"模型初始化失敗，檔案路徑錯誤：{e}") from e
    
    # 對其他錯誤也強制拋出
    raise RuntimeError(f"模型初始化失敗：{e}") from e

# --- Blueprint 定義 ---
customer_churn_bank_blueprint = Blueprint('customer_churn_bank_blueprint', __name__)

# -----------------------------------------------------------------------

## 📈 單一客戶流失預測 API (保持不變)
@customer_churn_bank_blueprint.route('/predict', methods=['POST'])
def predict_churn():
    """
    接收單一客戶的 JSON 輸入，進行預測、局部 SHAP 分析，並返回結果。
    """
    try:
        data = request.get_json()
        if not data:
            raise BadRequest("無效的 JSON 請求")

        # 1. 整理輸入數據並使用預設值
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
        final_charts = []

        if CUSTOMER_CHURN_BANK_SERVICE and CUSTOMER_CHURN_BANK_SERVICE.model:
            # 2. 呼叫服務層進行預處理、預測和 SHAP 分析
            prediction_results = CUSTOMER_CHURN_BANK_SERVICE.preprocess_and_predict(
                input_df=input_df, 
                fe_pipeline_func=FeatureEngineerForAPI.run_v2_preprocessing
            )
            
            proba_churn = prediction_results['probability']
            feature_importance_text = prediction_results['feature_importance']
            local_shap_values = prediction_results['local_shap_values']
            
            # 3. 繪製局部 SHAP 圖表
            chart_base64_local = generate_local_shap_chart(
                local_shap_values, 
                f"Individual SHAP Local Influence (Churn Probability: {proba_churn:.4f})"
            )
            
            # 4. 加入全局 SHAP 圖表 (如果已載入)
            if GLOBAL_SHAP_BASE64:
                final_charts.append({
                    "type": "image/png", 
                    "base64_data": GLOBAL_SHAP_BASE64,
                    "title": "模型全局 SHAP 特徵圖 (整體特徵重要性)"
                })

            # 5. 組裝局部圖表結果
            if chart_base64_local:
                final_charts.append({
                    "type": "image/png", 
                    "base64_data": chart_base64_local,
                    "title": f"單筆客戶 SHAP 特徵分析 流失機率 : {proba_churn:.4f}"
                })
                
            # 6. 處理可讀性輸出
            geography_map = {0: "法國 (France)", 1: "西班牙 (Spain)", 2: "德國 (Germany)"}
            gender_map = {0: "男性 (Male)", 1: "女性 (Female)"}
            readable_data = {
                '信用分數': data.get('CreditScore', 0),
                '年齡': data.get('Age', 0),
                '服務年限': data.get('Tenure', 0),
                '餘額': f"${float(data.get('Balance',0)):.2f}",
                '產品數量': data.get('NumOfProducts', 0),
                '持有信用卡': "是" if data.get('HasCrCard', 0) == 1 else "否",
                '活躍會員': "是" if data.get('IsActiveMember', 0) == 1 else "否",
                '估計薪資': f"${float(data.get('EstimatedSalary',0)):.2f}",
                '國家/地區': geography_map.get(data.get('Geography', -1), '未知'),
                '性別': gender_map.get(data.get('Gender', -1), '未知')
            }
            
            explanation_prompt_snippet = f"模型預測的客戶流失機率為 {proba_churn:.4f}。\n關鍵特徵資訊:\n{feature_importance_text}"
            
            # 7. 返回結果
            return jsonify({
                "status": "success",
                "prediction": float(proba_churn),
                "readable_features": readable_data, 
                "explanation_prompt": explanation_prompt_snippet, 
                "charts": final_charts
            })

        # 模擬結果的返回
        readable_data = {
            '信用分數': data.get('CreditScore', 0),
            # ... (其他可讀性數據)
        }
        return jsonify({
            "status": "warning",
            "prediction": 0.5,
            "readable_features": readable_data, 
            "explanation_prompt": "模型未初始化，使用模擬預測，無法提供 AI 解釋。", 
            "charts": []
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

## 💾 批次客戶流失預測 API
@customer_churn_bank_blueprint.route('/predict_batch', methods=['POST'])
def predict_batch():
    """
    接收 CSV 檔案上傳，進行批次流失預測，並返回結果 JSON 數據。
    - 嚴格檢查 CRITICAL_COLUMNS (id + 10核心特徵) 是否存在且數據無任何缺失。
    - 只要有任何缺失，即拒絕整個 CSV 檔案導入。
    """
    logger.info("接收到批次預測請求。")
    if CUSTOMER_CHURN_BANK_SERVICE is None or CUSTOMER_CHURN_BANK_SERVICE.model is None:
        logger.error("模型服務未啟動，無法進行批次預測。")
        return jsonify({"error": "模型服務未啟動，無法進行批次預測。"}), 503

    # 1. 檔案檢查
    if 'file' not in request.files:
        raise BadRequest("請求中未包含檔案。請上傳 CSV 檔案。")
    
    file = request.files['file']

    if not file.filename:
        raise BadRequest("未選擇檔案或檔案名無效。")

    if not file.filename.lower().endswith('.csv'):
        raise BadRequest("檔案格式錯誤。請上傳 CSV 檔案。")

    try:
        # 2. 讀取 CSV 檔案至 DataFrame
        # keep_default_na=True 確保標準缺失值被讀取為 NaN
        data_io = io.StringIO(file.read().decode('utf-8'))
        input_df_original = pd.read_csv(data_io, keep_default_na=True, na_values=['', 'NA', 'N/A'])
        
        if input_df_original.empty:
            raise ValueError("CSV 檔案為空。")
            
        # ------------------------------------------------------------------
        # ★★★ 結構性檢查：檢查核心欄位是否存在 (Fail Fast) ★★★
        # ------------------------------------------------------------------
        missing_cols = [col for col in CRITICAL_COLUMNS if col not in input_df_original.columns]
        if missing_cols:
            error_msg = f"CSV 檔案中缺少關鍵欄位，無法導入。缺失欄位: {', '.join(missing_cols)}"
            logger.error(f"結構性檢查失敗: {error_msg}")
            return jsonify({"error": error_msg}), 400
        
        # --------------------------------------------------------------
        # ★★★ 數據檢查：檢查關鍵欄位中是否存在任何 NaN 值 (Fail Fast) ★★★
        # --------------------------------------------------------------
        # 篩選出關鍵欄位的子集
        df_critical = input_df_original[CRITICAL_COLUMNS]
        
        # 檢查是否有任何 NaN 值
        if df_critical.isnull().values.any():
            # 定位缺失值所在的欄位
            missing_data_cols = df_critical.columns[df_critical.isnull().any()].tolist()
            
            error_msg = f"CSV 檔案在關鍵欄位中發現缺失值，無法導入。包含缺失值的欄位: {', '.join(missing_data_cols)}"
            logger.error(f"數據缺失檢查失敗: {error_msg}")
            return jsonify({"error": error_msg}), 400
        
        logger.info("結構和數據缺失性檢查通過。")
        
        # 3. 補齊非核心欄位 ('CustomerId', 'RowNumber', 'Surname')
        input_df_processed = ensure_required_columns(input_df_original, REQUIRED_RAW_FEATURES)
        
        logger.info(f"批次預測 - 輔助數據補齊完成。數據筆數: {len(input_df_processed)}")
        
        # 4. 呼叫服務層進行批次預測
        result_df = CUSTOMER_CHURN_BANK_SERVICE.predict_batch_csv(
            input_df=input_df_processed, 
            fe_pipeline_func=FeatureEngineerForAPI.run_v2_preprocessing
        )
        
        # 5. 準備 JSON 回應
        
        # 選擇要返回的原始特徵欄位
        # 包含 10 個核心特徵 + id (共 11 個欄位)
        feature_cols_to_return = [
            'id', 'CreditScore', 'Geography', 'Gender', 'Age', 'Tenure', 
            'Balance', 'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary'
        ]
        
        # 確保只有在 CSV 檔中存在的欄位被選取
        available_cols = [col for col in feature_cols_to_return if col in input_df_processed.columns]
        
        # 合併原始特徵和預測結果
        result_df_full = input_df_processed[available_cols].copy()
        result_df_full['probability'] = result_df['Exited_Probability']
        
        # 關鍵：處理 NaN 值、四捨五入和資料類型轉換，避免 JSON 序列化錯誤
        for col in ['id', 'NumOfProducts', 'HasCrCard', 'IsActiveMember']:
             if col in result_df_full.columns:
                 result_df_full[col] = result_df_full[col].fillna(0).astype(int)

        for col in ['CreditScore', 'Age', 'Tenure', 'Balance', 'EstimatedSalary', 'probability']:
             if col in result_df_full.columns:
                 # 保留小數點後兩位，並處理 NaN
                 result_df_full[col] = result_df_full[col].fillna(0.0).astype(float).round(2) 
        
        # 轉換為前端所需的 JSON 列表格式
        result_list = result_df_full.to_dict('records')
        
        # 6. 返回結果
        return jsonify({
            "status": "success",
            "message": f"成功預測 {len(result_list)} 筆資料。",
            "data": result_list
        })

    except BadRequest as e:
        logger.error(f"批次 API 請求錯誤: {e}")
        return jsonify({"error": str(e)}), 400
    except ValueError as e:
        # 捕獲 ensure_required_columns 拋出的 id 缺失錯誤 或 CSV 為空錯誤
        logger.error(f"批次數據處理錯誤 (CSV 內容): {e}")
        return jsonify({"error": f"CSV 內容格式錯誤: {e}"}), 400
    except RuntimeError as e:
        logger.error(f"模型預測失敗: {e}")
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        logger.error(f"批次預測過程發生錯誤: {e}", exc_info=True)
        return jsonify({"error": f"伺服器內部錯誤: {e}"}), 500