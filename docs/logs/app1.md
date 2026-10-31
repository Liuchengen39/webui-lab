# 暨南大學課程排課系統：Event 與 Function 對照表

本文件整理專案中所有 event，以及每個 event 觸發的 function 呼叫鏈（縮排代表「又呼叫了誰」）。

涵蓋檔案：`app.js`、`settings.js`、`timetable.js`、`profile.js`

---

## 0. 先看重點

- 首頁課程資料只在 `DOMContentLoaded` 時讀取**一次**（`fetch('data/xxx.json')`），之後的搜尋、切分頁、加退選都只是重畫畫面，不會再 fetch。
- app.js **沒有呼叫** server.py 的 `/api/*`，而是直接讀 `data/` 底下的靜態 JSON。
- 會發出網路請求的 function：
  - 讀課程資料：`getJson`、`loadPE`、`loadCM`
  - 呼叫 Google：`drive`、`fetchEmail`
- 最核心的三個 function：`renderAll()`（畫畫面）、`saveAdded()`（存資料）、`drive()`（所有 Google 請求的出入口）。

---

## 1. index.html（app.js）

### 1.1 Event 總表

| # | Event | 元素 | 觸發的 function | 修改的 DOM |
|---|---|---|---|---|
| 1 | `DOMContentLoaded` | `document` | 匿名 async（載入資料、綁事件、`renderAll()`） | 見 `renderAll` |
| 2 | `click` | `document`（過濾 `.act-btn, .sel-del`） | `toggleCourse()` / `removeSelected()` | 改資料後呼叫 `renderAll()` |
| 3 | `click` | `#courseTabs` | `switchTab()` | `.tab` 的 `.active`、`#courseFilter`、`#courseTable tbody` |
| 4 | `input` | `#courseSearch` | `renderCourses()` | `#courseTable tbody`、`#courseCount`、`#tabCnt-*`、`#coursePager` |
| 5 | `change` | `#courseFilter` | `renderCourses()` | 同上 |
| 6 | `click` | `#openManual` | `setManualMsg()` + `showModal()` | `#mfMsg`、開啟 `#manualDialog` |
| 7 | `click` | `#mfCancel` | `dlg.close()` | 關閉 `#manualDialog` |
| 8 | `click` | `#manualDialog`（點背景） | `dlg.close()` | 關閉 `#manualDialog` |
| 9 | `submit` | `#manualForm` | `addManualCourse()` | `#mfMsg`、表單 reset、新增 `.toast` |
| 10 | `onclick`（HTML 字串內） | 上一頁／下一頁 | `goCourses()` | 同 #4 |

### 1.2 呼叫鏈

#### 1. `DOMContentLoaded`（開頁）

```
匿名 async function
├─ getJson('cs_courses.json')            → fetch
├─ loadGeneral()
│   ├─ getJson ×2                         → fetch general_courses / general_domains
│   └─ shortDomain()
├─ loadPE()                               → fetch physical.json
│   ├─ normalizePE() → pick()
│   ├─ peCategoryOf()
│   └─ keyOf() → pick()
├─ loadCM()                               → fetch common.json
│   ├─ normalizeCM() → normalizePE() → pick()
│   └─ keyOf()
├─ rebuildFilter() → gradeOptions()、esc()
├─ initManualDialog()                     （綁事件 6、7、8、9）
└─ renderAll()
```

#### 2. `click` 在 `document`（加入／退選／✕）

```
匿名 function
├─ removeSelected(key)                    （按右側 ✕）
│   ├─ saveAdded()
│   └─ renderAll()
└─ toggleCourse(src, key)                 （按表格的加入／退選）
    ├─ isAdded()
    ├─ keyOf() → pick()
    ├─ recordFromCS() / recordFromGeneral() / recordFromPE() / recordFromCM()
    │   └─ keyOf()、creditsOf()、categoryOf()、bigDomain()、peCategoryOf()
    ├─ isConflicted() → parseTimeSlot()、allSelected()
    ├─ confirm()                          （衝堂時詢問）
    ├─ saveAdded()
    └─ renderAll()
```

#### 3. `click` 在 `#courseTabs`

```
匿名 function → switchTab(tab)
├─ rebuildFilter() → gradeOptions()、esc()
└─ renderCourses()
```

#### 4、5. `input` 在 `#courseSearch` / `change` 在 `#courseFilter`

```
匿名 function → renderCourses()
```

#### 6. `click` 在 `#openManual`

```
匿名 function
├─ setManualMsg(MF_HINT)
└─ dlg.showModal()
```

