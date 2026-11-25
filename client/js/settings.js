// 登入按鈕
const signInButton = document.querySelector("#googleSignIn");

// 頁面上有登入按鈕
if (signInButton) {
  const accountSession = document.querySelector("#accountSession"); // 已登入時顯示的帳號區塊
  const accountName = document.querySelector("#accountName");       // 使用者名稱
  const accountEmail = document.querySelector("#accountEmail");     // 使用者 email
  const signOutButton = document.querySelector("#googleSignOut");   // 登出按鈕
  const authStatus = document.querySelector("#authStatus");         // 顯示狀態／錯誤訊息的文字區
  let googleInitialized = false;                                  

  // user 有值 = 已登入，null = 未登入
  function renderAccount(user) {
    const isSignedIn = Boolean(user);
    accountSession.hidden = !isSignedIn;  // 已登入才顯示帳號資訊
    signOutButton.hidden = !isSignedIn;   // 已登入才顯示登出鈕
    signInButton.hidden = isSignedIn;     // 已登入就隱藏登入鈕
    accountName.textContent = user?.name || "";
    accountEmail.textContent = user?.email || "";
    if (isSignedIn) authStatus.textContent = "Google 帳號已登入。";
  }

  // response.credential 是 Google 給的憑證（ID token），要送到後端驗證
  async function handleGoogleCredential(response) {
    authStatus.textContent = "正在驗證 Google 帳號…";
    try {
      // 把憑證 POST 給後端，由後端向 Google 驗證並建立 session
      const result = await fetch("api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credential: response.credential }),
      });
      const payload = await result.json();
      // 失敗時優先使用後端回傳的錯誤說明
      if (!result.ok) throw new Error(payload.detail || `登入失敗（HTTP ${result.status}）`);
      renderAccount(payload.user);              // 先立即更新這個區塊
      await window.refreshGoogleAuthState();    // 再同步其他部分（會廣播 google-auth-state-change）
      window.showAppToast("Google 帳號登入成功"); // 跳出提示訊息
    } catch (error) {
      authStatus.textContent = error.message;
    }
  }

  // ── 初始化並繪製 Google 登入按鈕 ────────────────────────────
  function initializeGoogleButton(clientId) {
    if (googleInitialized) return; // 已初始化過就不重複做
    // Google 的腳本沒載入成功時提示使用者
    if (!window.google?.accounts?.id) {
      authStatus.textContent = "Google 登入服務載入失敗，請重新整理頁面。";
      return;
    }
    // 設定 Google 登入：用哪個 client id、成功後呼叫誰、以彈出視窗方式登入
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      ux_mode: "popup",
    });
    // 把 Google 官方樣式的按鈕畫進 signInButton 這個元素裡
    window.google.accounts.id.renderButton(signInButton, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      locale: "en",
    });
    googleInitialized = true;
    authStatus.textContent = "請使用下方按鈕登入 Google 帳號。";
  }

  // ── 載入 Google 登入所需的設定與腳本 ────────────────────────
  async function loadGoogleSignIn() {
    authStatus.textContent = "正在載入 Google 登入…";
    // 向後端取得 Google client id（不寫死在前端，方便更換）
    const configResponse = await fetch("api/auth/config", { credentials: "same-origin" });
    if (!configResponse.ok) throw new Error(`無法載入 Google 登入設定（HTTP ${configResponse.status}）`);
    const { client_id: clientId } = await configResponse.json(); // 重新命名成 clientId
    if (!clientId) throw new Error("伺服器尚未設定 Google Client ID。");

    // Google 腳本已經載入過，直接初始化
    if (window.google?.accounts?.id) {
      initializeGoogleButton(clientId);
      return;
    }

    // 還沒載入：動態插入 <script>，用 Promise 等它載入完成
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("無法載入 Google 登入服務，請檢查網路連線。"));
      document.head.append(script);
    });
    initializeGoogleButton(clientId);
  }

  // ── 事件監聽 ────────────────────────────────────────────────
  // 其他地方呼叫 refreshGoogleAuthState 後會廣播這個事件，收到就更新畫面
  window.addEventListener("google-auth-state-change", (event) => renderAccount(event.detail));

  // 按「登出」
  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true; // 處理中先停用按鈕，防止連點
    try {
      const response = await fetch("api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`登出失敗（HTTP ${response.status}）`);
      renderAccount(null);                    // 切換成未登入的畫面
      await window.refreshGoogleAuthState();  // 通知其他部分狀態已改變
      sessionStorage.removeItem("selectedCourses"); // 清掉暫存的已選課程
      // 做個標記，之後回到課表頁時會把已選課程清空
      sessionStorage.setItem("clearSelectedCoursesOnReturn", "true");
      await loadGoogleSignIn();               // 重新準備好登入按鈕
      authStatus.textContent = "已登出 Google 帳號，請使用下方按鈕重新登入。";
      window.showAppToast("已登出 Google 帳號");
    } catch (error) {
      authStatus.textContent = error.message;
    } finally {
      signOutButton.disabled = false; // 無論成功或失敗都恢復按鈕
    }
  });

  // ── 頁面載入時的初始流程 ────────────────────────────────────
  // 先問後端目前有沒有登入：
  //   已登入 → 顯示帳號資訊
  //   未登入 → 載入 Google 登入按鈕
  window.refreshGoogleAuthState()
    .then((user) => {
      renderAccount(user);
      if (!user) return loadGoogleSignIn();
    })
    .catch((error) => {
      authStatus.textContent = error.message;
    });
}