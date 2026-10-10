// 視覺化課表：把首頁「加入」的課程（localStorage 'ncnu_added_courses'）排進課表
// 時間格式如 "2cd4d"：數字=星期（1=週一…7=週日），後面的字母=節次；連續的節次會合併成一格
const STORAGE_KEY = 'ncnu_added_courses'; // 與首頁 app.js 相同

// 節次對應時間（每節 50 分鐘）：a–d 上午、e–i 下午、j 晚上
const PERIODS = [
  ['a', '08:10'], ['b', '09:10'], ['c', '10:10'], ['d', '11:10'],
  ['e', '13:30'], ['f', '14:30'], ['g', '15:30'], ['h', '16:30'], ['i', '17:30'],
  ['j', '18:30'], ['k', ''], ['l', ''], ['m', ''],
];
const DAY_NAMES = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

// 每門課一個顏色：背景、邊框、文字、左側色條
const PALETTE = [
  ['#e8f1ff', '#c5dcff', '#1f4f9e', '#3b82f6'], // 藍
  ['#e6f7ef', '#bfe8d3', '#1d7a55', '#34b27b'], // 綠
  ['#f1e9fd', '#dccbf7', '#6b3fa8', '#9b6ee0'], // 紫
  ['#fff1e0', '#fcd9ac', '#9a5a12', '#f59e2b'], // 橘
  ['#fdeaf1', '#f8c9dc', '#a1325f', '#ec5b97'], // 粉
  ['#e0f6f6', '#b4e6e6', '#17717a', '#19b0b8'], // 青
  ['#fff8d9', '#f5e8a1', '#86690c', '#e0b81d'], // 黃
  ['#e9ebff', '#cdd2fb', '#3a43a3', '#6470e6'], // 靛
  ['#eef8dc', '#d3ebab', '#4a6f12', '#86c232'], // 草綠
  ['#eef1f6', '#d3dae6', '#43546d', '#7a8aa5'], // 灰藍
];
const CONFLICT_COLOR = ['#fff0f0', '#ffc4c8', '#b0303a', '#e5484d'];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 首頁每筆「已新增」紀錄：{key, semester, course_name, unit, credits, category, time_slot, teacher, location}
function loadAdded() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

const clean = (v) => (v && v !== '無' ? String(v) : '');

// "2cd4d" → { 2: ['c','d'], 4: ['d'] }
function parseSlots(t) {
  const out = {};
  for (const m of String(t || '').matchAll(/(\d)([a-z]+)/gi)) {
    const d = Number(m[1]);
    out[d] = [...new Set([...(out[d] || []), ...m[2].toLowerCase()])].sort();
  }
  return out;
}

// 把一天裡的節次切成「連續的一段一段」：['b','c','d','f'] → [['b','c','d'],['f']]
function runsOf(letters) {
  const runs = [];
  letters.forEach((l) => {
    const last = runs[runs.length - 1];
    if (last && l.charCodeAt(0) - last[last.length - 1].charCodeAt(0) === 1) last.push(l);
    else runs.push([l]);
  });
  return runs;
}

