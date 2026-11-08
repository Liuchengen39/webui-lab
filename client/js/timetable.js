const menuButton = document.querySelector(".menu-toggle");

if (menuButton) {
  const closeMenu = () => {
    document.body.classList.remove("sidebar-open");
    menuButton.setAttribute("aria-expanded", "false");
  };

  menuButton.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("sidebar-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  document.querySelector("[data-close-menu]")?.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  document.querySelectorAll(".side-nav a").forEach((link) => link.addEventListener("click", closeMenu));
}
