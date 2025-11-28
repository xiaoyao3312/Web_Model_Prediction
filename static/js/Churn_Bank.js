/**
 * Churn_Bank.js
 * 銀行流失頁面專有邏輯：API Key 處理、收集輸入、呼叫後端 API、串接 Gemini API 取得解釋、渲染結果
 */

let isApiKeyActive = false;
let geminiApiKey = null;
const API_PREDICT_ENDPOINT = '/api/churn_bank/predict'; 
const API_KEY_STORAGE_KEY = 'geminiApiKey';

document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiStatusMsg = document.getElementById('apiStatusMsg');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const initialMessage = document.getElementById('initialMessage');

    // 初始化 API Key
    const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedApiKey) {
        apiKeyInput.value = storedApiKey;
        handleApiKeyActivation(storedApiKey);
    } else {
        updateUIState(false);
    }
    
    // 綁定 API Key 儲存/啟用按鈕
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (isApiKeyActive) {
                handleApiKeyDeactivation();
            } else if (key) {
                localStorage.setItem(API_KEY_STORAGE_KEY, key);
                handleApiKeyActivation(key);
            } else {
                alert("請輸入有效的 Gemini API Key。");
            }
        });
    }

    // 綁定執行分析按鈕
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', runPredictionAndExplain);
    }

    function handleApiKeyActivation(key) {
        geminiApiKey = key;
        isApiKeyActive = true;
        apiKeyInput.disabled = true;
        saveApiKeyBtn.querySelector('.key-status-text').textContent = 'AI 已啟用';
        saveApiKeyBtn.style.backgroundColor = 'var(--primary-color)';
        saveApiKeyBtn.title = '點擊可清除 Key 並禁用 AI';
        apiStatusMsg.textContent = '✅ AI 功能已啟用。請執行分析。';
        apiStatusMsg.style.color = 'var(--primary-color)';
        updateUIState(true);
    }

    function handleApiKeyDeactivation() {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        geminiApiKey = null;
        isApiKeyActive = false;
        apiKeyInput.disabled = false;
        apiKeyInput.value = '';
        saveApiKeyBtn.querySelector('.key-status-text').textContent = '啟用 AI';
        saveApiKeyBtn.style.backgroundColor = 'red';
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
 * 收集表單輸入數據
 */
function collectInputData() {
    const inputFields = document.querySelectorAll('#inputForm input[data-feature-name]');
    const data = {};
    let allValid = true;

    inputFields.forEach(input => {
        const featureName = input.getAttribute('data-feature-name');
        let value = input.value.trim();
        if (value === "") { allValid = false; return; }
        data[featureName] = parseFloat(value);
        if (isNaN(data[featureName])) allValid = false;
    });

    if (!allValid) throw new Error("請確保所有輸入欄位都已填寫並為有效數字。");
    return data;
}

/**
 * 執行模型預測並取得 AI 解釋
 */
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
    const spinner = document.getElementById('spinner');
    const errorMsg = document.getElementById('errorMsg');
    const explanationOutput = document.getElementById('explanationOutput');

    analyzeBtn.disabled = true;
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    explanationOutput.innerHTML = '<p class="initial-message flex items-center"><div class="loading-spinner"></div> 正在運行模型預測並生成 AI 解釋，請稍候...</p>';

    try {
        const inputData = collectInputData();

        // 呼叫後端進行預測
        const predictResponse = await fetch(API_PREDICT_ENDPOINT, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(inputData)
        });
        const predictResult = await predictResponse.json();

        if (predictResponse.status !== 200 || predictResult.error) {
            throw new Error(predictResult.error || `預測 API 錯誤 (Status: ${predictResponse.status})`);
        }

        const churnProb = predictResult.prediction;
        const inputDataString = JSON.stringify(inputData, null, 2);
        const fullPrompt = `模型預測的客戶流失機率為 ${(churnProb * 100).toFixed(2)}%。客戶輸入特徵如下：\n${inputDataString}\n\n請根據以上資訊，並遵循以下使用者指令，提供結構化解釋和行動建議：\n\n【使用者指令】\n${aiPrompt}`;

        explanationOutput.innerHTML = `
            <div class="prediction-result">
                <h3 class="text-lg font-bold mb-3 text-red-700">【模型預測結果】</h3>
                <p class="text-xl font-extrabold mb-4">流失機率: 
                    <span class="prob-value ${churnProb > 0.5 ? 'high-risk' : 'low-risk'}">
                        ${(churnProb * 100).toFixed(2)}%
                    </span> 
                    (${churnProb > 0.5 ? '⚠️' : '✅'} ${churnProb > 0.5 ? '高風險流失客戶' : '低風險流失客戶'})
                </p>
            </div>
            <hr class="card-divider">
            <h3 class="card-title">【AI 風控專家解釋 (生成中...)】</h3>
            <p class="loading-message">正在生成 AI 解釋與行動建議...</p>
        `;

        const explanation = await getAiExplanation(fullPrompt, geminiApiKey);
        explanationOutput.querySelector('.loading-message').outerHTML = explanation;

        // 模擬圖表
        const chartData = {
            featuresImportance: "<ul><li>信用分數: 0.25</li><li>年齡: 0.12</li><li>餘額: 0.10</li>...</ul>",
            decisionPath: "<p>如果 **信用分數 < 650** 且 **活躍會員 = 0** → 高風險</p>",
            customerSegment: "<p>屬於 **高餘額/低活動** 群組</p>",
            probDist: "<p>當前客戶的機率值位於機率分佈的 **第 80 百分位數**。</p>",
            historyTrend: "<p>過去 12 個月平均流失率: 15%</p>"
        };
        renderModelCharts(chartData);

    } catch (error) {
        console.error("預測或解釋失敗:", error);
        errorMsg.textContent = `錯誤: ${error.message}`;
        errorMsg.classList.remove('hidden');
        explanationOutput.innerHTML = '<p class="error-message">預測或 AI 解釋失敗。</p>';
    } finally {
        analyzeBtn.disabled = !isApiKeyActive;
        spinner.classList.add('hidden');
    }
}

