/* =========================
   系統設定頁
   1. 個人資料：行內編輯，存 localStorage，所有頁面右上角同步
   2. 自動同步開關：記住開／關
   3. Google Drive 同步：需要 OAuth 用戶端 ID（見下方 GOOGLE_CLIENT_ID）
   ========================= */

// ★ 申請到 Google OAuth「用戶端 ID」後貼在這裡，例如 '123456789-abc.apps.googleusercontent.com'
// 沒填的話，按「連結 Google 帳號」只會顯示提示，其他功能照常使用
const GOOGLE_CLIENT_ID = '609296002726-pds1hehq70fkchcrj8uuefreooperdkd.apps.googleusercontent.com';

const SYNC_KEY = 'ncnu_autosync';
const COURSES_KEY = 'ncnu_added_courses';
const GRADES = ['大一', '大二', '大三', '大四', '延畢', '研究所'];

const $ = (id) => document.getElementById(id);

/* ---------- 1. 個人資料 ---------- */
const FIELDS = {
  name: { label: '姓名', max: 20, type: 'text' },
  dept: { label: '系所', max: 30, type: 'text' },
  grade: { label: '目前年級', type: 'select' },
};

function renderProfile() {
  const p = NCNU_PROFILE.load();
  document.querySelectorAll('[data-field]').forEach((row) => {
    row.querySelector('.val').textContent = p[row.dataset.field];
  });
}

function startEdit(row) {
  const field = row.dataset.field;
  const cfg = FIELDS[field];
  const valEl = row.querySelector('.val');
  const actions = row.querySelector('.row-actions');
  const editBtn = row.querySelector('.edit-btn');
  const current = NCNU_PROFILE.load()[field];

  let input;
  if (cfg.type === 'select') {
    input = document.createElement('select');
    const opts = GRADES.includes(current) ? GRADES : [current, ...GRADES];
    input.innerHTML = opts.map((g) => `<option${g === current ? ' selected' : ''}>${g}</option>`).join('');
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.maxLength = cfg.max;
  }
  input.className = 'edit-input';
  input.setAttribute('aria-label', cfg.label);

  const err = document.createElement('div');
  err.className = 'edit-err';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-gray';
  cancelBtn.textContent = '取消';

  valEl.replaceWith(input);
  input.insertAdjacentElement('afterend', err);
  editBtn.textContent = '儲存';
  editBtn.classList.remove('btn-gray');
  actions.appendChild(cancelBtn);
  input.focus();
  if (input.select) input.select();

  const finish = () => {
    input.replaceWith(valEl);
    err.remove();
    cancelBtn.remove();
    editBtn.textContent = '編輯';
    editBtn.classList.add('btn-gray');
    row.dataset.editing = '';
    editBtn.onclick = () => startEdit(row);
    renderProfile();
  };

  const commit = () => {
    const v = input.value.trim();
    if (!v) { err.textContent = `${cfg.label}不能是空的`; input.focus(); return; }
    const p = NCNU_PROFILE.load();
    p[field] = v;
    NCNU_PROFILE.save(p);
    finish();
    scheduleAutoSync();
  };

  row.dataset.editing = '1';
  editBtn.onclick = commit;
  cancelBtn.onclick = finish;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') finish();
  });
}

function initProfile() {
  renderProfile();
  document.querySelectorAll('[data-field]').forEach((row) => {
    row.querySelector('.edit-btn').onclick = () => startEdit(row);
  });
}

/* ---------- 2. 自動同步開關 ---------- */
const autoSyncOn = () => localStorage.getItem(SYNC_KEY) !== '0'; // 預設開啟

function initSwitch() {
  const sw = $('syncSwitch');
  if (!sw) return;
  const paint = () => {
    sw.classList.toggle('off', !autoSyncOn());
    sw.setAttribute('aria-pressed', String(autoSyncOn()));
  };
  paint();
  sw.addEventListener('click', () => {
    try { localStorage.setItem(SYNC_KEY, autoSyncOn() ? '0' : '1'); } catch (e) { /* 忽略 */ }
    paint();
    if (autoSyncOn()) scheduleAutoSync();
  });
}

/* ---------- 3. Google Drive 同步（資料存在 Drive 的 AppData 隱藏資料夾）---------- */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email'; // 後者用來辨識是哪個帳號,偵測換帳號
const ACCOUNT_KEY = 'ncnu_google_account'; // 目前這台瀏覽器連結的 Google 帳號(email)
const FILE_NAME = 'ncnu-courses.json';
let accessToken = null;

// 登入狀態要跨頁保留:切到別的 html 再回來,不用重新登入
// token 只放 sessionStorage(關閉分頁就清掉),大約 1 小時後 Google 會讓它失效
const TOKEN_KEY = 'ncnu_google_token';
const LINKED_KEY = 'ncnu_google_linked'; // 這台瀏覽器曾經連結過(之後重新登入不再詢問要用哪邊的資料)

