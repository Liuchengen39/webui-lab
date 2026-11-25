// 向後端查詢目前登入狀態
async function refreshGoogleAuthState() {
  // 呼叫 API 取得目前登入的使用者
  const response = await fetch("api/auth/me", { credentials: "same-origin" });
  if (!response.ok) throw new Error(`無法取得登入狀態（HTTP ${response.status}）`);

  // 解析 JSON，取出 user
  const { user } = await response.json();

  // 找到畫面上的使用者資訊
  const profile = document.querySelector(".user-profile");
  if (profile) {   // 判斷有沒有這個畫面
    const avatar = profile.querySelector(".avatar");   
    const name = profile.querySelector("strong");      
    const detail = profile.querySelector("small");   

    // 未登入則顯示「訪」
    avatar.textContent = user ? [...user.name][0] : "訪";
    // 已登入顯示名字 否則顯示「訪客」
    name.textContent = user?.name || "訪客";
    // 已登入顯示 email 否則顯示「尚未登入」
    detail.textContent = user?.email || "尚未登入";
  }

  // 廣播自訂事件，讓頁面其他部分可以監聽並隨登入狀態更新
  window.dispatchEvent(new CustomEvent("google-auth-state-change", { detail: user }));

  return user;
}

// 頁面載入時立刻執行一次
refreshGoogleAuthState().catch((error) => {
  const status = document.querySelector("#authStatus");
  if (status) status.textContent = error.message;
});