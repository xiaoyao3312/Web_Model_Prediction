# css_notes.py
# ====================================================================
# CSS_CORE_CAPABILITIES - CSS 核心能力總結配置 (轉換自使用者筆記)
# ====================================================================

CSS_CORE_CAPABILITIES = {
    "I. 視覺與外觀 (Visual Aesthetics)": {
        "顏色與背景": {
            "color": "設定文字、圖標的前景色。值類別: 顏色單位",
            "background-color": "設定元素的背景色。值類別: 顏色單位",
            "background-image": "使用圖片作為背景。值類別: url(), linear-gradient()",
            "background-control": ["background-repeat", "background-position", "background-size"],
            "mix-blend-mode": "設定元素內容如何與背景混合 (如 Photoshop 模式)。值類別: 關鍵字 (e.g., multiply, screen)"
        },
        "邊框、圓角與陰影": {
            "border": "設定邊框的寬度、樣式和顏色。值類別: 絕對長度 (px), 顏色單位",
            "border-radius": "設定元素的圓角程度。值類別: 絕對長度 (px), 相對長度 (%)",
            "outline": "元素外層的輪廓線 (不佔空間)。",
            "box-shadow": "為元素添加陰影，增加立體感。值類別: 顏色單位 + 絕對長度 (px)",
            "text-shadow": "為文字添加陰影。值類別: 顏色單位 + 絕對長度 (px)"
        },
        "可見性與交互": {
            "opacity": "設定元素的整體透明度 (0.0 到 1.0)。值類別: 數字 (Number)",
            "visibility: hidden": "隱藏元素，但仍佔據空間。",
            "display: none": "隱藏元素且不佔據空間。",
            "cursor": "改變滑鼠懸停在元素上時的游標圖案。值類別: 關鍵字 (e.g., pointer, default)"
        }
    },

    "II. 文字與排版 (Typography)": {
        "字體與樣式": {
            "font-family": "設定字體（如 Arial, serif）。值類別: 關鍵字/字體名稱",
            "font-size": "設定文字的大小。值類別: rem, em, px, %",
            "font-weight": "設定文字的粗細（如 bold, 700）。值類別: 數字 (100-900), 關鍵字",
            "font-style": "設定文字是否為斜體 (italic)。值類別: 關鍵字 (normal, italic)",
            "text-transform": "將文字轉換為大寫、小寫或首字母大寫。值類別: 關鍵字"
        },
        "間距與對齊": {
            "line-height": "設定文字的行高。值類別: 數字, px, em",
            "letter-spacing": "設定字母之間的間距。值類別: px, em",
            "word-spacing": "設定單詞之間的間距。值類別: px, em",
            "text-align": "設定文字在容器中的水平對齊方式。值類別: 關鍵字 (left, center, right)",
            "vertical-align": "設定元素或文字的垂直對齊方式。值類別: 關鍵字, px, %, em"
        },
        "溢出與換行處理": {
            "white-space": "控制文字溢出時是否換行。值類別: 關鍵字",
            "word-wrap/word-break": "控制長單詞如何斷開。值類別: 關鍵字",
            "text-overflow": "設定文字溢出時是否顯示省略號 (...)。值類別: 關鍵字 (ellipsis)"
        }
    },

    "III. 佈局與定位 (Layout & Positioning)": {
        "尺寸與模型": {
            "display": "定義元素的佈局模型 (block, inline, flex, grid, none)。值類別: 關鍵字",
            "size_control": {
                "width": "值類別: px, %, rem, vw, auto, calc()",
                "height": "值類別: px, %, rem, vh, auto, calc()"
            },
            "size_limits": ["min-width", "max-width", "min-height", "max-height"]
        },
        "空間與溢出": {
            "margin": "設定元素邊框以外的外邊距。值類別: px, %, rem, em, auto",
            "padding": "設定元素內容與邊框之間的內邊距。值類別: px, %, rem, em",
            "overflow": "控制內容溢出元素框時的行為 (hidden, scroll, auto)。值類別: 關鍵字"
        },
        "定位與層級": {
            "position": "設定元素的定位類型 (static, relative, absolute, fixed, sticky)。值類別: 關鍵字",
            "position_coords": {
                "top/bottom/left/right": "值類別: px, %, rem"
            },
            "z-index": "設定定位元素在垂直 (Z 軸) 堆疊時的順序。值類別: 整數"
        }
    },

    "IV. Flexbox (一維佈局)": {
        "容器屬性": [
            "display: flex",
            "flex-direction (主軸方向)",
            "justify-content (主軸對齊)",
            "align-items (交叉軸對齊)",
            "flex-wrap (換行控制)"
        ],
        "項目屬性": [
            "flex-grow / flex-shrink / flex-basis (擴張/收縮/初始大小)",
            "order (視覺順序)",
            "align-self (單個項目交叉軸對齊)"
        ]
    },

    "V. Grid (二維佈局)": {
        "容器屬性": [
            "display: grid",
            "grid-template-columns / grid-template-rows (定義行列)",
            "grid-gap / gap (行間距)"
        ],
        "項目屬性": [
            "grid-column / grid-row (跨越行列範圍)",
            "grid-area (為網格項目命名)",
            "place-items / place-content (網格內容對齊)"
        ]
    },

    "VI. 響應式與動畫 (Responsiveness & Animation)": {
        "響應式控制": [
            "@media 規則 (max-width, min-width) - 常用單位: px, em, rem",
            "視口單位 (vh, vw, vmin, vmax)"
        ],
        "動畫與過渡": [
            "transform (2D/3D 轉換：旋轉、縮放、平移) - 值類別: 角度 (deg, turn), 函式, 數字",
            "transition (過渡動畫設置) - 值類別: 時間 (s, ms)",
            "@keyframes 規則 (定義複雜動畫序列)",
            "animation (應用和控制 @keyframes 動畫) - 值類別: 時間 (s, ms), 關鍵字"
        ]
    }
}