function saveToken(token, expiresIn) {
  accessToken = token;
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + ((expiresIn || 3600) - 60) * 1000 }));
    localStorage.setItem(LINKED_KEY, '1');
  } catch (e) { /* 無法儲存就只在這一頁有效 */ }
}

function clearToken() {
  accessToken = null;
  try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* 忽略 */ }
}

function loadToken() {
  try {
    const v = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (v && v.token && v.exp > Date.now()) return v.token;
  } catch (e) { /* 壞掉的資料當作沒有 */ }
  return null;
}
let syncTimer = null;

function setMsg(text, kind) {
  const el = $('syncMsg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'muted sync-msg' + (kind ? ' ' + kind : '');
}

function setLinked(linked) {
  const st = $('googleStatus');
  st.classList.toggle('off', !linked);
  st.innerHTML = `<i class="dot"></i>${linked ? '已連結' : '未連結'}`;
  $('linkGoogleBtn').textContent = linked ? '立即上傳到雲端' : '連結 Google 帳號';
  $('restoreBtn').hidden = !linked;
  $('unlinkBtn').hidden = !linked;
}

function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => reject(new Error('無法載入 Google 登入元件，請檢查網路'));
    document.head.appendChild(s);
  });
}

// 打包要同步的資料
function snapshot() {
  let courses = [];
  try { courses = JSON.parse(localStorage.getItem(COURSES_KEY) || '[]'); } catch (e) { /* 壞掉的資料當作沒有 */ }
  return { version: 1, savedAt: new Date().toISOString(), profile: NCNU_PROFILE.load(), courses };
}

// 清空這台瀏覽器上的課程與個人資料(切換帳號、中斷連結時使用)
function clearLocalData() {
  try {
    localStorage.removeItem(COURSES_KEY);
    localStorage.removeItem(NCNU_PROFILE.KEY);
  } catch (e) { /* 忽略 */ }
  NCNU_PROFILE.apply();
  renderProfile();
}

const localIsEmpty = () => {
  let n = 0;
  try { n = JSON.parse(localStorage.getItem(COURSES_KEY) || '[]').length; } catch (e) { /* 當作空的 */ }
  return n === 0 && !localStorage.getItem(NCNU_PROFILE.KEY);
};

async function fetchEmail() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!r.ok) return '';
    return (await r.json()).email || '';
  } catch (e) {
    return '';
  }
}

function restore(data) {
  if (data && data.profile) NCNU_PROFILE.save({ ...NCNU_PROFILE.DEFAULT, ...data.profile });
  try { localStorage.setItem(COURSES_KEY, JSON.stringify(Array.isArray(data && data.courses) ? data.courses : [])); } catch (e) { /* 忽略 */ }
  renderProfile();
}

async function drive(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + accessToken, ...(opts.headers || {}) } });
  if (res.status === 401) {
    clearToken();
    setLinked(false);
    throw new Error('Google 登入已逾時，請重新連結');
  }
  if (!res.ok) {
    let why = '';
    try { const j = await res.json(); why = (j.error && (j.error.message || j.error.status)) || ''; } catch (e) {}
    if (res.status === 403 && /not been used|disabled|accessNotConfigured/i.test(why)) why = '尚未在專案中啟用 Google Drive API（' + why.slice(0, 80) + '）';
    else if (res.status === 403 && /scope|insufficient/i.test(why)) why = '授權時沒有勾選「Drive 應用程式資料」權限，請中斷連結後重新登入並勾選';
    throw new Error('Google Drive 回應錯誤（' + res.status + '）' + (why ? '：' + why : ''));
  }
  return res;
}

