// 全域腳本：主題切換/顏色控制 (目前為佔位符)
console.log("Color/BG Control JS loaded.");(function(){
  const fabHTML=`
  <div id="colorFab">
    <div id="fabIcon">🎨</div>
    <div id="fabContent">
      <div class="panel-title">背景顏色調整</div>
      <div class="sliders">
        <label>R: <span id="valR">128</span></label>
        <input type="range" id="rangeR" min="0" max="255" value="128">
        <label>G: <span id="valG">128</span></label>
        <input type="range" id="rangeG" min="0" max="255" value="128">
        <label>B: <span id="valB">128</span></label>
        <input type="range" id="rangeB" min="0" max="255" value="128">
        <label>A: <span id="valA">1</span></label>
        <input type="range" id="rangeA" min="0" max="1" step="0.01" value="1">
      </div>
      <div class="themes">
        <button class="theme-btn" data-color="rgba(0,0,0,1)">黑色</button>
        <button class="theme-btn" data-color="rgba(85,85,85,1)">深色</button>
        <button class="theme-btn" data-color="rgba(128,128,128,1)">灰色</button>
      </div>
      <div class="themes">
        <button class="theme-btn" data-color="rgba(170,170,170,1)">淺色</button>
        <button class="theme-btn" data-color="rgba(255,255,255,1)">白色</button>
        <button id="randomBtn" class="theme-btn">隨機</button> <!-- 新增的隨機按鈕 -->
      </div>
    </div>
  </div>`;
  if (!document.getElementById("colorFab")) {
    document.body.insertAdjacentHTML("beforeend",fabHTML);
  }

  const fab=document.getElementById("colorFab");
  const icon=document.getElementById("fabIcon");
  const content=document.getElementById("fabContent");
  const randomBtn = document.getElementById("randomBtn"); // 選取新的隨機按鈕
  const EDGE_MARGIN = 5; 

  const sliders={
    r: document.getElementById("rangeR"),
    g: document.getElementById("rangeG"),
    b: document.getElementById("rangeB"),
    a: document.getElementById("rangeA")
  };

  const labels={
    r: document.getElementById("valR"),
    g: document.getElementById("valG"),
    b: document.getElementById("valB"),
    a: document.getElementById("valA")
  };

  const themeBtns=document.querySelectorAll(".theme-btn");

  function applyColor(){
    const r = +sliders.r.value;
    const g = +sliders.g.value;
    const b = +sliders.b.value;
    const a = sliders.a.value;
    const color=`rgba(${r},${g},${b},${a})`;
    
    // 主背景亮度
    const avg=(r + g + b)/3; 
    
    // *******************************************************************
    // 關鍵修正：全域文字顏色計算（調整對比度曲線至更平緩）
    // 將指數從 1.5 調整為 1.2，使文字顏色在中灰區域的轉換更加平緩。
    // *******************************************************************
    const exponent = 1.2; 
    let fontVal;
    
    if (avg > 127.5) {
        // 背景偏亮: 讓字體顏色往 0 (黑色) 推
        const normalized_avg = (avg - 127.5) / 127.5; // 0 到 1
        // 使用較小的 Power Function 指數 (1.2) 使得 fontVal 較慢接近 0
        fontVal = 127.5 * (1 - Math.pow(normalized_avg, exponent)); 
    } else {
        // 背景偏暗: 讓字體顏色往 255 (白色) 推
        const normalized_avg = (127.5 - avg) / 127.5; // 0 到 1
        // 使用較小的 Power Function 指數 (1.2) 使得 fontVal 較慢接近 255
        fontVal = 127.5 + 127.5 * Math.pow(normalized_avg, exponent); 
    }
    
    // 確保值在 0 到 255 範圍內
    fontVal = Math.round(Math.min(255, Math.max(0, fontVal)));

    const globalFontColor = `rgb(${fontVal}, ${fontVal}, ${fontVal})`;
    
    // 頂部文字顏色 (純黑或純白，用於高對比標題)
    const headerFontColor = avg > 128 ? "#000" : "#fff";

    // 設定全域主題顏色
    document.documentElement.style.setProperty("--global-theme-color",color);
    document.documentElement.style.setProperty("--global-font-color", globalFontColor); 
    document.documentElement.style.setProperty("--header-font-color", headerFontColor);

    // 面板背景和文字色 (此部分保持硬切換，以確保 FAB 面板始終有良好對比)
    if (avg > 128) {
        // 主背景為淺色 -> 面板使用微淺灰，文字黑色
        document.documentElement.style.setProperty("--panel-bg-color", "rgba(230, 230, 230, 0.9)");
        document.documentElement.style.setProperty("--panel-font-color", "#000"); 
    } else {
        // 主背景為深色 -> 面板使用微深灰，文字白色
        document.documentElement.style.setProperty("--panel-bg-color", "rgba(50, 50, 50, 0.9)");
        document.documentElement.style.setProperty("--panel-font-color", "#fff"); 
    }

    saveSettings();
  }

  function updateLabels(){
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

      sliders.r.value = r;
      sliders.g.value = g;
      sliders.b.value = b;
      sliders.a.value = a;
  }

  Object.values(sliders).forEach(s=>{
    s.addEventListener("input",()=>{
      updateLabels();
      applyColor();
    });
  });

  themeBtns.forEach(btn=>{
    btn.addEventListener("click",()=>{
      const rgba=btn.dataset.color.match(/\d+(\.\d+)?/g);
      sliders.r.value=rgba[0];
      sliders.g.value=rgba[1];
      sliders.b.value=rgba[2];
      sliders.a.value=rgba[3]||1;
      updateLabels();
      applyColor();
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
        void content.offsetHeight; 
  }

  icon.addEventListener("click",()=>{
    content.style.display = content.style.display==="flex" ? "none" : "flex";
    
    // 【修正 1】：展開時強制重繪並定位
    if (content.style.display === "flex") {
        forceLayoutRecalculation();
        positionPanel();
    }
  });

  function stickToEdge(x, y){
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;
    const fabW = fab.offsetWidth;
    const fabH = fab.offsetHeight;

    // 【修正 2】：根據 FAB 中線位置決定吸附方向
    const isNearRight = (x + fabW/2) > (windowW/2);
    
    let finalY;

    if (isNearRight) {
        fab.style.right = EDGE_MARGIN + "px";
        fab.style.left = "auto";
    } else {
        fab.style.left = EDGE_MARGIN + "px";
        fab.style.right = "auto";
    }
    
    finalY = y;
    if (y < EDGE_MARGIN) { // 簡化 y 軸邊緣判斷
        finalY = EDGE_MARGIN; 
    } else if (y > windowH - fabH - EDGE_MARGIN) {
        finalY = windowH - fabH - EDGE_MARGIN; 
    }

    fab.style.top = finalY + "px";
    fab.style.bottom = "auto";
    
    // 如果面板是展開的，進行定位 (包含展開方向和邊界修正)
    if(content.style.display==="flex") positionPanel();
  }

  let isDrag=false,offsetX=0,offsetY=0;
  icon.addEventListener("mousedown",e=>{
    e.stopPropagation(); 
    e.preventDefault(); 
    
    isDrag=true;
    offsetX=e.clientX-fab.offsetLeft;
    offsetY=e.clientY-fab.offsetTop;
    fab.style.cursor = 'grabbing';
  });

  document.addEventListener("mousemove",e=>{
    if(!isDrag) return;
    let newX=e.clientX-offsetX;
    let newY=e.clientY-offsetY;

    newX=Math.max(0, Math.min(window.innerWidth-fab.offsetWidth,newX));
    newY=Math.max(0, Math.min(window.innerHeight-fab.offsetHeight,newY));

    fab.style.left=newX+"px";
    fab.style.top=newY+"px";
    fab.style.right="auto";
    fab.style.bottom="auto";

    // 【修正 3】：拖曳時也實時更新展開方向
    if(content.style.display==="flex") positionPanel();
  });

  document.addEventListener("mouseup",e=>{
    if(!isDrag) return;
    isDrag=false;
    fab.style.cursor = 'grab';
    
    stickToEdge(fab.offsetLeft, fab.offsetTop); 
    saveSettings();
  });

  function positionPanel(){
    const fabRect=fab.getBoundingClientRect();
    const windowW = window.innerWidth;
    
    // 關鍵：根據 FAB 的水平中心點判斷展開方向
    const isNearRight = (fab.offsetLeft + fab.offsetWidth / 2) > (windowW / 2);
    
    if (isNearRight) {
      content.style.left="auto";
      content.style.right= fabRect.width + 15 + "px"; 
    } else {
      content.style.right="auto";
      content.style.left= fabRect.width + 15 + "px";
    }
    
    // 垂直居中定位
    content.style.top = (fabRect.height / 2) - (content.offsetHeight / 2) + "px"; 
    
    // 邊界修正邏輯 (您原有的，但已優化底部計算)
    const contentRect = content.getBoundingClientRect();
    if (contentRect.top < EDGE_MARGIN) {
        content.style.top = (fabRect.height / 2) - (contentRect.height / 2) + (EDGE_MARGIN - contentRect.top) + "px";
    }
    if (contentRect.bottom > window.innerHeight - EDGE_MARGIN) {
        // 計算需要向上推動的距離，並將其套用到 content.style.top
        const pushUpDistance = contentRect.bottom - (window.innerHeight - EDGE_MARGIN);
        
        // 重新計算新的 content.style.top
        const initialTop = (fabRect.height / 2) - (content.offsetHeight / 2);
        const newTop = initialTop - pushUpDistance;
        
        content.style.top = newTop + "px";
    }
  }

  function saveSettings(){
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

  function loadSettings(){
    const s=JSON.parse(localStorage.getItem("FABSettings"));
    
    // 確保重整時面板是關閉的
    content.style.display = "none";
    
    if(!s) {
      fab.style.left = "auto";
      fab.style.top = "auto";
      fab.style.right = EDGE_MARGIN + "px";
      fab.style.bottom = EDGE_MARGIN + "px";
    } else {
      fab.style.left = s.left;
      fab.style.right = s.right;
      fab.style.top = s.top;
      fab.style.bottom = s.bottom;
      
      sliders.r.value=s.r;
      sliders.g.value=s.g;
      sliders.b.value=s.b;
      sliders.a.value=s.a;
    }

    updateLabels();
    applyColor();
    
    // 確保 FAB 定位吸附
    window.requestAnimationFrame(() => {
        stickToEdge(fab.offsetLeft, fab.offsetTop);
    });
  }

  window.addEventListener("resize",()=>{
    // 【修正 4】：確保 resize 時 FAB 位置和面板展開方向都被更新
    if (fab.style.left !== "auto" || fab.style.right !== "auto") {
        stickToEdge(fab.offsetLeft, fab.offsetTop); 
    }
    if(content.style.display==="flex") positionPanel();
  });

  loadSettings();
})();