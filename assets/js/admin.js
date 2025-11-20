document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('admin-login-section');
  const adminSection = document.getElementById('admin-section');

  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('admin-login-error');
  const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;
  const logoutBtn = document.getElementById('admin-logout-btn');

  const summaryContainer = document.getElementById('summary-container');
  const summaryEmpty = document.getElementById('summary-empty');

  // 活動詳細相關 DOM
  const eventDetailSection = document.getElementById('event-detail-section');
  const eventDetailTitle = document.getElementById('event-detail-title');
  const eventDetailMeta = document.getElementById('event-detail-meta');
  const eventDetailContent = document.getElementById('event-detail-content');
  const eventDetailStats = document.getElementById('event-detail-stats');
  const eventDetailTbody = document.getElementById('event-detail-tbody');
  const eventDetailBackBtn = document.getElementById('event-detail-back');

  // 額外顯示控制：切換未回覆名單
  const detailShowUnrepliedToggle = document.getElementById('detail-show-unreplied');
  const eventDetailUnrepliedSection = document.getElementById('event-detail-unreplied');
  const eventDetailUnrepliedTbody = document.getElementById('event-detail-unreplied-tbody');

  // 簽名顯示區
  const signatureViewer = document.getElementById('signature-viewer');
  const signatureViewerInfo = document.getElementById('signature-viewer-info');
  const signatureViewerImage = document.getElementById('signature-viewer-image');

  // 目前這一場活動的詳細資料（含 replied / notReplied）
  let currentEventDetailData = null;

  function renderLoggedIn() {
    setHidden(loginSection, true);
    setHidden(adminSection, false);
  }
  function renderLoggedOut() {
    setHidden(adminSection, true);
    setHidden(loginSection, false);
    // 順便清空詳細區
    setHidden(eventDetailSection, true);
    signatureViewer.classList.add('hidden');
  }

  // 載入活動總覽統計
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
          <th>名單人數</th>
          <th>已回覆</th>
          <th>操作</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      entries.forEach(([eventId, info]) => {
        const ev = info.event || {};
        const tr = document.createElement('tr');

        const title = ev.title || eventId;
        const total = info.totalRoster || 0;
        const replied = info.replied || 0;

        tr.innerHTML = `
          <td>${title}</td>
          <td>${total}</td>
          <td>${replied}</td>
          <td></td>
        `;

        const actionsTd = tr.lastElementChild;
        const btnView = document.createElement('button');
        btnView.className = 'btn secondary small';
        btnView.textContent = '查看結果';
        btnView.addEventListener('click', () => handleViewResults(eventId, ev, btnView));
        actionsTd.appendChild(btnView);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      summaryContainer.appendChild(table);
    } catch (err) {
      console.error(err);
      showToast('讀取統計資料失敗');
    }
  }


  // 依照目前模式（checkbox）繪製「已回覆 / 未回覆」兩個區塊
  function renderEventDetailTables() {
    if (!currentEventDetailData) return;

    const replied = currentEventDetailData.replied || [];
    const notReplied = currentEventDetailData.notReplied || [];
    const showUnreplied = detailShowUnrepliedToggle && detailShowUnrepliedToggle.checked;

    // ===== 上半部：已回覆名單 =====
    if (!replied.length) {
      eventDetailTbody.innerHTML = '<tr><td colspan="5" class="muted">目前尚無回覆。</td></tr>';
    } else {
      eventDetailTbody.innerHTML = '';
      replied.forEach(row => {
        const tr = document.createElement('tr');

        const cls = (row.class != null ? String(row.class) : '');
        const name = (row.name != null ? String(row.name) : '');
        const instrument = (row.instrument != null ? String(row.instrument) : '');

        let resultText = '';
        let signatureUrl = '';

        try {
          const ans = row.answer ? JSON.parse(row.answer) : {};
          resultText =
            ans.result ||
            ans.reply ||
            ans.choice ||
            ans.status ||
            ans.attend ||
            ans.consentChoice ||
            '';
          signatureUrl =
            ans.parentSignature ||
            ans.signatureDataUrl ||
            ans.signature ||
            ans.sign ||
            '';
        } catch (e) {
          console.warn('解析 answer 失敗', row.answer, e);
        }

        const tdName = document.createElement('td');
        tdName.textContent = name || '-';

        const tdClass = document.createElement('td');
        tdClass.textContent = cls || '-';

        const tdInstrument = document.createElement('td');
        tdInstrument.textContent = instrument || '-';

        const tdResult = document.createElement('td');
        tdResult.textContent = resultText || '-';

        const tdSignature = document.createElement('td');
        const btnSig = document.createElement('button');
        btnSig.className = 'btn secondary small';
        btnSig.textContent = '查看簽名';

        if (signatureUrl) {
          btnSig.addEventListener('click', () => {
            openSignatureViewer(name, signatureUrl);
          });
        } else {
          btnSig.disabled = true;
          btnSig.textContent = '無簽名';
        }
        tdSignature.appendChild(btnSig);

        tr.appendChild(tdName);
        tr.appendChild(tdClass);
        tr.appendChild(tdInstrument);
        tr.appendChild(tdResult);
        tr.appendChild(tdSignature);

        eventDetailTbody.appendChild(tr);
      });
    }

    // ===== 下半部：未回覆名單 =====
    if (!eventDetailUnrepliedSection || !eventDetailUnrepliedTbody) return;

    if (!showUnreplied) {
      setHidden(eventDetailUnrepliedSection, true);
      eventDetailUnrepliedTbody.innerHTML = '';
      return;
    }

    setHidden(eventDetailUnrepliedSection, false);

    if (!notReplied.length) {
      eventDetailUnrepliedTbody.innerHTML =
        '<tr><td colspan="3" class="muted">目前沒有未回覆名單。</td></tr>';
      return;
    }

    eventDetailUnrepliedTbody.innerHTML = '';
    notReplied.forEach(row => {
      const tr = document.createElement('tr');

      const cls = (row.class != null ? String(row.class) : '');
      const name = (row.name != null ? String(row.name) : '');
      const instrument = (row.instrument != null ? String(row.instrument) : '');

      const tdName = document.createElement('td');
      tdName.textContent = name || '-';

      const tdClass = document.createElement('td');
      tdClass.textContent = cls || '-';

      const tdInstrument = document.createElement('td');
      tdInstrument.textContent = instrument || '-';

      tr.appendChild(tdName);
      tr.appendChild(tdClass);
      tr.appendChild(tdInstrument);

      eventDetailUnrepliedTbody.appendChild(tr);
    });
  }

  // 點「查看結果」→ 載入單一活動詳細
  async function handleViewResults(eventId, ev, triggerBtn) {
    if (typeof setButtonLoading === 'function' && triggerBtn) {
      setButtonLoading(triggerBtn, true);
    }

    const session = getAdminSession();
    if (!session || !session.adminToken) {
      showToast('請先登入管理員');
      return;
    }

    // 預先清空畫面
    eventDetailTitle.textContent = ev.title || eventId;
    currentEventDetailData = null;
    if (detailShowUnrepliedToggle) { detailShowUnrepliedToggle.checked = false; }
    if (eventDetailUnrepliedSection) { setHidden(eventDetailUnrepliedSection, true); eventDetailUnrepliedTbody.innerHTML = ''; }
    eventDetailMeta.textContent = '';
    if (eventDetailContent) {
      eventDetailContent.textContent = '';
      eventDetailContent.classList.add('hidden');
    }
    eventDetailStats.textContent = '載入中…';
    eventDetailTbody.innerHTML = '<tr><td colspan="5" class="muted">載入中…</td></tr>';
    signatureViewer.classList.add('hidden');
    setHidden(eventDetailSection, false);

    try {
      const res = await adminEventDetail(session.adminToken, eventId);
      if (!res.ok) {
        showToast('載入活動詳細失敗：' + (res.error || '未知錯誤'));
        eventDetailStats.textContent = '載入失敗。';
        return;
      }

      const data = res;
      const eventInfo = data.event || {};
      const replied = data.replied || [];
      const notReplied = data.notReplied || [];
      const total = data.totalRoster || 0;
      const repliedCount = data.repliedCount || 0;
      const notRepliedCount = data.notRepliedCount || 0;
      const replyRate = (data.replyRate != null ? data.replyRate + '%' : '-');

      // 標題
      eventDetailTitle.textContent = eventInfo.title || ev.title || eventId;

      // 基本資訊
      const dateStr = eventInfo.date || eventInfo.startAt || '';
      const placeStr = eventInfo.place || '';
      const contactStr = eventInfo.contact || '';
      const ddlStr = eventInfo.deadline || '';

      const metaParts = [];
      if (dateStr) metaParts.push(`日期：${dateStr}`);
      if (placeStr) metaParts.push(`地點：${placeStr}`);
      if (ddlStr) metaParts.push(`截止：${ddlStr}`);
      if (contactStr) metaParts.push(`聯絡人：${contactStr}`);
      eventDetailMeta.textContent = metaParts.join('｜');

      // 活動內容／同意書內容（statDescription）
      if (eventDetailContent) {
        const desc = eventInfo.statDescription || '';
        if (desc) {
          eventDetailContent.textContent = desc;
          eventDetailContent.classList.remove('hidden');
        } else {
          eventDetailContent.textContent = '';
          eventDetailContent.classList.add('hidden');
        }
      }

      // 統計文字
      eventDetailStats.textContent =
        `總人數：${total}　已回覆：${repliedCount}　未回覆：${notRepliedCount}　回覆率：${replyRate}`;

      // 儲存明細資料，交給 renderEventDetailTables 處理（含未回覆名單）
      currentEventDetailData = { replied, notReplied };
      renderEventDetailTables();
    } catch (err) {
      console.error(err);
      showToast('載入活動詳細失敗（網路或系統錯誤）');
      eventDetailStats.textContent = '載入失敗。';
    }
    finally {
      if (typeof setButtonLoading === 'function' && triggerBtn) {
        setButtonLoading(triggerBtn, false);
      }
    }
  }

  function openSignatureViewer(studentName, url) {
    signatureViewer.classList.remove('hidden');
    signatureViewerInfo.textContent = studentName
      ? `學生：${studentName} 的家長簽名`
      : '家長簽名';
    signatureViewerImage.src = url;
  }

  // 返回列表（只是收起詳細區，summary 繼續留著）
  eventDetailBackBtn.addEventListener('click', () => {
    setHidden(eventDetailSection, true);
    signatureViewer.classList.add('hidden');
    signatureViewerImage.src = '';

    currentEventDetailData = null;
    if (detailShowUnrepliedToggle) {
      detailShowUnrepliedToggle.checked = false;
    }
    if (eventDetailUnrepliedSection) {
      setHidden(eventDetailUnrepliedSection, true);
      if (eventDetailUnrepliedTbody) {
        eventDetailUnrepliedTbody.innerHTML = '';
      }
    }
  });

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

    if (typeof setButtonLoading === 'function' && loginSubmitBtn) {
      setButtonLoading(loginSubmitBtn, true);
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
    } finally {
      if (typeof setButtonLoading === 'function' && loginSubmitBtn) {
        setButtonLoading(loginSubmitBtn, false);
      }
    }
  });

  logoutBtn.addEventListener('click', () => {
    clearAdminSession();
    renderLoggedOut();
    summaryContainer.innerHTML = '';
    showToast('已登出管理員');
  });

  if (detailShowUnrepliedToggle) {
    detailShowUnrepliedToggle.addEventListener('change', () => {
      renderEventDetailTables();
    });
  }

  // Auto restore
  const adminSession = getAdminSession();
  if (adminSession && adminSession.adminToken) {
    renderLoggedIn();
    loadSummary();
  }
});
