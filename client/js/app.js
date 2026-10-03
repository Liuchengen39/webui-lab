function removeRow(btn) {
  const tr = btn.closest('tr');
  if (!tr) return;
  if (tr.dataset.courseId) removed.add(tr.dataset.courseId);
  renderTable();
}

// 從 FastAPI 的 /api/courses 取得 cs.py 爬到的課程，直接匯入「新增本學期修課程」表格
let COURSES = [];
const removed = new Set(); // 使用者按垃圾桶移除的課程，篩選時不會再冒出來
const PAGE_SIZE = 8; // 每頁幾筆
let page = 1;

// 資工系「專業選修」課號（依系上必選修科目表）；不在名單內的視為專業必修
const ELECTIVE_IDS = new Set([
  '210150', '210012', '210015', '210021', '210023', '210123', '210124', '210125',
  '210126', '210130', '210131', '210132', '210133', '210134', '210135', '210136',
  '210140', '210141', '210142', '210143', '210146', '210147', '210148', '210149',
  '210009', '210086', '210115', '210145', '210029', '210153', '210154', '210156',
  '210157', '210158', '210159', '210161', '210163', '210164', '210165', '210166',
  '210167', '210168', '210169', '210170', '210171', '210172', '210173', '210174',
]);

const categoryOf = (c) => (ELECTIVE_IDS.has(c.course_id) ? '專業選修' : '專業必修');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 用上課時間推算學分：時間格式如 "2cd4d"（數字=星期，字母=節次），字母數 = 學分
function creditsOf(c) {
  if (c.credits) return c.credits;
  const n = (String(c.time_slot || '').match(/[a-z]/gi) || []).length;
  return n || '—';
}

function renderTable() {
  const q = document.getElementById('courseSearch').value.trim().toLowerCase();
  const grade = document.getElementById('gradeFilter').value;
  const tbody = document.querySelector('#newCourses tbody');

  const rows = COURSES.filter((c) => {
    if (removed.has(c.course_id + '|' + c.time_slot)) return false;
    if (grade && c.grade !== grade) return false;
    if (!q) return true;
    return [c.course_name, c.teacher, c.course_id].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(Math.max(page, 1), totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((c) => {
      const key = c.course_id + '|' + c.time_slot;
      return `
      <tr data-course-id="${esc(key)}">
        <td>${esc(c.course_name)}</td>
        <td><span class="status ${categoryOf(c) === '專業必修' ? 'blue' : ''}">${categoryOf(c)}</span></td>
        <td>${esc(creditsOf(c))}</td>
        <td>${esc(c.time_slot)}</td>
        <td>${esc(c.teacher)}</td>
        <td>${esc(c.location)}</td>
        <td><span class="status">已新增</span></td>
        <td><button class="trash" onclick="removeRow(this)" title="移除">🗑</button></td>
      </tr>`;
    })
    .join('');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">沒有符合的課程</td></tr>';
  }
  document.getElementById('courseCount').textContent = `共 ${rows.length} 門`;
  renderPager(totalPages);
}

function goPage(p) {
  page = p;
  renderTable();
}

function renderPager(totalPages) {
  let pager = document.getElementById('pager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'pager';
    pager.className = 'pager';
    document.getElementById('newCourses').insertAdjacentElement('afterend', pager);
  }
  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }
  pager.innerHTML = `
    <span class="pg-info">第 ${page} / ${totalPages} 頁</span>
    <button class="pg-btn" onclick="goPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹ 上一頁</button>
    <button class="pg-btn" onclick="goPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>下一頁 ›</button>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/courses');
    if (!res.ok) throw new Error(res.status);
    COURSES = await res.json();
  } catch (e) {
    console.error('載入課程失敗', e);
  }
  const sel = document.getElementById('gradeFilter');
  [...new Set(COURSES.map((c) => c.grade).filter(Boolean))].sort().forEach((g) => {
    sel.insertAdjacentHTML('beforeend', `<option value="${esc(g)}">${esc(g)} 年級</option>`);
  });
  document.getElementById('courseSearch').addEventListener('input', () => { page = 1; renderTable(); });
  sel.addEventListener('change', () => { page = 1; renderTable(); });
  renderTable();
});


// ===== 本學期通識課：載入 general_courses.json（經由 /api/general-courses）=====
let GENERAL = [];
let genPage = 1;

const pick = (c, ...keys) => {
  for (const k of keys) if (c[k] !== undefined && c[k] !== null && c[k] !== '') return c[k];
  return '';
};

function renderGeneral() {
  const table = document.querySelector('.general-card .table');
  if (!table) return;
  table.id = 'generalCourses';

  const totalPages = Math.max(1, Math.ceil(GENERAL.length / PAGE_SIZE));
  genPage = Math.min(Math.max(genPage, 1), totalPages);
  const rows = GENERAL.slice((genPage - 1) * PAGE_SIZE, genPage * PAGE_SIZE);

  table.innerHTML = `
    <thead>
      <tr>
        <th>課程名稱</th><th>類別</th><th>學分</th><th>時間</th><th>老師</th><th>上課地點</th><th>狀態</th>
      </tr>
    </thead>
    <tbody>
      ${
        rows
          .map(
            (c) => `
      <tr>
        <td>${esc(pick(c, 'course_name', 'name', 'cname'))}</td>
        <td>${esc(pick(c, 'category', 'type', 'domain') || '通識')}</td>
        <td>${esc(pick(c, 'credits', 'credit') || creditsOf(c))}</td>
        <td>${esc(pick(c, 'time_slot', 'time') || '無')}</td>
        <td>${esc(pick(c, 'teacher', 'teachers') || '—')}</td>
        <td>${esc(pick(c, 'location', 'classroom') || '無')}</td>
        <td><span class="status">已新增</span></td>
      </tr>`
          )
          .join('') || '<tr><td colspan="7" style="text-align:center">沒有通識課資料（請確認 general_courses.json）</td></tr>'
      }
    </tbody>`;

  let pager = document.getElementById('genPager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'genPager';
    pager.className = 'pager';
    table.insertAdjacentElement('afterend', pager);
  }
  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }
  pager.innerHTML = `
    <span class="pg-info">第 ${genPage} / ${totalPages} 頁（共 ${GENERAL.length} 門）</span>
    <button class="pg-btn" onclick="goGeneral(${genPage - 1})" ${genPage === 1 ? 'disabled' : ''}>‹ 上一頁</button>
    <button class="pg-btn" onclick="goGeneral(${genPage + 1})" ${genPage === totalPages ? 'disabled' : ''}>下一頁 ›</button>`;
}

function goGeneral(p) {
  genPage = p;
  renderGeneral();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/general-courses');
    if (!res.ok) throw new Error(res.status);
    GENERAL = await res.json();
  } catch (e) {
    console.error('載入通識課失敗', e);
  }
  renderGeneral();
});