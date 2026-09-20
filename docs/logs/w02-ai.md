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

<!-- 2. <main>：宣告這是整頁的核心主體內容（排除 header/footer） -->
<main>

  <!-- <article>：代表這是一篇獨立完整的文章（可被單獨轉載或訂閱 RSS） -->
  <article>
    <h2>如何寫出高品質的 HTML</h2>
    <p>發布日期：2026-03-22</p>
    <p>語意化標籤是提升網頁品質與 SEO 的關鍵...</p>
    
    <!-- <div>：純粹為了 CSS 排版（例如左右併排的外包裝），無語意需求 -->
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