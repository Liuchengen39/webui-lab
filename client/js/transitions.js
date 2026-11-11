const menuButton = document.querySelector(".menu-toggle");
const sidebar = document.querySelector(".sidebar");
let menuCloseTimer;

if (menuButton && sidebar) {
  const closeMenu = () => {
    if (!document.body.classList.contains("sidebar-open")) return;
    document.body.classList.remove("sidebar-open");
    menuButton.setAttribute("aria-expanded", "false");
    sidebar.classList.add("is-closing");
    window.clearTimeout(menuCloseTimer);
    const closeMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
    menuCloseTimer = window.setTimeout(() => sidebar.classList.remove("is-closing"), closeMs);
  };

  menuButton.addEventListener("click", () => {
    if (document.body.classList.contains("sidebar-open")) {
      closeMenu();
      return;
    }
    window.clearTimeout(menuCloseTimer);
    sidebar.classList.remove("is-closing");
    document.body.classList.add("sidebar-open");
    menuButton.setAttribute("aria-expanded", "true");
  });
  document.querySelector("[data-close-menu]")?.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("dialog[open]")) closeMenu();
  });
  document.querySelectorAll(".side-nav a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 600) closeMenu();
  });
}

const appToast = document.querySelector("#appToast");
let toastTimer;

window.showAppToast = (message) => {
  if (!appToast) return;
  window.clearTimeout(toastTimer);
  appToast.textContent = message;
  appToast.classList.add("is-open");
  toastTimer = window.setTimeout(() => appToast.classList.remove("is-open"), 3200);
};

const conflictDialog = document.createElement("dialog");
conflictDialog.className = "course-dialog conflict-confirm-dialog";
conflictDialog.setAttribute("aria-labelledby", "conflictConfirmTitle");
conflictDialog.setAttribute("aria-describedby", "conflictConfirmMessage");

const conflictForm = document.createElement("form");
conflictForm.className = "conflict-confirm-form";
const conflictHeading = document.createElement("div");
conflictHeading.className = "dialog-heading";
const conflictTitle = document.createElement("h2");
conflictTitle.id = "conflictConfirmTitle";
conflictTitle.textContent = "課程時間衝堂";
conflictHeading.append(conflictTitle);

const conflictMessage = document.createElement("p");
conflictMessage.id = "conflictConfirmMessage";
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
conflictForm.append(conflictHeading, conflictMessage, conflictActions);
conflictDialog.append(conflictForm);
document.body.append(conflictDialog);

let conflictDialogResolve;
let conflictDialogCloseTimer;
let conflictDialogOpenFrame;

const closeConflictDialog = (confirmed) => {
  if (!conflictDialog.open || conflictDialog.classList.contains("is-closing")) return;
  cancelAnimationFrame(conflictDialogOpenFrame);
  conflictDialog.classList.remove("is-open");
  conflictDialog.classList.add("is-closing");
  const closeDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--modal-close-dur")) || 150;
  window.clearTimeout(conflictDialogCloseTimer);
  conflictDialogCloseTimer = window.setTimeout(() => {
    conflictDialog.classList.remove("is-closing");
    conflictDialog.close();
    const resolve = conflictDialogResolve;
    conflictDialogResolve = undefined;
    resolve?.(confirmed);
  }, closeDuration);
};

conflictForm.addEventListener("submit", (event) => {
  event.preventDefault();
  closeConflictDialog(true);
});
cancelConflictAdd.addEventListener("click", () => closeConflictDialog(false));
conflictDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeConflictDialog(false);
});
conflictDialog.addEventListener("click", (event) => {
  if (event.target === conflictDialog) closeConflictDialog(false);
});

window.confirmCourseConflict = (courseName, conflictingCourseNames) => {
  if (conflictDialog.open) return Promise.resolve(false);
  conflictMessage.textContent = `「${courseName}」與已選課程「${conflictingCourseNames.join("、")}」有衝堂，確定仍要加入嗎？`;
  conflictDialog.classList.remove("is-closing", "is-open");
  window.clearTimeout(conflictDialogCloseTimer);
  conflictDialog.showModal();
  conflictDialogOpenFrame = requestAnimationFrame(() => conflictDialog.classList.add("is-open"));
  return new Promise((resolve) => {
    conflictDialogResolve = resolve;
  });
};
