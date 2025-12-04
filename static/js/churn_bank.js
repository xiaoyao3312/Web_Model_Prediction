/**
 * Churn_Bank.js
 * 銀行流失頁面專有邏輯：API Key 處理、收集輸入、呼叫後端 API、
 * 串接 Gemini API 取得解釋、渲染結果、批次結果處理 (搜索、篩選、排序、分頁)
 */

const API_KEY_STORAGE_KEY = 'geminiApiKey';
const storage = sessionStorage;

let isApiKeyActive = false;
let geminiApiKey = null;

// 自動判斷後端 API 網址
const API_BASE_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? 'http://127.0.0.1:5000'
    : 'https://ai-churn-prediction-system.onrender.com';

const API_PREDICT_ENDPOINT = '/api/churn_bank/predict';
const API_BATCH_ENDPOINT = '/api/churn_bank/predict_batch';

// ★★★ 全域變數用來儲存批次資料和表格狀態 ★★★
let globalBatchData = [];       // 儲存經篩選和排序後的數據 (用於渲染當前頁面)
let originalBatchData = [];     // 儲存最原始的 API 回傳數據 (作為篩選和排序的基礎)
let currentSort = {
    key: 'none',                // 排序鍵: 'id', 'probability', 'risk', 'none'
    order: 'none'               // 排序順序: 'asc', 'desc', 'none'
};

// ★★★ 分頁參數 ★★★
let currentPage = 1;
const rowsPerPage = 10; // 每頁顯示 10 筆資料


// =========================================================================
// DOMContentLoaded: 初始化與事件綁定
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const uploadBatchBtn = document.getElementById('uploadBatchBtn');
    const filterDataBtn = document.getElementById('filterDataBtn');

    initializeDropdowns();

    // --- API Key 初始化 ---
    const storedApiKey = storage.getItem(API_KEY_STORAGE_KEY);
    if (storedApiKey) {
        apiKeyInput.value = storedApiKey;
        handleApiKeyActivation(storedApiKey);
    } else {
        handleApiKeyDeactivation();
    }

    // --- 事件綁定 ---
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (isApiKeyActive) {
                handleApiKeyDeactivation();
            } else if (key) {
                storage.setItem(API_KEY_STORAGE_KEY, key);
                handleApiKeyActivation(key);
            } else {
                alert("請輸入有效的 Gemini API Key。");
            }
        });
    }

    // 單筆預測按鈕
    if (analyzeBtn) analyzeBtn.addEventListener('click', runPredictionAndExplain);
    const predictOnlyBtn = document.getElementById('predictOnlyBtn');
    if (predictOnlyBtn) predictOnlyBtn.addEventListener('click', runPredictionOnly);

    // 批次分析按鈕
    if (uploadBatchBtn) uploadBatchBtn.addEventListener('click', uploadAndPredictBatch);
    if (filterDataBtn) filterDataBtn.addEventListener('click', filterAndRenderBatchResults);
    
    // ★★★ 排序事件綁定 ★★★
    document.querySelectorAll('.fl-table th[data-sort-key]').forEach(header => {
        header.addEventListener('click', handleSort);
    });
    
    // ★★★ ID 搜索輸入事件綁定 ★★★
    const idSearchInput = document.getElementById('idSearchInput');
    if (idSearchInput) idSearchInput.addEventListener('input', filterAndRenderBatchResults);

    // ★★★ 分頁控制事件綁定 ★★★
    document.getElementById('prevPageBtn')?.addEventListener('click', () => handlePagination('prev'));
    document.getElementById('nextPageBtn')?.addEventListener('click', () => handlePagination('next'));
    
    const pageInput = document.getElementById('pageInput');
    if (pageInput) {
        pageInput.addEventListener('change', () => handlePagination('jump'));
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handlePagination('jump');
            }
        });
    }

    // 讓批次結果面板一開始就可見 (如果您的 HTML 中預設是隱藏的，請確保移除 hidden 類別)
    const batchResultPanel = document.getElementById('batch-result-panel');
    if (batchResultPanel) {
        batchResultPanel.style.display = 'block'; // 或者移除您的 hidden class
    }
    // -----------------------------------------------------------------


    // --- API Key 處理函式 (保持不變) ---
    function handleApiKeyActivation(key) {
        geminiApiKey = key;
        isApiKeyActive = true;
        apiKeyInput.disabled = true;
        saveApiKeyBtn.querySelector('.key-status-text').textContent = '已啟用 AI';
        saveApiKeyBtn.title = '點擊可清除 Key 並禁用 AI';
        document.getElementById('apiStatusMsg').textContent = '✅ AI 功能已啟用。請執行分析。';
        document.getElementById('apiStatusMsg').style.color = 'var(--primary-color)';
        updateUIState(true);
    }

    function handleApiKeyDeactivation() {
        storage.removeItem(API_KEY_STORAGE_KEY);
        geminiApiKey = null;
        isApiKeyActive = false;
        apiKeyInput.disabled = false;
        apiKeyInput.value = '';
        saveApiKeyBtn.querySelector('.key-status-text').textContent = '尚未啟用 AI';
        saveApiKeyBtn.title = '在此輸入您的 Gemini API Key';
        document.getElementById('apiStatusMsg').textContent = '❌ AI 功能已禁用！請輸入 Key。';
        document.getElementById('apiStatusMsg').style.color = 'red';
        updateUIState(false);
    }

    function updateUIState(isEnabled) {
        if (!analyzeBtn || !document.getElementById('initialMessage')) return;
        analyzeBtn.disabled = !isEnabled;
        
        const initialMessage = document.getElementById('initialMessage');

        if (isEnabled) {
            initialMessage.innerHTML = '<p class="initial-message">AI 功能已啟用。請調整輸入值與指令，然後點擊按鈕執行分析。</p>';
        } else {
            initialMessage.innerHTML = '<p class="error-message">AI 功能已禁用！請在上方輸入 API Key 並點擊啟用按鈕。</p>';
        }
    }
});

