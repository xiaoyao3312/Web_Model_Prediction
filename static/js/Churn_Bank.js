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

    // 初始化 API Key (保持不變)
    const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedApiKey) {
        apiKeyInput.value = storedApiKey;
        handleApiKeyActivation(storedApiKey);
    } else {
        updateUIState(false);
    }
    
    // 綁定 API Key 儲存/啟用按鈕 (保持不變)
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

    // 綁定執行分析按鈕 (保持不變)
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
 * 收集表單輸入數據 (保持不變)
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
    const chartDisplay = document.getElementById('chartDisplay'); // 引用圖表容器

    analyzeBtn.disabled = true;
    spinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');
    explanationOutput.innerHTML = '<p class="initial-message flex items-center"><div class="loading-spinner"></div> 正在運行模型預測並生成 AI 解釋，請稍候...</p>';
    chartDisplay.innerHTML = '<p class="chart-footer-message">圖表正在生成中...</p>'; // 清除並顯示圖表生成中

    try {
        const inputData = collectInputData();

        // 1. 呼叫後端進行預測
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
        const readableFeatures = predictResult.readable_features; // 獲取可讀性特徵
        const charts = predictResult.charts || []; // 獲取圖表數據
        
        // 格式化可讀性特徵
        const formattedFeatures = Object.keys(readableFeatures)
            .map(key => `- ${key}: ${readableFeatures[key]}`)
            .join('\n');
            
        // 2. 組裝給 AI 的完整 Prompt
        const fullPrompt = `模型預測的客戶流失機率為 ${(churnProb * 100).toFixed(2)}%。客戶輸入特徵如下：\n${formattedFeatures}\n\n請根據以上資訊，並遵循以下使用者指令，提供結構化解釋和行動建議：\n\n【使用者指令】\n${aiPrompt}`;

        // 3. 渲染預測結果 UI
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

        // 4. 呼叫 AI 取得解釋
        const explanation = await getAiExplanation(fullPrompt, geminiApiKey);
        explanationOutput.querySelector('.loading-message').outerHTML = explanation;

        // 5. 渲染圖表
        renderChartsFromBase64(charts);

    } catch (error) {
        console.error("預測或解釋失敗:", error);
        errorMsg.textContent = `錯誤: ${error.message}`;
        errorMsg.classList.remove('hidden');
        explanationOutput.innerHTML = '<p class="error-message">預測或 AI 解釋失敗。</p>';
        chartDisplay.innerHTML = '<p class="error-message">圖表生成失敗。</p>'; // 圖表區也顯示錯誤
    } finally {
        analyzeBtn.disabled = !isApiKeyActive;
        spinner.classList.add('hidden');
    }
}

/**
 * 呼叫 Gemini API 取得解釋 (增加偵錯輸出)
 */
async function getAiExplanation(prompt, apiKey) {
    const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
    
    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.7,
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    // 💥💥 新增偵錯日誌 💥💥
    console.log("Gemini API HTTP Status:", response.status, response.statusText);
    const result = await response.json();
    console.log("Gemini API Raw JSON Response:", result);
    // 💥💥 💥💥 💥💥 💥💥 💥💥

    if (!response.ok || result.error) {
        // 輸出更詳細的錯誤訊息到控制台
        console.error("Gemini API Error Detail:", result.error || result);
        const errorDetail = result.error ? result.error.message : JSON.stringify(result);
        throw new Error(`Gemini API 呼叫失敗，請檢查 API Key 或指令內容。錯誤詳情: ${errorDetail.substring(0, 100)}...`);
    }
    
    // 獲取回傳文本的路徑
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "無法取得回傳內容"; 
    
    // 如果 rawText 仍然是 "無法取得回傳內容"，表示 JSON 結構錯誤或內容被過濾
    if (rawText === "無法取得回傳內容") {
        console.error("Gemini API: 未在預期路徑找到文本內容。可能被安全過濾。", result);
    }
    
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
 * 渲染後端傳來的 Base64 圖表 (保持不變)
 */
function renderChartsFromBase64(charts) {
    const chartContainer = document.getElementById('chartDisplay');
    if (!chartContainer) return;

    chartContainer.innerHTML = '';
    
    if (charts.length === 0 || !charts[0].base64_data) {
        chartContainer.innerHTML = '<p class="chart-footer-message">後端沒有產生圖表或圖表生成失敗。</p>';
        return;
    }

    charts.forEach((chart, index) => {
        const div = document.createElement('div');
        div.className = 'chart-result-item'; 
        
        const title = document.createElement('h4');
        title.textContent = `${chart.title || `圖表 ${index + 1}`}`;
        
        const img = document.createElement('img');
        // 使用 data URL 格式來顯示 Base64 圖片
        img.src = `data:${chart.type || 'image/png'};base64,${chart.base64_data}`; 
        img.alt = chart.title || `模型輸出圖表 ${index + 1}`;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        div.appendChild(title);
        div.appendChild(img);
        chartContainer.appendChild(div);
    });

    const footer = document.createElement('p');
    footer.className = 'chart-footer-message';
    footer.textContent = '模型圖表已載入。使用上下拉桿檢視所有相關圖表。';
    chartContainer.appendChild(footer);
}