#### 7、8. `click` 在 `#mfCancel` / 點對話框背景

```
dlg.close()
```

#### 9. `submit` 在 `#manualForm`

```
addManualCourse(e)
├─ setManualMsg()                         （驗證失敗時）
├─ isConflicted() → parseTimeSlot()
├─ confirm()
├─ saveAdded()
├─ renderAll()
└─ showToast()
```

#### 10. 行內 `onclick`（上一頁／下一頁）

```
goCourses(p) → renderCourses()
```

#### 共用：`renderAll()`

```
renderAll()
├─ renderCourses()
│   ├─ rowOf() → categoryOf()、peCategoryOf()、creditsOf()、pick()、bigDomain()、domainBadge()
│   ├─ keyOf()
│   ├─ statusHtml() → isAdded()、isConflicted()
│   ├─ actionHtml() → isAdded()、esc()
│   └─ esc()
├─ renderSelected()
│   └─ allSelected()、isAdded()、esc()
└─ renderProgress()
    ├─ creditsByCategory() → allSelected()
    └─ pct()
```

### 1.3 資料流程

```
DOMContentLoaded
  → getJson / loadPE / loadCM
  → fetch('data/xxx.json')
  → GET {站台路徑}/data/xxx.json
  → StaticFiles（server.py 的 /data mount）直接回傳檔案
  → JSON Response
  → 存進 COURSES / GENERAL / PE / CM
  → renderAll()
  → 修改 DOM
  → 使用者看到課程表、已選課程、學分進度
```

| 資料 | Function | 請求的檔案 | 存到 |
|---|---|---|---|
| 資工系 | `getJson` | `data/cs_courses.json` | `COURSES` |
| 通識 | `loadGeneral` | `data/general_courses.json` + `data/general_domains.json`（前端合併領域與學分） | `GENERAL` |
| 體育 | `loadPE` | `data/physical.json` | `PE` |
| 共同必修 | `loadCM` | `data/common.json` | `CM` |

---

## 2. settings.html（settings.js）

### 2.1 Event 總表

| # | Event | 元素 | 觸發的 function |
|---|---|---|---|
| 1 | `DOMContentLoaded` | `document` | `initProfile()`、`initSwitch()`、`initGoogle()` |
| 2 | `onclick` | 各列「編輯」`.edit-btn` | `startEdit(row)` |
| 3 | `onclick` | 編輯中的「儲存」 | `commit()` |
| 4 | `onclick` | 編輯中的「取消」 | `finish()` |
| 5 | `keydown` | 編輯輸入框 | Enter → `commit()`、Esc → `finish()` |
| 6 | `click` | `#syncSwitch` | 切換自動同步 |
| 7 | `click` | `#linkGoogleBtn` | `connectGoogle()` |
| 8 | `click` | `#restoreBtn` | `restoreFromCloud()` |
| 9 | `click` | `#unlinkBtn` | `unlink()` |
| 10 | `storage` | `window` | `scheduleAutoSync()` |
| 11 | `onload` / `onerror` | 動態建立的 `<script>` | `resolve` / `reject`（載入 Google 登入元件） |
| 12 | `callback` / `error_callback` | Google 登入視窗（非 DOM event） | 存 token，或顯示登入失敗 |

### 2.2 呼叫鏈

#### 1. `DOMContentLoaded`

```
匿名 function
├─ initProfile()
│   ├─ renderProfile() → NCNU_PROFILE.load()
│   └─ 幫每個「編輯」綁 onclick = startEdit
├─ initSwitch()                           （綁 #syncSwitch click）
└─ initGoogle()
    ├─ loadToken()
    ├─ setLinked()
    ├─ setMsg()
    └─ 綁 #linkGoogleBtn / #restoreBtn / #unlinkBtn click、window storage
```

#### 2–5. 個人資料編輯

```
startEdit(row)
└─ 建立輸入框，並把按鈕改綁成 commit / finish

commit()                                  （儲存、Enter）
├─ NCNU_PROFILE.load() / save() → apply()
├─ finish() → renderProfile()
└─ scheduleAutoSync() → uploadNow()

finish()                                  （取消、Esc）
└─ renderProfile()
```

#### 6. `click` 在 `#syncSwitch`

```
匿名 function
├─ autoSyncOn()
├─ paint()
└─ scheduleAutoSync()                     （開啟時）
```

#### 7. `click` 在 `#linkGoogleBtn`

