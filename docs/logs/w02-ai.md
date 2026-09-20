### AI Concept Question

## 1.為什麼不應該整個網站全部用<div>？
網頁如果只使用 `<div>`，會帶來以下重大問題：

* **缺乏語意 (No Semantics)**：`<div>` 是一個無語意的通用容器，瀏覽器無法透過它理解內容的真實用途。
* **不利於 SEO**：搜尋引擎爬蟲（如 Googlebot）依賴 HTML 語意標籤來判斷網頁的核心內容、標題層級與導覽區域。全用 `<div>` 會降低頁面索引與權重的精準度。
* **程式碼維護困難**：過多的 `<div>` 嵌套會導致 HTML 結構變得繁雜且混亂，開發者難以快速定位目標區域與進行樣式除錯。

請比較：
<div>
<section>
<article>
<nav>
<main>
用實際網頁例子解釋。

已為您將五個標籤的比較與實際網頁範例整理成乾淨的 Markdown 格式，您可以直接複製並儲存（或覆蓋）至 w02-ai.md 檔案中：

Markdown
# HTML 語意化標籤比較與實務應用 (Semantic HTML Tags)

在 HTML5 中，語意化標籤（Semantic Tags）是用來向瀏覽器、搜尋引擎（SEO）與無障礙輔具（Screen Reader）明確傳達「該區塊內容用途」的標籤。

---

## 一、 標籤特性與用途比較

| 標籤 | 語意說明 | 最佳使用時機 |
| :--- | :--- | :--- |
| **`<main>`** | 頁面的主要內容區域 | 整個頁面**只能有一個**，用來包裹該頁面最獨特、核心的主體內容（排除 Header, Footer, Sidebar）。 |
| **`<nav>`** | 主要導覽連結區域 | 放置網站的主選單、頁尾導覽列、麵包屑導覽（Breadcrumbs）或分頁按鈕等連結。 |
| **`<section>`** | 具備邏輯主題的獨立章節 | 頁面中按主題劃分的章節（如：關於我們、產品特點、最新消息區塊），內部**通常包含一個標題標籤（`<h1>`-`<h6>`）**。 |
| **`<article>`** | 完全獨立且可單獨發布的內容 | 可脫離目前頁面獨立被轉載或閱讀的完整篇章（如：部落格文章、新聞報導、單篇評論、論壇貼文）。 |
| **`<div>`** | 無語意區塊容器 | 僅用於**純視覺排版、CSS 樣式包裹**（如 Flex/Grid 容器、裝飾外框），不具備任何內容邏輯意義時。 |

---

## 二、 實際網頁例子：部落格文章頁面

以下以一個標準部落格文章頁面為例，展示這五個標籤如何分工合作：

```html
<!-- 1. <header> 頁首：放置網站標題與導覽 -->
<header>
  <h1>我的技術部落格</h1>
  
  <!-- <nav>：導覽區塊，放置主要選單連結 -->
  <nav>
    <ul>
      <li><a href="#">首頁</a></li>
      <li><a href="#">文章列表</a></li>
      <li><a href="#">關於我</a></li>
    </ul>
  </nav>
</header>

<!-- 2. <main>：宣告這是整頁的核心主體內容（排除 header/footer/sidebar） -->
<main>

  <!-- <article>：代表這是一篇獨立完整的文章（可被單獨轉載或訂閱 RSS） -->
  <article>
    <h2>如何寫出高品質的 HTML</h2>
    <p>發布日期：2026-03-22</p>
    <p>語意化標籤是提升網頁品質與 SEO 的關鍵...</p>
    
    <!-- <div>：純粹為了 CSS 排版（例如 Flexbox 併排的外包裝），無語意需求 -->
    <div class="image-gallery-flex">
      <img src="pic1.jpg" alt="範例圖 1">
      <img src="pic2.jpg" alt="範例圖 2">
    </div>
  </article>

  <!-- <section>：頁面中按主題劃分的另一個獨立章節（例如：相關文章） -->
  <section class="related-posts">
    <h3>相關文章推薦</h3>
    <ul>
      <li><a href="#">CSS Grid 排版技巧</a></li>
      <li><a href="#">JavaScript 基礎入門</a></li>
    </ul>
  </section>

</main>

<!-- 頁尾 -->
<footer>
  <p>© 2026 My Website</p>
</footer>

---