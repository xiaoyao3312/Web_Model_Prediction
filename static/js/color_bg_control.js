// 全域腳本：主題切換/顏色控制 (目前為佔位符)
console.log("color/bg control JS loaded."); // 在控制台輸出訊息，確認腳本載入

(function(){ 
  const fabHTML=` 
  <div id="fab-color"> 
    <div id="fab-Icon">🎨</div> 
    <div id="fab-Content"> 
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
        <button id="randomBtn" class="fab-theme-btn">隨機</button>       </div> 
    </div>
  </div>`;
  
  if (!document.getElementById("fab-color")) { // 檢查 FAB 是否已經存在於 DOM 中
    document.body.insertAdjacentHTML("beforeend",fabHTML); // 如果不存在，將 FAB 插入到 body 結束標籤之前
  }

  const fab=document.getElementById("fab-color"); // 獲取 FAB 容器元素
  const icon=document.getElementById("fab-Icon"); // 獲取 FAB 圖標 (用於點擊/拖曳)
  const content=document.getElementById("fab-Content"); // 獲取 FAB 內容面板
  const randomBtn = document.getElementById("randomBtn"); // 選取新的隨機按鈕
  const EDGE_MARGIN = 5; // 定義 FAB 吸附邊緣時的邊距 (像素)

  const sliders={ // 收集所有滑桿元素
    r: document.getElementById("rangeR"),
    g: document.getElementById("rangeG"),
    b: document.getElementById("rangeB"),
    a: document.getElementById("rangeA")
  };

  const labels={ // 收集所有顯示滑桿數值的標籤元素
    r: document.getElementById("valR"),
    g: document.getElementById("valG"),
    b: document.getElementById("valB"),
    a: document.getElementById("valA")
  };

  const themeBtns=document.querySelectorAll(".fab-theme-btn"); // 獲取所有主題預設按鈕

  function applyColor(){ // 應用當前滑桿值作為主題顏色
    const r = +sliders.r.value; // 獲取 R 值 (使用 + 轉為數字)
    const g = +sliders.g.value; // 獲取 G 值
    const b = +sliders.b.value; // 獲取 B 值
    const a = sliders.a.value; // 獲取 A 值
    const color=`rgba(${r},${g},${b},${a})`; // 組合 CSS 顏色字串
    
    // 主背景亮度 (用於決定字體和面板的顏色對比)
    const avg=(r + g + b)/3; // 計算 RGB 的平均亮度 (0-255)
    
    // *******************************************************************
    // 關鍵修正：全域文字顏色計算（調整對比度曲線至更平緩）
    // 這裡使用 Power Function 算法來平滑地計算全域字體顏色，使其在中灰區域不會突變。
    // *******************************************************************
    const exponent = 1.2; // 調整曲線平緩度的指數
    let fontVal; // 最終的字體灰度值 (0-255)
    
    if (avg > 127.5) {
        // 背景偏亮: 讓字體顏色往 0 (黑色) 推
        const normalized_avg = (avg - 127.5) / 127.5; // 亮度歸一化 (0 到 1)
        // 1 - Math.pow(normalized_avg, exponent) 使得亮度越高，fontVal 越接近 0
        fontVal = 127.5 * (1 - Math.pow(normalized_avg, exponent)); 
    } else {
        // 背景偏暗: 讓字體顏色往 255 (白色) 推
        const normalized_avg = (127.5 - avg) / 127.5; // 亮度歸一化 (0 到 1)
        // Math.pow(normalized_avg, exponent) 使得亮度越暗，fontVal 越接近 255
        fontVal = 127.5 + 127.5 * Math.pow(normalized_avg, exponent); 
    }
    
    // 確保值在 0 到 255 範圍內
    fontVal = Math.round(Math.min(255, Math.max(0, fontVal)));

    const globalFontColor = `rgb(${fontVal}, ${fontVal}, ${fontVal})`; // 計算出的灰度文字顏色
    
    // 頂部文字顏色 (純黑或純白，此變數 headerFontColor 在當前程式碼中未使用)
    const headerFontColor = avg > 128 ? "#000" : "#fff";

    // 設定全域主題背景顏色
    document.documentElement.style.setProperty("--global-bg-color",color);

    // 這裡缺少將 globalFontColor 應用到 --global-font-color 的邏輯
    // 目前的邏輯是硬切換 --global-font-color，導致平滑過渡的計算被覆蓋 (參照上一次討論的修正)

    // 面板背景和文字色 (此部分保持硬切換，以確保 FAB 面板始終有良好對比)
    if (avg > 128) {
        // 主背景為淺色 -> 面板使用微淺灰，面板文字硬切為黑色
        document.documentElement.style.setProperty("--panel-bg-color", "rgba(230, 230, 230, 0.97)");
        document.documentElement.style.setProperty("--global-font-color", "#000"); // ⚠️ 這裡將全域字體顏色硬切為黑色
    } else {
        // 主背景為深色 -> 面板使用微深灰，面板文字硬切為白色
        document.documentElement.style.setProperty("--panel-bg-color", "rgba(50, 50, 50, 0.97)");
        document.documentElement.style.setProperty("--global-font-color", "#fff"); // ⚠️ 這裡將全域字體顏色硬切為白色
    }

    saveSettings(); // 儲存當前設定
  }

  function updateLabels(){ // 更新滑桿旁邊的數值顯示
    labels.r.textContent=sliders.r.value;
    labels.g.textContent=sliders.g.value;
    labels.b.textContent=sliders.b.value;
    labels.a.textContent=sliders.a.value;
  }

  // 新增：生成隨機 RGBA 顏色並更新滑桿值
  function randomizeColor() {
      // 隨機 R, G, B (0-255)
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      // 隨機 A (0.5 - 1.0) 確保不會完全透明，並保留兩位小數
      const a = ((Math.random() * 0.5) + 0.5).toFixed(2); 

      sliders.r.value = r; // 更新滑桿 R 值
      sliders.g.value = g; // 更新滑桿 G 值
      sliders.b.value = b; // 更新滑桿 B 值
      sliders.a.value = a; // 更新滑桿 A 值
  }

  Object.values(sliders).forEach(s=>{ // 遍歷所有滑桿
    s.addEventListener("input",()=>{ // 監聽滑桿的 input 事件 (值改變時)
      updateLabels(); // 更新數值顯示
      applyColor(); // 應用新顏色
    });
  });

  themeBtns.forEach(btn=>{ // 遍歷所有主題按鈕
    btn.addEventListener("click",()=>{ // 監聽按鈕點擊事件
      const rgba=btn.dataset.color.match(/\d+(\.\d+)?/g); // 從 data-color 屬性解析出 RGBA 數值
      sliders.r.value=rgba[0]; // 設定 R 值
      sliders.g.value=rgba[1]; // 設定 G 值
      sliders.b.value=rgba[2]; // 設定 B 值
      sliders.a.value=rgba[3]||1; // 設定 A 值 (如果沒有 A 值則預設為 1)
      updateLabels(); // 更新數值顯示
      applyColor(); // 應用新顏色
    });
  });
  
  // 新增：隨機按鈕的事件監聽器
  if (randomBtn) {
    randomBtn.addEventListener("click", () => {
      randomizeColor(); // 隨機生成顏色
      updateLabels(); // 更新標籤顯示
      applyColor(); // 應用新顏色
    });
  }
    
  // 強制重繪函數：用於確保瀏覽器立即計算元素尺寸 (用於第一次展開修正錯位)
  function forceLayoutRecalculation() {
        void content.offsetHeight; // 讀取一個會觸發瀏覽器重繪的屬性 (但不實際使用返回值)
  }

  icon.addEventListener("click",()=>{ // 監聽 FAB 圖標點擊事件
    content.style.display = content.style.display==="flex" ? "none" : "flex"; // 切換面板的顯示/隱藏
    
    // 【修正 1】：展開時強制重繪並定位
    if (content.style.display === "flex") { // 如果面板展開
        forceLayoutRecalculation(); // 強制重繪，確保尺寸計算正確
        positionPanel(); // 調整面板位置和展開方向
    }
  });

  function stickToEdge(x, y){ // 將 FAB 吸附到最近的左右邊緣
    const windowW = window.innerWidth; // 視窗寬度
    const windowH = window.innerHeight; // 視窗高度
    const fabW = fab.offsetWidth; // FAB 寬度
    const fabH = fab.offsetHeight; // FAB 高度

    // 【修正 2】：根據 FAB 中線位置決定吸附方向
    const isNearRight = (x + fabW/2) > (windowW/2); // 判斷 FAB 中心是否靠近右半邊
    
    let finalY; // 最終的垂直位置

    if (isNearRight) { // 如果靠近右邊
        fab.style.right = EDGE_MARGIN + "px"; // 設定 right 距離邊緣
        fab.style.left = "auto"; // 移除 left 設定
    } else { // 如果靠近左邊
        fab.style.left = EDGE_MARGIN + "px"; // 設定 left 距離邊緣
        fab.style.right = "auto"; // 移除 right 設定
    }
    
    finalY = y;
    if (y < EDGE_MARGIN) { // 檢查是否超出頂部邊界
        finalY = EDGE_MARGIN; // 黏貼到頂部邊界
    } else if (y > windowH - fabH - EDGE_MARGIN) { // 檢查是否超出底部邊界
        finalY = windowH - fabH - EDGE_MARGIN; // 黏貼到底部邊界
    }

    fab.style.top = finalY + "px"; // 設定最終的 top 位置
    fab.style.bottom = "auto"; // 移除 bottom 設定
    
    // 如果面板是展開的，進行定位 (包含展開方向和邊界修正)
    if(content.style.display==="flex") positionPanel();
  }

  let isDrag=false,offsetX=0,offsetY=0; // 拖曳狀態變數
  icon.addEventListener("mousedown",e=>{ // 監聽滑鼠按下事件 (開始拖曳)
    e.stopPropagation(); // 阻止事件冒泡
    e.preventDefault(); // 阻止預設行為 (如圖片拖曳)
    
    isDrag=true; // 設為拖曳狀態
    offsetX=e.clientX-fab.offsetLeft; // 計算滑鼠點擊點與 FAB 左上角的 X 偏移
    offsetY=e.clientY-fab.offsetTop; // 計算滑鼠點擊點與 FAB 左上角的 Y 偏移
    fab.style.cursor = 'grabbing'; // 改變游標樣式
  });

  document.addEventListener("mousemove",e=>{ // 監聽滑鼠移動事件 (進行拖曳)
    if(!isDrag) return; // 如果不是拖曳狀態則退出
    let newX=e.clientX-offsetX; // 計算新的 X 位置
    let newY=e.clientY-offsetY; // 計算新的 Y 位置

    // 限制 FAB 不超出視窗範圍
    newX=Math.max(0, Math.min(window.innerWidth-fab.offsetWidth,newX));
    newY=Math.max(0, Math.min(window.innerHeight-fab.offsetHeight,newY));

    fab.style.left=newX+"px"; // 設置即時的 X 位置
    fab.style.top=newY+"px"; // 設置即時的 Y 位置
    fab.style.right="auto"; // 拖曳時清除 right
    fab.style.bottom="auto"; // 拖曳時清除 bottom

    // 【修正 3】：拖曳時也實時更新展開方向
    if(content.style.display==="flex") positionPanel();
  });

  document.addEventListener("mouseup",e=>{ // 監聽滑鼠鬆開事件 (拖曳結束)
    if(!isDrag) return; // 如果不是拖曳狀態則退出
    isDrag=false; // 結束拖曳狀態
    fab.style.cursor = 'grab'; // 恢復游標樣式
    
    stickToEdge(fab.offsetLeft, fab.offsetTop); // 呼叫吸附函數，將 FAB 黏貼到最近的邊緣
    saveSettings(); // 儲存最終的 FAB 位置
  });

  function positionPanel(){ // 根據 FAB 位置調整內容面板的位置和展開方向
    const fabRect=fab.getBoundingClientRect(); // 獲取 FAB 的尺寸和位置
    const windowW = window.innerWidth; // 視窗寬度
    
    // 關鍵：根據 FAB 的水平中心點判斷展開方向
    const isNearRight = (fab.offsetLeft + fab.offsetWidth / 2) > (windowW / 2);
    
    if (isNearRight) { // 如果靠近右邊 (面板向左展開)
      content.style.left="auto"; // 移除 left
      content.style.right= fabRect.width + 15 + "px"; // 設置 right 距離 (FAB 寬度 + 間隔)
    } else { // 如果靠近左邊 (面板向右展開)
      content.style.right="auto"; // 移除 right
      content.style.left= fabRect.width + 15 + "px"; // 設置 left 距離 (FAB 寬度 + 間隔)
    }
    
    // 垂直居中定位 (初始定位，後續會進行邊界修正)
    content.style.top = (fabRect.height / 2) - (content.offsetHeight / 2) + "px"; 
    
    // 邊界修正邏輯 (確保面板不會超出視窗上下邊緣)
    const contentRect = content.getBoundingClientRect();
    if (contentRect.top < EDGE_MARGIN) {
        // 上邊緣修正: 重新計算 top 值，使其與頂部邊緣保持 EDGE_MARGIN 距離
        content.style.top = (fabRect.height / 2) - (contentRect.height / 2) + (EDGE_MARGIN - contentRect.top) + "px";
    }
    if (contentRect.bottom > window.innerHeight - EDGE_MARGIN) {
        // 底部邊緣修正: 計算需要向上推動的距離
        const pushUpDistance = contentRect.bottom - (window.innerHeight - EDGE_MARGIN);
        
        // 重新計算新的 content.style.top
        const initialTop = (fabRect.height / 2) - (content.offsetHeight / 2);
        const newTop = initialTop - pushUpDistance;
        
        content.style.top = newTop + "px";
    }
  }

  function saveSettings(){ // 儲存 FAB 位置和顏色滑桿值到 localStorage
    localStorage.setItem("FABSettings",JSON.stringify({
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

  function loadSettings(){ // 從 localStorage 載入儲存的設定
    const s=JSON.parse(localStorage.getItem("FABSettings")); // 讀取並解析 JSON
    
    // 確保重整時面板是關閉的
    content.style.display = "none";
    
    if(!s) { // 如果沒有儲存的設定 (首次載入)
        // --- 修正處：首次啟用時設定在右上方 ---
      fab.style.left = "auto";
      fab.style.bottom = "auto"; // 移除 bottom 設定
      fab.style.right = EDGE_MARGIN + "px"; // 設定到右邊緣
      fab.style.top = EDGE_MARGIN + "px"; // 設定到頂部邊緣
        // ----------------------------------------
    } else { // 如果有儲存的設定
      fab.style.left = s.left; // 載入 FAB 位置
      fab.style.right = s.right;
      fab.style.top = s.top;
      fab.style.bottom = s.bottom;
      
      sliders.r.value=s.r; // 載入顏色滑桿值
      sliders.g.value=s.g;
      sliders.b.value=s.b;
      sliders.a.value=s.a;
    }

    updateLabels(); // 更新數值顯示
    applyColor(); // 應用載入的顏色
    
    // 確保 FAB 定位吸附 (使用 requestAnimationFrame 確保 DOM 渲染完成後再計算位置)
    window.requestAnimationFrame(() => {
        stickToEdge(fab.offsetLeft, fab.offsetTop); // 確保位置在螢幕內且吸附到最近邊緣
    });
  }

  window.addEventListener("resize",()=>{ // 監聽視窗大小改變事件
    // 【修正 4】：確保 resize 時 FAB 位置和面板展開方向都被更新
    if (fab.style.left !== "auto" || fab.style.right !== "auto") {
        stickToEdge(fab.offsetLeft, fab.offsetTop); // 重新計算 FAB 吸附位置
    }
    if(content.style.display==="flex") positionPanel(); // 如果面板是開著的，重新定位它
  });

  loadSettings(); // 執行載入設定函數 (腳本的起始點)
})();