/**
 * 驗證規則定義 (保持不變)
 */
const VALIDATION_RULES = {
    // ... (保持不變) ...
    'CreditScore': { min: 350, max: 850, integer: true, msg: "信用分數必須介於 350 到 850 之間的整數。" },
    'Age': { min: 18, max: 100, integer: true, msg: "年齡必須介於 18 到 100 之間的整數。" },
    'Tenure': { min: 0, max: 10, integer: true, msg: "服務年限必須介於 0 到 10 之間的整數。" },
    'Balance': { min: 0, max: 300000, integer: false, msg: "餘額必須介於 0 到 300000 之間，小數點是允許的。" },
    'NumOfProducts': { min: 1, max: 4, integer: true, msg: "產品數量只能輸入 1、2、3 或 4。" },
    'HasCrCard': { min: 0, max: 1, integer: true, msg: "持有信用卡只能輸入 0 (否) 或 1 (是)。" },
    'IsActiveMember': { min: 0, max: 1, integer: true, msg: "活躍會員只能輸入 0 (否) 或 1 (是)。" },
    'EstimatedSalary': { min: 0, max: 200000, integer: false, msg: "估計薪資必須介於 0 到 200000 之間，小數點是允許的。" },
    'Geography': { min: 0, max: 2, integer: true, msg: "國家/地區只能輸入 0 (法國), 1 (西班牙) 或 2 (德國)。" },
    'Gender': { min: 0, max: 1, integer: true, msg: "性別只能輸入 0 (男) 或 1 (女)。" },
};

/**
 * 收集單筆表單輸入數據 (保持不變)
 */
