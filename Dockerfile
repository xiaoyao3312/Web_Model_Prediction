# -----------------------------------------------------------
# Stage 1: 建構階段 (Builder) - 建立虛擬環境和安裝 Python 套件
# -----------------------------------------------------------
FROM python:3.11 AS builder

# 設置工作目錄
WORKDIR /usr/src/app

# 複製依賴文件
COPY requirements.txt .

# 🚨 【系統依賴】安裝編譯 Python 套件所需的系統庫 (例如，numpy/scipy/xgboost 編譯需要 build-essential)
# 注意：這些依賴將不會被複製到最終映像檔，只是為了確保安裝成功
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        # Matplotlib 運行所需的開發文件，用於編譯 Python 輪子
        pkg-config \
        libgirepository1.0-dev \
        libcairo2-dev \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-xlib-2.0-dev \
        libffi-dev \
        shared-mime-info && \
    rm -rf /var/lib/apt/lists/*

# 創建虛擬環境並安裝所有 Python 依賴到根目錄下的 /venv
# 確保 Gunicorn 被安裝到這個 venv 中
RUN python -m venv /venv && \
    /venv/bin/pip install --upgrade pip && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt


# -----------------------------------------------------------
# Stage 2: 生產階段 (Final Stage) - 使用精簡版 Python 映像來運行
# -----------------------------------------------------------
FROM python:3.11

# 設置最終的工作目錄
WORKDIR /app

# 🚨 【系統依賴】這是關鍵修正：確保所有科學計算和 Gunicorn 運行所需的 RUNTIME 函式庫存在
# 我們需要精確的運行時依賴版本
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        # Gunicorn / Core Python 運行時庫
        libgirepository-1.0-1 \
        libffi8 \
        # Matplotlib 運行時依賴 (確保其 'Agg' 後端能正常工作)
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-xlib-2.0-0 \
        # 雜項
        shared-mime-info \
        # 由於您使用了 Python 的 Matplotlib，我們假設您需要字體支持
        # 儘管您目前沒有中文字體需求，但一些基礎英文字體可能仍然需要
        fontconfig \
        libfreetype6 \
        # 其他依賴：在 Debian/Slim 環境中，確保這些基本庫存在
        libxkbcommon0 \
        libxrandr2 \
        libxrender1 && \
    rm -rf /var/lib/apt/lists/*

# 複製 BUILDER 階段安裝好的虛擬環境到 /app/venv
COPY --from=builder /venv /app/venv

# 複製應用程式程式碼和模型檔案
COPY . .

# 設置 PATH 環境變數，確保系統可以在 /app/venv/bin 中找到 Gunicorn
ENV PATH="/app/venv/bin:$PATH"

# 設定容器啟動命令 (使用標準的 Gunicorn 啟動命令)
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "2", "--timeout", "300"]