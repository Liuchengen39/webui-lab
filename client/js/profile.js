// 個人資料（姓名／系所／年級）：存在 localStorage，所有頁面右上角共用
// 每一頁在 app.js / timetable.js / settings.js 之前引入這支檔案即可
(function () {
  // 同一個網域底下有很多同學的網站(例如 /student-a/、/student-b/),
  // localStorage 是依「網域」共用的,所以每個 key 前面加上這個網站的路徑,資料才不會互相覆蓋。
  // 例:https://demo.../student-a/index.html → 'ncnu_profile' 變成 'student-a:ncnu_profile'
  // 本機開在根目錄(/)時沒有前綴,和舊資料相容。
  const dir = location.pathname.replace(/[^/]*$/, ''); // '/student-a/' 或 '/'
  const NS = dir === '/' ? '' : dir.replace(/^\/|\/$/g, '') + ':';
  window.NCNU_KEY = (k) => NS + k;

  const KEY = window.NCNU_KEY('ncnu_profile');
  const DEFAULT = { name: '', dept: '', grade: '' }; // 預設是空白(登出或換帳號後不會留下上一個人的資料)
  const EMPTY_NAME = '未設定';

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...DEFAULT, ...(v && typeof v === 'object' ? v : {}) };
    } catch (e) {
      return { ...DEFAULT };
    }
  }

  // 把名字、年級寫進右上角
  function apply(p) {
    p = p || load();
    document.querySelectorAll('.profile b').forEach((el) => { el.textContent = p.name || EMPTY_NAME; });
    document.querySelectorAll('.profile small').forEach((el) => { el.textContent = p.grade; });
  }

  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 無法儲存就只在這一頁生效 */ }
    apply(p);
  }

  window.NCNU_PROFILE = { KEY, DEFAULT, load, save, apply };
  document.addEventListener('DOMContentLoaded', () => apply());
  // 在別的分頁改了資料，這一頁也跟著更新
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });
})();