/* =========================
   資料來源：靜態 JSON（放在 data 資料夾，與 index.html 同層）
   ※ 資料夾名稱大小寫要與實際一致
   ========================= */
const DATA_DIR = 'data/';

const getJson = (file, label) =>
  fetch(DATA_DIR + file)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .catch((e) => {
      console.error(label, DATA_DIR + file, e);
      return [];
    });

// 通識課：把原本 server.py 的合併邏輯搬到前端（先用課號比對領域，找不到再用課名）
const shortDomain = (d) =>
  String(d).replace(/^[A-Za-z]\s+/, '').replace(/\s*[(（]?\d+始[)）]?\s*$/, '').trim();

async function loadGeneral() {
  const [courses, domains] = await Promise.all([
    getJson('general_courses.json', '載入通識課失敗'),
    getJson('general_domains.json', '載入通識領域失敗')
  ]);
  const byId = {}, byName = {}, credits = {};
  domains.forEach((r) => {
    const dom = shortDomain(r.domain);
    const id = String(r.course_id).trim();
    const name = String(r.course_name).trim();
    [[byId, id], [byName, name]].forEach(([t, k]) => {
      const list = (t[k] = t[k] || []);
      if (!list.includes(dom)) list.push(dom);
    });
    credits[id] = r.credits || '';
  });
  courses.forEach((c) => {
    const id = String(c.course_id || '').trim();
    const name = String(c.course_name || '').trim();
    const doms = byId[id] || byName[name] || [];
    c.domain = doms.length ? doms.join('、') : '未分類';
    const cr = credits[id];
    if (cr && !c.credits) {
      const n = parseFloat(cr);
      c.credits = Number.isFinite(n) ? String(n) : cr;
    }
  });
  return courses;
}

/* =========================
   資料與狀態
   ========================= */
let COURSES = []; // 資工系課程 (/api/courses)
let GENERAL = []; // 通識課 (/api/general-courses)
const PAGE_SIZE = 8; // 每頁幾筆
let PE = []; // 體育(特色運動) + 校共同必修(課名含「資工」)
let PE_LOAD_ERROR = ''; // 體育課資料載入失敗時的提示
let CM = []; // 全校共同必修 (/api/common-courses，來源 common.json)
let CM_LOAD_ERROR = '';

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
// physical.json 的欄位：課號 / 班別 / 中文課名 / 開課教師 / 地點 / 時間 / 系統可選年級（沒有學分欄）
// 同一門課有多個班(a、b、c…)，時間和老師都可能相同，所以課號後面接班別才不會被當成重複
const normalizePE = (c) => {
  const id = pick(c, 'course_id', '課程代碼', '課號', '選課代碼');
  const sec = String(pick(c, 'section', '班別') || '');
  const hasSec = sec && sec !== '0';
  return {
    course_id: hasSec ? `${id}-${sec}` : String(id),
    section: hasSec ? sec : '',
    course_name: pick(c, 'course_name', '課程名稱', '中文課名', '中文課程名稱', 'cname'),
    time_slot: pick(c, 'time_slot', '上課時間', '時間', 'time'),
    teacher: pick(c, 'teacher', '授課教師', '開課教師', '教師', '老師', 'teachers'),
    location: pick(c, 'location', '教室', '地點', '上課地點', 'classroom'),
    // 資料裡沒有學分欄：課名含「資工」的（資工系大一體育）是 1 學分，其餘體育課當 0
    // 體育課的上課節數不等於學分，不能用節數推算
    credits: String(
      pick(c, 'credits', '學分', 'credit') ||
        (String(pick(c, 'course_name', '課程名稱', '中文課名', '中文課程名稱', 'cname')).includes('資工') ? '1' : '0')
    ),
    grade: pick(c, 'grade', '系統可選年級', '年級')
  };
};

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

  // 依序嘗試幾個常見位置，第一個讀得到的就用
  const candidates = [DATA_DIR + 'physical.json'];
  let raw = null;
  for (const url of candidates) {
    raw = await fetchJson(url);
    if (raw) {
      console.info('體育課資料來源：', url, `(${raw.length} 筆)`);
      break;
    }
  }
  if (!raw) {
    PE_LOAD_ERROR = '讀不到 data/physical.json：請確認 data 資料夾（大小寫要一致）與 index.html 在同一層';
    console.error(PE_LOAD_ERROR, '已嘗試：', candidates);
    raw = [];
  }

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
    course_name: c.section ? `${c.course_name} (${c.section}班)` : c.course_name,
    unit: cat === '特色運動' ? '體育室' : '資工系',
    credits: creditsOf(c),
    category: cat,
    time_slot: c.time_slot || '無',
    teacher: c.teacher || '',
    location: c.location || ''
  };
}

