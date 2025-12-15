// static\js\customer_churn_bank.js

const API_KEY_STORAGE_KEY = 'geminiApiKey';
const storage = sessionStorage;

let isApiKeyActive = false;
let geminiApiKey = null;

// 自動判斷後端 API 網址
const API_BASE_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? 'http://127.0.0.1:5000' 
    : 'https://ai-churn-prediction-system.onrender.com';

const API_PREDICT_ENDPOINT = '/api/customer_churn_bank/predict';
const API_BATCH_ENDPOINT = '/api/customer_churn_bank/predict_batch';

// 全域變數用來儲存批次資料和排序狀態
let globalBatchData = [];       // 儲存當前篩選和排序後的數據 (用於渲染分頁)
let originalBatchData = [];     // 儲存最原始的順序數據 (用於重設排序)
let currentSort = {
    key: 'none',                // 排序鍵: 'id', 'probability', 'risk', 'none'
    order: 'none'               // 排序順序: 'asc', 'desc', 'none'
};

// 分頁相關全域變數和常量
const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let totalPages = 0;
let currentFilteredData = []; // 儲存當前篩選後、未分頁的數據 (用於計算分頁)


// =========================================================================
// DOMContentLoaded: 初始化與事件綁定
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const bankApiKeyInput = document.getElementById('bankApiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiStatusMsg = document.getElementById('apiStatusMsg');
    const AiAnalyzeButton = document.getElementById('AiAnalyzeButton');
    const initialMessage = document.getElementById('initialMessage');
    const uploadBatchBtn = document.getElementById('uploadBatchBtn');
    const filterDataBtn = document.getElementById('filterDataBtn');
    
    // 分頁和搜索 DOM 元素
    const predictOnlyBtn = document.getElementById('predictOnlyBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInput = document.getElementById('pageInput');
    const idSearchInput = document.getElementById('idSearchInput');

    initializeDropdowns();

    // --- API Key 初始化 ---
    const storedApiKey = storage.getItem(API_KEY_STORAGE_KEY);
    if (storedApiKey) {
        bankApiKeyInput.value = storedApiKey;
        handleApiKeyActivation(storedApiKey);
    } else {
        handleApiKeyDeactivation();
    }

    // --- 事件綁定 ---
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = bankApiKeyInput.value.trim();
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
    if (AiAnalyzeButton) AiAnalyzeButton.addEventListener('click', runPredictionAndExplain);
    if (predictOnlyBtn) predictOnlyBtn.addEventListener('click', runPredictionOnly);

    // 批次分析按鈕
    if (uploadBatchBtn) uploadBatchBtn.addEventListener('click', uploadAndPredictBatch);
    if (filterDataBtn) filterDataBtn.addEventListener('click', filterAndRenderBatchResults);
    
    // 排序事件綁定
    document.querySelectorAll('.fl-table th[data-sort-key]').forEach(header => {
        header.addEventListener('click', handleSort);
    });

    // 分頁事件綁定
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => handlePagination(-1));
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => handlePagination(1));
    if (pageInput) {
        pageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handlePageInput();
            }
        });
        pageInput.addEventListener('blur', handlePageInput);
    }

    // ID 搜索事件綁定
    if (idSearchInput) idSearchInput.addEventListener('input', filterAndRenderBatchResults);

    // --- API Key 處理函式 ---
    function handleApiKeyActivation(key) {
        geminiApiKey = key;
        isApiKeyActive = true;
        bankApiKeyInput.disabled = true;
        saveApiKeyBtn.querySelector('.bank-api-key-status').textContent = '已啟用 AI';
        saveApiKeyBtn.title = '點擊可清除 Key 並禁用 AI';
        apiStatusMsg.textContent = '✅ AI 功能已啟用。請執行分析。';
        apiStatusMsg.style.color = 'var(--success-color)';
        // 這裡修正了使用變數的方式，但假設 --font-weight-900 和 --h6-font-size 已經被定義
        apiStatusMsg.style.fontWeight = 'var(--font-weight-900)'; // 避免未定義變數錯誤
        apiStatusMsg.style.fontSize = 'var(--h6-font-size)';    // 避免未定義變數錯誤
        updateUIState(true);
    }

    function handleApiKeyDeactivation() {
        storage.removeItem(API_KEY_STORAGE_KEY);
        geminiApiKey = null;
        isApiKeyActive = false;
        bankApiKeyInput.disabled = false;
        bankApiKeyInput.value = '';
        saveApiKeyBtn.querySelector('.bank-api-key-status').textContent = '尚未啟用 AI';
        saveApiKeyBtn.title = '在此輸入您的 Gemini API Key';
        apiStatusMsg.textContent = '❌ AI 功能已禁用！請輸入 Key。';
        apiStatusMsg.style.color = 'var(--error-color)';
        // 這裡修正了使用變數的方式，但假設 --font-weight-900 和 --h6-font-size 已經被定義
        apiStatusMsg.style.fontWeight = 'var(--font-weight-900)'; // 避免未定義變數錯誤
        apiStatusMsg.style.fontSize = 'var(--h6-font-size)';    // 避免未定義變數錯誤
        updateUIState(false);
    }

    function updateUIState(isEnabled) {
        // 使用問號操作符來確保元素存在
        const aiAnalyzeButton = document.getElementById('AiAnalyzeButton');
        const initialMessage = document.getElementById('initialMessage');
        const predictOnlyBtn = document.getElementById('predictOnlyBtn');

        if (aiAnalyzeButton) aiAnalyzeButton.disabled = !isEnabled;
        if (predictOnlyBtn) predictOnlyBtn.disabled = false; // 預測按鈕不應該被 API Key 禁用

        if (initialMessage) {
            if (isEnabled) {
                initialMessage.innerHTML = '<h6 class="bank-card-title">AI 功能已啟用。請輸入指令，然後點擊按鈕執行分析。</h6>';
            } else {
                initialMessage.innerHTML = '<h6 class="bank-card-title">AI 功能已禁用！請在上方輸入 API Key 並點擊啟用按鈕。</h6>';
            }
        }
    }
});

