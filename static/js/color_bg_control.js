// static\js\color_bg_control.js
// 全域腳本：主題切換/顏色控制 - 增強為命名空間模式

/*
<div id="fab-color"> 
    <div id="fab-icon">🎨</div> 
    <div id="fab-content"> 
        <div class="fab-panel-title">背景顏色調整</div> 
        <div class="fab-sliders"> 
            <label>R: <span id="valR">128</span></label> 
            <input type="range" id="rangeR" min="0" max="255" value="128"> 
            <label>G: <span id="valG">128</span></label> 
            <input type="range" id="rangeG" min="0" max="255" value="128"> 
            <label>B: <span id="valB">128</span></label> 
            <input type="range" id="rangeB" min="0" max="255" value="128"> 
            <label>A: <span id="valA">1</span></label> 
            <input type="range" id="rangeA" min="0" max="1" step="0.01" value="1"> 
        </div>
        <div class="fab-themes"> 
            <button class="fab-theme-btn" data-color="rgba(0,0,0,1)">黑色</button>
            <button class="fab-theme-btn" data-color="rgba(85,85,85,1)">深色</button>
            <button class="fab-theme-btn" data-color="rgba(128,128,128,1)">灰色</button>
        </div>
        <div class="fab-themes"> 
            <button class="fab-theme-btn" data-color="rgba(170,170,170,1)">淺色</button>
            <button class="fab-theme-btn" data-color="rgba(255,255,255,1)">白色</button>
            <button id="randomBtn" class="fab-theme-btn">隨機</button>       
        </div> 
    </div>
</div>
*/

console.log("color_bg_control JS loaded.");

