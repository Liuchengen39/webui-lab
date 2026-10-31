# app.js 事件流程：Event → Function → DOM Change

暨南大學課程排課系統（`index.html` + `app.js`）

## 整體結構

```
app.js
│
├─ 【模組載入時就執行】
│   ├─ DATA_DIR = 'data/'
│   ├─ 宣告全域狀態：COURSES / GENERAL / PE / CM / curTab / tabPage / tabFilter
│   ├─ STORAGE_KEY = NCNU_KEY('ncnu_added_courses')   ← 來自 profile.js
│   ├─ added = loadAdded()                            ← 讀 localStorage
│   └─ document click 事件委派（加入／退選／刪除）
│
├─ 【DOMContentLoaded】
│   ├─ 載入資料：getJson / loadGeneral / loadPE / loadCM
│   ├─ rebuildFilter()
│   ├─ 綁定：#courseTabs、#courseSearch、#courseFilter
│   ├─ initManualDialog()
│   └─ renderAll()  ← 首次畫面
│
├─ 【inline onclick】分頁按鈕 → goCourses(p)
│
└─ renderAll()  ← 所有改變選課資料的事件最後都匯集到這裡
    ├─ renderCourses()
    ├─ renderSelected()
    └─ renderProgress()
```

基本模式：

```
Event → 改 JS 狀態（added / curTab / tabPage / tabFilter）→ render 函式 → 重寫 DOM
```

---

## 1. 頁面載入

**Event**：`document` 的 `DOMContentLoaded`

**Function**：匿名 async function，依序執行：

1. `getJson()`、`loadGeneral()`、`loadPE()`、`loadCM()` 載入資料（只改 JS 變數，不改 DOM）
2. `rebuildFilter()`
3. 綁定其他事件，並呼叫 `initManualDialog()`
4. `renderAll()`

**DOM Change**：

- `#courseFilter`：`innerHTML` 換成 `<option>` 清單，`.value` 設為目前篩選值
- `renderAll()` 內的修改（見第 8 節）

---

## 2. 切換分頁

**Event**：`#courseTabs` 的 `click`（用 `closest('.tab')` 判斷）

**Function**：`switchTab(tab)` → `rebuildFilter()` → `renderCourses()`

**DOM Change**：

- 每個 `#courseTabs .tab`：`classList.toggle('active')`、`aria-selected` 改成 `"true"` 或 `"false"`
- `#courseFilter`：`innerHTML` 和 `.value`
- 課程表相關：見 `renderCourses()`（第 8 節）

> 點的若是目前分頁，或分頁不在 `FILTERS` 裡，`switchTab` 一開始就 return。

---

## 3. 搜尋

**Event**：`#courseSearch` 的 `input`

**Function**：匿名函式（`tabPage[curTab] = 1`）→ `renderCourses()`

**DOM Change**：只有 `renderCourses()` 內的修改

---

## 4. 篩選

**Event**：`#courseFilter` 的 `change`

**Function**：匿名函式（`tabFilter[curTab] = e.target.value`、`tabPage[curTab] = 1`）→ `renderCourses()`

**DOM Change**：只有 `renderCourses()` 內的修改

---

## 5. 換頁

**Event**：分頁按鈕的 inline `onclick`

**Function**：`goCourses(p)`（`tabPage[curTab] = p`）→ `renderCourses()`

**DOM Change**：只有 `renderCourses()` 內的修改

> `goCourses` 必須是全域函式，inline `onclick` 才找得到。

---

## 6. 加入、退選、✕ 刪除

**Event**：`document` 的 `click`（事件委派，`closest('.act-btn, .sel-del')`）

**Function**：

| 點擊位置 | Function |
|---|---|
| 表格的加入／退選按鈕 | `toggleCourse(src, key)` → `saveAdded()` → `renderAll()` |
| 已選清單的 ✕（`data-from="selected"`） | `removeSelected(key)` → `saveAdded()` → `renderAll()` |

**DOM Change**：

- 本身不直接改 DOM，全部交給 `renderAll()`（第 8 節）
- `toggleCourse` 遇到衝堂會先跳 `confirm()`，使用者取消則不更新

### 為什麼用事件委派

`renderCourses()` 與 `renderSelected()` 每次都用 `innerHTML` 整個換掉按鈕，舊按鈕上的 listener 會隨之消失。把 listener 綁在不會被重畫的 `document`，再用 `closest()` 判斷點到誰，只需綁一次。按鈕要傳的資料放在 `data-src`、`data-key`。

### 注意事項

`#openManual`、`#mfCancel`、表單的「新增」按鈕也帶有 `act-btn` class，所以同樣會被這個全域 click 抓到。此時 `dataset.src`、`dataset.key` 都是 `undefined`，`toggleCourse` 會因為找不到課程而直接 return，沒有副作用，但屬於巧合。可在監聽中加上 `if (!btn.dataset.key) return;` 避免。

---

## 7. 手動新增視窗

### 7.1 開關視窗

