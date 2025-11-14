
document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('admin-login-section');
  const adminSection = document.getElementById('admin-section');

  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('admin-login-error');
  const logoutBtn = document.getElementById('admin-logout-btn');

  const summaryContainer = document.getElementById('summary-container');
  const summaryEmpty = document.getElementById('summary-empty');

  function renderLoggedIn() {
    setHidden(loginSection, true);
    setHidden(adminSection, false);
  }
  function renderLoggedOut() {
    setHidden(adminSection, true);
    setHidden(loginSection, false);
  }

  async function loadSummary() {
    const session = getAdminSession();
    if (!session || !session.adminToken) return;

    try {
      const res = await adminSummary(session.adminToken);
      if (!res.ok) throw new Error(res.error || 'summary error');

      const byEvent = (res.summary && res.summary.byEvent) || {};
      const entries = Object.entries(byEvent);

      summaryContainer.innerHTML = '';
      if (!entries.length) {
        summaryEmpty.classList.remove('hidden');
        return;
      }
      summaryEmpty.classList.add('hidden');

      const table = document.createElement('table');
      table.className = 'summary-table';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>活動</th>
          <th>日期</th>
          <th>地點</th>
          <th>名單人數</th>
          <th>已回覆</th>
          <th>回覆率</th>
          <th>操作</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      entries.forEach(([eventId, info]) => {
        const ev = info.event || {};
        const tr = document.createElement('tr');

        const title = ev.title || eventId;
        const date = ev.date || ev.startAt || '';
        const place = ev.place || '';
        const total = info.totalRoster || 0;
        const replied = info.replied || 0;
        const rate = info.replyRate != null ? info.replyRate + '%' : '-';

        tr.innerHTML = `
          <td>${title}</td>
          <td>${date}</td>
          <td>${place}</td>
          <td>${total}</td>
          <td>${replied}</td>
          <td>${rate}</td>
          <td></td>
        `;

        const actionsTd = tr.lastElementChild;
        const btnExport = document.createElement('button');
        btnExport.className = 'btn secondary small';
        btnExport.textContent = '匯出 CSV';
        btnExport.addEventListener('click', () => handleExport(eventId, title));
        actionsTd.appendChild(btnExport);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      summaryContainer.appendChild(table);
    } catch (err) {
      console.error(err);
      showToast('讀取統計資料失敗');
    }
  }

  async function handleExport(eventId, title) {
    const session = getAdminSession();
    if (!session || !session.adminToken) {
      showToast('請先登入管理員');
      return;
    }
    try {
      const res = await adminExportCSV(session.adminToken, eventId);
      if (!res.ok) {
        showToast('匯出失敗：' + (res.error || '未知錯誤'));
        return;
      }
      const csv = res.csv || '';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = title.replace(/[\\\/:*?"<>|]/g, '_');
      a.download = `replies_${eventId}_${safeTitle}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('已下載 CSV 檔案');
    } catch (err) {
      console.error(err);
      showToast('匯出失敗（網路或系統錯誤）');
    }
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginError.classList.add('hidden');

    const formData = new FormData(loginForm);
    const token = (formData.get('adminToken') || '').toString().trim();
    if (!token) {
      loginError.textContent = '請輸入 token。';
      loginError.classList.remove('hidden');
      return;
    }

    try {
      const res = await authAdmin(token);
      if (!res.ok || res.role !== 'admin') {
        loginError.textContent = '登入失敗，請確認 token 是否正確。';
        loginError.classList.remove('hidden');
        return;
      }
      saveAdminSession(token);
      renderLoggedIn();
      showToast('管理員登入成功');
      loadSummary();
    } catch (err) {
      console.error(err);
      loginError.textContent = '登入失敗（網路或系統錯誤）';
      loginError.classList.remove('hidden');
    }
  });

  logoutBtn.addEventListener('click', () => {
    clearAdminSession();
    renderLoggedOut();
    summaryContainer.innerHTML = '';
    showToast('已登出管理員');
  });

  // Auto restore
  const adminSession = getAdminSession();
  if (adminSession && adminSession.adminToken) {
    renderLoggedIn();
    loadSummary();
  }
});