/* =========================
   全校共同必修 (common.json)
   ========================= */
// common.json 沒有學分欄：用上課節數推算（2ef → 2 學分），與資工系課程相同的算法
const normalizeCM = (c) => {
  const n = normalizePE(c);
  const given = pick(c, 'credits', '學分', 'credit');
  const inferred = (String(n.time_slot).match(/[a-z]/gi) || []).length;
  n.credits = String(given || inferred || '0');
  return n;
};

async function loadCM() {
  try {
    const r = await fetch(DATA_DIR + 'common.json');
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('格式不是陣列');
    const seen = new Set();
    return data.map(normalizeCM).filter((c) => {
      const k = keyOf(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch (e) {
    CM_LOAD_ERROR = '讀不到 data/common.json：請確認 data 資料夾（大小寫要一致）與 index.html 在同一層';
    console.error(CM_LOAD_ERROR, e);
    return [];
  }
}

function recordFromCM(c) {
  return {
    key: keyOf(c),
    semester: SEMESTER,
    course_name: c.section ? `${c.course_name} (${c.section}班)` : c.course_name,
    unit: '共同教育',
    credits: creditsOf(c),
    category: '校共同必修',
    time_slot: c.time_slot || '無',
    teacher: c.teacher || '',
    location: c.location || ''
  };
}

function toggleCourse(src, key) {
  if (isAdded(key)) {
    added = added.filter((a) => a.key !== key);
  } else {
    const list = src === 'general' ? GENERAL : src === 'pe' ? PE : src === 'cm' ? CM : COURSES;
    const c = list.find((x) => keyOf(x) === key);
    if (!c) return;
    const rec =
      src === 'general' ? recordFromGeneral(c)
      : src === 'pe' ? recordFromPE(c)
      : src === 'cm' ? recordFromCM(c)
      : recordFromCS(c);
    if (isConflicted(rec.time_slot, rec.key)) {
      if (!confirm(`「${rec.course_name}」與已選課程衝堂,仍要加入嗎?`)) return;
    }
    added.push(rec);
  }
  saveAdded();
  renderAll();
}

/* =========================
   手動新增課程（加簽／補登）
   ========================= */
// 時間格式：數字＝星期、字母＝節次，例如 2cd4d；可留空
const TIME_RE = /^(\d[a-z]+)+$/i;

function setManualMsg(text, isErr) {
  const el = document.getElementById('mfMsg');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('err', !!isErr);
}

function addManualCourse(e) {
  e.preventDefault();
  const name = document.getElementById('mfName').value.trim();
  const credits = parseFloat(document.getElementById('mfCredits').value);
  const category = document.getElementById('mfCategory').value;
  const time = document.getElementById('mfTime').value.trim().toLowerCase();
  const teacher = document.getElementById('mfTeacher').value.trim();
  const location = document.getElementById('mfLocation').value.trim();

  if (!name) return setManualMsg('請輸入課程名稱', true);
  if (!(credits >= 0)) return setManualMsg('請輸入正確的學分', true);
  if (time && !TIME_RE.test(time)) {
    return setManualMsg('時間格式不正確，請用像 2cd4d 的格式（數字＝星期、字母＝節次）', true);
  }

  const rec = {
    key: `manual|${Date.now()}`,
    semester: SEMESTER,
    course_name: name,
    unit: '手動新增',
    credits: String(credits),
    category,
    time_slot: time || '無',
    teacher,
    location,
    manual: true
  };

  if (time && isConflicted(rec.time_slot, rec.key)) {
    if (!confirm(`「${name}」與已選課程衝堂,仍要加入嗎?`)) return;
  }

  added.push(rec);
  saveAdded();
  renderAll();

  document.getElementById('manualForm').reset();
  document.getElementById('mfCredits').value = '3';
  document.getElementById('manualDialog').close();
  showToast(`已新增「${name}」`);
}

// 右下角的小提示（彈窗關閉後讓使用者知道有加成功）
function showToast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 2200);
}

const MF_HINT = '時間格式：數字＝星期（1=週一）、字母＝節次，例如 2cd4d ＝ 週二 C、D 節與週四 D 節。沒有時間可留空。';

function initManualDialog() {
  const dlg = document.getElementById('manualDialog');
  document.getElementById('openManual').addEventListener('click', () => {
    setManualMsg(MF_HINT, false);
    dlg.showModal();
    document.getElementById('mfName').focus();
  });
  document.getElementById('mfCancel').addEventListener('click', () => dlg.close());
  // 點到半透明背景也關閉（內容都包在 .dlg-body 裡，點內容不會觸發）
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.getElementById('manualForm').addEventListener('submit', addManualCourse);
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
   課程表：資工系／體育／共同必修／通識 共用一張表，用分頁籤切換
   ========================= */
let curTab = 'cs';
const tabPage = { cs: 1, pe: 1, cm: 1, general: 1 };
const tabFilter = { cs: '', pe: '', cm: '', general: '' };
const TAB_DATA = () => ({ cs: COURSES, pe: PE, cm: CM, general: GENERAL });

// 通識領域的標籤顏色，和右側「課程分類進度」的領域顏色一致（跨領域的課看第一個，和學分統計的算法相同）
function domainBadge(domain) {
  const first = bigDomain(domain).split('、')[0];
  return { 人文: 'hum', 社會: 'soc', 自然: 'nat', 特色: 'spe' }[first] || 'none';
}

// 四種來源整理成同樣的欄位，表格只要畫一種
function rowOf(src, c) {
  if (src === 'cs') {
    const cat = categoryOf(c);
    return { id: c.course_id, name: c.course_name, section: '', cat, catTitle: '', badge: cat === '專業必修' ? 'blue' : 'pur', credits: creditsOf(c), slot: c.time_slot, teacher: c.teacher, location: c.location };
  }
  if (src === 'pe') {
    const cat = peCategoryOf(c);
    return { id: c.course_id, name: c.course_name, section: c.section, cat, catTitle: '', badge: cat === '校共同必修' ? 'com' : '', credits: creditsOf(c), slot: c.time_slot, teacher: c.teacher, location: c.location };
  }
  if (src === 'cm') {
    return { id: c.course_id, name: c.course_name, section: c.section, cat: '校共同必修', catTitle: '', badge: 'com', credits: creditsOf(c), slot: c.time_slot, teacher: c.teacher, location: c.location };
  }
  const domain = pick(c, 'domain', 'category', 'type');
  const slot = pick(c, 'time_slot', 'time');
  return {
    id: c.course_id,
    name: pick(c, 'course_name', 'name', 'cname'),
    section: '',
    cat: bigDomain(domain),
    catTitle: domain,
    badge: domainBadge(domain),
    credits: pick(c, 'credits', 'credit') || creditsOf(c),
    slot,
    teacher: pick(c, 'teacher', 'teachers'),
    location: pick(c, 'location', 'classroom')
  };
}

const gradeOptions = (list) =>
  [...new Set(list.map((c) => String(c.grade)).filter(Boolean))].sort().map((g) => [g, `${g} 年級`]);

// 每個分頁各自的篩選下拉
const FILTERS = {
  cs: { all: '全部年級', opts: () => gradeOptions(COURSES), test: (c, v) => String(c.grade) === v },
  pe: { all: '全部類別', opts: () => [['特色運動', '特色運動'], ['校共同必修', '校共同必修']], test: (c, v) => peCategoryOf(c) === v },
  cm: { all: '全部年級', opts: () => gradeOptions(CM), test: (c, v) => String(c.grade) === v },
  general: {
    all: '全部星期',
    opts: () => ['一', '二', '三', '四', '五'].map((d, i) => [String(i + 1), `星期${d}`]),
    test: (c, v) => parseTimeSlot(pick(c, 'time_slot', 'time')).some((x) => x[0] === v)
  }
};

function rebuildFilter() {
  const sel = document.getElementById('courseFilter');
  const f = FILTERS[curTab];
  sel.innerHTML =
    `<option value="">${f.all}</option>` +
    f.opts().map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.value = tabFilter[curTab];
}

function renderCourses() {
  const src = curTab;
  const q = document.getElementById('courseSearch').value.trim().toLowerCase();
  const fv = tabFilter[src];
  const f = FILTERS[src];
  const tbody = document.querySelector('#courseTable tbody');

  const rows = TAB_DATA()[src].filter((c) => {
    if (fv && !f.test(c, fv)) return false;
    if (!q) return true;
    const r = rowOf(src, c);
    return [r.name, r.teacher, r.id].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  tabPage[src] = Math.min(Math.max(tabPage[src], 1), totalPages);
  const pg = tabPage[src];
  const pageRows = rows.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((c) => {
      const key = keyOf(c);
      const r = rowOf(src, c);
      const cat = r.badge
        ? `<span class="status ${r.badge}" title="${esc(r.catTitle)}">${esc(r.cat)}</span>`
        : `<span class="status" title="${esc(r.catTitle)}">${esc(r.cat)}</span>`;
      return `
<tr>
  <td>${esc(r.name)}${r.section ? ` <span class="muted">(${esc(r.section)}班)</span>` : ''}</td>
  <td>${cat}</td>
  <td>${esc(r.credits)}</td>
  <td>${esc(r.slot || '無')}</td>
  <td>${esc(r.teacher || '—')}</td>
  <td>${esc(r.location || '無')}</td>
  <td>${statusHtml(key, r.slot)}</td>
  <td>${actionHtml(src, key)}</td>
</tr>`;
    })
    .join('');

  if (!rows.length) {
    const err = src === 'pe' ? PE_LOAD_ERROR : src === 'cm' ? CM_LOAD_ERROR : '';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center${err ? ';color:#d54d57' : ''}">${esc(err || '沒有符合的課程')}</td></tr>`;
  }

  document.getElementById('courseCount').textContent = `共 ${rows.length} 門`;

  // 分頁籤上的總門數
  const all = TAB_DATA();
  Object.keys(all).forEach((k) => {
    const el = document.getElementById('tabCnt-' + k);
    if (el) el.textContent = all[k].length;
  });

  document.getElementById('coursePager').innerHTML =
    totalPages <= 1
      ? ''
      : `
<span class="pg-info">第 ${pg} / ${totalPages} 頁</span>
<button class="pg-btn" onclick="goCourses(${pg - 1})" ${pg === 1 ? 'disabled' : ''}>‹ 上一頁</button>
<button class="pg-btn" onclick="goCourses(${pg + 1})" ${pg === totalPages ? 'disabled' : ''}>下一頁 ›</button>`;
}

function goCourses(p) {
  tabPage[curTab] = p;
  renderCourses();
}

function switchTab(tab) {
  if (!FILTERS[tab] || tab === curTab) return;
  curTab = tab;
  tabPage[tab] = 1;
  document.querySelectorAll('#courseTabs .tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  rebuildFilter();
  renderCourses();
}

/* =========================
   已選課程一覽
   ========================= */
function renderSelected() {
  const box = document.getElementById('selectedList');
  if (!box) return;

  const list = allSelected();
  box.innerHTML = list
    .map((s) => {
      const isBase = !isAdded(s.key);
      const tag = s.manual ? '<span class="status manual">手動</span>' : '';
      const del = isBase
        ? ''
        : `<button class="sel-del" title="退選" aria-label="退選 ${esc(s.course_name)}" data-key="${esc(s.key)}" data-from="selected">✕</button>`;
      const meta = [`${esc(s.credits)} 學分`, esc(s.category), esc(s.time_slot || '無')].join(' · ');
      return `
<div class="sel-item">
  <div class="sel-main">
    <div class="sel-name">${esc(s.course_name)} ${tag}</div>
    <div class="sel-meta">${meta}</div>
  </div>
  ${del}
</div>`;
    })
    .join('') || '<div class="sel-empty">尚未選課,請從左側表格加入課程</div>';

  const total = list.reduce((sum, s) => sum + (parseFloat(s.credits) || 0), 0);
  const el = document.getElementById('selectedSummary');
  if (el) el.textContent = `${list.length} 門 · ${total} 學分`;
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
const COMMON = { key: '校共同必修', label: '校共同必修', need: 16, color: 'pink' };
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
  renderCourses();
  renderSelected();
  renderProgress();
}

/* =========================
   初始化
   ========================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.act-btn, .sel-del');
  if (!btn) return;
  if (btn.dataset.from === 'selected') removeSelected(btn.dataset.key);
  else toggleCourse(btn.dataset.src, btn.dataset.key);
});

document.addEventListener('DOMContentLoaded', async () => {
  const [cs, gen] = await Promise.all([
    getJson('cs_courses.json', '載入課程失敗'),
    loadGeneral()
  ]);
  COURSES = cs;
  GENERAL = gen;
  PE = await loadPE();
  CM = await loadCM();

  rebuildFilter();
  document.getElementById('courseTabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) switchTab(b.dataset.tab);
  });
  document.getElementById('courseSearch').addEventListener('input', () => {
    tabPage[curTab] = 1;
    renderCourses();
  });
  document.getElementById('courseFilter').addEventListener('change', (e) => {
    tabFilter[curTab] = e.target.value;
    tabPage[curTab] = 1;
    renderCourses();
  });
  initManualDialog();

  renderAll();
});