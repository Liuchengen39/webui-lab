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

* **綜合儀表板 (Dashboard)**
  * **學分完成情況**：主修與通識學分進度條、分類條目、環形總進度圖與未達標紅框警示。
  * **本學期開課與選課管理**：提供開課清單檢視、一鍵新增/刪除當前修課與課表動態連動。
  * **已選課程一覽**：完整紀錄歷年（如 114-1）已修完並獲得學分之科目。
  * **修課提醒與預測進度**：根據當前選課結果，即時預測選課後學分進度與缺額警告。

* **視覺化課表 (Timetable)**
  * 根據「本學期新增課程」自動繪製週一至週五/每日節次課表網格，支援衝堂預警與課程細節查看。

* **可收折側邊欄 (Collapsible Sidebar)**
  * 提供「綜合」、「課表」、「帳號設定」三大核心分頁切換，支援一鍵展開與收折。

* **Google Drive 雲端自動同步**
  * 採用 Google Identity Services (GIS) 與 Drive AppData API。
  * 資料離線優先儲存於 `LocalStorage`，登入後靜默同步至個人 Google 雲端隱藏目錄，實現跨裝置無縫接軌。

---