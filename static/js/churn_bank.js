/**
 * Churn_Bank.js
 * 銀行流失頁面專有邏輯：API Key 處理、收集輸入、呼叫後端 API、
 * 串接 Gemini API 取得解釋、渲染結果
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

// ★★★ 新增：全域變數用來儲存原始批次資料 ★★★
let globalBatchData = [];


// =========================================================================
// DOMContentLoaded: 初始化與事件綁定
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiStatusMsg = document.getElementById('apiStatusMsg');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const initialMessage = document.getElementById('initialMessage');
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

    // --- API Key 處理函式 ---
    function handleApiKeyActivation(key) {
        geminiApiKey = key;
        isApiKeyActive = true;
        apiKeyInput.disabled = true;
        saveApiKeyBtn.querySelector('.key-status-text').textContent = '已啟用 AI';
        saveApiKeyBtn.title = '點擊可清除 Key 並禁用 AI';
        apiStatusMsg.textContent = '✅ AI 功能已啟用。請執行分析。';
        apiStatusMsg.style.color = 'var(--primary-color)';
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
        apiStatusMsg.textContent = '❌ AI 功能已禁用！請輸入 Key。';
        apiStatusMsg.style.color = 'red';
        updateUIState(false);
    }

    function updateUIState(isEnabled) {
        if (!analyzeBtn || !initialMessage) return;
        analyzeBtn.disabled = !isEnabled;

        if (isEnabled) {
            initialMessage.innerHTML = '<p class="initial-message">AI 功能已啟用。請調整輸入值與指令，然後點擊按鈕執行分析。</p>';
        } else {
            initialMessage.innerHTML = '<p class="error-message">AI 功能已禁用！請在上方輸入 API Key 並點擊啟用按鈕。</p>';
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

// =========================================================================
// 執行模型預測並取得 AI 解釋
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
// 批次 CSV 預測（強化錯誤處理和 JSON 穩定性）
// =========================================================================
async function uploadAndPredictBatch() {
    const csvFileInput = document.getElementById('csvFileInput');
    const uploadBatchBtn = document.getElementById('uploadBatchBtn');
    const batchResultPanel = document.getElementById('batch-result-panel');
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

    // ... (清空 UI 狀態碼略) ...
    document.getElementById('explanationOutput').innerHTML = '<p class="initial-message">批次預測正在執行中。單筆分析結果區域已重置...</p>';
    document.getElementById('chartDisplay').innerHTML = '<p class="chart-footer-message">批次預測結果圖表不在此區塊顯示。</p>';
    batchResultPanel.classList.add('hidden');
    filterStats.innerHTML = '';
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
            // 如果 JSON 解析失敗，直接拋出錯誤，讓 catch 處理
            throw new Error(`JSON 解析失敗。後端回傳可能不是有效的 JSON。錯誤: ${jsonError.message}`);
        }

        if (response.ok) {
            // 3. 雙重檢查：確保 result 是一個有效的 Object
            if (result && typeof result === 'object' && result !== null) {
                
                // 4. 強化檢查：確保 result.data 是一個非空陣列
                const batchData = result.data;
                
                // 使用 Object.prototype.hasOwnProperty.call(result, 'data') 進行嚴格檢查
                if (batchData && Array.isArray(batchData) && batchData.length > 0) {
                    globalBatchData = batchData; // <--- 成功賦值
                    
                    // 顯示批次結果面板
                    batchResultPanel.classList.remove('hidden');
                    // 渲染表格
                    filterAndRenderBatchResults(); 
                    alert(`批次分析成功！共處理 ${globalBatchData.length} 筆客戶資料。`);
                } else {
                    // 格式錯誤或 'data' 欄位不是非空陣列
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
            // 狀態碼非 200 (伺服器錯誤)
            let errorMessage = `伺服器返回錯誤 (Status: ${response.status})`;
            if (result && result.error) {
                errorMessage += `: ${result.error}`; // 如果 JSON 中有明確的 error 欄位
            } else if (responseText) {
                // 如果沒有明確的 JSON 錯誤欄位，顯示原始文本片段
                errorMessage += `。原始回應片段: ${responseText.substring(0, 300)}...`;
            }
            throw new Error(errorMessage);
        }

    } catch (error) {
        // 錯誤處理，顯示更詳細的訊息
        const batchResultPanel = document.getElementById('batch-result-panel');
        
        console.error("批次預測失敗:", error);
        batchResultPanel.classList.remove('hidden'); // 錯誤時也顯示面板，顯示錯誤訊息
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

/**
 * 批次結果篩選與渲染邏輯
 */
function filterAndRenderBatchResults() {
    const thresholdInput = document.getElementById('thresholdInput');
    const tbody = document.getElementById('batchResultBody');
    const statsDiv = document.getElementById('filterStats');

    if (globalBatchData.length === 0) {
        statsDiv.innerHTML = '請先上傳 CSV 檔案進行批次分析。';
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;">請上傳 CSV 檔案進行批次分析</td></tr>';
        return;
    }

    // 取得使用者輸入的百分比 (例如 50)，轉為小數 (0.5)
    let thresholdPercent = parseFloat(thresholdInput.value);
    
    // 防呆機制
    if (isNaN(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
        thresholdPercent = 0;
        thresholdInput.value = 0;
    }
    const thresholdDecimal = thresholdPercent / 100;

    // 進行篩選：找出機率 >= 門檻值的客戶
    const filteredData = globalBatchData.filter(row => row.probability >= thresholdDecimal);

    // 清空表格
    tbody.innerHTML = ''; 

    // 更新統計文字
    statsDiv.innerHTML = `
        <strong>總筆數</strong>: ${globalBatchData.length} &nbsp; | &nbsp; 
        <strong>流失機率 > ${thresholdPercent}% 客戶數</strong>: 
        <span class="prob-value high-risk">${filteredData.length}</span> 位
    `;
    statsDiv.style.fontWeight = '500';

    // 如果篩選後沒資料
    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color: #94a3b8;">沒有符合條件的客戶</td></tr>';
        return;
    }

    // 渲染篩選後的資料
    filteredData.forEach(row => {
        const tr = document.createElement('tr');
        
        // 檢查 probability 是否為有效數字，避免 NaN 導致顯示問題
        let probability = row.probability;
        if (typeof probability !== 'number' || isNaN(probability)) {
            probability = 0; // 設為 0 或其他預設值，雖然理論上後端應該避免 NaN
        }

        const probPercent = (probability * 100).toFixed(1) + '%';
        // 風險等級標籤邏輯: 仍以預設 0.5 (50%) 作為高低風險的判斷基準
        const isHighRisk = probability > 0.5; 
        
        const riskClass = isHighRisk ? 'high-risk-tag' : 'low-risk-tag';
        const riskLabel = isHighRisk ? '高風險' : '低風險';

        // 這裡將 Customer ID 和 Probability 放在不同的欄位
        tr.innerHTML = `
            <td style="padding: 12px; text-align: center;">${row.customerId || 'N/A'}</td>
            <td style="padding: 12px; font-weight: bold; text-align: center;">
                <span class="${isHighRisk ? 'high-risk' : 'low-risk'}">${probPercent}</span>
            </td>
            <td style="padding: 12px; text-align: center;">
                <span class="risk-tag ${riskClass}">${riskLabel}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


// =========================================================================
// 執行模型預測（不含 AI 解釋）
// =========================================================================
async function runPredictionOnly() {
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
// 渲染後端傳來的 Base64 圖表
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