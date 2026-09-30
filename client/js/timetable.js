document.addEventListener('DOMContentLoaded', () => {
  const reloadBtn = document.getElementById('reloadBtn');

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      location.reload();
    });
  }
});