function collectInputData() {
    // ... (保持不變) ...
    const inputFields = document.querySelectorAll('#inputForm input[data-feature-name]');
    const data = {};
    const errors = [];

    for (const input of inputFields) {
        const featureName = input.getAttribute('data-feature-name');
        const rule = VALIDATION_RULES[featureName];
        let value = input.value.trim();
        let numericValue;

        if (input.classList.contains('dropdown-input')) {
            value = input.getAttribute('data-value');
            if (!value) {
                errors.push(`欄位 "${featureName}" 尚未選擇。`);
                continue;
            }
        }

        numericValue = parseFloat(value);
        if (isNaN(numericValue)) {
            errors.push(`"${featureName}" 必須為有效的數字。`);
            continue;
        }

        if (rule) {
            if (rule.integer && !Number.isInteger(numericValue)) {
                errors.push(`"${featureName}" 錯誤：${rule.msg}`);
            } else if (numericValue < rule.min || numericValue > rule.max) {
                errors.push(`"${featureName}" 錯誤：${rule.msg}`);
            }
        }

        const isError = errors.some(err => err.includes(`"${featureName}"`));
        if (!isError) data[featureName] = numericValue;
    }

    if (errors.length > 0) {
        throw new Error('表單驗證失敗：\n' + errors.join('\n'));
    }

    return data;
}

/**
 * 下拉選單邏輯 (保持不變)
 */
function initializeDropdowns() {
    // ... (保持不變) ...
    document.querySelectorAll('.dropdown-container').forEach(container => {
        const input = container.querySelector('.dropdown-input');
        const list = container.querySelector('.dropdown-list');
        const items = container.querySelectorAll('.dropdown-item');

        input.addEventListener('click', (e) => {
            document.querySelectorAll('.dropdown-list').forEach(l => {
                if (l !== list) l.classList.add('hidden');
            });
            list.classList.toggle('hidden');
            e.stopPropagation();
        });

        items.forEach(item => {
            item.addEventListener('click', () => {
                input.value = item.textContent.trim();
                input.setAttribute('data-value', item.getAttribute('data-value'));
                list.classList.add('hidden');
            });
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-list').forEach(l => l.classList.add('hidden'));
    });
}

/**
 * 執行模型預測並取得 AI 解釋 (保持不變)
 */
async function runPredictionAndExplain() {
    // ... (保持不變) ...
    if (!isApiKeyActive || !geminiApiKey) {
        alert("請先在上方啟用 Gemini API Key。");
        return;
    }

    const aiPrompt = document.getElementById('aiPrompt').value.trim();
    if (!aiPrompt) {
        alert("請輸入 AI 解釋指令。");
        return;
    }

    const analyzeBtn = document.getElementById('analyzeBtn');
    const predictOnlyBtn = document.getElementById('predictOnlyBtn');
    const errorMsg = document.getElementById('errorMsg');
    const explanationOutput = document.getElementById('explanationOutput');
    const chartDisplay = document.getElementById('chartDisplay');

    analyzeBtn.disabled = true;
    predictOnlyBtn.disabled = true;
    errorMsg.classList.add('hidden');

    explanationOutput.innerHTML = '<p class="initial-message flex items-center">正在運行模型預測並生成 AI 解釋，請稍候...</p>';
    chartDisplay.innerHTML = '<p class="chart-footer-message">圖表正在生成中...</p>';

    try {
        const inputData = collectInputData();

        const predictResponse = await fetch(API_PREDICT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputData)
        });

        const predictResult = await predictResponse.json();

        if (predictResponse.status !== 200 || predictResult.error) {
            throw new Error(predictResult.error || `預測 API 錯誤 (Status: ${predictResponse.status})`);
        }

        const churnProb = predictResult.prediction;
        const readableFeatures = predictResult.readable_features;
        const charts = predictResult.charts || [];

        const formattedFeatures = Object.keys(readableFeatures)
            .map(key => `- ${key}: ${readableFeatures[key]}`)
            .join('\n');

        const fullPrompt =
            `模型預測的客戶流失機率為 ${(churnProb * 100).toFixed(2)}%。客戶輸入特徵如下：\n${formattedFeatures}\n\n` +
            `關鍵特徵影響因素分析:\n${predictResult.explanation_prompt}\n\n` +
            `請根據以上資訊，並遵循以下使用者指令，提供結構化解釋和行動建議：\n\n【使用者指令】\n${aiPrompt}`;

        explanationOutput.innerHTML = `
            <div class="prediction-result">
                <h3 class="card-title">【模型預測結果】</h3>
                <p class="text-xl font-extrabold mb-4">流失機率: 
                    <span class="prob-value ${churnProb > 0.5 ? 'high-risk' : 'low-risk'}">
                        ${(churnProb * 100).toFixed(2)}%
                    </span> 
                    (${churnProb > 0.5 ? '⚠️ 高風險流失客戶' : '✅ 低風險流失客戶'})
                </p>
            </div>
            <hr class="card-divider">
            <h3 class="card-title">【AI 風控專家解釋 (生成中...)】</h3>
            <p class="loading-message">正在生成 AI 解釋與行動建議...</p>
        `;

        const explanation = await getAiExplanation(fullPrompt, geminiApiKey);

        const loadingMessageElement = explanationOutput.querySelector('.loading-message');
        if (loadingMessageElement) {
            loadingMessageElement.outerHTML = explanation;
        } else {
            explanationOutput.innerHTML += explanation;
        }

        renderChartsFromBase64(charts);

    } catch (error) {
        console.error("預測或解釋失敗:", error);
        errorMsg.innerHTML = `錯誤: <br>${error.message.replace(/\n/g, '<br>')}`;
        errorMsg.classList.remove('hidden');

        explanationOutput.innerHTML = '<p class="error-message">預測或 AI 解釋失敗。</p>';
        chartDisplay.innerHTML = '<p class="error-message">圖表生成失敗。</p>';
    } finally {
        analyzeBtn.disabled = !isApiKeyActive;
        predictOnlyBtn.disabled = false;
    }
}


