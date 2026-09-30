document.addEventListener('DOMContentLoaded', () => {
  const linkGoogleBtn = document.getElementById('linkGoogleBtn');
  const syncSwitch = document.getElementById('syncSwitch');

  if (linkGoogleBtn) {
    linkGoogleBtn.addEventListener('click', () => {
      alert('此示範頁尚未串接 Google Identity Services。');
    });
  }

  if (syncSwitch) {
    syncSwitch.addEventListener('click', () => {
      syncSwitch.classList.toggle('off');
    });
  }
});