# ====================================================================
# CSS_UNITS - CSS 單位與值類別速查 (轉換自使用者筆記)
# ====================================================================

CSS_UNITS = {
    "I. 相對長度單位 (Relative Length Units)": {
        "em": {
            "relative_to": "父元素的字體大小 (font-size)",
            "description": "用於內部元素，如 padding 或 line-height，隨父元素字體變化。"
        },
        "rem": {
            "relative_to": "根元素 (<html>) 的字體大小",
            "description": "常用於響應式排版，維持一致的比例基準。"
        },
        "ch": {
            "relative_to": "當前字體中數字 '0' 的寬度",
            "description": "適用於限制內容行寬以提高可讀性。"
        },
        "ex": {
            "relative_to": "當前字體中 'x' 字母的高度",
            "description": "主要用於精確控制字體的垂直對齊 (較少用)。"
        },
    },

    "II. 視口單位 (Viewport-Relative Units)": {
        "vw": {
            "value": "視口寬度 (Viewport Width) 的 1%",
            "use_case": "尺寸與瀏覽器視窗寬度成比例縮放。"
        },
        "vh": {
            "value": "視口高度 (Viewport Height) 的 1%",
            "use_case": "常用於讓元素佔滿整個螢幕高度 (e.g., height: 100vh;)。"
        },
        "vmin": {
            "value": "視口寬度或高度中較小者的 1%",
            "use_case": "適用於正方形元素，防止在視窗改變方向時溢出。"
        },
        "vmax": {
            "value": "視口寬度或高度中較大者的 1%",
            "use_case": "確保元素盡可能佔滿空間。"
        },
    },

    "III. 顏色單位 (Color Units)": {
        "Hex": "十六進制顏色碼 (RRGGBB)。 e.g., #ff0000",
        "rgb()": "紅、綠、藍 (0-255) 值。 e.g., rgb(255, 0, 0)",
        "rgba()": "帶透明度 (Alpha 0-1) 的 RGB 值。 e.g., rgba(255, 0, 0, 0.5)",
        "hsl()": "色相、飽和度、亮度 (Hue, Saturation, Lightness)。",
        "hsla()": "帶透明度的 HSL 值。",
        "具名顏色": "預定義的顏色名稱。 e.g., red, transparent",
    },

    "IV. 時間與角度單位 (Time & Angle Units)": {
        "Time": {
            "s": "秒 (Seconds)。 e.g., 1s",
            "ms": "毫秒 (Milliseconds)。 e.g., 500ms"
        },
        "Angle": {
            "deg": "角度 (Degrees)，一圈是 360°。 e.g., 90deg",
            "rad": "弧度 (Radians)，一圈是 2π。 e.g., 1.57rad",
            "turn": "圈數 (Turns)，一圈是 1。 e.g., 0.25turn"
        }
    },

    "V. 關鍵字和函式值 (Keywords & Function Values)": {
        "Keywords": [
            "auto: 讓瀏覽器計算值 (e.g., margin: auto)。",
            "initial: 將屬性設置為其預設值。",
            "inherit: 繼承父元素的值。",
            "unset: 繼承或重置。",
            "none: 表示無 (e.g., box-shadow: none;)。"
        ],
        "Functions": [
            "calc(): 允許執行數學運算 (e.g., width: calc(100% - 20px);)。",
            "linear-gradient(), radial-gradient(): 生成漸變背景圖。",
            "var(): 引用 CSS 變數。"
        ]
    }
}


