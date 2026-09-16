# WebUI Lab

Web Programming課程實作專案。

## 學號
s115321012

## 一、 專案目標與學習內容

本專案旨在幫助大學生高效管理「時間（課表）」與「開銷（記帳）」，並在開發過程中完整掌握標準 Web 開發流程與安全防範觀念。

### 涵蓋技術與 Web 觀念
* **HTML5 & CSS3**：語意化標籤（`aside`, `nav`, `main`, `section`）、Flexbox & CSS Grid 切版、響應式設計 (RWD)。
* **JavaScript (ES6+)**：DOM 操作、Event Listener、Array 高階方法 (`filter`, `reduce`)、動態 UI 渲染。
* **HTML Graphics**：Canvas / SVG 技術應用（用於繪製雙空心圓形圖與近七日花費柱狀圖）。
* **JSON & Web APIs**：JSON 資料格式處理、`localStorage` 本地儲存、Fetch API 與數據匯出。
* **Web Security & Auth**：User Authentication 概念、XSS 防禦與防範自動化 Robot 測試防護。

---

## 二、 核心功能與頁面架構

本應用程式採用 **「左側邊欄 (Sidebar) + 右側主視圖 (Main View)」** 佈局，包含四大分頁：

### 1. 綜合 (Dashboard / 總覽)
* **頂部狀態欄**：顯示日期與當前學期資訊。
* **下一堂課卡片**：即時顯示下一節課程地點與時間。
* **本月預算卡片**：顯示預算消耗百分比與剩餘金額。
* **本月數據卡片**：統計本月總支出、總收入、結餘與記帳筆數。
* **今日課程列表**：動態展示當天的課程表。
* **近七日花費柱狀圖 (Bar Chart)**：以 7 根長條柱動態顯示近七天的每日支出起伏與總金額。

### 2. 課表 (Timetable)
* **週課表視圖**：預設顯示週一至週五課表。
* **課程新增與刪除**：支援點擊新增與刪除課程。
* **課程詳細欄位**：
  * 課程名稱、教室地點、教授名稱、課程標籤顏色、上課時間（星期與節次）。
  * **畢業門檻學分選單**：整合暨南國際大學通識與專業課程架構（包含專業必/選修、共同課程 16 學分、領域課程 15 學分與共同選修）。

### 3. 記帳 (Accounting)
* **時間維度**：以「天」為基本單位顯示明細，支援「月份」切換。
* **雙空心圓形圖 (Doughnut Charts)**：
  * **支出圖表**：僅顯示類別顏色區塊比例，中間標示總支出金額。
  * **收入圖表**：僅顯示類別顏色區塊比例，中間標示總收入金額。
* **收支類別與備註**：
  * **支出類別**：預設（早餐、中餐、晚餐、飲料、宵夜）+ **自訂類別手動輸入**。
  * **收入類別**：預設（生活費、打工、獎學金、其他）。
  * **文字備註**：每筆帳目均可手動輸入詳細備註。
* **專屬自訂數字鍵盤 (Custom Keypad)**：
  * 內建數字 (0-9)、小數點 (.)、退格 (⌫)、清空 (C) 與儲存按鈕，提供流暢快速的輸入體驗。
* **按天分組明細列表**：依日期降序排列，支援刪除與編輯。

### 4. 設定 (Settings)
* **Google 帳號連動**：支援 Google Authentication 登入與登出狀態顯示。
* **資料備份與管理**：提供「匯出記帳資料 (CSV / JSON)」功能，實現本機備份。

---

## 三、 16 週對齊課程進度學習地圖

```text
Week 1: 課程說明：討論期末計畫 (需求討論、UI/UX 規劃與檔案架構定案)
Week 2: How the Web Works? (專案目錄建置與基礎觀念確立)
Week 3: HTML and CSS 1 (語意化骨架aside, main, nav, section與通用樣式)
Week 4: HTML and CSS 2 (Flexbox與CSS Grid側邊欄與主要View佈局切版)
Week 5: HTML and CSS 3 (表單樣式、自訂數字鍵盤與 Modal 視窗UI美化)
Week 6: Term Project Module (專案企畫書定案：問題、動機、目的、角色任務與動線)
Week 7: JavaScript Homeworks (JS 基礎、DOM 選擇器與事件監聽)
Week 8: JavaScript 1 (Tab 頁籤切換邏輯與記帳收支 CRUD 基礎)
Week 9: JavaScript 2 (課表網格動態生成與暨大門檻選單邏輯)
Week 10: JavaScript 3 (按天分組明細、月份切換與高階陣列處理 filter/reduce)
Week 11: HTML Graphics (使用 Canvas/SVG 繪製雙空心圓形圖與近七日花費柱狀圖)
Week 12: Term Project Prototype - Code Review (原型 Demo、報告程式與架構、問題討論)
Week 13: JSON and Web APIs 1 (localStorage 全站資料持久化儲存與讀取)
Week 14: JSON and Web APIs 2 (資料匯出 CSV/JSON 功能與 Fetch API 觀念整合)
Week 15: HTML APIs 視狀況補充：User Authentication and Security (Google Auth UI 與 XSS 資安防護)
Week 16: Project Demo and Report (防範 TA "Human-Like Web Robot" 自動化測試與最終成果展示)