/**
 * 呼叫 Gemini API 取得解釋 (修正為 generateContent 的正確格式)
 */
async function getAiExplanation(prompt, apiKey) {
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    
    // ✅ 修正後的 JSON body 結構
    const body = {
        // 使用 contents 陣列
        contents: [
            {
                role: "user",
                parts: [
                    { text: prompt } // 使用 parts 陣列
                ]
            }
        ],
        // 使用 generationConfig 包含所有可選參數
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!response.ok || result.error) {
        const errorDetail = result.error ? result.error.message : JSON.stringify(result);
        throw new Error(`Gemini API 呼叫失敗: ${errorDetail}`);
    }
    
    // ✅ 修正了獲取回傳文本的路徑
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "無法取得回傳內容"; 

    // Markdown 轉換邏輯保持不變
    let htmlText = rawText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/### (.*)/g, '<h3>$1</h3>')
                        .replace(/## (.*)/g, '<h2>$1</h2>')
                        .replace(/\n\s*\*\s+/g, '<br>• ')
                        .replace(/\n/g, '<p>');

    htmlText = htmlText.replace(/^(<p>)+/, '');

    return `<div class="ai-explanation">${htmlText}</div>`;
}

/**
 * 渲染模型圖表
 */
function renderModelCharts(data) {
    const chartContainer = document.getElementById('chartDisplay');
    if (!chartContainer) return;

    chartContainer.innerHTML = '';
    const charts = [
        { title: "特徵重要性 (Feature Importance)", content: data.featuresImportance },
        { title: "決策路徑 (Decision Path / SHAP)", content: data.decisionPath },
        { title: "客戶群組分佈 (Customer Segmentation)", content: data.customerSegment },
        { title: "預測機率分佈 (Prediction Probability)", content: data.probDist },
        { title: "歷史流失趨勢 (Historical Churn Trend)", content: data.historyTrend }
    ];

    charts.forEach(chart => {
        const div = document.createElement('div');
        div.className = 'chart-placeholder';
        div.innerHTML = `<h4>${chart.title}</h4>${chart.content}`;
        chartContainer.appendChild(div);
    });

    const footer = document.createElement('p');
    footer.className = 'chart-footer-message';
    footer.textContent = '使用上下拉桿檢視所有相關圖表。';
    chartContainer.appendChild(footer);
}