// base_Churn.js (單 TopBar 結構與響應式高度處理)

document.addEventListener('DOMContentLoaded', () => {
    // 初始化函數
    setupTopbarToggle(); 

    // 1. 立即執行一次高度更新
    updateHeaderPositions(); 
    
    // 2. 監聽視窗大小變化
    window.addEventListener('resize', updateHeaderPositions); 
    
    // 3. 監聽 Primary TopBar 的 class 或內容變動
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

        // 確保瀏覽器完成渲染後再計算高度
        setTimeout(updateHeaderPositions, 0); 
    });
}


/**
 * 動態計算 Primary TopBar 高度，並調整 Main Content 的位置
 */
function updateHeaderPositions() {
    const topbarPrimary = document.getElementById('topbar');
    const mainContent = document.getElementById('main-content');
    const root = document.documentElement;

    if (!topbarPrimary || !mainContent) return;

    // 1. 獲取 TopBar-Primary 的實際高度
    const primaryHeight = topbarPrimary.offsetHeight;
    
    // 2. 設定 Main Content 的 padding-top
    const totalFixedHeight = primaryHeight + 10;
    mainContent.style.paddingTop = `${totalFixedHeight}px`;
    
    // 3. 更新全域總高度變數 (供 CSS 內部計算使用)
    root.style.setProperty('--current-total-header-height', `${primaryHeight}px`);
}