// =========================================================================
// 批次 CSV 預測（保持不變，只移除不必要的註釋）
// =========================================================================
async function uploadAndPredictBatch() {
    const csvFileInput = document.getElementById('csvFileInput');
    const uploadBatchBtn = document.getElementById('uploadBatchBtn');
    const filterStats = document.getElementById('filterStats');

    if (csvFileInput.files.length === 0) {
        alert("請先選擇一個 CSV 檔案！");
        return;
    }

    const file = csvFileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const originalText = uploadBatchBtn.innerHTML;
    uploadBatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';
    uploadBatchBtn.disabled = true;

    // 清空 UI 狀態
    document.getElementById('explanationOutput').innerHTML = '<p class="initial-message">批次預測正在執行中。單筆分析結果區域已重置...</p>';
    document.getElementById('chartDisplay').innerHTML = '<p class="chart-footer-message">批次預測結果圖表不在此區塊顯示。</p>';
    
    filterStats.innerHTML = '';
    // 將 colspan 改為 3 (因為後端已移除 missing_count)
    document.getElementById('batchResultBody').innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;"><i class="fas fa-spinner fa-spin"></i> 正在處理資料...</td></tr>';


    try {
        const response = await fetch(`${API_BASE_URL}${API_BATCH_ENDPOINT}`, {
            method: 'POST',
            body: formData 
        });

        // 1. 讀取原始文本並強制清理
        let responseText = await response.text();
        responseText = responseText.trim(); // 移除前後可能導致問題的不可見字元

        let result = null;
        
        try {
            // 2. 嘗試解析 JSON
            if (responseText) {
                result = JSON.parse(responseText);
            }
        } catch (jsonError) {
            throw new Error(`JSON 解析失敗。後端回傳可能不是有效的 JSON。錯誤: ${jsonError.message}`);
        }

        if (response.ok) {
            // 3. 雙重檢查：確保 result 是一個有效的 Object
            if (result && typeof result === 'object' && result !== null) {
                
                const batchData = result.data;
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                if (batchData && Array.isArray(batchData) && batchData.length > 0) {
                    
                    // 儲存兩份數據並重設排序狀態
                    originalBatchData = batchData.map(item => ({
                        ...item,
                        // 確保 probability 是浮點數
                        probability: parseFloat(item.probability)
                    })); 
                    
                    // 重設搜索欄、頁碼和排序狀態
                    document.getElementById('idSearchInput').value = '';
                    currentPage = 1;
                    currentSort = { key: 'none', order: 'none' };
                    document.querySelectorAll('.fl-table th[data-sort-key]').forEach(header => {
                        header.setAttribute('data-sort-order', 'none');
                    });
                    
                    // 渲染表格 (會套用預設的 'none' 排序和 50% 篩選)
                    filterAndRenderBatchResults(); 
                    alert(`批次分析成功！共處理 ${originalBatchData.length} 筆客戶資料。`);
                } else {
                    let formatErrorMsg = "'data' 欄位是空的陣列，沒有客戶資料。";
                    throw new Error(formatErrorMsg);
                }

            } else {
                throw new Error(`JSON 解析成功，但回傳的結果不是有效的物件。原始回應片段:\n${responseText.substring(0, 300)}...`);
            }
        } else {
            // 狀態碼非 200 (伺服器錯誤或欄位缺失錯誤)
            let errorMessage = `伺服器返回錯誤 (Status: ${response.status})`;
            if (result && result.error) {
                errorMessage += `: ${result.error}`; 
            } else if (responseText) {
                errorMessage += `。原始回應片段: ${responseText.substring(0, 300)}...`;
            }
            throw new Error(errorMessage);
        }

    } catch (error) {
        // 錯誤處理
        console.error("批次預測失敗:", error);
        
        // 將 colspan 改為 3
        document.getElementById('batchResultBody').innerHTML = 
            `<tr><td colspan="3" class="error-message" style="text-align:center; padding:20px;">
                ❌ 批次預測失敗:<br> ${error.message.replace(/\n/g, '<br>')}
            </td></tr>`;
        
        filterStats.innerHTML = `<span class="error-message">批次分析失敗。</span>`;
        
    } finally {
        uploadBatchBtn.innerHTML = originalText;
        uploadBatchBtn.disabled = false;
        csvFileInput.value = ''; // 清空檔案輸入欄
    }
}


