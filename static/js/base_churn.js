// base_Churn.js (已移除 Gemini API 功能和 Secondary TopBar 相關處理)

document.addEventListener('DOMContentLoaded', () => {
    // 初始化函數
    // setupApiKeyHandling() 已移除
    setupTopbarToggle(); 

    // 1. 立即執行一次高度更新
    updateHeaderPositions(); 
    
    // 2. 監聽視窗大小變化，防止 Primary TopBar 高度變化時定位出錯
    window.addEventListener('resize', updateHeaderPositions); 
    
    // 3. 使用 MutationObserver 監聽 Primary TopBar 上的 'collapsed' 類別變動，
    //    或內容變動導致的高度變化，確保定位準確。
    const topbarPrimary = document.getElementById('topbar');
    if (topbarPrimary) {
        const observer = new MutationObserver(updateHeaderPositions);
        // 觀察 attributes (針對 class="collapsed" 變動)
        observer.observe(topbarPrimary, { attributes: true, childList: true, subtree: true });
    }
});


/**
 * 處理 TopBar 的縮放邏輯
 */
function setupTopbarToggle() {
    const topbar = document.getElementById('topbar');
    const toggleBtn = document.getElementById('topbar-toggle-btn');
    
    if (!topbar || !toggleBtn) return;

    let isCollapsed = localStorage.getItem('topbarCollapsed') === 'true';

    if (isCollapsed) {
        topbar.classList.add('collapsed');
    }

    toggleBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        topbar.classList.toggle('collapsed', isCollapsed);
        
        localStorage.setItem('topbarCollapsed', isCollapsed);

        // 必須在 class 改變後立即調用，確保 Primary TopBar 高度變化時 Main Content 跟上
        // 使用 setTimeout 確保瀏覽器完成渲染後再計算高度
        setTimeout(updateHeaderPositions, 0); 
    });
}


/**
 * 處理 API Key 相關的邏輯 (已移除)
 */
// setupApiKeyHandling 函數已移除


/**
 * 動態計算 Primary TopBar 高度，並調整 Main Content 的位置
 * 由於 Secondary TopBar 已移除，邏輯變得更簡單。
 */
function updateHeaderPositions() {
    const topbarPrimary = document.getElementById('topbar');
    const mainContent = document.getElementById('main-content');
    const root = document.documentElement;

    if (!topbarPrimary || !mainContent) return;

    // 1. 獲取 TopBar-Primary 的實際高度
    const primaryHeight = topbarPrimary.offsetHeight;
    
    // 2. 設定 Main Content 的 padding-top
    // 總固定高度 = Primary Height + 間距 (10px)
    const totalFixedHeight = primaryHeight + 10;
    mainContent.style.paddingTop = `${totalFixedHeight}px`;
    
    // 3. 更新全域總高度變數 (現在只包含 Primary TopBar 的高度)
    root.style.setProperty('--current-total-header-height', `${primaryHeight}px`);
    
    // 已移除：針對 Secondary TopBar 定位和高度計算的代碼
}