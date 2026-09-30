function removeRow(btn) {
  const tr = btn.closest('tr');
  if (tr) tr.remove();
}

function addCourse() {
  const tbody = document.querySelector('#newCourses tbody');
  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td>新課程</td>
    <td>開課單位</td>
    <td>3</td>
    <td>專業選修</td>
    <td><span class="status">已新增</span></td>
    <td><button class="trash" onclick="removeRow(this)">♙</button></td>
  `;

  tbody.appendChild(tr);
}

document.addEventListener('DOMContentLoaded', () => {
  const reloadBtn = document.getElementById('reloadBtn');

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      location.reload();
    });
  }
});