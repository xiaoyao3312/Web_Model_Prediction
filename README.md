# Web_Model_Prediction ｜ 銀行客戶流失預測互動平台

![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Framework](https://img.shields.io/badge/Framework-Flask-lightgrey)

這是一個整合機器學習模型與 Web 互動介面的預測平台。透過全端技術實作，將 XGBoost 預測模型、SHAP 歸因分析與 ROI 商業價值評估轉化為直觀的視覺化儀表板，並串接 Google Gemini API 提供即時 AI 諮詢。

## 🚀 技術棧 (Tech Stack)
- **Frontend:** JavaScript (ES6+), HTML5, CSS3 (RWD 響應式設計)
- **Backend:** Python Flask
- **AI/ML:** XGBoost, Scikit-learn, SHAP (模型可解釋性), Gemini API
- **DevOps:** Docker, Render 部署

---

## 🛠️ 本地開發環境設置 (Local Setup)

建議使用 **Anaconda** 建立 **Python 3.11.14** 環境，並搭配 **VS Code** 執行。

### 1. 切換至專案目錄
```bash
# 開啟終端機並切換至專案資料夾路徑
cd Web_Model_Prediction
2. 安裝依賴套件
Bash

pip install -r requirements.txt
3. 模型權重初始化 (首次運行必備)
若需要訓練模型並產生 SHAP 分析圖表，請執行：
Bash

cd projects/customer_churn_bank_code
python customer_churn_bank_train.py
python customer_churn_bank_shap.py
cd ../..
4. 啟動服務
Bash

python app.py
啟動後訪問：http://127.0.0.1:5000/

📂 專案架構 (Directory Structure)
Plaintext

C:\WEB_MODEL_PREDICTION
│  app.py                      # Flask 啟動點
│  config.py                   # 設定檔
│  Dockerfile                  # 容器化定義檔
│  Procfile                    # 雲端平台啟動腳本
│  requirements.txt            # 相依套件清單
│
├─api                          # 預測接口 (Single/Batch Predict)
├─projects                     # 機器學習核心代碼
│  └─customer_churn_bank_code  # 模型訓練、XAI 分析、權重檔 (.joblib)
├─routes                       # Flask 路由管理
├─services                     # 邏輯層 (含 Gemini API 服務)
├─static                       # 靜態資源 (CSS, JS, 圖片)
└─templates                    # HTML 模板頁面

📊 資料欄位說明 (API Important Fields)
本系統批次預測CSV檔案時需要以下關鍵欄位： id, CreditScore, Geography, Gender, Age, Tenure, Balance, NumOfProducts, HasCrCard, IsActiveMember, EstimatedSalary

🎨 前端組件使用 (Frontend Widget)
背景顏色調整小工具 (color_bg_control) 可於任意頁面 HTML 快速引入：
引入 CSS： <link rel="stylesheet" href="{{ url_for('static', filename='css/color_bg_control.css') }}">
引入 JS ： <script src="{{ url_for('static', filename='js/color_bg_control.js') }}"></script>

🆙 版本控制 (Git Management)
Bash
git status           # 檢查修改狀態
git add .            # 暫存修改內容
git commit -m "feat: 更新模型與 UI 介面"
git push             # 推送到遠端倉庫
專案作者：蔡文耀 (Tsai Wen-Yao)