// =========================================================================
// 排序邏輯 (移除 missing_count 相關邏輯)
// =========================================================================

/**
 * 處理表頭點擊，切換排序狀態 (none -> asc -> desc -> none)
 */
function handleSort() {
    const sortKey = this.getAttribute('data-sort-key');
    const currentOrder = this.getAttribute('data-sort-order');
    const nextOrderMap = {
        'none': 'asc',
        'asc': 'desc',
        'desc': 'none'
    };
    const nextOrder = nextOrderMap[currentOrder];

    // 重設所有表頭狀態
    document.querySelectorAll('.fl-table th[data-sort-key]').forEach(header => {
        if (header !== this) {
            header.setAttribute('data-sort-order', 'none');
        }
    });

    // 設定當前表頭狀態
    this.setAttribute('data-sort-order', nextOrder);

    // 更新全局排序狀態
    currentSort = {
        key: sortKey,
        order: nextOrder
    };

    // 重新渲染結果
    filterAndRenderBatchResults();
}

/**
 * 根據 currentSort 狀態對數據進行排序
 * @param {Array} data - 要排序的數據陣列
 * @returns {Array} 排序後的數據陣列
 */
function sortBatchData(data) {
    const { key, order } = currentSort;
    
    if (order === 'none') {
        // 如果是 'none' 排序，則返回原始數據中與當前篩選數據 ID 匹配的部分 (保留原始上傳順序)
        const filteredIds = new Set(data.map(d => d.id));
        return originalBatchData.filter(row => filteredIds.has(row.id));
    }

    // 複製數據以避免修改原始數據
    const sortedData = [...data];

    sortedData.sort((a, b) => {
        let valA, valB;

        if (key === 'risk') {
            // true=高風險(1), false=低風險(0)。
            valA = (a.probability > 0.5) ? 1 : 0; 
            valB = (b.probability > 0.5) ? 1 : 0;
        } else if (key === 'id') {
            valA = a.id;
            valB = b.id;
        } else if (key === 'probability') {
            valA = a.probability;
            valB = b.probability;
        } else {
            return 0; // 不支援的 key
        }

        if (valA < valB) {
            return order === 'asc' ? -1 : 1;
        }
        if (valA > valB) {
            return order === 'asc' ? 1 : -1;
        }
        return 0; // 值相等
    });

    return sortedData;
}