// 定義一個全域物件作為命名空間，用於暴露核心功能
window.ThemeControl = (function() {
    
    // --- 內部私有變數 (Private Variables) ---
    const EDGE_MARGIN = 5; 
    let isDrag = false;
    let offsetX = 0;
    let offsetY = 0;

    // --- DOM 元素變數 (需要在 DOMContentLoaded 後才能安全取得) ---
    let fab, icon, content, randomBtn;
    let sliders = {};
    let labels = {};
    let themeBtns;

    /**
     * @public function - 應用當前滑桿值作為主題顏色
     * 此函數被設計為可以從外部調用 (例如：在其他模組中需要強制重繪顏色)
     */
    function applyColor() { 
        // 確保 DOM 元素已載入
        if (!sliders.r) return; 
        
        const r = +sliders.r.value;
        const g = +sliders.g.value;
        const b = +sliders.b.value;
        const a = sliders.a.value;
        const color = `rgba(${r},${g},${b},${a})`;
        
        // 主背景亮度
        const avg = (r + g + b) / 3;
        
        // Power Function 算法計算全域文字顏色
        const exponent = 1.2;
        let fontVal;
        
        if (avg > 127.5) {
            const normalized_avg = (avg - 127.5) / 127.5;
            fontVal = 127.5 * (1 - Math.pow(normalized_avg, exponent)); 
        } else {
            const normalized_avg = (127.5 - avg) / 127.5;
            fontVal = 127.5 + 127.5 * Math.pow(normalized_avg, exponent); 
        }
        
        fontVal = Math.round(Math.min(255, Math.max(0, fontVal)));

        // 設定全域主題背景顏色
        document.documentElement.style.setProperty("--fab-color-control-global-bg-color", color);

        // 面板和文字色 (保持硬切換以確保對比)
        if (avg > 128) {
            document.documentElement.style.setProperty("--fab-color-control-panel-bg-color", "rgba(230, 230, 230, 0.97)");
            // ⚠️ 這裡將全域字體顏色硬切為黑色
            document.documentElement.style.setProperty("--fab-color-control-global-font-color", "#000"); 
        } else {
            document.documentElement.style.setProperty("--fab-color-control-panel-bg-color", "rgba(50, 50, 50, 0.97)");
            // ⚠️ 這裡將全域字體顏色硬切為白色
            document.documentElement.style.setProperty("--fab-color-control-global-font-color", "#fff"); 
        }

        saveSettings();
    }
    
    // ----------------------------------------------------
    // --- 內部私有輔助函數 (Private Helper Functions) ---
    // ----------------------------------------------------

    function updateLabels(){
        labels.r.textContent = sliders.r.value;
        labels.g.textContent = sliders.g.value;
        labels.b.textContent = sliders.b.value;
        labels.a.textContent = sliders.a.value;
    }

    function randomizeColor() {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        const a = ((Math.random() * 0.5) + 0.5).toFixed(2); 

        sliders.r.value = r;
        sliders.g.value = g;
        sliders.b.value = b;
        sliders.a.value = a;
    }
    
    function forceLayoutRecalculation() {
        void content.offsetHeight;
    }

    function positionPanel(){
        const fabRect = fab.getBoundingClientRect();
        const windowW = window.innerWidth;
        
        const isNearRight = (fab.offsetLeft + fab.offsetWidth / 2) > (windowW / 2);
        
        if (isNearRight) {
            content.style.left = "auto";
            content.style.right = fabRect.width + 15 + "px";
        } else {
            content.style.right = "auto";
            content.style.left = fabRect.width + 15 + "px";
        }
        
        // 垂直居中定位
        content.style.top = (fabRect.height / 2) - (content.offsetHeight / 2) + "px"; 
        
        // 邊界修正邏輯
        const contentRect = content.getBoundingClientRect();
        if (contentRect.top < EDGE_MARGIN) {
            content.style.top = (fabRect.height / 2) - (contentRect.height / 2) + (EDGE_MARGIN - contentRect.top) + "px";
        }
        if (contentRect.bottom > window.innerHeight - EDGE_MARGIN) {
            const pushUpDistance = contentRect.bottom - (window.innerHeight - EDGE_MARGIN);
            const initialTop = (fabRect.height / 2) - (content.offsetHeight / 2);
            const newTop = initialTop - pushUpDistance;
            content.style.top = newTop + "px";
        }
    }

    function saveSettings(){
        if (!fab) return;
        localStorage.setItem("FABSettings", JSON.stringify({
            left: fab.style.left,
            right: fab.style.right,
            top: fab.style.top,
            bottom: fab.style.bottom,
            r: sliders.r.value,
            g: sliders.g.value,
            b: sliders.b.value,
            a: sliders.a.value
        }));
    }

    function stickToEdge(x, y){
        const windowW = window.innerWidth;
        const windowH = window.innerHeight;
        const fabW = fab.offsetWidth;
        const fabH = fab.offsetHeight;

        const isNearRight = (x + fabW / 2) > (windowW / 2);
        
        let finalY;

        if (isNearRight) {
            fab.style.right = EDGE_MARGIN + "px";
            fab.style.left = "auto";
        } else {
            fab.style.left = EDGE_MARGIN + "px";
            fab.style.right = "auto";
        }
        
        finalY = y;
        if (y < EDGE_MARGIN) {
            finalY = EDGE_MARGIN;
        } else if (y > windowH - fabH - EDGE_MARGIN) {
            finalY = windowH - fabH - EDGE_MARGIN;
        }

        fab.style.top = finalY + "px";
        fab.style.bottom = "auto";
        
        if(content.style.display === "flex") positionPanel();
    }
    
    // ----------------------------------------------------
    // --- 事件綁定 (Event Binding) ---
    // ----------------------------------------------------

    function bindEvents() {
        // 滑桿事件
        Object.values(sliders).forEach(s => {
            s.addEventListener("input", () => {
                updateLabels();
                applyColor();
            });
        });

        // 主題按鈕事件
        themeBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const rgba = btn.dataset.color.match(/\d+(\.\d+)?/g);
                sliders.r.value = rgba[0];
                sliders.g.value = rgba[1];
                sliders.b.value = rgba[2];
                sliders.a.value = rgba[3] || 1;
                updateLabels();
                applyColor();
            });
        });
        
        // 隨機按鈕事件
        if (randomBtn) {
            randomBtn.addEventListener("click", () => {
                randomizeColor();
                updateLabels();
                applyColor();
            });
        }
        
        // FAB 圖標點擊事件 (展開/收合面板)
        icon.addEventListener("click", () => {
            content.style.display = content.style.display === "flex" ? "none" : "flex";
            if (content.style.display === "flex") {
                forceLayoutRecalculation();
                positionPanel();
            }
        });

        // 拖曳事件
        icon.addEventListener("mousedown", e => {
            e.stopPropagation();
            e.preventDefault();
            isDrag = true;
            offsetX = e.clientX - fab.offsetLeft;
            offsetY = e.clientY - fab.offsetTop;
            fab.style.cursor = 'grabbing';
        });

        document.addEventListener("mousemove", e => {
            if (!isDrag) return;
            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;

            newX = Math.max(0, Math.min(window.innerWidth - fab.offsetWidth, newX));
            newY = Math.max(0, Math.min(window.innerHeight - fab.offsetHeight, newY));

            fab.style.left = newX + "px";
            fab.style.top = newY + "px";
            fab.style.right = "auto";
            fab.style.bottom = "auto";

            if (content.style.display === "flex") positionPanel();
        });

        document.addEventListener("mouseup", e => {
            if (!isDrag) return;
            isDrag = false;
            fab.style.cursor = 'grab';
            stickToEdge(fab.offsetLeft, fab.offsetTop);
            saveSettings();
        });

        // 視窗大小改變事件
        window.addEventListener("resize", () => {
            if (fab.style.left !== "auto" || fab.style.right !== "auto") {
                stickToEdge(fab.offsetLeft, fab.offsetTop);
            }
            if (content.style.display === "flex") positionPanel();
        });
    }

    /**
     * @public function - 從 localStorage 載入儲存的設定並初始化 FAB
     */
    function loadSettings() {
        // 1. 確保 DOM 元素已獲取
        if (!fab) {
            console.error("Initialization failed: FAB element not found.");
            return;
        }

        const s = JSON.parse(localStorage.getItem("FABSettings"));
        
        content.style.display = "none";
        
        if (!s) { // 首次載入：預設在右上方
            fab.style.left = "auto";
            fab.style.bottom = "auto";
            fab.style.right = EDGE_MARGIN + "px";
            fab.style.top = EDGE_MARGIN + "px";
            
            // 首次載入：設定預設顏色 (例如中灰)
            sliders.r.value = 128; 
            sliders.g.value = 128;
            sliders.b.value = 128;
            sliders.a.value = 1;

        } else { // 載入儲存的設定
            fab.style.left = s.left;
            fab.style.right = s.right;
            fab.style.top = s.top;
            fab.style.bottom = s.bottom;
            
            sliders.r.value = s.r;
            sliders.g.value = s.g;
            sliders.b.value = s.b;
            sliders.a.value = s.a;
        }

        updateLabels();
        applyColor(); // 應用載入或預設的顏色
        
        window.requestAnimationFrame(() => {
            stickToEdge(fab.offsetLeft, fab.offsetTop);
        });
    }

    /**
     * 核心初始化函數，用於確保在 DOM 載入後才執行
     */
    function initialize() {
        // 1. 獲取所有 DOM 元素
        fab = document.getElementById("fab-color");
        if (!fab) {
            console.error("Error: FAB element (#fab-color) not found. Cannot initialize.");
            return;
        }
        icon = document.getElementById("fab-icon");
        content = document.getElementById("fab-content");
        randomBtn = document.getElementById("randomBtn");
        
        sliders = {
            r: document.getElementById("rangeR"),
            g: document.getElementById("rangeG"),
            b: document.getElementById("rangeB"),
            a: document.getElementById("rangeA")
        };
        
        labels = {
            r: document.getElementById("valR"),
            g: document.getElementById("valG"),
            b: document.getElementById("valB"),
            a: document.getElementById("valA")
        };
        
        themeBtns = document.querySelectorAll(".fab-theme-btn");

        // 2. 綁定所有事件
        bindEvents();

        // 3. 載入並應用設定
        loadSettings();
    }

    // 確保 DOM 結構準備好後才執行初始化
    document.addEventListener('DOMContentLoaded', initialize);

    // 暴露公開接口 (Public API)
    return {
        // 允許外部調用來強制應用顏色 (例如在其他腳本變更顏色設定時)
        applyColor: applyColor, 
        // 允許外部調用來強制重新載入或應用初始設定
        reinitialize: initialize 
    };

})(); // 立即執行函數並將其返回值 (ThemeControl 物件) 賦值給 window.ThemeControl