# 常見的基本 HTML 元素
# HTML 元素數量眾多，但以下是網頁結構和內容中最常用、最基礎的幾大類元素：

# 1. 內容分組與區塊 (Grouping & Block Elements)
# 這些元素用於組織內容和建立網頁佈局：

# <div> (Division/區塊)： 最通用的區塊元素。它沒有語義，純粹用於對內容進行分組，並作為 CSS 樣式的容器。

# <p> (Paragraph/段落)： 專門用於定義文字段落。

# <hr> (Horizontal Rule/水平線)： 用於內容中的主題切換（例如，在兩段不同主題的內容之間劃分界線）。

# 2. 文本語義元素 (Semantic Text Elements)
# 這些元素用於增強文本的含義，而不是僅僅改變外觀：

# <span> (Span/跨度)： 最通用的行內元素。與 <div> 類似，但用於對行內的一小部分文本施加樣式或語義，不會產生換行。

# <strong> / <b> (Strong/Bold)：

# <strong>：表示內容具有強烈的重要性（語義強調）。

# <b>：僅用於讓文字視覺上變粗，沒有額外的語義強調（純展示）。

# <em> / <i> (Emphasis/Italic)：

# <em>：表示內容需要強調（語義強調，例如朗讀時會加重語氣）。

# <i>：僅用於讓文字視覺上傾斜，通常用於專業術語或外來語（純展示）。

# 3. 列表元素 (List Elements)
# 除了您提到的 <li> (列表項)，列表還需要容器：

# <ul> (Unordered List/無序列表)： 列表項通常顯示為項目符號（點）。

# <ol> (Ordered List/有序列表)： 列表項會顯示為數字或字母順序。

# 4. 媒體與圖片 (Media & Images)
# <img> (Image/圖片)： 內嵌圖片。

# <picture> (Picture)： 用於響應式設計，讓瀏覽器根據不同螢幕尺寸選擇性載入圖片。

# <video> 和 <audio>： 分別用於內嵌視訊和音訊內容。

# 5. 語義結構元素 (Layout & Semantic Structure)
# 為了讓搜尋引擎和輔助技術更好地理解網頁結構，現代 HTML5 推薦使用這些元素取代通用的 <div>：

# <header>	頁面或區塊的頂部或標頭。	包含標題、導航欄、Logo。
# <nav>	導航連結的集合。	頁面主菜單（如您的 TopBar 連結）。
# <main>	頁面的主要內容。	頁面上每個頁面獨特的部分（例如您的 #main-content 區域）。
# <section>	具有獨立主題的內容區塊。	儀表板中的「選擇分析模型」區塊。
# <article>	獨立、自成一體的內容。	部落格文章、新聞報導。
# <footer>	頁面或區塊的底部或頁腳。	包含版權信息、聯絡方式。

