# C:\Users\user\Desktop\Web_Model_Prediction\Dockerfile
# Dockerfile 內容
# 使用穩定的 Python 3.11 版本作為基礎映像檔
FROM python:3.11-slim

# --- 標準基礎套件安裝 (僅保留標準 Linux 依賴，移除中文字體和 fc-cache) ---
# 1. 更新套件列表
RUN apt-get update && \
# 2. 安裝繪圖所需的基礎函式庫 (用於 Matplotlib 穩定運行，非中文字體)
    apt-get install -y libgirepository1.0-dev libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info && \
# 3. 清理以減小映像檔大小
    rm -rf /var/lib/apt/lists/*
# ------------------------------------------------------------------------
    
# 設置容器內的工作目錄
WORKDIR /app

# 將 requirements.txt 複製到容器中
COPY requirements.txt .

# 安裝所有依賴項。使用 --no-cache-dir 節省空間
RUN pip install --no-cache-dir -r requirements.txt

# 將專案中所有其他檔案 (包括 app.py, models, static, templates 等) 複製到容器的工作目錄
COPY . .

# 暴露 Gunicorn 服務端口，Render 預設使用 8080 端口
EXPOSE 8080

# 定義容器啟動時執行的命令：使用 Gunicorn 啟動您的 Flask 應用程式
CMD ["gunicorn", "app:app", "-b", "0.0.0.0:8080"]