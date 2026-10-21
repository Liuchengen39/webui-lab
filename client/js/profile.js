// 個人資料（姓名／系所／年級）：存在 localStorage，所有頁面右上角共用
// 每一頁在 app.js / timetable.js / settings.js 之前引入這支檔案即可
(function () {
  const KEY = 'ncnu_profile';
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