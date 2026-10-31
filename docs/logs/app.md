# app.js 結構與執行流程分析

> 重點：這份程式**沒有呼叫任何後端 API，也沒有送出資料給伺服器**。
> 只用 `fetch` 對 `data/` 資料夾做 5 次 GET 讀取靜態 JSON，唯一的寫入是瀏覽器的 localStorage。
> 程式裡 `/api/courses` 之類的註解是舊版 `server.py` 留下的，現在沒有作用。

## 一、函式分類

| 類別 | 函式 |
|---|---|
| 啟動 / 初始化 | `DOMContentLoaded` 監聽器、`initManualDialog`、`loadAdded`（腳本載入時就執行） |
| 資料載入 | `getJson`、`loadGeneral`、`loadPE`、`loadCM` |
| 資料正規化 / 轉換 | `shortDomain`、`normalizePE`、`normalizeCM`、`recordFromCS` / `recordFromGeneral` / `recordFromPE` / `recordFromCM` |
| DOM render | `renderAll`、`renderCourses`、`renderSelected`、`renderProgress`、`rebuildFilter`、`statusHtml`、`actionHtml`、`rowOf`、`showToast` |
| UI state 修改 | `toggleCourse`、`removeSelected`、`addManualCourse`（新增部分）、`saveAdded`、`switchTab`、`goCourses` |
| Event handler | 全域 click 委派（加入、退選、✕）、分頁籤 click、搜尋 input、篩選 change、表單 submit、對話框開啟 / 取消 / 點背景關閉 |
| Error handling | `getJson` 的 catch、`loadPE` / `loadCM` 的錯誤訊息、`loadAdded` / `saveAdded` 的 try/catch、`addManualCourse` 的欄位驗證與 `setManualMsg` |

純計算工具（不屬於上面任何一類）：`parseTimeSlot`、`isConflicted`、`creditsOf`、`pick`、`keyOf`、`categoryOf`、`peCategoryOf`、`bigDomain`、`creditsByCategory`、`pct`、`isAdded`、`allSelected`、`esc`

## 二、Top-down 執行流程與資料存取

### 階段 A：腳本載入（同步）

1. 宣告常數和全域狀態，`COURSES`、`GENERAL`、`PE`、`CM` 此時都是空陣列。
2. 算出 `STORAGE_KEY`。
3. **讀取 localStorage**：`loadAdded()` 讀 `ncnu_added_courses`，還原成 `added` 陣列。讀不到或格式壞掉就回傳 `[]`。
4. 註冊全域 click 監聽器和 `DOMContentLoaded`。

### 階段 B：DOM 就緒後（共 5 次 fetch，全是 GET）

| 順序 | 呼叫 | 傳出的資料 | 取回後存到哪 |
|---|---|---|---|
| 1 | `data/cs_courses.json` | 無（沒有 body、沒有參數） | `COURSES` |
| 1（並行） | `data/general_courses.json` | 無 | 在 `loadGeneral` 裡合併，最後存到 `GENERAL` |
| 1（並行） | `data/general_domains.json` | 無 | 只拿來比對領域與補學分，不單獨存 |
| 2 | `data/physical.json` | 無 | 正規化、過濾（只留「體育」開頭或含「資工」的課）、去重後存到 `PE` |
| 3 | `data/common.json` | 無 | 正規化、去重後存到 `CM` |

- 第 1 組是 `Promise.all` 並行，第 2、3 是依序等待。
- 任何一次失敗都不會中斷程式：`getJson` 回傳 `[]`；`loadPE` / `loadCM` 會設定 `PE_LOAD_ERROR` / `CM_LOAD_ERROR`，之後表格會用紅字顯示。
- 這些資料只放在記憶體，不會寫進 localStorage，重新整理就重新下載。

之後依序執行：`rebuildFilter()` → 綁定分頁籤、搜尋、篩選三個事件 → `initManualDialog()` → `renderAll()` 首次繪製。

### 階段 C：使用者操作

localStorage 只在三種情況寫入（`saveAdded`），寫入內容都是整個 `added` 陣列的 JSON：

- 點「加入」或「退選」：`toggleCourse`
- 點右側「✕」：`removeSelected`
- 手動新增課程：`addManualCourse`

每筆已選課程存的欄位（`manual` 只有手動新增的課才有）：

```
key, semester("115-1"), course_name, unit, credits,
category, time_slot, teacher, location, manual
```

搜尋、篩選、切分頁籤、翻頁都只改記憶體裡的 `tabFilter`、`tabPage`、`curTab`，不會存到任何地方，重新整理就回到預設。

各操作的流程：

| 操作 | 流程 |
|---|---|
| 加入 / 退選 | click → `toggleCourse` → `isConflicted`（可能 `confirm`）→ 改 `added` → `saveAdded` → `renderAll` |
| 右側 ✕ | click → `removeSelected` → `saveAdded` → `renderAll` |
| 切分頁籤 | `switchTab` → `rebuildFilter` → `renderCourses` |
| 搜尋 / 篩選 / 翻頁 | 改 `tabFilter` / `tabPage` → `renderCourses`（只重繪表格） |
| 手動新增 | submit → `addManualCourse` 驗證 → 改 `added` → `saveAdded` → `renderAll` → 關對話框 → `showToast` |

## 三、限制與注意事項

- 選課資料只存在這台瀏覽器：換裝置、換瀏覽器或清除網站資料就會消失，也沒有送到任何伺服器。
- localStorage 寫入失敗時（例如無痕模式）會被靜默忽略，該次頁面仍可操作，但重新整理後資料就沒了，畫面上不會有提示。
- 階段 B 的 `loadPE` 和 `loadCM` 是串行的，互不依賴，可以和第一組 `Promise.all` 合併成並行來加快載入。
- 這份 `app.js` 裡沒有 `loadPageData()` 或 Sidebar，如果它們存在，應該是在 `profile.js` 或其他檔案裡。