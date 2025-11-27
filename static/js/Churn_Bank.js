// 銀行流失專案特有的 JS 邏輯

// ⚠️ FEATURE_NAMES 變數已在 Churn_Bank.html 中定義

let API_KEY = localStorage.getItem('gemini_api_key') || ''; 
const API_ENDPOINT = '/api/churn_bank_execute'; 

// DOM 元素參考 (從 HTML 獲取)
const apiKeyInput = document.getElementById('apiKeyInput');
const executeBtn = document.getElementById('executeBtn');
const inputForm = document.getElementById('inputForm');
const explanationOutput = document.getElementById('explanationOutput');
const chartDisplay = document.getElementById('chartDisplay');
const spinner = document.getElementById('spinner');

// --- 核心邏輯（複製上一個回應的邏輯） ---

// 1. 輔助函數：創建輸入欄位
function createInputField(name) {
    const group = document.createElement('div');
    group.className = 'form-group';
    const label = document.createElement('label');
    label.setAttribute('for', name);
    label.textContent = name;
    group.appendChild(label);

    let input;
    // 這裡進行簡單的類型判斷，實際應更精確
    if (name === 'Gender') {
        input = document.createElement('select');
        input.id = name;
        input.innerHTML = `<option value="Male">Male (男性)</option><option value="Female">Female (女性)</option>`;
    } else if (name === 'Geography') {
        input = document.createElement('select');
        input.id = name;
        input.innerHTML = `<option value="France">France (法國)</option><option value="Germany">Germany (德國)</option><option value="Spain">Spain (西班牙)</option>`;
    } else if (name === 'HasCrCard' || name === 'IsActiveMember') {
        input = document.createElement('select');
        input.id = name;
        input.innerHTML = `<option value="1">Yes (是)</option><option value="0">No (否)</option>`;
    } 
    else {
        input = document.createElement('input');
        input.type = 'number';
        input.id = name;
        input.placeholder = `輸入 ${name}`;
    }
    
    input.name = name;
    input.required = true;
    group.appendChild(input);
    return group;
}

// 2. 檢查 API 金鑰狀態並更新 UI
function checkApiKeyStatus() {
    const isKeySet = API_KEY.trim().length > 0;
    executeBtn.disabled = !isKeySet;
    
    if (isKeySet) {
        apiKeyInput.placeholder = "API 金鑰已設定";
        apiKeyInput.value = '';
        executeBtn.textContent = "執行分析";
    } else {
        apiKeyInput.placeholder = "請輸入 Gemini API 金鑰";
        executeBtn.textContent = "請先設定金鑰";
    }
}

// 3. 收集輸入數據
function collectInputData() {
    const data = {};
    const inputs = inputForm.querySelectorAll('input, select');
    
    inputs.forEach(input => {
        if (input.type === 'number') {
            data[input.name] = parseFloat(input.value);
        } else if (input.name === 'HasCrCard' || input.name === 'IsActiveMember') {
            data[input.name] = parseInt(input.value);
        } else {
            data[input.name] = input.value;
        }
    });
    
    if (Object.keys(data).length !== FEATURE_NAMES.length) {
        throw new Error("請填寫所有 10 個特徵輸入欄位。");
    }
    return data;
}

// 4. 處理分析請求
async function executeAnalysis() {
    if (!API_KEY) {
        CORE.displayError(explanationOutput, "請先設定 Gemini API 金鑰。");
        return;
    }
    
    let inputFeatures;
    try {
        inputFeatures = collectInputData();
    } catch (e) {
        CORE.displayError(explanationOutput, e.message);
        return;
    }
    
    // 設置 UI 狀態
    executeBtn.disabled = true;
    CORE.showSpinner(spinner);
    explanationOutput.innerHTML = '<p class="initial-message">AI 正在執行模型預測並生成解釋中，請稍候...</p>';
    chartDisplay.innerHTML = '<p class="initial-message">圖表正在生成...</p>';

    const payload = {
        api_key: API_KEY,
        input_features: inputFeatures
    };

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || result.status !== 'success') {
            const errorMessage = result.error || 'Flask 服務器發生未知錯誤。';
            throw new Error(errorMessage);
        }

        // 1. 左下：AI 解釋
        explanationOutput.innerHTML = `
            <h2>流失風險機率：<span style="color: ${result.churn_probability > 50 ? 'red' : 'green'};">${result.churn_probability}%</span></h2>
            <hr>
            ${result.explanation.replace(/\n/g, '<br>')}
        `;

        // 2. 右方：圖表顯示
        chartDisplay.innerHTML = ''; 
        if (result.charts && result.charts.length > 0) {
            result.charts.forEach(base64Image => {
                const img = document.createElement('img');
                img.src = base64Image;
                img.alt = 'Model Output Chart';
                chartDisplay.appendChild(img);
            });
        } else {
             chartDisplay.innerHTML = `<p class="initial-message">模型未提供圖表輸出。</p>`;
        }

    } catch (error) {
        console.error("執行分析錯誤:", error);
        CORE.displayError(explanationOutput, error.message);
    } finally {
        // 恢復 UI 狀態
        executeBtn.disabled = false;
        CORE.hideSpinner(spinner);
    }
}


// --- 初始化與事件監聽 ---

// 1. 動態生成輸入表單
function initializeInputForm() {
    FEATURE_NAMES.forEach(name => {
        inputForm.appendChild(createInputField(name));
    });
}

// 2. 設置 API 金鑰處理
function setupApiKeyHandler() {
    checkApiKeyStatus();

    apiKeyInput.addEventListener('input', () => {
        const key = apiKeyInput.value.trim();
        if (key.length > 10) { 
            API_KEY = key; 
            localStorage.setItem('gemini_api_key', key);
        } else {
            API_KEY = '';
            localStorage.removeItem('gemini_api_key');
        }
        checkApiKeyStatus();
    });
}

// 3. 綁定執行按鈕
executeBtn.addEventListener('click', executeAnalysis);


// 頁面載入完成後執行
document.addEventListener('DOMContentLoaded', () => {
    initializeInputForm();
    setupApiKeyHandler();
});