// =========================================================================
// 批次結果篩選、搜索與渲染核心邏輯
// =========================================================================
function filterAndRenderBatchResults() {
    const thresholdInput = document.getElementById('thresholdInput');
    const idSearchInput = document.getElementById('idSearchInput');
    const tbody = document.getElementById('batchResultBody');
    const statsDiv = document.getElementById('filterStats');
    const paginationControls = document.getElementById('paginationControls');
    
    // 如果沒有資料，直接顯示預設訊息
    if (originalBatchData.length === 0) { 
        statsDiv.innerHTML = '請先上傳 CSV 檔案進行批次分析。';
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;">請上傳 CSV 檔案進行批次分析</td></tr>';
        paginationControls.style.display = 'none';
        return;
    }

    // 1. 應用 ID 搜索
    const searchId = idSearchInput.value.trim();
    let intermediateData = [];

    if (searchId) {
        // ID 搜索會覆蓋機率篩選
        const targetId = parseInt(searchId);
        if (!isNaN(targetId)) {
            intermediateData = originalBatchData.filter(row => row.id === targetId);
        }
        
        // 更新統計文字為搜索結果
        statsDiv.innerHTML = `
            <i class="fas fa-search"></i> 搜索結果: 找到 <strong>${intermediateData.length}</strong> 筆 ID 為 ${searchId} 的資料。
        `;

    } else {
        // 2. 應用機率篩選
        let thresholdPercent = parseFloat(thresholdInput.value);
        if (isNaN(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
            thresholdPercent = 0;
            thresholdInput.value = 0;
        }
        const thresholdDecimal = thresholdPercent / 100;
        
        intermediateData = originalBatchData.filter(row => row.probability >= thresholdDecimal);

        // 更新統計文字為篩選結果
        statsDiv.innerHTML = `
            <strong>總筆數</strong>: ${originalBatchData.length} &nbsp; | &nbsp; 
            <strong>流失機率 > ${thresholdPercent}% 客戶數</strong>: 
            <span class="prob-value high-risk">${intermediateData.length}</span> 位
        `;
        statsDiv.style.fontWeight = '500';
    }
    
    // 3. 應用排序
    globalBatchData = sortBatchData(intermediateData);
    
    // 4. 重置頁碼，並渲染表格
    currentPage = 1;
    renderTablePage(globalBatchData);
}

/**
 * 根據當前頁碼和數據集渲染表格 (處理分頁)。
 * @param {Array<Object>} data - 要顯示的數據列表 (已篩選/搜索/排序)。
 */
function renderTablePage(data) {
    const tableBody = document.getElementById('batchResultBody');
    const paginationControls = document.getElementById('paginationControls');
    tableBody.innerHTML = ''; // 清空現有內容

    const totalPages = Math.ceil(data.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = data.slice(startIndex, endIndex);

    // 檢查頁碼是否有效 (防止在搜索/篩選後頁碼超出範圍)
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        renderTablePage(data); // 重新呼叫以修正頁碼
        return;
    }

    // 更新分頁資訊
    const pageInput = document.getElementById('pageInput');
    pageInput.value = currentPage;
    pageInput.max = totalPages || 1;
    document.getElementById('pageInfo').textContent = ` / ${totalPages || 1}`;
    document.getElementById('prevPageBtn').disabled = currentPage === 1;
    document.getElementById('nextPageBtn').disabled = currentPage === totalPages || totalPages === 0;

    // 渲染表格內容
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;">無結果符合條件。</td></tr>';
        paginationControls.style.display = 'none';
        return;
    }
    
    // 顯示分頁控制
    paginationControls.style.display = 'flex';

    pageData.forEach(row => {
        let probability = row.probability;
        if (typeof probability !== 'number' || isNaN(probability)) {
            probability = 0; 
        }
        
        const probPercent = (probability * 100).toFixed(1) + '%';
        const isHighRisk = probability > 0.5; 
        
        const riskClass = isHighRisk ? 'high-risk-tag' : 'low-risk-tag';
        const riskLabel = isHighRisk ? '高風險' : '低風險';

        const tr = document.createElement('tr');
        tr.dataset.id = row.id;
        
        tr.innerHTML = `
            <td style="padding: 12px; text-align: center;">${row.id ?? 'N/A'}</td> 
            <td style="padding: 12px; font-weight: bold; text-align: center;">
                <span class="${isHighRisk ? 'high-risk' : 'low-risk'}">${probPercent}</span>
            </td>
            <td style="padding: 12px; text-align: center;">
                <span class="risk-tag ${riskClass}">${riskLabel}</span>
            </td>
        `;
        
        // 為每一行添加點擊事件 (未來用於查看詳細數據)
        tr.onclick = () => showRowDetails(row.id);
        tableBody.appendChild(tr);
    });
}