const addMin = (hhmm, m) => {
  const [h, mi] = hhmm.split(':').map(Number);
  const t = h * 60 + mi + m;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

function render() {
  const board = document.getElementById('timetable');
  const note = document.getElementById('unscheduled');
  const summary = document.getElementById('ttSummary');
  const legend = document.getElementById('ttLegend');
  const courses = loadAdded();

  // 1. 先把每門課切成 blocks：{course, day, letters, color}
  const blocks = [];
  const unscheduled = [];
  const usedLetters = new Set();
  let maxDay = 5;
  courses.forEach((c, i) => {
    const slots = parseSlots(c.time_slot);
    const days = Object.keys(slots);
    if (!days.length) { unscheduled.push(c); return; }
    days.forEach((d) => {
      runsOf(slots[d]).forEach((letters) => {
        letters.forEach((l) => usedLetters.add(l));
        blocks.push({ c, i, day: Number(d), letters });
      });
      maxDay = Math.max(maxDay, Number(d));
    });
  });

  // 2. 決定要顯示哪些列、哪些天
  const rows = PERIODS.filter(([p]) => 'abcdefghi'.includes(p) || usedLetters.has(p));
  const rowOf = (l) => rows.findIndex(([p]) => p === l);
  const D = maxDay;

  blocks.forEach((b) => {
    b.start = rowOf(b.letters[0]);
    b.span = b.letters.length;
    b.end = b.start + b.span; // 不含
  });

  // 3. 每天分別找重疊（衝堂）並分配左右並排的位置
  const conflictNames = new Set();
  for (let d = 1; d <= D; d++) {
    const list = blocks.filter((b) => b.day === d).sort((a, b) => a.start - b.start || b.end - a.end);
    // 分群：互相（連鎖）重疊的放同一群
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const laneEnds = [];
      cluster.forEach((b) => {
        let lane = laneEnds.findIndex((e) => e <= b.start);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = b.end;
        b.lane = lane;
      });
      cluster.forEach((b) => { b.lanes = laneEnds.length; });
      cluster = [];
    };
    list.forEach((b) => {
      if (cluster.length && b.start >= clusterEnd) flush();
      cluster.push(b);
      clusterEnd = Math.max(cluster.length === 1 ? 0 : clusterEnd, b.end);
    });
    if (cluster.length) flush();
    list.forEach((a) => {
      a.conflict = list.some((b) => b !== a && a.start < b.end && b.start < a.end);
      if (a.conflict) conflictNames.add(a.c.course_name);
    });
  }

  // 4. 畫格線
  const today = new Date().getDay() || 7; // 1..7
  board.style.setProperty('--days', D);
  let html = '<div class="cell head">節次</div>';
  for (let d = 1; d <= D; d++) html += `<div class="cell head${d === today ? ' today' : ''}">${DAY_NAMES[d]}</div>`;
  rows.forEach(([p, time], r) => {
    const alt = r % 2 ? ' alt' : '';
    html += `<div class="cell period"><b>${p.toUpperCase()}</b>${time ? `<small>${time}</small><small class="end">${addMin(time, 50)}</small>` : ''}</div>`;
    for (let d = 1; d <= D; d++) html += `<div class="cell${alt}"></div>`;
  });

  // 5. 疊上課程方塊（用百分比＋列高定位）
  html += '<div class="tt-layer">';
  blocks.forEach((b) => {
    const lanes = b.lanes || 1;
    const lane = b.lane || 0;
    const left = ((b.day - 1 + lane / lanes) / D) * 100;
    const width = 100 / D / lanes;
    const [bg, bd, fg, ac] = b.conflict ? CONFLICT_COLOR : PALETTE[b.i % PALETTE.length];
    const t0 = PERIODS.find(([p]) => p === b.letters[0])[1];
    const t1 = PERIODS.find(([p]) => p === b.letters[b.letters.length - 1])[1];
    const time = t0 && t1 ? `${t0}–${addMin(t1, 50)}` : '';
    const loc = clean(b.c.location);
    const teacher = clean(b.c.teacher);
    const tip = [
      b.c.course_name,
      time && `${DAY_NAMES[b.day]} ${time}`,
      loc && `地點：${loc}`,
      teacher && `老師：${teacher}`,
      b.conflict && '⚠ 此時段有課程衝堂',
    ].filter(Boolean).join('\n');
    html += `
<div class="tt-slot" style="left:${left}%;width:${width}%;top:calc(var(--rh) * ${b.start});height:calc(var(--rh) * ${b.span})">
  <div class="tt-block span${Math.min(b.span, 3)}${b.conflict ? ' conflict' : ''}${lanes > 1 ? ' narrow' : ''}" style="--bg:${bg};--bd:${bd};--fg:${fg};--ac:${ac}" title="${esc(tip)}">
    <div class="tt-name">${b.conflict ? '⚠ ' : ''}${esc(b.c.course_name)}</div>
    ${b.span === 1
      ? (loc || teacher ? `<div class="tt-meta">${esc([loc, teacher].filter(Boolean).join(' · '))}</div>` : '')
      : `${loc ? `<div class="tt-meta">${esc(loc)}</div>` : ''}${teacher ? `<div class="tt-meta">${esc(teacher)}</div>` : ''}`}
  </div>
</div>`;
  });
  html += '</div>';
  board.innerHTML = html;

  // 6. 上方統計、下方圖例
  const credits = courses.reduce((n, c) => n + (parseFloat(c.credits) || 0), 0);
  if (summary) summary.innerHTML = courses.length
    ? `<span class="tt-chip">共 ${courses.length} 門</span>
       <span class="tt-chip">${credits} 學分</span>
       ${conflictNames.size
         ? `<span class="tt-chip warn">⚠ ${conflictNames.size} 門課衝堂</span>`
         : '<span class="tt-chip ok">✓ 沒有衝堂</span>'}`
    : '';

  if (legend) legend.innerHTML = courses
    .map((c, i) => {
      const ac = PALETTE[i % PALETTE.length][3];
      return `<span style="--ac:${ac}"><i></i>${esc(c.course_name)}</span>`;
    })
    .join('');

  let msg = '';
  if (!courses.length) {
    msg = '<div class="tt-note">還沒有選任何課。到<a href="index.html">綜合總覽</a>按「加入」，課程就會出現在這裡。</div>';
  } else if (unscheduled.length) {
    msg = `<div class="tt-note">未排入課表（沒有上課時間）：${unscheduled.map((c) => esc(c.course_name)).join('、')}</div>`;
  }
  if (note) note.innerHTML = msg;
}

document.addEventListener('DOMContentLoaded', () => {
  const reloadBtn = document.getElementById('reloadBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => location.reload());
  render();
});

// 在首頁加入／退選後，這一頁（若同時開著）也會跟著更新
window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) render(); });