| Event | Function | DOM Change |
|---|---|---|
| `#openManual` click | `setManualMsg(MF_HINT)` | `#mfMsg` 的 `textContent` 設為提示文字，移除 `err` class |
| | `dlg.showModal()` | `#manualDialog` 加上 `open` attribute |
| | `#mfName.focus()` | `#mfName` 取得 focus |
| `#mfCancel` click | `dlg.close()` | `#manualDialog` 移除 `open` attribute |
| `#manualDialog` click（只有點背景才處理，`e.target === dlg`） | `dlg.close()` | `#manualDialog` 移除 `open` attribute |

### 7.2 表單送出

**Event**：`#manualForm` 的 `submit`

**Function**：`addManualCourse(e)`，先 `e.preventDefault()`，再依驗證結果分支：

| 分支 | Function | DOM Change |
|---|---|---|
| 驗證失敗（名稱空白、學分不合理、時間格式錯） | `setManualMsg(錯誤訊息, true)` | `#mfMsg` 的 `textContent` 換成錯誤訊息，加上 `err` class |
| 驗證成功 | `isConflicted()` → `confirm()`（衝堂時） | 無 |
| | `added.push(rec)` → `saveAdded()` → `renderAll()` | `renderAll()` 內的修改（第 8 節） |
| | `form.reset()` | `#manualForm` 欄位清空；`#mfCredits.value` 設回 `'3'` |
| | `dlg.close()` | `#manualDialog` 移除 `open` attribute |
| | `showToast(text)` | `body` 新增 `<div class="toast">`，10ms 後加 `show` class，約 2.2 秒後移除 `show`，再 250ms 後移除整個元素 |

---

## 8. 匯集點：`renderAll()`

第 1、6、7 節的事件最後都會走到這裡。

| Function | DOM element | DOM Change |
|---|---|---|
| `renderCourses()` | `#courseTable tbody` | `innerHTML` 換成當頁課程列；無結果時顯示「沒有符合的課程」或載入錯誤訊息 |
| | 表格列內的狀態標籤 | `<span class="status">`，衝堂為 `status conflict`，未選為 `status idle`，已選為「已新增」 |
| | 表格列內的按鈕 | class 為 `act-btn add`（加入）或 `act-btn remove`（退選） |
| | `#courseCount` | `textContent`「共 N 門」 |
| | `#tabCnt-cs/pe/cm/general` | `textContent`（各分頁總數） |
| | `#coursePager` | `innerHTML`（頁碼資訊與上下頁按鈕），首頁或末頁時按鈕帶 `disabled` attribute；只有一頁時清空 |
| `renderSelected()` | `#selectedList` | `innerHTML` 換成已選課程卡片（手動課程有 `status manual` 標籤，非基礎課程才有 ✕ 按鈕） |
| | `#selectedSummary` | `textContent`「N 門 · X 學分」 |
| `renderProgress()` | `#creditTotalText`、`#creditTotalPct` | `textContent` |
| | `#creditTotalBar` | `style.width` |
| | `#totalNum` | `innerHTML` |
| | `#totalRing` | `style.setProperty('--p', ...)`、`dataset.pct` |
| | `#creditRows` | `innerHTML`（學分明細列） |
| | `#creditWarn` | `textContent`（通識不足警告，足夠時為空字串） |
| | `#catList` | `innerHTML`（分類進度條、領域 chips，達標的領域加 `done` class） |

---

## 總覽表

| # | Event | 綁定目標 | Function | 主要 DOM Change |
|---|---|---|---|---|
| 1 | `DOMContentLoaded` | `document` | 匿名 async → `rebuildFilter()`、`renderAll()` | `#courseFilter` ＋ 全部 render 區塊 |
| 2 | `click` | `#courseTabs` | `switchTab()` | `.tab` 的 `active`、`aria-selected`；`#courseFilter`；課程表 |
| 3 | `input` | `#courseSearch` | 匿名 → `renderCourses()` | 課程表、計數、分頁器 |
| 4 | `change` | `#courseFilter` | 匿名 → `renderCourses()` | 課程表、計數、分頁器 |
| 5 | `click`（inline） | 分頁按鈕 | `goCourses()` | 課程表、計數、分頁器 |
| 6 | `click`（委派） | `document` | `toggleCourse()` / `removeSelected()` → `renderAll()` | 全部 render 區塊 |
| 7a | `click` | `#openManual` | 匿名 | `#mfMsg` 文字、`<dialog>` 的 `open` |
| 7b | `click` | `#mfCancel`、`#manualDialog` | 匿名 | `<dialog>` 移除 `open` |
| 7c | `submit` | `#manualForm` | `addManualCourse()` | 錯誤訊息，或全部 render 區塊＋表單重設＋toast |

---

## 補充

- 本檔只涵蓋 `app.js`。`index.html` 另外載入的 `js/profile.js`（提供 `window.NCNU_KEY` 與頁首個人資料）未上傳，因此未列入。
- `app.js` 內沒有 sidebar 的 menu／close／backdrop／account 相關事件，左側導覽只是普通 `<a>` 連結。