/**
 * 處理分頁按鈕點擊和頁碼輸入。
 * @param {string} action - 'prev', 'next', 或 'jump'.
 */
function handlePagination(action) {
    const totalPages = Math.ceil(globalBatchData.length / rowsPerPage);
    
    if (action === 'prev') {
        currentPage = Math.max(1, currentPage - 1);
    } else if (action === 'next') {
        currentPage = Math.min(totalPages, currentPage + 1);
    } else if (action === 'jump') {
        let page = parseInt(document.getElementById('pageInput').value);
        if (isNaN(page) || page < 1) {
            page = 1;
        } else if (page > totalPages) {
            page = totalPages;
        }
        currentPage = page;
    }
    
    renderTablePage(globalBatchData);
}

/**
 * 顯示單筆資料細節的佔位符函式
 * @param {number} id - 客戶 ID
 */
function showRowDetails(id) {
    const item = originalBatchData.find(d => d.id === id);
    if (item) {
        alert(`點擊 ID ${id}。您現在可以調用單一預測 API，並顯示其詳細資訊和 SHAP 解釋。`);
        // 💡 實際操作：
        // 1. 尋找原始輸入 CSV 中 ID 匹配的行，以取得其所有特徵值。
        // 2. 將這些特徵值設定到單筆預測區塊的輸入欄位中。
        // 3. 呼叫 runPredictionAndExplain() 或 runPredictionOnly()。
    }
}