# 6. 表單與輸入 (Forms & Inputs)
# <form> (Form/表單)： 用來收集使用者輸入的容器。

# <input> (Input/輸入)： 用於創建各種輸入控制項（文本框、密碼、單選框等）。

# <button> (Button/按鈕)： 可點擊的按鈕。

# <label> (Label/標籤)： 標註表單控制項的描述文字。

# 要素名稱,屬性名,功能說明,常用值範例
# 1. 要變化的 CSS 屬性,transition-property,指定哪些 CSS 屬性的變化需要套用過渡效果。,all、color、transform、width
# 2. 過渡所需時間,transition-duration,指定過渡效果持續多久。,0.5s (0.5 秒)、500ms (500 毫秒)
# 3. 速度曲線,transition-timing-function,指定過渡效果的速度變化曲線（例如：開始慢、中間快、結束慢）。,ease（預設）、linear、ease-in-out、cubic-bezier(...)
# 4. 延遲時間,transition-delay,指定過渡效果延遲多久後才開始執行。,0s (0 秒)、1s (1 秒)

# 標籤,語義用途,瀏覽器預設樣式,範例
# <h1> 到 <h6>,標題 (Headings)：定義不同層級的標題。<h1> 最重要，<h6> 最次要。,粗體，預設有上下間距 (Margin)，字體大小遞減。,<h2>我的主題</h2>
# <p>,段落 (Paragraph)：定義一段通用的文字內容。,預設有上下間距 (Margin)。,<p>這是文章的一段文字。</p>
# <blockquote>,區塊引用：用於包含來自其他來源的長篇引用內容。,通常會縮排 (Indentation) 顯示，預設有上下間距。,<blockquote>...</blockquote>
# <div>,通用容器：本身沒有特殊語義，主要用於 CSS 佈局和分組內容。,預設獨佔一行，沒有特殊樣式。,<div>用於分組內容</div>

# 標籤,語義用途,瀏覽器預設樣式,範例
# <span>,通用行內容器：本身沒有特殊語義，主要用於為一段文字中的一小部分應用 CSS 樣式。,沒有特殊樣式。,<span>部分文字</span>
# <label>,表單標籤：與表單控制項（如 <input>）相關聯，提供用戶可點擊的文字標識。,沒有特殊樣式，但語義上很重要。,"<label for=""name"">姓名:</label>"
# <a>,錨點/超連結：創建一個超連結到其他頁面或資源。,預設藍色帶底線。,"<a href=""..."">連結</a>"
# <strong>,重要性強：強調內容的重要性、嚴肅性或緊迫性。,粗體。,<strong>重要！</strong>
# <em>,強調：強調內容的語氣。,斜體 (Italic)。,<em>強調語氣</em>
# <b>,粗體：用於引起注意，但沒有特別的重要性語義。,粗體。,<b>單純粗體</b>
# <i>,斜體：表示不同語氣、技術術語或思想。,斜體。,<i>術語</i>

# 標籤,語義用途,範例
# <ul>,無序列表：項目符號清單。,<ul><li>項目一</li></ul>
# <ol>,有序列表：編號清單。,<ol><li>第一項</li></ol>
# <li>,清單項目：清單中的單個項目。,<li>...</li>

# 標籤,語義用途,範例
# "<input type=""text"">",輸入框：用於讓用戶輸入文字。,"<input type=""text"">"
# <textarea>,多行文字輸入：用於輸入較長的文本。,<textarea>...</textarea>
# <button>,按鈕：用於觸發動作，按鈕內的文字就是其內容。,<button>點擊我</button>

# 當 margin 只有兩個值時：margin: [垂直間距] [水平間距];
# 當 margin 只有四個值時：margin: 上 右 下 左;