```
connectGoogle()
├─ uploadNow()                            （已登入時）
└─ （未登入時）
    ├─ loadGIS()
    ├─ google.accounts.oauth2.initTokenClient()
    └─ requestAccessToken()
        └─ callback（使用者在 Google 視窗完成授權後）
            ├─ saveToken()
            ├─ setLinked()
            ├─ fetchEmail()                → fetch userinfo
            ├─ clearLocalData() → renderProfile()   （換帳號時）
            └─ firstSync()                 （第一次連結或換帳號時）
                ├─ findFile() → drive()
                ├─ upload(null) → snapshot()、drive()
                ├─ downloadRemote() → drive()
                ├─ localIsEmpty()
                ├─ restore() → renderProfile()
                ├─ confirm()
                └─ upload(file)
```

#### 8. `click` 在 `#restoreBtn`

```
restoreFromCloud()
├─ findFile() → drive()
├─ confirm()
├─ downloadRemote() → drive()
└─ restore() → NCNU_PROFILE.save()、renderProfile()
```

#### 9. `click` 在 `#unlinkBtn`

```
unlink()
├─ confirm()
├─ upload(await findFile())
├─ google.accounts.oauth2.revoke()
├─ clearToken()
├─ clearLocalData()
└─ setLinked(false)
```

#### 10. `storage` 在 `window`（別的分頁改了課程或個人資料）

```
匿名 function → scheduleAutoSync()
              └─ setTimeout 1.5 秒 → uploadNow()
                  ├─ setMsg()
                  ├─ findFile() → drive()
                  └─ upload(file) → snapshot()、drive()
```

#### 共用：`drive(url)`

```
drive()
├─ fetch(url, Authorization: Bearer token)
├─ 401 → clearToken()、setLinked(false)
└─ 其他錯誤 → throw Error
```

### 2.3 Google API 清單

| 用途 | 請求 |
|---|---|
| 載入登入元件 | `accounts.google.com/gsi/client`（Google Identity Services） |
| 取得 email（偵測換帳號） | `GET oauth2/v3/userinfo` |
| 查詢雲端存檔 | `GET drive/v3/files?spaces=appDataFolder` |
| 下載存檔 | `GET drive/v3/files/{id}?alt=media` |
| 更新存檔 | `PATCH upload/drive/v3/files/{id}?uploadType=media` |
| 第一次建立存檔 | `POST upload/drive/v3/files?uploadType=multipart` |

授權範圍（scope）：`drive.appdata`、`userinfo.email`。

---

## 3. timetable.html（timetable.js）

| Event | 元素 | 觸發的 function |
|---|---|---|
| `DOMContentLoaded` | `document` | 綁 `#reloadBtn`，並呼叫 `render()` |
| `click` | `#reloadBtn` | `location.reload()` |
| `storage` | `window` | `render()`（首頁加退選後自動更新課表） |

```
render()
├─ loadAdded()
├─ parseSlots()
├─ runsOf()
├─ addMin()
├─ clean()
└─ esc()
```

---

## 4. 所有頁面共用（profile.js）

| Event | 元素 | 觸發的 function |
|---|---|---|
| `DOMContentLoaded` | `document` | `apply()`（把姓名、年級寫進右上角） |
| `storage` | `window` | `apply()`（別的分頁改了個人資料就同步） |

```
apply() → load()
```

---

## 5. 備註

1. **`storage` event 只會在「別的分頁」修改 localStorage 時觸發**，自己這一頁改不會觸發。settings、timetable、profile 都有監聽，只有 app.js 沒有，所以其他分頁改了資料，首頁不會自動更新。
2. **事件綁定時機**：app.js 的 `DOMContentLoaded` handler 是 `async`，要等所有資料載入完才會綁 tab、搜尋、篩選、手動新增的事件。若資料載入拋出錯誤，這些事件不會被綁定。
3. **Google 登入狀態跨頁**：token 存在 `sessionStorage`，key 由 `profile.js` 的 `NCNU_KEY()` 依網址路徑加前綴。demo 站若網址有無結尾斜線不一致，前綴會不同而讀不到 token（建議把前綴改成只取第一層路徑，並將 token 改存 `localStorage`）。
4. **fetch 的相對路徑**：`'data/'` 為相對路徑。若 demo 站網址是 `/s115321012`（無結尾斜線），會被解析成 `/data/...` 而讀不到檔案。
5. **server.py 的 `/api/*` 目前未被前端使用**，與前端 `loadGeneral()`、`normalizePE()` 的處理邏輯重複，可擇一保留。