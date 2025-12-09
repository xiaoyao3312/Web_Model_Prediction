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