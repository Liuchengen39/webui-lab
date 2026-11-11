const signInButton = document.querySelector("#googleSignIn");

if (signInButton) {
  const accountSession = document.querySelector("#accountSession");
  const accountName = document.querySelector("#accountName");
  const accountEmail = document.querySelector("#accountEmail");
  const signOutButton = document.querySelector("#googleSignOut");
  const authStatus = document.querySelector("#authStatus");
  let googleInitialized = false;

  function renderAccount(user) {
    const isSignedIn = Boolean(user);
    accountSession.hidden = !isSignedIn;
    signOutButton.hidden = !isSignedIn;
    signInButton.hidden = isSignedIn;
    accountName.textContent = user?.name || "";
    accountEmail.textContent = user?.email || "";
    if (isSignedIn) authStatus.textContent = "Google 帳號已登入。";
  }

  async function handleGoogleCredential(response) {
    authStatus.textContent = "正在驗證 Google 帳號…";
    try {
      const result = await fetch("api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ credential: response.credential }),
      });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload.detail || `登入失敗（HTTP ${result.status}）`);
      renderAccount(payload.user);
      await window.refreshGoogleAuthState();
      window.showAppToast("Google 帳號登入成功");
    } catch (error) {
      authStatus.textContent = error.message;
    }
  }

  function initializeGoogleButton(clientId) {
    if (googleInitialized) return;
    if (!window.google?.accounts?.id) {
      authStatus.textContent = "Google 登入服務載入失敗，請重新整理頁面。";
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      ux_mode: "popup",
    });
    window.google.accounts.id.renderButton(signInButton, {
      type: "icon",
      theme: "outline",
      size: "large",
      shape: "circle",
      locale: "zh-TW",
    });
    googleInitialized = true;
    authStatus.textContent = "請使用下方按鈕登入 Google 帳號。";
  }

  async function loadGoogleSignIn() {
    authStatus.textContent = "正在載入 Google 登入…";
    const configResponse = await fetch("api/auth/config", { credentials: "same-origin" });
    if (!configResponse.ok) throw new Error(`無法載入 Google 登入設定（HTTP ${configResponse.status}）`);
    const { client_id: clientId } = await configResponse.json();
    if (!clientId) throw new Error("伺服器尚未設定 Google Client ID。");

    if (window.google?.accounts?.id) {
      initializeGoogleButton(clientId);
      return;
    }

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

  window.addEventListener("google-auth-state-change", (event) => renderAccount(event.detail));
  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    try {
      const response = await fetch("api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`登出失敗（HTTP ${response.status}）`);
      renderAccount(null);
      await window.refreshGoogleAuthState();
      sessionStorage.removeItem("selectedCourses.v2");
      sessionStorage.setItem("clearSelectedCoursesOnReturn", "true");
      await loadGoogleSignIn();
      authStatus.textContent = "已登出 Google 帳號，請使用下方按鈕重新登入。";
      window.showAppToast("已登出 Google 帳號");
    } catch (error) {
      authStatus.textContent = error.message;
    } finally {
      signOutButton.disabled = false;
    }
  });

  window.refreshGoogleAuthState()
    .then((user) => {
      renderAccount(user);
      if (!user) return loadGoogleSignIn();
    })
    .catch((error) => {
      authStatus.textContent = error.message;
    });
}