/**
 * 驗證規則定義
 */
const VALIDATION_RULES = {
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
 * 收集單筆表單輸入數據
 */
function collectInputData() {
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

// =========================================================================
// 下拉選單邏輯
// =========================================================================
function initializeDropdowns() {
    document.querySelectorAll('.dropdown-container').forEach(container => {
        const input = container.querySelector('.dropdown-input');
        const list = container.querySelector('.dropdown-list');
        const items = container.querySelectorAll('.dropdown-item');

        if (!input || !list) return; // 確保元素存在

        input.addEventListener('click', (e) => {
            document.querySelectorAll('.dropdown-list').forEach(l => {
                if (l !== list) l.classList.add('bank-hidden');
            });
            list.classList.toggle('bank-hidden');
            e.stopPropagation();
        });

        items.forEach(item => {
            item.addEventListener('click', () => {
                input.value = item.textContent.trim();
                input.setAttribute('data-value', item.getAttribute('data-value'));
                list.classList.add('bank-hidden');
            });
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-list').forEach(l => l.classList.add('bank-hidden'));
    });
}

// =========================================================================
// 執行模型預測並取得 AI 解釋 (原功能)
// =========================================================================
async function runPredictionAndExplain() {
    if (!isApiKeyActive || !geminiApiKey) {
        alert("請先在上方啟用 Gemini API Key。");
        return;
    }

    const aiPrompt = document.getElementById('aiPrompt').value.trim();
    if (!aiPrompt) {
        alert("請輸入 AI 解釋指令。");
        return;
    }

    const AiAnalyzeButton = document.getElementById('AiAnalyzeButton');
    const predictOnlyBtn = document.getElementById('predictOnlyBtn');
    const errorMsg = document.getElementById('errorMsg');
    const explanationOutput = document.getElementById('explanationOutput');
    const chartDisplay = document.getElementById('chartDisplay');
    const predictionOutput = document.getElementById('predictionOutput');

    AiAnalyzeButton.disabled = true;
    if (predictOnlyBtn) predictOnlyBtn.disabled = true;
    if (errorMsg) errorMsg.classList.add('bank-hidden');

    if (predictionOutput) {
        predictionOutput.innerHTML = '<h6 class="initial-message">AI 分析運行中。結果將在下方專家解釋區顯示。</h6>';
    }

    if (chartDisplay) chartDisplay.innerHTML = '<h6 class="bank-card-title">圖表正在生成中...</h6>';
    
    try {
        const inputData = collectInputData();

        const predictResponse = await fetch(`${API_BASE_URL}${API_PREDICT_ENDPOINT}`, {
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

        const predictionHtml = `<h6 class="bank-card-title"> 流失機率 : <span ${churnProb > 0.5 ? 'high-risk' : 'low-risk'}">${(churnProb * 100).toFixed(3)}%</span> ( ${churnProb > 0.5 ? '⚠️ 高風險流失客戶' : '✅ 低風險流失客戶'} ) </h6>`;
        if (predictionOutput) {
            predictionOutput.innerHTML = predictionHtml;
        }
        
        if (explanationOutput) explanationOutput.innerHTML = `<h6 class="loading-message">正在生成 AI 解釋與行動建議...</h6>`;
        

        const explanation = await getAiExplanation(fullPrompt, geminiApiKey);

        const loadingMessageElement = explanationOutput.querySelector('.loading-message');
        if (loadingMessageElement) {
            loadingMessageElement.outerHTML = explanation;
        } else {
            // 如果找不到 loading 訊息，就直接附加 (保險機制)
            if (explanationOutput) explanationOutput.innerHTML += explanation;
        }

        renderChartsFromBase64(charts);

    } catch (error) {
        console.error("預測或解釋失敗:", error);
        if (errorMsg) {
            errorMsg.innerHTML = `錯誤: <br>${error.message.replace(/\n/g, '<br>')}`;
            errorMsg.classList.remove('bank-hidden');
        }

        if (explanationOutput) explanationOutput.innerHTML = '<h6 class="bank-card-title">預測或 AI 解釋失敗。</h6>';
        if (chartDisplay) chartDisplay.innerHTML = '<h6 class="bank-card-title">圖表生成失敗。</h6>';
        if (predictionOutput) predictionOutput.innerHTML = '<h6 class="bank-card-title">預測或 AI 解釋失敗。</h6>';
        
    } finally {
        if (AiAnalyzeButton) AiAnalyzeButton.disabled = !isApiKeyActive;
        if (predictOnlyBtn) predictOnlyBtn.disabled = false;
    }
}


// =========================================================================
// 批次 CSV 預測
// =========================================================================
async function uploadAndPredictBatch() {
    const bankCsvFileInput = document.getElementById('bankCsvFileInput');
    const uploadBatchBtn = document.getElementById('uploadBatchBtn');
    const filterStats = document.getElementById('filterStats');
    const batchResultBody = document.getElementById('batchResultBody');

    if (bankCsvFileInput.files.length === 0) {
        alert("請先選擇一個 CSV 檔案！");
        return;
    }

    const file = bankCsvFileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const originalText = uploadBatchBtn.innerHTML;
    uploadBatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 處理中...';
    uploadBatchBtn.disabled = true;

    // 重置單筆分析區塊
    document.getElementById('explanationOutput').innerHTML = '<h6 class="initial-message">批次預測正在執行中。單筆分析結果區域已重置...</h6>';
    document.getElementById('chartDisplay').innerHTML = '<h6 class="bank-card-title">批次預測結果圖表不在此區塊顯示。</h6>';
    document.getElementById('predictionOutput').innerHTML = '<h6 class="initial-message">批次預測正在執行中。單筆分析結果區域已重置...</ph6'; 
    
    if (filterStats) filterStats.innerHTML = '';
    if (batchResultBody) batchResultBody.innerHTML = '<tr><td colspan="3" class="bank-card-title"><i class="fas fa-spinner fa-spin"></i> 正在處理資料...</td></tr>';


    try {
        const response = await fetch(`${API_BASE_URL}${API_BATCH_ENDPOINT}`, {
            method: 'POST',
            body: formData 
        });

        let responseText = await response.text();
        responseText = responseText.trim(); 

        let result = null;
        
        try {
            if (responseText) {
                result = JSON.parse(responseText);
            }
        } catch (jsonError) {
            throw new Error(`JSON 解析失敗。後端回傳可能不是有效的 JSON。錯誤: ${jsonError.message}`);
        }

        if (response.ok) {
            if (result && typeof result === 'object' && result !== null) {
                
                const batchData = result.data;
                
                if (result.error && result.error.includes('Missing required columns')) {
                    throw new Error(result.error);
                }
                
                if (batchData && Array.isArray(batchData) && batchData.length > 0) {
                    
                    // 儲存兩份數據並重設排序狀態
                    globalBatchData = batchData; 
                    originalBatchData = JSON.parse(JSON.stringify(batchData)); 
                    
                    // 重設排序狀態
                    currentSort = { key: 'none', order: 'none' };
                    document.querySelectorAll('.fl-table th[data-sort-key]').forEach(header => {
                        header.setAttribute('data-sort-order', 'none');
                    });
                    
                    // 重設分頁與搜索
                    currentPage = 1;
                    const idSearchInput = document.getElementById('idSearchInput');
                    if (idSearchInput) idSearchInput.value = ''; 
                    
                    // 渲染表格
                    filterAndRenderBatchResults(); 
                    alert(`批次分析成功！共處理 ${originalBatchData.length} 筆客戶資料。`);
                } else {
                    let formatErrorMsg = "後端回傳結果格式錯誤或 'data' 欄位不是非空陣列。";
                    if (batchData && Array.isArray(batchData) && batchData.length === 0) {
                            formatErrorMsg = "'data' 欄位是空的陣列，沒有客戶資料。";
                    }
                    
                    throw new Error(`${formatErrorMsg}原始回應片段:\n${responseText.substring(0, 300)}...`);
                }

            } else {
                throw new Error(`JSON 解析成功，但回傳的結果不是有效的物件。原始回應片段:\n${responseText.substring(0, 300)}...`);
            }
        } else {
            let errorMessage = `伺服器返回錯誤 (Status: ${response.status})`;
            if (result && result.error) {
                errorMessage += `: ${result.error}`; 
            } else if (responseText) {
                errorMessage += `。原始回應片段: ${responseText.substring(0, 300)}...`;
            }
            throw new Error(errorMessage);
        }

    } catch (error) {
        
        console.error("批次預測失敗:", error);
        
        if (batchResultBody) batchResultBody.innerHTML = 
            `<tr><td colspan="3" class="error-message">
                ❌ 批次預測失敗:<br> ${error.message.replace(/\n/g, '<br>')}
            </td></tr>`;
        
        if (filterStats) filterStats.innerHTML = `<span class="error-message">批次分析失敗。</span>`;
        
    } finally {
        uploadBatchBtn.innerHTML = originalText;
        uploadBatchBtn.disabled = false;
        bankCsvFileInput.value = ''; 
    }
}

// =========================================================================
// 排序邏輯
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
    
    // 重設為第 1 頁
    currentPage = 1;

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
        // 如果是 'none' 排序，則按照原始數據的順序重新排 (只包含當前篩選出來的 ID)
        const filteredIds = new Set(data.map(d => d.id));
        return originalBatchData.filter(row => filteredIds.has(row.id));
    }

    // 複製數據以避免修改原始數據
    const sortedData = [...data];

    sortedData.sort((a, b) => {
        let valA, valB;

        if (key === 'risk') {
            // true=高風險(1), false=低風險(0)。風險等級：高風險排在前面 (降序)
            valA = (a.probability > 0.5) ? 1 : 0; 
            valB = (b.probability > 0.5) ? 1 : 0;
            // 由於風險本身就是二元變量，我們需要確定 'asc' 和 'desc' 的意義
            // 假設 'asc' (升序) = 低風險到高風險 (0 -> 1)
            // 假設 'desc' (降序) = 高風險到低風險 (1 -> 0)
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
        // 如果值相等，則退回以 ID 排序 (確保穩定性)
        if (order === 'asc') {
            return (a.id ?? 0) - (b.id ?? 0);
        } else {
            return (b.id ?? 0) - (a.id ?? 0);
        }
    });

    return sortedData;
}


// =========================================================================
// 批次結果篩選、搜索與渲染邏輯
// =========================================================================
function filterAndRenderBatchResults() {
    const thresholdInput = document.getElementById('thresholdInput');
    const idSearchInput = document.getElementById('idSearchInput');
    const tbody = document.getElementById('batchResultBody');
    const statsDiv = document.getElementById('filterStats');
    const pageInput = document.getElementById('pageInput');
    const pageInfo = document.getElementById('pageInfo');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');

    if (originalBatchData.length === 0) { 
        if (statsDiv) statsDiv.innerHTML = '請先上傳 CSV 檔案進行批次分析。';
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="bank-card-title">請上傳 CSV 檔案進行批次分析</td></tr>';
        if (pageInput) pageInput.value = 1;
        if (pageInfo) pageInfo.textContent = ' / 1';
        if (prevPageBtn) prevPageBtn.disabled = true;
        if (nextPageBtn) nextPageBtn.disabled = true;
        return;
    }

    // 1. 取得使用者輸入
    let thresholdPercent = parseFloat(thresholdInput?.value) || 0;
    const idSearchTerm = idSearchInput?.value.trim().toLowerCase() || '';
    
    // 防呆機制
    if (isNaN(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
        thresholdPercent = 0;
        if (thresholdInput) thresholdInput.value = 0;
    }
    const thresholdDecimal = thresholdPercent / 100;

    // 2. 進行篩選：找出 機率 >= 門檻值 **AND** ID 包含搜索詞 的客戶
    let filteredData = originalBatchData.filter(row => {
        const probFilter = row.probability >= thresholdDecimal;
        // 確保 row.id 存在且可轉換為字串
        const rowIdString = row.id != null ? String(row.id).toLowerCase() : '';
        const idSearch = rowIdString.includes(idSearchTerm);
        return probFilter && idSearch;
    });
    
    // 3. 應用當前排序狀態
    currentFilteredData = sortBatchData(filteredData); 
    
    // 4. 計算分頁
    totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
    
    // 確保當前頁碼在有效範圍內
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (currentPage < 1 && totalPages > 0) {
        currentPage = 1;
    } else if (totalPages === 0) {
        currentPage = 1;
    }
    
    // 5. 根據分頁切割數據
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const finalData = currentFilteredData.slice(startIndex, endIndex);

    // 清空表格
    if (tbody) tbody.innerHTML = ''; 

    // 6. 更新統計文字
    if (statsDiv) {
        statsDiv.innerHTML = `
            <strong>總筆數</strong>: ${originalBatchData.length} &nbsp; | &nbsp; 
            <strong>篩選後符合條件客戶數</strong>: 
            <span class="high-risk">${currentFilteredData.length}</span> 位
            (機率 > ${thresholdPercent}%)
        `;
        statsDiv.style.fontWeight = '500';
    }
    
    // 7. 更新分頁控制元件狀態
    const totalCount = currentFilteredData.length;
    if (pageInput) pageInput.value = currentPage;
    if (pageInfo) pageInfo.textContent = ` / ${totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1 || totalCount === 0;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages || totalCount === 0;


    // 8. 渲染數據
    if (finalData.length === 0) {
        let message = totalCount === 0 
            ? '沒有符合篩選條件 (機率/ID) 的客戶' 
            : '找不到當前頁面數據 (可能是分頁錯誤)';
        
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;">${message}</td></tr>`;
        return;
    }
    
    // 8. 渲染數據
    if (finalData.length === 0) {
        let message = totalCount === 0 
            ? '沒有符合篩選條件 (機率/ID) 的客戶' 
            : '找不到當前頁面數據 (可能是分頁錯誤)';
        
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;">${message}</td></tr>`;
        // 無論是否有數據，都清空詳情面板
        displayFeatureDetails(null); 
        return;
    }

    // 關鍵修改：添加行點擊事件
    finalData.forEach(row => {
        const tr = document.createElement('tr');
        
        // --- 新增：行點擊事件處理 START ---
        // 1. 儲存完整的行數據 (包含特徵) 到 DOM 元素上
        tr.dataset.rowData = JSON.stringify(row); 
        
        // 2. 添加點擊事件監聽器
        tr.addEventListener('click', function() {
            // A. 移除所有行上的選中標記
            document.querySelectorAll('#batchResultBody tr').forEach(rowEl => {
                rowEl.classList.remove('selected-row');
            });

            // B. 為當前點擊的行添加選中標記 (CSS 會改變樣式)
            this.classList.add('selected-row');

            // C. 解析並顯示詳情
            try {
                // 從 dataset 中解析完整的行數據 (包含 10 個特徵)
                const rowData = JSON.parse(this.dataset.rowData);
                displayFeatureDetails(rowData);
            } catch (e) {
                console.error("解析行數據失敗:", e);
                displayFeatureDetails(null); // 清空詳情面板
            }
        });
        // --- 新增：行點擊事件處理 END ---
        
        let probability = row.probability;
        if (typeof probability !== 'number' || isNaN(probability)) {
            probability = 0; 
        }

        const probPercent = (probability * 100).toFixed(2) + '%';
        const isHighRisk = probability > 0.5; 
        
        const riskClass = isHighRisk ? 'high-risk' : 'low-risk';
        const riskLabel = isHighRisk ? '高風險' : '低風險';

        // 渲染 3 個欄位 (ID, 流失機率, 風險等級)
        tr.innerHTML = `
            <td style="padding: 12px; text-align: center;">${row.id ?? 'N/A'}</td> 
            <td style="padding: 12px; font-weight: bold; text-align: center;">
                <span class="${isHighRisk ? 'high-risk' : 'low-risk'}">${probPercent}</span>
            </td>
            <td style="padding: 12px; text-align: center;">
                <span class="risk-tag ${riskClass}">${riskLabel}</span>
            </td>
            `;
        if (tbody) tbody.appendChild(tr);
    });
}

// =========================================================================
// 分頁控制邏輯
// =========================================================================

/**
 * 處理分頁按鈕 (上一頁/下一頁) 點擊事件
 * @param {number} delta - 頁碼變動量 (-1 或 1)
 */
function handlePagination(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        filterAndRenderBatchResults();
    }
}

/**
 * 處理頁碼輸入框事件
 */
function handlePageInput() {
    const pageInput = document.getElementById('pageInput');
    if (!pageInput) return;

    let page = parseInt(pageInput.value);
    
    if (isNaN(page) || page < 1) {
        page = 1;
    } else if (page > totalPages) {
        page = totalPages > 0 ? totalPages : 1;
    }
    
    // 只有在頁碼有實際變動時才重新渲染
    if (page !== currentPage) {
        currentPage = page;
        filterAndRenderBatchResults();
    } else {
        // 確保輸入框的值是正確的
        pageInput.value = currentPage; 
    }
}

// =========================================================================
// 批次結果視圖重置 (例如：新檔案上傳後)
// =========================================================================
function resetBatchView() {
    // 重設分頁和篩選數據
    currentPage = 1;
    // 重新從原始數據開始
    currentFilteredData = originalBatchData; 
    totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
    
    // 重設篩選欄位
    const idSearchInput = document.getElementById('idSearchInput');
    const thresholdInput = document.getElementById('thresholdInput');
    if (idSearchInput) idSearchInput.value = '';
    // 將流失機率門檻值重設為 50
    if (thresholdInput) thresholdInput.value = '50';
    
    // --- 關鍵新增：清空特徵詳情面板 START ---
    const grid = document.getElementById('featureGrid');
    const placeholder = document.getElementById('featureDetailsPlaceholder');
    
    if (grid && placeholder) {
        // 清空內容，並顯示佔位符
        grid.innerHTML = '';
        grid.classList.add('bank-hidden');
        placeholder.classList.remove('bank-hidden');
    }
    // --- 關鍵新增：清空特徵詳情面板 END ---
    
    // 重新執行篩選與渲染 (由於篩選欄位已重設，這將顯示第一頁的原始數據)
    filterAndRenderBatchResults(); 
}

// =========================================================================
// 執行模型預測（不含 AI 解釋）
// =========================================================================
async function runPredictionOnly() {
    const AiAnalyzeButton = document.getElementById('AiAnalyzeButton');
    const predictOnlyBtn = document.getElementById('predictOnlyBtn');
    const errorMsg = document.getElementById('errorMsg');
    // ✨ 修改點 1: 新增 predictionOutput 引用，並保留 chartDisplay
    const predictionOutput = document.getElementById('predictionOutput'); 
    const chartDisplay = document.getElementById('chartDisplay'); 
    const explanationOutput = document.getElementById('explanationOutput'); 

    if (AiAnalyzeButton) AiAnalyzeButton.disabled = true;
    if (predictOnlyBtn) predictOnlyBtn.disabled = true;
    if (errorMsg) errorMsg.classList.add('bank-hidden');

    // ✨ 修改點 2: 更新顯示等待訊息的元素
    if (predictionOutput) predictionOutput.innerHTML = '<h6 class="initial-message">正在運行模型預測，請稍候...</h6>';
    if (chartDisplay) chartDisplay.innerHTML = '<h6 class="bank-card-title">圖表正在生成中...</h6>';
    if (explanationOutput) explanationOutput.innerHTML = '<h6 class="initial-message">請點擊「執行模型預測並取得 AI 解釋」以生成解釋內容。</h6>';

    try {
        const inputData = collectInputData();

        const predictResponse = await fetch(`${API_BASE_URL}${API_PREDICT_ENDPOINT}`, {
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

        // ✨ 修改點 3: 將結果輸出到 predictionOutput
        if (predictionOutput) {
            predictionOutput.innerHTML = `<h6 class="bank-card-title"> 流失機率 : <span ${churnProb > 0.5 ? 'high-risk' : 'low-risk'}>${(churnProb * 100).toFixed(3)} % </span> ( ${churnProb > 0.5 ? '⚠️ 高風險流失客戶' : '✅ 低風險流失客戶'} ) <h6>`;
        }

        renderChartsFromBase64(charts);

    } catch (error) {
        if (errorMsg) {
            errorMsg.innerHTML = `錯誤:<br>${error.message.replace(/\n/g, '<br>')}`;
            errorMsg.classList.remove('bank-hidden');
        }

        // ✨ 修改點 4: 錯誤訊息輸出到 predictionOutput 和 explanationOutput
        if (predictionOutput) predictionOutput.innerHTML = '<h6 class="bank-card-title">模型預測失敗。</h6>';
        if (chartDisplay) chartDisplay.innerHTML = '<h6 class="bank-card-title">圖表生成失敗。</h6>';
        if (explanationOutput) explanationOutput.innerHTML = '<h6 class="bank-card-title">模型預測失敗。</h6>';

    } finally {
        if (predictOnlyBtn) predictOnlyBtn.disabled = false;
        if (AiAnalyzeButton) AiAnalyzeButton.disabled = !isApiKeyActive;
    }
}

// =========================================================================
// Gemini API 呼叫
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

    // 基礎 Markdown 轉 HTML 處理
    let htmlText = rawText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
        .replace(/### (.*)/g, '<h3>$1</h3>') 
        .replace(/## (.*)/g, '<h2>$1</h2>') 
        // 將換行後跟著星號的列表轉換為帶有 • 符號的列表項
        .replace(/\n\s*\*\s+/g, '<br>• ') 
        // 將其他獨立的換行符轉換為 <p>，但這可能導致過多 <p>
        .replace(/(?<!<br>• )(\n)(?!<)/g, '</p><p>'); 

    // 移除開頭和結尾多餘的 <p>
    htmlText = htmlText.replace(/^(<p>)+/, '').replace(/(<p>)+$/, '');

    return `<div class="ai-explanation">${htmlText}</div>`;
}

// =========================================================================
// 渲染後端傳來的 Base64 圖表
// =========================================================================
function renderChartsFromBase64(charts) {
    const chartContainer = document.getElementById('chartDisplay');
    if (!chartContainer) return;

    chartContainer.innerHTML = '';

    const hasChartData = charts.some(chart => chart.base64_data);
    if (charts.length === 0 || !hasChartData) {
        chartContainer.innerHTML = '<h6 class="bank-card-title">後端沒有產生圖表或圖表生成失敗。</h6>';
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

// --- 單筆特徵詳情相關變數和函式 ---

// 定義要顯示的特徵及其中文名稱和順序 (共 10 個核心特徵)
const FEATURE_DISPLAY_MAP = {
    'CreditScore': '信用分數',
    'Geography': '所在國家',
    'Gender': '性別',
    'Age': '客戶年齡 (歲)', // 使用者要求
    'Tenure': '服務年限 (年)', // 使用者要求
    'Balance': '帳戶餘額 (NT$)',
    'NumOfProducts': '產品數量',
    'HasCrCard': '持有信用卡',
    'IsActiveMember': '活躍客戶',
    'EstimatedSalary': '預估薪資 (NT$)'
};

const FEATURE_DISPLAY_ORDER = [
    'CreditScore', 'Geography', 'Gender', 'Age', 'Tenure', 
    'Balance', 'NumOfProducts', 'HasCrCard', 'IsActiveMember', 'EstimatedSalary'
];


/**
 * 渲染單筆客戶的特徵詳情到指定面板
 * @param {Object} data - 包含客戶特徵的單筆數據物件
 */
function displayFeatureDetails(data) {
    const grid = document.getElementById('featureGrid');
    const placeholder = document.getElementById('featureDetailsPlaceholder');

    if (!data) {
        // 沒有數據時：顯示佔位符，隱藏網格
        grid.classList.add('bank-hidden');
        placeholder.classList.remove('bank-hidden');
        return;
    }
    
    // 顯示網格，隱藏佔位符
    placeholder.classList.add('bank-hidden');
    grid.classList.remove('bank-hidden');
    // 移除初始佔位符類別（可選，但保持狀態整潔）
    grid.classList.remove('initial-feature-grid'); 

    grid.innerHTML = ''; // 清空舊內容

    // 依序渲染 10 個特徵
    FEATURE_DISPLAY_ORDER.forEach(key => {
        const label = FEATURE_DISPLAY_MAP[key];
        let value = data[key];
        
        // 數值格式化處理 (邏輯不變)
        if (key === 'Balance' || key === 'EstimatedSalary') {
            // 格式化為貨幣，顯示兩位小數
            value = new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);
        } else if (key === 'HasCrCard' || key === 'IsActiveMember') {
            // 0/1 轉換為 是/否
            value = value === 1 ? '是' : '否';
        } else if (typeof value === 'number') {
             // 其他數字特徵（如年齡、信用分數）取整
             value = Math.round(value); 
        }

        // 建立特徵顯示元素
        const itemDiv = document.createElement('div');
        // 應用新的 CSS 類別，移除所有 Tailwind 類別
        itemDiv.className = 'feature-item'; 

        const labelP = document.createElement('p');
        // 應用新的 CSS 類別
        labelP.className = 'feature-item-label';
        labelP.textContent = label;

        const valueSpan = document.createElement('span');
        // 應用新的 CSS 類別
        valueSpan.className = 'feature-item-value';
        valueSpan.textContent = value;
        
        itemDiv.appendChild(labelP);
        itemDiv.appendChild(valueSpan);
        grid.appendChild(itemDiv);
    });
}