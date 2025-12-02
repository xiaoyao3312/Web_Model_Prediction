# Dockerfile 內容
# 使用穩定的 Python 3.11 版本作為基礎映像檔
FROM python:3.11-slim

# 設置容器內的工作目錄
WORKDIR /app

# 將 requirements.txt 複製到容器中
# 這樣做可以利用 Docker 快取，加速後續建置
COPY requirements.txt .

# 安裝所有依賴項。使用 --no-cache-dir 節省空間
RUN pip install --no-cache-dir -r requirements.txt

# 將專案中所有其他檔案 (包括 app.py, models, static, templates 等) 複製到容器的工作目錄
# 此命令會複製您架構中的所有子資料夾 (api, projects, routes, services, static, templates)
COPY . .

# 暴露 Gunicorn 服務端口，Render 預設使用 8080 端口
EXPOSE 8080

# 定義容器啟動時執行的命令：使用 Gunicorn 啟動您的 Flask 應用程式
# 您的啟動命令 (web: gunicorn app:app) 應該寫在這裡
CMD ["gunicorn", "app:app", "-b", "0.0.0.0:8080"]