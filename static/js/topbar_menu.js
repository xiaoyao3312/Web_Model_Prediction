// static\js\topbar_menu.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. 初始化導航欄切換功能
    setupTopbarToggle(); 

    // 2. 立即執行一次高度更新
    updateHeaderPositions(); 
    
    // 3. 監聽視窗大小變化（用於處理響應式佈局引起的 TopBar 高度變化）
    window.addEventListener('resize', updateHeaderPositions); 
    
    // 4. 監聽 Primary TopBar 的 class 或內容變動
    const topbarMenu = document.getElementById('topbarMenu');
    if (topbarMenu) {
        const observer = new MutationObserver(updateHeaderPositions);
        // 觀察 attributes (針對 class="collapsed" 變動，以及其他可能的變化)
        observer.observe(topbarMenu, { 
            attributes: true, 
            childList: true, 
            subtree: true 
        });
    }
});


/**
 * 處理 TopBar 的收合/展開邏輯
 */
function setupTopbarToggle() {
    const topbarMenu = document.getElementById('topbarMenu');
    const topbarToggleButton = document.getElementById('topbarToggleButton');
    
    if (!topbarMenu || !topbarToggleButton) return;

    // 從 localStorage 讀取狀態
    let isCollapsed = localStorage.getItem('topbarCollapsed') === 'true';

    // 初始設定狀態
    if (isCollapsed) {
        topbarMenu.classList.add('collapsed');
    }

    topbarToggleButton.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        // 切換 'collapsed' class
        topbarMenu.classList.toggle('collapsed', isCollapsed);
        
        // 儲存狀態
        localStorage.setItem('topbarCollapsed', isCollapsed);

        // 使用 setTimeout 確保瀏覽器完成 class 切換後再計算高度
        setTimeout(updateHeaderPositions, 0); 
    });
}


/**
 * 動態計算 TopBar 實際高度，並調整 Main Content 的位置
 */
function updateHeaderPositions() {
    const topbarMenu = document.getElementById('topbarMenu');
    const topbarContentGap = document.getElementById('topbarContentGap');
    const root = document.documentElement; // 獲取 :root 元素

    if (!topbarMenu || !topbarContentGap) return;

    // 1. 獲取 TopBar-Primary 的實際高度 (包含 padding 和可能的換行)
    const topbarActualHeight = topbarMenu.offsetHeight;
    
    // 2. 更新 CSS 全域變數，供 .main-content 的 CSS 計算 padding-top
    // 這裡更新的是 --topbarMenu-dynamic-height 變數
    root.style.setProperty('--topbarMenu-dynamic-height', `${topbarActualHeight}px`);
    
    // 3. (可選) 直接設定 Main Content 的 padding-top (若 CSS 計算不可靠時使用)
    // 為了與 CSS 檔案保持一致，建議讓 CSS 處理 padding-top，但這裡保留註解以備參考。
    // const totalSpacing = 10; // TopBar 和 Main Content 之間的間距
    // topbarContentGap.style.paddingTop = `${topbarActualHeight + totalSpacing}px`;
}