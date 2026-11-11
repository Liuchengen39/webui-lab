async function refreshGoogleAuthState() {
  const response = await fetch("api/auth/me", { credentials: "same-origin" });
  if (!response.ok) throw new Error(`無法取得登入狀態（HTTP ${response.status}）`);
  const { user } = await response.json();
  const profile = document.querySelector(".user-profile");
  if (profile) {
    const avatar = profile.querySelector(".avatar");
    const name = profile.querySelector("strong");
    const detail = profile.querySelector("small");
    avatar.textContent = user ? [...user.name][0] : "訪";
    name.textContent = user?.name || "訪客";
    detail.textContent = user?.email || "尚未登入";
  }
  window.dispatchEvent(new CustomEvent("google-auth-state-change", { detail: user }));
  return user;
}

refreshGoogleAuthState().catch((error) => {
  const status = document.querySelector("#authStatus");
  if (status) status.textContent = error.message;
});
