/* =========================
   資料與狀態
   ========================= */
let COURSES = []; // 資工系課程 (/api/courses)
let GENERAL = []; // 通識課 (/api/general-courses)
const PAGE_SIZE = 8; // 每頁幾筆
let page = 1;
let genPage = 1;
let PE = []; // 體育(特色運動) + 校共同必修(課名含「資工」)
let pePage = 1;

const SEMESTER = '115-1'; // 新增的課程所屬學期
const STORAGE_KEY = 'ncnu_added_courses';

// 先前已選上、不可退選的課程
const BASE_SELECTED = [];

// 使用者自己新增的課程(存在瀏覽器,重新整理後還在)
let added = loadAdded();

function loadAdded() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function saveAdded() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
  } catch (e) {
    /* 無法儲存時仍可在本頁操作 */
  }
}

const isAdded = (key) => added.some((a) => a.key === key);
const allSelected = () => [...BASE_SELECTED, ...added];

// 資工系「專業選修」課號(依系上必選修科目表);不在名單內的視為專業必修
const ELECTIVE_IDS = new Set([
  '210150', '210012', '210015', '210021', '210023', '210123', '210124', '210125',
  '210126', '210130', '210131', '210132', '210133', '210134', '210135', '210136',
  '210140', '210141', '210142', '210143', '210146', '210147', '210148', '210149',
  '210009', '210086', '210115', '210145', '210029', '210153', '210154', '210156',
  '210157', '210158', '210159', '210161', '210163', '210164', '210165', '210166',
  '210167', '210168', '210169', '210170', '210171', '210172', '210173', '210174',
]);

// 領域只顯示大類:自然 / 人文 / 社會 / 特色(完整名稱放在滑鼠提示)
const bigDomain = (d) => {
  if (!d) return '通識';
  const out = [];
  String(d).split('、').forEach((x) => {
    const m = x.trim().match(/^(自然|人文|社會|特色)/);
    const k = m ? m[1] : x.trim();
    if (k && !out.includes(k)) out.push(k);
  });
  return out.join('、');
};

const categoryOf = (c) => (ELECTIVE_IDS.has(c.course_id) ? '專業選修' : '專業必修');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

// 用上課時間推算學分:時間格式如 "2cd4d"(數字=星期,字母=節次),字母數 = 學分
function creditsOf(c) {
  if (c.credits) return c.credits;
  const n = (String(c.time_slot || '').match(/[a-z]/gi) || []).length;
  return n || '—';
}

const pick = (c, ...keys) => {
  for (const k of keys) {
    if (c[k] !== undefined && c[k] !== null && c[k] !== '') return c[k];
  }
  return '';
};

const keyOf = (c) => `${c.course_id}|${pick(c, 'time_slot', 'time')}`;

// 解析時間字串,例如 "2cd4d" => ["2c", "2d", "4d"]
function parseTimeSlot(slot) {
  const s = String(slot || '').trim();
  if (!s || s === '無') return [];

  const result = [];
  const matches = s.match(/\d[a-z]+/gi) || [];
  matches.forEach((part) => {
    const day = part[0];
    part.slice(1).split('').forEach((p) => result.push(`${day}${p}`));
  });
  return result;
}

// 與目前已選課程(含新增的)是否衝堂
function isConflicted(slot, selfKey) {
  const cur = parseTimeSlot(slot);
  if (!cur.length) return false;
  return allSelected().some((s) => {
    if (s.key === selfKey) return false;
    const other = parseTimeSlot(s.time_slot);
    return cur.some((x) => other.includes(x));
  });
}

/* =========================
   把原始課程轉成「已選」紀錄
   ========================= */
function recordFromCS(c) {
  return {
    key: keyOf(c),
    semester: SEMESTER,
    course_name: c.course_name,
    unit: '資工系',
    credits: creditsOf(c),
    category: categoryOf(c),
    time_slot: c.time_slot || '無',
    teacher: c.teacher || '',
    location: c.location || ''
  };
}

function recordFromGeneral(c) {
  const domain = pick(c, 'domain', 'category', 'type');
  return {
    key: keyOf(c),
    semester: SEMESTER,
    course_name: pick(c, 'course_name', 'name', 'cname'),
    unit: '通識中心',
    credits: pick(c, 'credits', 'credit') || creditsOf(c),
    category: '通識-' + bigDomain(domain),
    time_slot: pick(c, 'time_slot', 'time') || '無',
    teacher: pick(c, 'teacher', 'teachers'),
    location: pick(c, 'location', 'classroom')
  };
}

/* =========================
   新增 / 退選
   ========================= */
