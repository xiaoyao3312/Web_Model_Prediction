// 核心共用邏輯 (處理 AJAX 呼叫、Spinner 控制等)

// 佔位符
const CORE = {
    showSpinner: (element) => {
        if (element) element.style.display = 'inline-block';
    },
    hideSpinner: (element) => {
        if (element) element.style.display = 'none';
    },
    // ⚠️ 實際應用中，此處應有一個通用的 fetchData 函數來處理所有 API 呼叫
    displayError: (outputElement, message) => {
        outputElement.innerHTML = `
            <h2 style="color: red;">操作失敗</h2>
            <p>錯誤訊息：${message}</p>
        `;
    }
};

console.log("Runner Core JS loaded.");