async function findFile() {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const res = await drive(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`);
  const { files } = await res.json();
  return files && files[0] ? files[0] : null;
}

async function downloadRemote(file) {
  const res = await drive(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  return res.json();
}

async function upload(file) {
  const data = JSON.stringify(snapshot());
  if (file) {
    await drive(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: data,
    });
  } else {
    const boundary = 'ncnu' + Date.now();
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }) +
      `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${data}\r\n--${boundary}--`;
    await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    });
  }
}

async function uploadNow() {
  setMsg('上傳中…');
  try {
    await upload(await findFile());
    setMsg('已同步到 Google Drive（' + new Date().toLocaleTimeString() + '）', 'ok');
  } catch (e) {
    setMsg(e.message, 'err');
  }
}

// 第一次連結：雲端沒有資料就上傳；已有資料就讓使用者選用哪一邊
async function firstSync() {
  setMsg('檢查雲端資料…');
  try {
    const file = await findFile();
    if (!file) {
      await upload(null);
      return setMsg('已連結，並把目前的資料上傳到 Google Drive', 'ok');
    }
    const remote = await downloadRemote(file);
    if (localIsEmpty()) { // 這台沒有資料(例如剛登出或換帳號)→ 直接載入雲端,不用問
      restore(remote);
      return setMsg('已載入這個帳號的雲端資料(回到首頁就會看到)', 'ok');
    }
    const when = remote.savedAt ? new Date(remote.savedAt).toLocaleString() : '未知時間';
    const n = Array.isArray(remote.courses) ? remote.courses.length : 0;
    if (confirm(`雲端已有資料（${when}，${n} 門課）。\n\n按「確定」：用雲端資料覆蓋這台電腦\n按「取消」：用這台電腦的資料覆蓋雲端`)) {
      restore(remote);
      setMsg('已用雲端資料還原（回到首頁就會看到）', 'ok');
    } else {
      await upload(file);
      setMsg('已用這台電腦的資料覆蓋雲端', 'ok');
    }
  } catch (e) {
    setMsg(e.message, 'err');
  }
}

async function connectGoogle() {
  if (accessToken) return uploadNow(); // 已連結時，這顆按鈕變成「立即上傳」
  if (!GOOGLE_CLIENT_ID) {
    return setMsg('尚未設定 Google OAuth 用戶端 ID：請在 settings.js 最上面的 GOOGLE_CLIENT_ID 貼上你申請到的 ID。', 'err');
  }
  try {
    setMsg('開啟 Google 登入…');
    await loadGIS();
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: async (resp) => {
        if (resp.error) return setMsg('Google 登入失敗：' + resp.error, 'err');
        const firstTime = !localStorage.getItem(LINKED_KEY);
        saveToken(resp.access_token, Number(resp.expires_in));
        setLinked(true);
        // 換了另一個 Google 帳號 → 先清掉上一個帳號留在這台的資料,再載入新帳號的雲端資料
        const email = await fetchEmail();
        const prev = localStorage.getItem(ACCOUNT_KEY);
        const switched = !!(prev && email && prev !== email);
        if (switched) clearLocalData();
        if (email) { try { localStorage.setItem(ACCOUNT_KEY, email); } catch (e) { /* 忽略 */ } }
        if (firstTime || switched) await firstSync(); // 第一次連結或換帳號才檢查雲端
        else setMsg('已重新登入 Google' + (email ? '(' + email + ')' : ''), 'ok');
      },
      error_callback: (err) => setMsg('Google 登入失敗：' + (err.type || '已取消'), 'err'),
    });
    client.requestAccessToken({ prompt: '' });
  } catch (e) {
    setMsg(e.message, 'err');
  }
}

async function restoreFromCloud() {
  try {
    setMsg('讀取雲端資料…');
    const file = await findFile();
    if (!file) return setMsg('雲端還沒有資料', 'err');
    if (!confirm('要用雲端資料覆蓋這台電腦目前的資料嗎？')) return setMsg('');
    restore(await downloadRemote(file));
    setMsg('已用雲端資料還原（回到首頁就會看到）', 'ok');
  } catch (e) {
    setMsg(e.message, 'err');
  }
}

async function unlink() {
  if (!confirm('中斷連結後,這台電腦上的課程與個人資料會被清空(雲端上的資料不會刪除)。\n\n要繼續嗎?')) return;
  // 清空前先把最新資料傳上雲端,避免遺失
  if (accessToken && !localIsEmpty()) {
    try { await upload(await findFile()); } catch (e) { /* 傳不上去也照常登出 */ }
  }
  if (accessToken && window.google) google.accounts.oauth2.revoke(accessToken, () => {});
  clearToken();
  try {
    localStorage.removeItem(LINKED_KEY);
    localStorage.removeItem(ACCOUNT_KEY);
  } catch (e) { /* 忽略 */ }
  clearLocalData();
  setLinked(false);
  setMsg('已中斷連結,並清空這台電腦上的資料(雲端上的資料不會被刪除)');
}

// 自動同步：已連結 + 開關開啟時，資料有變動就稍後上傳
function scheduleAutoSync() {
  if (!accessToken || !autoSyncOn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(uploadNow, 1500);
}

function initGoogle() {
  // 先前已登入且 token 還有效 → 直接維持「已連結」
  const saved = loadToken();
  if (saved) {
    accessToken = saved;
    setLinked(true);
  } else {
    setLinked(false);
    if (localStorage.getItem(LINKED_KEY)) setMsg('Google 登入已逾時,請再按一次「連結 Google」');
  }
  $('linkGoogleBtn').addEventListener('click', connectGoogle);
  $('restoreBtn').addEventListener('click', restoreFromCloud);
  $('unlinkBtn').addEventListener('click', unlink);
  // 在首頁加入／退選課程（別的分頁）時，自動上傳
  window.addEventListener('storage', (e) => {
    if (e.key === COURSES_KEY || e.key === NCNU_PROFILE.KEY) scheduleAutoSync();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initProfile();
  initSwitch();
  initGoogle();
});