/* =========================
   體育 / 校共同必修
   ========================= */
// 課名開頭是「體育」→ 特色運動;課名包含「資工」→ 校共同必修
const peCategoryOf = (c) => {
  const n = String(c.course_name || '').trim();
  if (n.startsWith('體育')) return '特色運動';
  if (n.includes('資工')) return '校共同必修';
  return '';
};

// 兼容爬蟲輸出的中文欄位名與 API 的英文欄位名
const normalizePE = (c) => ({
  course_id: pick(c, 'course_id', '課程代碼', '課號', '選課代碼'),
  course_name: pick(c, 'course_name', '課程名稱', '中文課名', '中文課程名稱', 'cname'),
  time_slot: pick(c, 'time_slot', '上課時間', '時間', 'time'),
  teacher: pick(c, 'teacher', '授課教師', '教師', '老師', 'teachers'),
  location: pick(c, 'location', '教室', '上課地點', 'classroom'),
  credits: pick(c, 'credits', '學分', 'credit'),
  grade: pick(c, 'grade', '年級')
});

// 資料來源：/api/pe-courses，沒有的話改讀爬蟲輸出的 /physical.json，再依課名分類
async function loadPE() {
  const fetchJson = async (url) => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();
      return Array.isArray(data) ? data : null;
    } catch (e) {
      return null;
    }
  };

  let raw = await fetchJson('/api/pe-courses');
  if (!raw) {
    raw = (await fetchJson('/physical.json')) || [];
  }
  if (!raw.length) console.error('載入體育 / 校共同必修課程失敗');

  // 兩個檔案若有重複的課，只留一筆
  const seen = new Set();
  return raw
    .map(normalizePE)
    .filter((c) => peCategoryOf(c))
    .filter((c) => {
      const k = keyOf(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function recordFromPE(c) {
  const cat = peCategoryOf(c);
  return {
    key: keyOf(c),
    semester: SEMESTER,
    course_name: c.course_name,
    unit: cat === '特色運動' ? '體育室' : '資工系',
    credits: creditsOf(c),
    category: cat,
    time_slot: c.time_slot || '無',
    teacher: c.teacher || '',
    location: c.location || ''
  };
}

function toggleCourse(src, key) {
  if (isAdded(key)) {
    added = added.filter((a) => a.key !== key);
  } else {
    const list = src === 'general' ? GENERAL : src === 'pe' ? PE : COURSES;
    const c = list.find((x) => keyOf(x) === key);
    if (!c) return;
    const rec = src === 'general' ? recordFromGeneral(c) : src === 'pe' ? recordFromPE(c) : recordFromCS(c);
    if (isConflicted(rec.time_slot, rec.key)) {
      if (!confirm(`「${rec.course_name}」與已選課程衝堂,仍要加入嗎?`)) return;
    }
    added.push(rec);
  }
  saveAdded();
  renderAll();
}

function removeSelected(key) {
  added = added.filter((a) => a.key !== key);
  saveAdded();
  renderAll();
}

// 狀態標籤 + 按鈕
function statusHtml(key, slot) {
  if (isAdded(key)) return '<span class="status">已新增</span>';
  if (isConflicted(slot, key)) return '<span class="status conflict">衝堂</span>';
  return '<span class="status idle">未選</span>';
}

function actionHtml(src, key) {
  return isAdded(key)
    ? `<button class="act-btn remove" data-src="${src}" data-key="${esc(key)}">退選</button>`
    : `<button class="act-btn add" data-src="${src}" data-key="${esc(key)}">加入</button>`;
}

/* =========================
   資工系課程表
   ========================= */
function renderTable() {
  const q = document.getElementById('courseSearch').value.trim().toLowerCase();
  const grade = document.getElementById('gradeFilter').value;
  const tbody = document.querySelector('#newCourses tbody');

  const rows = COURSES.filter((c) => {
    if (grade && c.grade !== grade) return false;
    if (!q) return true;
    return [c.course_name, c.teacher, c.course_id].some((v) =>
      String(v || '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(Math.max(page, 1), totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((c) => {
      const key = keyOf(c);
      return `
<tr>
  <td>${esc(c.course_name)}</td>
  <td><span class="status ${categoryOf(c) === '專業必修' ? 'blue' : ''}">${categoryOf(c)}</span></td>
  <td>${esc(creditsOf(c))}</td>
  <td>${esc(c.time_slot)}</td>
  <td>${esc(c.teacher)}</td>
  <td>${esc(c.location)}</td>
  <td>${statusHtml(key, c.time_slot)}</td>
  <td>${actionHtml('cs', key)}</td>
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

/* =========================
   通識課表
   ========================= */
function renderPE() {
  const q = document.getElementById('peSearch').value.trim().toLowerCase();
  const cat = document.getElementById('peFilter').value;
  const tbody = document.querySelector('#peCourses tbody');

  const rows = PE.filter((c) => {
    if (cat && peCategoryOf(c) !== cat) return false;
    if (!q) return true;
    return [c.course_name, c.teacher, c.course_id].some((v) =>
      String(v || '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  pePage = Math.min(Math.max(pePage, 1), totalPages);
  const pageRows = rows.slice((pePage - 1) * PAGE_SIZE, pePage * PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((c) => {
      const key = keyOf(c);
      const k = peCategoryOf(c);
      return `
<tr>
  <td>${esc(c.course_name)}</td>
  <td><span class="status ${k === '校共同必修' ? 'blue' : ''}">${k}</span></td>
  <td>${esc(creditsOf(c))}</td>
  <td>${esc(c.time_slot || '無')}</td>
  <td>${esc(c.teacher || '—')}</td>
  <td>${esc(c.location || '無')}</td>
  <td>${statusHtml(key, c.time_slot)}</td>
  <td>${actionHtml('pe', key)}</td>
</tr>`;
    })
    .join('');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">沒有符合的課程</td></tr>';
  }

  document.getElementById('peCount').textContent = `共 ${rows.length} 門`;

  let pager = document.getElementById('pePager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'pePager';
    pager.className = 'pager';
    document.getElementById('peCourses').insertAdjacentElement('afterend', pager);
  }
  pager.innerHTML =
    totalPages <= 1
      ? ''
      : `
<span class="pg-info">第 ${pePage} / ${totalPages} 頁</span>
<button class="pg-btn" onclick="goPE(${pePage - 1})" ${pePage === 1 ? 'disabled' : ''}>‹ 上一頁</button>
<button class="pg-btn" onclick="goPE(${pePage + 1})" ${pePage === totalPages ? 'disabled' : ''}>下一頁 ›</button>`;
}

function goPE(p) {
  pePage = p;
  renderPE();
}

function renderGeneral() {
  const table = document.querySelector('.general-card .table');
  if (!table) return;
  table.id = 'generalCourses';

  const gq = document.getElementById('generalSearch').value.trim().toLowerCase();
  const day = document.getElementById('weekdayFilter').value;
  const filtered = GENERAL.filter((c) => {
    if (day && !parseTimeSlot(pick(c, 'time_slot', 'time')).some((x) => x[0] === day)) return false;
    if (!gq) return true;
    return [pick(c, 'course_name', 'name', 'cname'), pick(c, 'teacher', 'teachers'), c.course_id].some((v) =>
      String(v || '').toLowerCase().includes(gq)
    );
  });
  const cnt = document.getElementById('generalCount');
  if (cnt) cnt.textContent = `共 ${filtered.length} 門`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  genPage = Math.min(Math.max(genPage, 1), totalPages);
  const rows = filtered.slice((genPage - 1) * PAGE_SIZE, genPage * PAGE_SIZE);

  table.innerHTML = `
<thead>
  <tr>
    <th>課程名稱</th>
    <th>類別</th>
    <th>學分</th>
    <th>時間</th>
    <th>老師</th>
    <th>上課地點</th>
    <th>狀態</th>
    <th>操作</th>
  </tr>
</thead>
<tbody>
${
  rows.map((c) => {
    const key = keyOf(c);
    const slot = pick(c, 'time_slot', 'time');
    return `
<tr>
  <td>${esc(pick(c, 'course_name', 'name', 'cname'))}</td>
  <td title="${esc(pick(c, 'domain', 'category', 'type'))}">
    ${esc(bigDomain(pick(c, 'domain', 'category', 'type')))}
  </td>
  <td>${esc(pick(c, 'credits', 'credit') || creditsOf(c))}</td>
  <td>${esc(slot || '無')}</td>
  <td>${esc(pick(c, 'teacher', 'teachers') || '—')}</td>
  <td>${esc(pick(c, 'location', 'classroom') || '無')}</td>
  <td>${statusHtml(key, slot)}</td>
  <td>${actionHtml('general', key)}</td>
</tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center">沒有符合的通識課</td></tr>'
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
<span class="pg-info">第 ${genPage} / ${totalPages} 頁(共 ${filtered.length} 門)</span>
<button class="pg-btn" onclick="goGeneral(${genPage - 1})" ${genPage === 1 ? 'disabled' : ''}>‹ 上一頁</button>
<button class="pg-btn" onclick="goGeneral(${genPage + 1})" ${genPage === totalPages ? 'disabled' : ''}>下一頁 ›</button>`;
}

function goGeneral(p) {
  genPage = p;
  renderGeneral();
}

/* =========================
   已選課程一覽
   ========================= */
function renderSelected() {
  const tbody = document.getElementById('selectedBody');
  if (!tbody) return;

  tbody.innerHTML = allSelected()
    .map((s) => {
      const isBase = !isAdded(s.key);
      const status = isBase
        ? '<span class="status blue">已選上</span>'
        : '<span class="status">已新增</span>';
      const action = isBase
        ? '<span class="muted">—</span>'
        : `<button class="act-btn remove" data-key="${esc(s.key)}" data-from="selected">退選</button>`;
      return `
<tr>
  <td>${esc(s.semester)}</td>
  <td>${esc(s.course_name)}</td>
  <td>${esc(s.unit)}</td>
  <td>${esc(s.credits)}</td>
  <td>${esc(s.category)}</td>
  <td>${esc(s.time_slot || '無')}</td>
  <td>${status}</td>
  <td>${action}</td>
</tr>`;
    })
    .join('') || '<tr><td colspan="8" style="text-align:center;color:#70819a">尚未選課,請從上方表格加入課程</td></tr>';

  const total = allSelected().reduce((sum, s) => sum + (parseFloat(s.credits) || 0), 0);
  const el = document.getElementById('selectedSummary');
  if (el) el.textContent = `共 ${allSelected().length} 門 · ${total} 學分`;
}


/* =========================
   學分進度(依已選課程計算)
   ========================= */
const TOTAL_REQUIRED = 128;
const REQ = [
  { key: '專業必修', label: '系必修', need: 49, color: 'blue' },
  { key: '專業選修', label: '專業選修', need: 42, color: 'purple' },
  { key: '通識-人文', label: '領域-人文', need: 3, color: 'orange', domain: true },
  { key: '通識-社會', label: '領域-社會', need: 3, color: 'red', domain: true },
  { key: '通識-自然', label: '領域-自然', need: 3, color: 'green', domain: true },
  { key: '通識-特色', label: '領域-特色通識', need: 3, color: 'teal', domain: true }
];
// 其餘畢業要求(目前沒有對應的課程資料來源,先顯示為 0)
const COMMON = { key: '校共同必修', label: '校共同必修', need: 16, color: 'blue' };
const FREE = { key: '自由學分', label: '自由學分', need: 6, color: 'purple' };

function creditsByCategory() {
  const sums = {};
  let total = 0;
  allSelected().forEach((s) => {
    const cr = parseFloat(s.credits) || 0;
    total += cr;
    // 跨多個領域的課只算在第一個領域
    const cat = String(s.category || '').split('、')[0];
    sums[cat] = (sums[cat] || 0) + cr;
  });
  return { sums, total };
}

const pct = (a, b) => Math.min(100, Math.round((a / b) * 100));

function renderProgress() {
  const { sums, total } = creditsByCategory();
  const totalPct = pct(total, TOTAL_REQUIRED);

  const set = (id, fn) => {
    const el = document.getElementById(id);
    if (el) fn(el);
  };
  set('creditTotalText', (el) => (el.textContent = `已修學分 ${total} / ${TOTAL_REQUIRED}`));
  set('creditTotalPct', (el) => (el.textContent = `${totalPct}%`));
  set('creditTotalBar', (el) => (el.style.width = `${totalPct}%`));
  set('totalNum', (el) => (el.innerHTML = `已修學分<br>${total} / ${TOTAL_REQUIRED}`));
  set('totalRing', (el) => {
    el.style.setProperty('--p', totalPct);
    el.dataset.pct = `${totalPct}%`;
  });

  const gen = REQ.filter((r) => r.domain);
  const genGot = gen.reduce((n, r) => n + (sums[r.key] || 0), 0);
  const genNeed = 15; // 通識領域總學分至少 15(四個領域各至少 3)
  const lackDomains = gen.filter((r) => (sums[r.key] || 0) < r.need);

  // 列表:專業必修、專業選修、通識(底下縮排各領域)
  const items = [
    { ...REQ[0], got: sums[REQ[0].key] || 0 },
    { ...REQ[1], got: sums[REQ[1].key] || 0 },
    { ...COMMON, got: sums[COMMON.key] || 0 },
    { label: '通識領域課程', need: genNeed, got: genGot, color: 'orange', parent: true },
    ...gen.map((r) => ({ ...r, got: sums[r.key] || 0, label: r.label.replace('領域-', ''), sub: true })),
    { ...FREE, got: sums[FREE.key] || 0, last: true }
  ];

  const rows = items.map((r) => `
<div class="detail-row${r.sub ? ' sub' : ''}">
  <span>${r.label}${r.sub ? '<small>(至少 ' + r.need + ')</small>' : ''}</span>
  <span>${r.got} / ${r.need}</span>
  <span>${pct(r.got, r.need)}%</span>
</div>`).join('');
  set('creditRows', (el) => (el.innerHTML = rows));

  const domainLack = lackDomains.reduce((n, r) => n + (r.need - (sums[r.key] || 0)), 0);
  const short = Math.max(domainLack, genNeed - genGot, 0);
  set('creditWarn', (el) => (el.textContent = short ? `● 通識領域總計至少 15、各領域至少 3 學分,仍差 ${short} 學分` : ''));

  const DOMAIN_COLOR = { 人文: '#efb34f', 社會: '#e6606c', 自然: '#35ad88', 特色通識: '#2fa7c4' };
  const catItem = (r) => {
    const p = pct(r.got, r.need);
    return `
<div class="cat">
  <div class="cat-head"><span>${r.label}</span><span>${p}%</span></div>
  <div class="progress"><i class="${r.color}" style="width:${p}%"></i></div>
</div>`;
  };
  set('catList', (el) => {
    const main = items.filter((r) => !r.sub && !r.parent && !r.last).map(catItem).join('');
    const last = items.filter((r) => r.last).map(catItem).join('');
    const parent = items.find((r) => r.parent);
    const subs = items.filter((r) => r.sub);
    const chips = subs.map((r) => {
      const p = pct(r.got, r.need);
      const done = r.got >= r.need;
      const c = DOMAIN_COLOR[r.label] || '#4c8be6';
      return `
<div class="dom${done ? ' done' : ''}">
  <div class="dom-top">
    <span class="dom-name"><i style="background:${c}"></i>${r.label}</span>
    <span class="dom-num">${done ? '✓ ' : ''}${r.got}/${r.need}</span>
  </div>
  <div class="dom-bar"><b style="width:${p}%;background:${c}"></b></div>
</div>`;
    }).join('');
    const group = `
<div class="cat-group">
  <div class="cat-group-head">
    <span>${parent.label}</span>
    <span>${parent.got} / ${parent.need} 學分</span>
  </div>
  <div class="progress"><i class="orange" style="width:${pct(parent.got, parent.need)}%"></i></div>
  <div class="dom-grid">${chips}</div>
  ${short ? `<div class="dom-note">總計至少 15、各領域至少 3 學分,尚缺 ${short} 學分</div>` : ''}
</div>`;
    el.innerHTML = main + group + last;
  });
}

function renderAll() {
  renderTable();
  renderPE();
  renderGeneral();
  renderSelected();
  renderProgress();
}

/* =========================
   初始化
   ========================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.act-btn');
  if (!btn) return;
  if (btn.dataset.from === 'selected') removeSelected(btn.dataset.key);
  else toggleCourse(btn.dataset.src, btn.dataset.key);
});

document.addEventListener('DOMContentLoaded', async () => {
  const [cs, gen] = await Promise.all([
    fetch('/api/courses').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).catch((e) => {
      console.error('載入課程失敗', e);
      return [];
    }),
    fetch('/api/general-courses').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).catch((e) => {
      console.error('載入通識課失敗', e);
      return [];
    })
  ]);
  COURSES = cs;
  GENERAL = gen;
  PE = await loadPE();

  const sel = document.getElementById('gradeFilter');
  [...new Set(COURSES.map((c) => c.grade).filter(Boolean))]
    .sort()
    .forEach((g) => {
      sel.insertAdjacentHTML('beforeend', `<option value="${esc(g)}">${esc(g)} 年級</option>`);
    });

  document.getElementById('courseSearch').addEventListener('input', () => {
    page = 1;
    renderTable();
  });

  sel.addEventListener('change', () => {
    page = 1;
    renderTable();
  });

  document.getElementById('generalSearch').addEventListener('input', () => {
    genPage = 1;
    renderGeneral();
  });
  document.getElementById('peSearch').addEventListener('input', () => {
    pePage = 1;
    renderPE();
  });
  document.getElementById('peFilter').addEventListener('change', () => {
    pePage = 1;
    renderPE();
  });
  document.getElementById('weekdayFilter').addEventListener('change', () => {
    genPage = 1;
    renderGeneral();
  });

  renderAll();
});