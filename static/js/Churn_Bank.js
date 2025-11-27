/**
 * Churn_Bank.js
 * 銀行流失頁面專有邏輯：收集輸入、呼叫後端 API、渲染結果
 */

const API_ENDPOINT = '/api/churn_bank/predict_and_explain';

document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const explanationOutput = document.getElementById('explanationOutput');
    const initialMessage = document.getElementById('initialMessage');
    
    // 1. 監聽 base_Churn.js 派發的 API Key 狀態變更事件
    document.addEventListener('apiKeyStatusChange', (event) => {
        const isEnabled = event.detail.isEnabled;
        updateUIState(isEnabled);
    });

    // 2. 初始化時檢查 sessionStorage 是否有 Key (從 base_Churn.js 繼承邏輯)
    const savedApiKey = sessionStorage.getItem('geminiApiKey');
    updateUIState(!!savedApiKey);

    /**
     * 根據 API Key 狀態更新 UI
     * @param {boolean} isEnabled - API Key 是否已啟用
     */
    function updateUIState(isEnabled) {
        if (!analyzeBtn) return;
        
        if (isEnabled) {
            analyzeBtn.disabled = false;
            if (initialMessage) {
                initialMessage.innerHTML = '<p class="text-gray-500">AI 功能已啟用。請調整輸入值，然後點擊按鈕執行分析。</p>';
            }
        } else {
            analyzeBtn.disabled = true;
            if (initialMessage) {
                initialMessage.innerHTML = '<p class="text-red-500 font-semibold">AI 功能已禁用！請在頂部導航欄輸入 API Key 並點擊啟用按鈕。</p>';
            }
        }
    }
});


/**
 * 收集輸入數據並呼叫後端 API 進行分析和解釋
 */
async function runPredictionAndExplain() {
    // ⚠️ 從 sessionStorage 獲取 API Key
    const apiKey = sessionStorage.getItem('geminiApiKey'); 
    
    const analyzeBtn = document.getElementById('analyzeBtn');
    const spinner = document.getElementById('spinner');
    const explanationOutput = document.getElementById('explanationOutput');
    const errorMsg = document.getElementById('errorMsg');
    
    // 檢查 API Key 是否存在
    if (!apiKey) {
        errorMsg.textContent = '錯誤：請在頂部導航欄輸入並啟用您的 Gemini API Key。';
        errorMsg.classList.remove('hidden');
        explanationOutput.innerHTML = '<p class="text-red-500 font-semibold">AI 功能未啟用。</p>';
        return; // Key 不存在時直接退出
    }

    errorMsg.classList.add('hidden');
    explanationOutput.innerHTML = '<p class="text-blue-600 initial-message flex items-center"><div class="loading-spinner"></div> 正在執行模型預測並生成 AI 解釋，請稍候...</p>';
    analyzeBtn.disabled = true;
    spinner.classList.remove('hidden');


    // 收集輸入數據 (按照 HTML 模板中 feature_names 的順序)
    const featureInputs = document.querySelectorAll('#inputForm input[data-feature-name]');
    const input_values = [];
    let isValid = true;

    featureInputs.forEach(input => {
        const value = parseFloat(input.value);
        if (isNaN(value)) {
            isValid = false;
        }
        input_values.push(value);
    });

    if (!isValid) {
        errorMsg.textContent = '錯誤：所有輸入欄位都必須是有效的數字。';
        errorMsg.classList.remove('hidden');
        analyzeBtn.disabled = false;
        spinner.classList.add('hidden');
        return;
    }

    const payload = {
        api_key: apiKey,
        input_values: input_values // 傳遞 NumPy 格式的數組 (JS Array)
    };

    // 呼叫後端 Flask API
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const churn_percentage = (result.churn_probability * 100).toFixed(2);
            
            // 渲染結果到左下方 Panel
            explanationOutput.innerHTML = `
                <h3 class="text-lg font-bold mb-3 text-red-700">【模型預測結果】</h3>
                <p class="text-xl font-extrabold mb-4">流失機率: <span class="text-red-600">${churn_percentage}%</span> (${result.prediction_status})</p>
                <hr class="my-4">
                <h3 class="text-lg font-bold mb-3 text-gray-700">【AI 風控專家解釋】</h3>
                <p>${result.explanation.replace(/\n/g, '<br>')}</p>
            `;
        } else {
            errorMsg.textContent = `後端錯誤: ${result.error || '未知錯誤'}`;
            errorMsg.classList.remove('hidden');
            explanationOutput.innerHTML = '<p class="text-red-500">分析失敗，請檢查 API Key 或服務狀態。</p>';
        }

    } catch (error) {
        console.error("Fetch 錯誤:", error);
        errorMsg.textContent = `連線錯誤: 無法連接到後端服務。`;
        errorMsg.classList.remove('hidden');
        explanationOutput.innerHTML = '<p class="text-red-500">連線錯誤，請確保 Flask 服務正在運行。</p>';
    } finally {
        // 分析結束後，檢查 API Key 是否仍存在，才重新啟用按鈕
        const isKeyStillAvailable = !!sessionStorage.getItem('geminiApiKey');
        analyzeBtn.disabled = !isKeyStillAvailable;
        spinner.classList.add('hidden');
    }
}