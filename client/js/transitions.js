// ☰ 選單按鈕
const menuButton = document.querySelector(".menu-toggle");
const sidebar = document.querySelector(".sidebar");

if (menuButton && sidebar) {
  const closeMenu = () => {
    if (!document.body.classList.contains("sidebar-open")) return;
    // 移除 classe 關閉選單
    document.body.classList.remove("sidebar-open");
    menuButton.setAttribute("aria-expanded", "false");
  };
  // 偵測到被點擊
  menuButton.addEventListener("click", () => {
    // 偵測現在是關還是開
    if (document.body.classList.contains("sidebar-open")) {
      closeMenu();
      return;
    }
    document.body.classList.add("sidebar-open");
    menuButton.setAttribute("aria-expanded", "true");
  });
  document.querySelector("[data-close-menu]")?.addEventListener("click", closeMenu);
  // 按Esc關閉
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]")) closeMenu();
  });
  // 切換頁面的時候關閉
  document.querySelectorAll(".side-nav a").forEach((link) => link.addEventListener("click", closeMenu));
  // 視窗變寬時關閉
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 600) closeMenu();
  });
}

// 提示
const appToast = document.querySelector("#appToast");
let toastTimer;
// 提示訊息條
window.showAppToast = (message) => {
  if (!appToast) return;
  // 刷新倒計時 
  window.clearTimeout(toastTimer);
  appToast.textContent = message;
  appToast.classList.add("is-open");
  toastTimer = window.setTimeout(() => appToast.classList.remove("is-open"), 3200);
};

// 用 <dialog> 當作衝堂確認視窗
const conflictDialog = document.createElement("dialog");
conflictDialog.className = "course-dialog conflict-confirm-dialog";
conflictDialog.setAttribute("aria-labelledby", "conflictConfirmTitle");
conflictDialog.setAttribute("aria-describedby", "conflictConfirmMessage");

// 用 form 包起來，讓「仍要加入」按鈕可以透過 submit 事件處理
const conflictForm = document.createElement("form");
conflictForm.className = "conflict-confirm-form";

// 標題區
const conflictHeading = document.createElement("div");
conflictHeading.className = "dialog-heading";
const conflictTitle = document.createElement("h2");
conflictTitle.id = "conflictConfirmTitle";
conflictTitle.textContent = "課程時間衝堂";
conflictHeading.append(conflictTitle);

// 訊息區（內容會在每次呼叫時動態填入）
const conflictMessage = document.createElement("p");
conflictMessage.id = "conflictConfirmMessage";

// 按鈕區：取消（type=button，不會觸發 submit）、仍要加入（type=submit）
const conflictActions = document.createElement("div");
conflictActions.className = "dialog-actions";
const cancelConflictAdd = document.createElement("button");
cancelConflictAdd.className = "dialog-cancel";
cancelConflictAdd.type = "button";
cancelConflictAdd.textContent = "取消";
const confirmConflictAdd = document.createElement("button");
confirmConflictAdd.className = "add-course";
confirmConflictAdd.type = "submit";
confirmConflictAdd.textContent = "仍要加入";
conflictActions.append(cancelConflictAdd, confirmConflictAdd);

// 組裝並掛到頁面上
conflictForm.append(conflictHeading, conflictMessage, conflictActions);
conflictDialog.append(conflictForm);
document.body.append(conflictDialog);

// 暫存目前這次 Promise 的 resolve 函式
let conflictDialogResolve;

// 統一的關閉函式：confirmed 為 true 代表使用者確認加入 false 代表取消
const closeConflictDialog = (confirmed) => {
  if (!conflictDialog.open) return;
  conflictDialog.close();
  const resolve = conflictDialogResolve;
  conflictDialogResolve = undefined;
  resolve?.(confirmed);
};

// 按「仍要加入」：阻止表單預設送出行為，改回傳 true
conflictForm.addEventListener("submit", (event) => {
  event.preventDefault();
  closeConflictDialog(true);
});

// 按「取消」：回傳 false
cancelConflictAdd.addEventListener("click", () => closeConflictDialog(false));

// 按 Esc：瀏覽器會觸發 cancel 事件；阻止預設關閉，改走自己的流程（回傳 false）
conflictDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConflictDialog(false);
});

// 點對話框外視為取消
conflictDialog.addEventListener("click", (event) => {
  if (event.target === conflictDialog) closeConflictDialog(false);
});

// 用法：if (await window.confirmCourseConflict)
window.confirmCourseConflict = (courseName, conflictingCourseNames) => {
  // 已經有對話框開著就直接回傳 false，防止重複彈出
  if (conflictDialog.open) return Promise.resolve(false);
  // 填入訊息：課程名稱 + 衝堂的課程（以「、」連接）
  conflictMessage.textContent = `「${courseName}」與已選課程「${conflictingCourseNames.join("、")}」有衝堂，確定仍要加入嗎？`;
  conflictDialog.showModal();                           // 以 modal 方式顯示（有遮罩、鎖定背景操作）
  // 回傳 Promise，等使用者操作後由 closeConflictDialog 來 resolve
  return new Promise((resolve) => {
    conflictDialogResolve = resolve;
  });
};