// =========================================================================
// 執行模型預測（不含 AI 解釋） (保持不變)
// =========================================================================
async function runPredictionOnly() {
    // ... (保持不變) ...
    const analyzeBtn = document.getElementById('analyzeBtn');
    const predictOnlyBtn = document.getElementById('predictOnlyBtn');
    const errorMsg = document.getElementById('errorMsg');
    const explanationOutput = document.getElementById('explanationOutput');
    const chartDisplay = document.getElementById('chartDisplay');

    analyzeBtn.disabled = true;
    predictOnlyBtn.disabled = true;
    errorMsg.classList.add('hidden');

    explanationOutput.innerHTML = '<p class="initial-message">正在運行模型預測，請稍候...</p>';
    chartDisplay.innerHTML = '<p class="chart-footer-message">圖表正在生成中...</p>';

    try {
        const inputData = collectInputData();

        const predictResponse = await fetch(API_PREDICT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputData)
        });

        const predictResult = await predictResponse.json();

        if (predictResponse.status !== 200 || predictResult.error) {
            throw new Error(predictResult.error || `預測 API 錯誤 (Status: ${predictResponse.status})`);
        }

        const churnProb = predictResult.prediction;
        const charts = predictResult.charts || [];

        explanationOutput.innerHTML = `
            <div class="prediction-result">
                <h3 class="card-title">【模型預測結果】</h3>
                <p class="text-xl font-extrabold mb-4">流失機率:
                    <span class="prob-value ${churnProb > 0.5 ? 'high-risk' : 'low-risk'}">
                        ${(churnProb * 100).toFixed(2)}%
                    </span>
                    (${churnProb > 0.5 ? '⚠️ 高風險流失客戶' : '✅ 低風險流失客戶'})
                </p>
            </div>
            <hr class="card-divider">
            <h3 class="card-title">【AI 風控專家解釋】</h3>
            <p class="initial-message">請點擊「執行模型預測並取得 AI 解釋」以生成解釋內容。</p>
        `;

        renderChartsFromBase64(charts);

    } catch (error) {
        errorMsg.innerHTML = `錯誤:<br>${error.message.replace(/\n/g, '<br>')}`;
        errorMsg.classList.remove('hidden');

        explanationOutput.innerHTML = '<p class="error-message">模型預測失敗。</p>';
        chartDisplay.innerHTML = '<p class="error-message">圖表生成失敗。</p>';

    } finally {
        predictOnlyBtn.disabled = false;
        analyzeBtn.disabled = !isApiKeyActive;
    }
}

// =========================================================================
// Gemini API 呼叫 (保持不變)
// =========================================================================
async function getAiExplanation(prompt, apiKey) {
    const GEMINI_API_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!response.ok || result.error) {
        const detail = result.error ? result.error.message : JSON.stringify(result);
        throw new Error(`Gemini API 呼叫失敗。錯誤詳情: ${detail.substring(0, 100)}...`);
    }

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "無法取得回傳內容";

    // 基礎 Markdown 轉 HTML 處理 (不依賴複雜的 Markdown 庫)
    let htmlText = rawText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // 粗體
        .replace(/### (.*)/g, '<h3>$1</h3>') // H3 標題
        .replace(/## (.*)/g, '<h2>$1</h2>') // H2 標題
        .replace(/\n\s*\*\s+/g, '<br>• ') // 處理無序列表
        .replace(/\n/g, '<p>'); // 換行轉段落

    htmlText = htmlText.replace(/^(<p>)+/, ''); // 移除開頭多餘的 <p>

    return `<div class="ai-explanation">${htmlText}</div>`;
}

// =========================================================================
// 渲染後端傳來的 Base64 圖表 (保持不變)
// =========================================================================
function renderChartsFromBase64(charts) {
    const chartContainer = document.getElementById('chartDisplay');
    if (!chartContainer) return;

    chartContainer.innerHTML = '';

    const hasChartData = charts.some(chart => chart.base64_data);
    if (charts.length === 0 || !hasChartData) {
        chartContainer.innerHTML = '<p class="chart-footer-message">後端沒有產生圖表或圖表生成失敗。</p>';
        return;
    }

    charts.forEach((chart, index) => {
        if (!chart.base64_data) return;

        const div = document.createElement('div');
        div.className = 'chart-result-item';

        const title = document.createElement('h4');
        title.textContent = chart.title || `圖表 ${index + 1}`;

        const img = document.createElement('img');
        img.src = `data:${chart.type || 'image/png'};base64,${chart.base64_data}`;
        img.alt = chart.title || `模型輸出圖表 ${index + 1}`;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        div.appendChild(title);
        div.appendChild(img);
        chartContainer.appendChild(div);
    });
}

