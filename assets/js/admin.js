document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('admin-login-section');
  const adminSection = document.getElementById('admin-section');

  const loginForm = document.getElementById('admin-login-form');
  const loginError = document.getElementById('admin-login-error');
  const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;
  const logoutBtn = document.getElementById('admin-logout-btn');

  const summaryContainer = document.getElementById('summary-container');
  const summaryEmpty = document.getElementById('summary-empty');

  const eventDetailSection = document.getElementById('event-detail-section');
  const eventDetailTitle = document.getElementById('event-detail-title');
  const eventDetailMeta = document.getElementById('event-detail-meta');
  const eventDetailContent = document.getElementById('event-detail-content');
  const eventDetailStats = document.getElementById('event-detail-stats');
  const eventDetailTbody = document.getElementById('event-detail-tbody');
  const eventDetailBackBtn = document.getElementById('event-detail-back');

  const detailShowUnrepliedToggle = document.getElementById('detail-show-unreplied');
  const eventDetailUnrepliedSection = document.getElementById('event-detail-unreplied');
  const eventDetailUnrepliedTbody = document.getElementById('event-detail-unreplied-tbody');

  const detailSortPills = document.getElementById('detail-sort-pills');
  const detailClassFilters = document.getElementById('detail-class-filters');

  const signatureViewer = document.getElementById('signature-viewer');
  const signatureViewerInfo = document.getElementById('signature-viewer-info');
  const signatureViewerImage = document.getElementById('signature-viewer-image');

  let currentEventDetailData = null;

  let latestViewResultsRequestId = 0;
  let latestViewResultsButton = null;

  const studentEntryLink = document.querySelector('.admin-entry-link');
  if (studentEntryLink) {
    studentEntryLink.addEventListener('click', (e) => {
      e.preventDefault();
      try { clearAdminSession(); } catch (_) {}
      try { clearStudentSession(); } catch (_) {}
      clearAdminDetailCache();
      currentEventDetailData = null;
      latestViewResultsRequestId = 0;
      latestViewResultsButton = null;
      window.location.href = 'index.html';
    });
  }

const adminEventDetailCache = new Map();
const adminEventDetailInFlight = new Map();

function parseDeadlineToMs(deadlineStr) {
  const s0 = (deadlineStr || '').toString().trim();
  if (!s0) return null;

  let s = s0.replace(/\//g, '-');

  if (/\d\s+\d/.test(s)) {
    s = s.replace(/\s+/, 'T');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s = s + 'T00:00:00';
  }

  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function formatDeadlineDisplay(deadlineStr) {
  const raw = (deadlineStr || '').toString().trim();
  if (!raw) return '';

  const dateMatch = raw.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);
  if (!dateMatch) return raw;

  let datePart = dateMatch[1].replace(/-/g, '/');

  const timeMatch = raw.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (timeMatch) {
    return `${datePart} ${timeMatch[1]}`;
  }

  return `${datePart} 23:59:59`;
}

function isFreshCache(entry, ttlMs) {
  if (!entry) return false;
  const ttl = ttlMs != null ? ttlMs : 0;
  if (ttl <= 0) return true;
  return (Date.now() - entry.fetchedAt) < ttl;
}

async function getAdminEventDetailCached(adminToken, eventId, opts) {
  const force = !!(opts && opts.force);
  const ttlMs = (opts && opts.ttlMs != null) ? opts.ttlMs : 0;

  const cached = adminEventDetailCache.get(eventId);
  if (!force && isFreshCache(cached, ttlMs)) {
    return cached.data;
  }

  if (adminEventDetailInFlight.has(eventId)) {
    return await adminEventDetailInFlight.get(eventId);
  }

  const p = (async () => {
    const res = await adminEventDetail(adminToken, eventId);
    if (!res || !res.ok) throw new Error((res && res.error) || 'adminEventDetail error');
    adminEventDetailCache.set(eventId, { data: res, fetchedAt: Date.now() });
    return res;
  })();

  adminEventDetailInFlight.set(eventId, p);
  try {
    return await p;
  } finally {
    adminEventDetailInFlight.delete(eventId);
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      try {
        results[cur] = await mapper(items[cur], cur);
      } catch (e) {
        results[cur] = null;
      }
    }
  }

  const n = Math.max(1, Math.min(limit || 3, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function pickNewestFiveEventIdsByDeadline(entries) {
  const withMs = entries.map(([eid, info]) => {
    const ev = (info && info.event) || {};
    const ms = parseDeadlineToMs(ev.deadline);
    return { eid, ms };
  });

  withMs.sort((a, b) => {
    const ta = a.ms, tb = b.ms;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb - ta;
  });

  return withMs.slice(0, 5).map(x => x.eid);
}

function clearAdminDetailCache() {
  adminEventDetailCache.clear();
  adminEventDetailInFlight.clear();
}

function isParentAttendanceEventId(eventId) {
  return String(eventId || '').endsWith('-parent-attendance');
}

function ensureSummaryRefreshButton() {
  const summarySection = summaryContainer ? summaryContainer.closest('section.card') : null;
  if (!summarySection) return;

  const h2 = summarySection.querySelector('h2');
  if (!h2) return;

  if (summarySection.querySelector('#summary-refresh-btn')) return;

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'space-between';
  wrap.style.gap = '0.75rem';

  const h2Clone = h2; // move node

  const btn = document.createElement('button');
  btn.id = 'summary-refresh-btn';
  btn.className = 'btn secondary small';
  btn.type = 'button';
  btn.textContent = '重新整理';

  btn.addEventListener('click', async () => {
    const session = getAdminSession();
    if (!session || !session.adminToken) {
      showToast('請先登入管理員');
      return;
    }
    if (typeof setButtonLoading === 'function') setButtonLoading(btn, true);
    try {
      clearAdminDetailCache();
      await loadSummary({ forcePrefetch: true });
      showToast('已重新整理');
    } catch (e) {
      console.error(e);
      showToast('重新整理失敗');
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
    }
  });

  h2.parentNode.insertBefore(wrap, h2);
  wrap.appendChild(h2Clone);
  wrap.appendChild(btn);
}

  const detailViewState = {
    classFilter: 'ALL',
    sortMode: 'instrument',
  };

  function renderLoggedIn() {
    setHidden(loginSection, true);
    setHidden(adminSection, false);
  }
  function renderLoggedOut() {
    setHidden(adminSection, true);
    setHidden(loginSection, false);
    setHidden(eventDetailSection, true);
    signatureViewer.classList.add('hidden');
    currentEventDetailData = null;
    latestViewResultsRequestId = 0;
    latestViewResultsButton = null;
  }

  async function loadSummary(opts) {
    const session = getAdminSession();
    if (!session || !session.adminToken) return;

    ensureSummaryRefreshButton();

    try {
      const res = await adminSummary(session.adminToken);
      if (!res.ok) throw new Error(res.error || 'summary error');

      const byEvent = (res.summary && res.summary.byEvent) || {};
      const entries = Object.entries(byEvent);

      entries.sort((a, b) => {
        const ea = (a[1] && a[1].event) || {};
        const eb = (b[1] && b[1].event) || {};
        const ta = parseDeadlineToMs(ea.deadline);
        const tb = parseDeadlineToMs(eb.deadline);
        if (ta == null && tb == null) return 0;
        if (ta == null) return -1;
        if (tb == null) return 1;
        return ta - tb;
      });

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
          <th>名單總數</th>
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

const status = String(ev.status || '').toLowerCase();
const pillText = status === 'open' ? '開放回覆' : '已截止';
const pillBg = status === 'open' ? '#16a34a' : '#6b7280';

tr.innerHTML = `
  <td>
    ${title}
    <span style="display:inline-block; margin-left:8px; padding:2px 8px; font-size:12px; line-height:1.4; border-radius:999px; color:#fff; background:${pillBg}; vertical-align:middle;">
      ${pillText}
    </span>
  </td>
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

try {
  const newestFive = pickNewestFiveEventIdsByDeadline(entries);
  const forcePrefetch = !!(opts && opts.forcePrefetch);

  mapLimit(newestFive, 3, async (eid) => {
    const cached = adminEventDetailCache.get(eid);
    if (!forcePrefetch && cached) return true;
    await getAdminEventDetailCached(session.adminToken, eid, { force: forcePrefetch, ttlMs: 60 * 1000 });
    return true;
  }).catch(err => {
    console.warn('prefetch newest five failed', err);
  });
} catch (e) {
  console.warn('prefetch setup failed', e);
}
    } catch (err) {
      console.error(err);
      showToast('載入活動摘要失敗');
    }
  }

  
  const DETAIL_TOGGLE_ICONS = {
    closed: 'assets/icons/eye.svg',
    open: 'assets/icons/eye-slash.svg'
  };

  function normalizeClassSortToken(cls) {
    return String(cls || '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/^8/, '八')
      .replace(/^7/, '七');
  }

  function classOrderKey(cls) {
    const raw = (cls || '').trim();
    if (!raw) return [9, 999, 999, ''];

    const normalized = normalizeClassSortToken(raw);
    const preferredRank = {
      '八甲': 0,
      '八乙': 1,
      '七甲': 2,
      '七乙': 3
    };

    if (preferredRank[normalized] != null) {
      return [0, preferredRank[normalized], 0, normalized];
    }

    const gradeMap = {
      '一': 1,
      '二': 2,
      '三': 3,
      '四': 4,
      '五': 5,
      '六': 6,
      '七': 7,
      '八': 8,
      '九': 9
    };
    const sectionMap = {
      '甲': 0,
      '乙': 1,
      '丙': 2,
      '丁': 3,
      '戊': 4,
      '己': 5,
      '庚': 6,
      '辛': 7,
      '壬': 8,
      '癸': 9
    };
    const match = normalized.match(/^([一二三四五六七八九]|\d+)([甲乙丙丁戊己庚辛壬癸]?)/);
    const gradeToken = match ? match[1] : '';
    const sectionToken = match ? match[2] : '';
    const grade = /^\d+$/.test(gradeToken) ? Number(gradeToken) : (gradeMap[gradeToken] || 0);
    const section = sectionMap[sectionToken] != null ? sectionMap[sectionToken] : 999;

    return [1, grade ? 99 - grade : 999, section, normalized];
  }

  function compareClassOrder(a, b) {
    const ka = classOrderKey(a);
    const kb = classOrderKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    if (ka[2] !== kb[2]) return ka[2] - kb[2];
    return ka[3].localeCompare(kb[3], 'zh-Hant');
  }

  function setDetailToggleButtonState(btn, isOpen, label) {
    if (!btn) return;
    if (btn.disabled) return;
    btn.classList.toggle('is-active', !!isOpen);
    btn.dataset.state = isOpen ? 'open' : 'closed';
    btn.setAttribute('aria-label', `${isOpen ? '收合' : '查看'}${label}`);
    btn.title = `${isOpen ? '收合' : '查看'}${label}`;
    btn.innerHTML = `<img class="detail-eye-btn-icon" src="${isOpen ? DETAIL_TOGGLE_ICONS.open : DETAIL_TOGGLE_ICONS.closed}" alt="" aria-hidden="true">`;
  }

  function safeParseAnswer(answer) {
    try {
      if (!answer) return {};
      if (typeof answer === 'object') return answer;
      return JSON.parse(String(answer));
    } catch (e) {
      return {};
    }
  }

  function parseReplyTime(row) {
    const direct = row.lastReplyTs ?? row.replyAt ?? row.updatedAt ?? row.createdAt ?? row.timestamp ?? row.time ?? null;
    const candidates = [];
    if (direct != null) candidates.push(direct);

    const ans = safeParseAnswer(row.answer);
    const fromAns = ans.replyAt ?? ans.submittedAt ?? ans.updatedAt ?? ans.createdAt ?? ans.timestamp ?? ans.time ?? ans.submitTime ?? null;
    if (fromAns != null) candidates.push(fromAns);

    for (const v of candidates) {
      if (typeof v === 'number' && isFinite(v)) {
        const ms = v < 2_000_000_000 ? v * 1000 : v;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d;
      }
      if (typeof v === 'string') {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d;
        const n = Number(v);
        if (isFinite(n)) {
          const ms = n < 2_000_000_000 ? n * 1000 : n;
          const d2 = new Date(ms);
          if (!isNaN(d2.getTime())) return d2;
        }
      }
    }
    return null;
  }

  function buildClassFilterButtons(detailData) {
    if (!detailClassFilters) return;

    const replied = (detailData && detailData.replied) || [];
    const notReplied = (detailData && detailData.notReplied) || [];
    const classes = new Set();

    [...replied, ...notReplied].forEach(r => {
      const c = (r.class != null ? String(r.class) : '').trim();
      if (c) classes.add(c);
    });

    const preferred = [];

    const extra = Array.from(classes).filter(c => !preferred.includes(c));
    extra.sort((a, b) => compareClassOrder(a, b));

    const classList = preferred.concat(extra);

    detailClassFilters.innerHTML = '';

    const makeBtn = (label, value) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill-btn';
      b.textContent = label;
      b.dataset.value = value;
      b.addEventListener('click', () => {
        detailViewState.classFilter = value;
        [...detailClassFilters.querySelectorAll('.pill-btn')].forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        renderEventDetailTables();
      });
      return b;
    };

    const allBtn = makeBtn('全部', 'ALL');
    if (detailViewState.classFilter === 'ALL') allBtn.classList.add('is-active');
    detailClassFilters.appendChild(allBtn);

    classList.forEach(cls => {
      const exists = classes.has(cls);
      const btn = makeBtn(cls, cls);
      if (!exists) {
        btn.disabled = true;
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
      }
      if (detailViewState.classFilter === cls) btn.classList.add('is-active');
      detailClassFilters.appendChild(btn);
    });

    if (detailViewState.classFilter !== 'ALL' && !classes.has(detailViewState.classFilter)) {
      detailViewState.classFilter = 'ALL';
      [...detailClassFilters.querySelectorAll('.pill-btn')].forEach(x => x.classList.remove('is-active'));
      allBtn.classList.add('is-active');
    }
  }

  function buildSortPills() {
    if (!detailSortPills) return;

    detailSortPills.innerHTML = '';

    const items = [
      { label: '依班級', value: 'class' },
      { label: '依樂器', value: 'instrument' },
      { label: '最新回覆', value: 'time_desc' },
      { label: '最早回覆', value: 'time_asc' },
    ];

    const makeBtn = (label, value) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pill-btn pill-green';
      b.textContent = label;
      b.dataset.value = value;
      b.addEventListener('click', () => {
        detailViewState.sortMode = value;
        [...detailSortPills.querySelectorAll('.pill-btn')].forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        renderEventDetailTables();
      });
      return b;
    };

    items.forEach(it => {
      const btn = makeBtn(it.label, it.value);
      if ((detailViewState.sortMode || 'instrument') === it.value) btn.classList.add('is-active');
      detailSortPills.appendChild(btn);
    });
  }

  function syncDetailControlsUI() {
    buildSortPills();
  }



  function renderEventDetailTables() {
    if (!currentEventDetailData) return;

    const replied = currentEventDetailData.replied || [];
    const notReplied = currentEventDetailData.notReplied || [];
    const hasBus = !!currentEventDetailData.hasBusFields;
    const detailMode = currentEventDetailData.detailMode || 'default';
    const isParentAttendance = detailMode === 'parentAttendance';
    const showUnreplied = detailShowUnrepliedToggle && detailShowUnrepliedToggle.checked;

    if (!renderEventDetailTables._expandedKey) renderEventDetailTables._expandedKey = null;

    const detailTable = eventDetailTbody ? eventDetailTbody.closest('table') : null;
    if (detailTable) {
      const headerRow = detailTable.querySelector('thead tr');
      if (headerRow) {
        if (isParentAttendance) {
          headerRow.innerHTML = '<th>姓名</th><th>班級</th><th>樂器</th><th>結果</th><th>簽名</th><th>備註</th>';
        } else if (hasBus) {
          headerRow.innerHTML = '<th>姓名</th><th>班級</th><th>樂器</th><th>回覆</th><th>去程搭車</th><th>回程搭車</th><th>家長搭車</th><th>簽名</th><th>備註</th>';
        } else {
          headerRow.innerHTML = '<th>姓名</th><th>班級</th><th>樂器</th><th>回覆</th><th>簽名</th><th>備註</th>';
        }
      }
    }

    const COLS = isParentAttendance ? 6 : (hasBus ? 9 : 6);

    function normalizeNote(raw) {
      if (raw == null) return '';
      const s = String(raw);
      if (!s.trim()) return '';
      return s;
    }

    function extractFromAnswer(row) {
      let resultText = '';
      let signatureUrl = '';
      let goBus = '';
      let backBus = '';
      let noteText = '';
      let parentBus = '';
      let parentBusCount = '';
      let attendeeCount = '';
      try {
        const ans = safeParseAnswer(row.answer);
        resultText =
          ans.result ||
          ans.reply ||
          ans.choice ||
          ans.status ||
          ans.attend ||
          ans.parentAttendance ||
          ans.parentAttend ||
          ans.attendanceStatus ||
          ans.attendanceDecision ||
          ans.willAttend ||
          ans.consentChoice ||
          '';

        signatureUrl =
          ans.parentSignature ||
          ans.signatureDataUrl ||
          ans.signature ||
          ans.sign ||
          '';

        goBus = ans.goBus || '';
        backBus = ans.backBus || '';

        parentBus = ans.parentBus || '';
        parentBusCount =
          ans.parentBusCount != null && ans.parentBusCount !== ''
            ? String(ans.parentBusCount)
            : '';
        attendeeCount =
          ans.attendeeCount != null && ans.attendeeCount !== ''
            ? String(ans.attendeeCount)
            : '';
        noteText = normalizeNote(
          ans.seatNote ??
          ans.parentNote ??
          ans.parentAttendanceNote ??
          ans.note ??
          ans.remark ??
          ans.memo ??
          ans.comment ??
          ans.message ??
          ans.parentNote ??
          ans.parentMemo ??
          ''
        );
      } catch (e) {
        console.warn('failed to parse answer', row.answer, e);
      }

      return { resultText, signatureUrl, goBus, backBus, parentBus, parentBusCount, attendeeCount, noteText };
    }

    function rowToView(row) {
      const cls = (row.class != null ? String(row.class) : '').trim();
      const name = (row.name != null ? String(row.name) : '').trim();
      const instrument = (row.instrument != null ? String(row.instrument) : '').trim();

      const {
        resultText,
        signatureUrl,
        goBus,
        backBus,
        parentBus,
        parentBusCount,
        attendeeCount,
        noteText
      } = extractFromAnswer(row);
      const replyTime = parseReplyTime(row);

      return {
        row,
        cls,
        name,
        instrument,
        resultText,
        signatureUrl,
        goBus,
        backBus,
        parentBus,
        parentBusCount,
        attendeeCount,
        noteText,
        replyTime
      };
    }

    function applyFiltersAndSort(list) {
      let out = list.slice();

      if (detailViewState.classFilter && detailViewState.classFilter !== 'ALL') {
        out = out.filter(v => v.cls === detailViewState.classFilter);
      }

      const mode = detailViewState.sortMode || 'class';
      if (mode === 'instrument') {
        out.sort((a, b) => {
          const ia = a.instrument || '';
          const ib = b.instrument || '';
          const c = ia.localeCompare(ib, 'zh-Hant');
          if (c !== 0) return c;
          const classCompare = compareClassOrder(a.cls, b.cls);
          if (classCompare !== 0) return classCompare;
          return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
        });
      } else if (mode === 'time_asc' || mode === 'time_desc') {
        const dir = mode === 'time_asc' ? 1 : -1;
        out.sort((a, b) => {
          const ta = a.replyTime ? a.replyTime.getTime() : null;
          const tb = b.replyTime ? b.replyTime.getTime() : null;
          if (ta == null && tb == null) return 0;
          if (ta == null) return 1;
          if (tb == null) return -1;
          if (ta === tb) return 0;
          return (ta < tb ? -1 : 1) * dir;
        });
      } else {
        out.sort((a, b) => {
          const classCompare = compareClassOrder(a.cls, b.cls);
          if (classCompare !== 0) return classCompare;
          return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
        });
      }

      return out;
    }

    function collapseCurrentExpanded() {
      const key = renderEventDetailTables._expandedKey;
      if (!key) return;

      const anchor = eventDetailTbody.querySelector(`tr[data-expand-key="${cssEscape(key)}"]`);
      if (anchor) {
        anchor.classList.remove('detail-expanded-anchor');
        const sigBtn = anchor.querySelector('button[data-action="sig"]');
        const noteBtn = anchor.querySelector('button[data-action="note"]');
        setDetailToggleButtonState(sigBtn, false, '簽名');
        setDetailToggleButtonState(noteBtn, false, '備註');
      }

      const expandRow = eventDetailTbody.querySelector(`tr.detail-expand-row[data-expand-key="${cssEscape(key)}"]`);
      if (expandRow) expandRow.remove();

      renderEventDetailTables._expandedKey = null;
    }

    function ensureExpandRow(anchorTr, key) {
      let expandRow = eventDetailTbody.querySelector(`tr.detail-expand-row[data-expand-key="${cssEscape(key)}"]`);
      if (!expandRow) {
        expandRow = document.createElement('tr');
        expandRow.className = 'detail-expand-row';
        expandRow.dataset.expandKey = key;

        const td = document.createElement('td');
        td.colSpan = COLS;

        const wrap = document.createElement('div');
        wrap.className = 'detail-expand-wrap';

        const sigPanel = document.createElement('div');
        sigPanel.className = 'detail-panel';
        sigPanel.dataset.panel = 'signature';
        sigPanel.classList.add('hidden');
        sigPanel.innerHTML = `
          <div class="detail-panel-title">簽名</div>
          <img class="detail-signature-img" alt="家長簽名" />
        `;

        const notePanel = document.createElement('div');
        notePanel.className = 'detail-panel';
        notePanel.dataset.panel = 'note';
        notePanel.classList.add('hidden');
        notePanel.innerHTML = `
          <div class="detail-panel-title">備註</div>
          <div class="detail-note-text"></div>
        `;

        wrap.appendChild(sigPanel);
        wrap.appendChild(notePanel);
        td.appendChild(wrap);
        expandRow.appendChild(td);

        if (anchorTr.nextSibling) eventDetailTbody.insertBefore(expandRow, anchorTr.nextSibling);
        else eventDetailTbody.appendChild(expandRow);
      }
      return expandRow;
    }

    function setPanelVisible(expandRow, panelName, visible) {
      const panel = expandRow.querySelector(`.detail-panel[data-panel="${panelName}"]`);
      if (!panel) return;
      if (visible) panel.classList.remove('hidden');
      else panel.classList.add('hidden');

      const anyVisible = [...expandRow.querySelectorAll('.detail-panel')].some(p => !p.classList.contains('hidden'));
      if (!anyVisible) {
        const key = expandRow.dataset.expandKey;
        const anchor = eventDetailTbody.querySelector(`tr[data-expand-key="${cssEscape(key)}"]`);
        if (anchor) {
          anchor.classList.remove('detail-expanded-anchor');
          const sigBtn = anchor.querySelector('button[data-action="sig"]');
          const noteBtn = anchor.querySelector('button[data-action="note"]');
          setDetailToggleButtonState(sigBtn, false, '簽名');
          setDetailToggleButtonState(noteBtn, false, '備註');
        }
        expandRow.remove();
        if (renderEventDetailTables._expandedKey === key) renderEventDetailTables._expandedKey = null;
      }
    }

    function cssEscape(str) {
      return String(str).replace(/["\\]/g, '\\$&');
    }

    function handleToggle(key, anchorTr, type, payload) {
      if (renderEventDetailTables._expandedKey && renderEventDetailTables._expandedKey !== key) {
        collapseCurrentExpanded();
      }

      if (!renderEventDetailTables._expandedKey) renderEventDetailTables._expandedKey = key;

      anchorTr.classList.add('detail-expanded-anchor');

      const expandRow = ensureExpandRow(anchorTr, key);

      if (type === 'signature') {
        const btn = anchorTr.querySelector('button[data-action="sig"]');
        const panel = expandRow.querySelector('.detail-panel[data-panel="signature"]');
        const img = panel ? panel.querySelector('img.detail-signature-img') : null;

        const isOpen = panel && !panel.classList.contains('hidden');
        if (isOpen) {
          setPanelVisible(expandRow, 'signature', false);
          if (btn) {
            setDetailToggleButtonState(btn, false, '簽名');
          }
        } else {
          if (img) img.src = payload.signatureUrl || '';
          setPanelVisible(expandRow, 'signature', true);
          if (btn) {
            setDetailToggleButtonState(btn, true, '簽名');
          }
        }
      }

      if (type === 'note') {
        const btn = anchorTr.querySelector('button[data-action="note"]');
        const panel = expandRow.querySelector('.detail-panel[data-panel="note"]');
        const box = panel ? panel.querySelector('.detail-note-text') : null;

        const isOpen = panel && !panel.classList.contains('hidden');
        if (isOpen) {
          setPanelVisible(expandRow, 'note', false);
          if (btn) {
            setDetailToggleButtonState(btn, false, '備註');
          }
        } else {
          if (box) box.textContent = payload.noteText || '';
          setPanelVisible(expandRow, 'note', true);
          if (btn) {
            setDetailToggleButtonState(btn, true, '備註');
          }
        }
      }
    }

    if (!replied.length) {
      eventDetailTbody.innerHTML =
        `<tr><td colspan="${COLS}" class="muted">目前沒有任何回覆</td></tr>`;
    } else {
      eventDetailTbody.innerHTML = '';
      renderEventDetailTables._expandedKey = null;

      const viewRows = applyFiltersAndSort(replied.map(rowToView));

      if (!viewRows.length) {
        eventDetailTbody.innerHTML = `<tr><td colspan="${COLS}" class="muted">目前篩選條件下沒有資料</td></tr>`;
        return;
      }

      viewRows.forEach(v => {
        const row = v.row;
        const tr = document.createElement('tr');

        const cls = v.cls;
        const name = v.name;
        const instrument = v.instrument;

        const {
          resultText,
          signatureUrl,
          goBus,
          backBus,
          parentBus,
          parentBusCount,
          attendeeCount,
          noteText
        } = v;

        const key = `${cls}__${name}`;
        tr.dataset.expandKey = key;

        const tdName = document.createElement('td');
        tdName.textContent = name || '-';

        const tdClass = document.createElement('td');
        tdClass.textContent = cls || '-';

        const tdInstrument = document.createElement('td');
        tdInstrument.textContent = instrument || '-';

        const tdResult = document.createElement('td');
        if (isParentAttendance) {
          if (resultText === '不出席') {
            tdResult.textContent = '不出席';
          } else if (attendeeCount) {
            tdResult.textContent = `${attendeeCount}人出席`;
          } else if (resultText === '出席') {
            tdResult.textContent = '出席';
          } else {
            tdResult.textContent = '-';
          }
        } else {
          tdResult.textContent = resultText || '-';
        }

        const tdGoBus = document.createElement('td');
        tdGoBus.textContent = goBus || '-';

        const tdBackBus = document.createElement('td');
        tdBackBus.textContent = backBus || '-';

        const tdParentBus = document.createElement('td');
        let parentDisplay = '-';
        if (parentBusCount) {
          parentDisplay = String(parentBusCount);
        } else if (parentBus) {
          parentDisplay = String(parentBus);
        }
        tdParentBus.textContent = parentDisplay;

        const tdSignature = document.createElement('td');
        const btnSig = document.createElement('button');
        btnSig.className = 'btn secondary small detail-eye-btn';
        btnSig.dataset.action = 'sig';
        setDetailToggleButtonState(btnSig, false, '簽名');

        if (signatureUrl) {
          btnSig.addEventListener('click', () => {
            handleToggle(key, tr, 'signature', { signatureUrl });
          });
        } else {
          btnSig.disabled = true;
          btnSig.textContent = '無';
          btnSig.title = '沒有簽名';
          btnSig.setAttribute('aria-label', '沒有簽名');
        }
        tdSignature.appendChild(btnSig);

        const tdNote = document.createElement('td');
        if (noteText) {
          const btnNote = document.createElement('button');
          btnNote.className = 'btn secondary small detail-eye-btn';
          btnNote.dataset.action = 'note';
          setDetailToggleButtonState(btnNote, false, '備註');
          btnNote.addEventListener('click', () => {
            handleToggle(key, tr, 'note', { noteText });
          });
          tdNote.appendChild(btnNote);
        } else {
          tdNote.textContent = '無';
          tdNote.classList.add('muted');
        }

        tr.appendChild(tdName);
        tr.appendChild(tdClass);
        tr.appendChild(tdInstrument);
        tr.appendChild(tdResult);

        if (!isParentAttendance && hasBus) {
          tr.appendChild(tdGoBus);
          tr.appendChild(tdBackBus);
          tr.appendChild(tdParentBus);
        }

        tr.appendChild(tdSignature);
        tr.appendChild(tdNote);

        eventDetailTbody.appendChild(tr);
      });
    }

    if (signatureViewer) {
      signatureViewer.classList.add('hidden');
      if (signatureViewerImage) signatureViewerImage.src = '';
    }

    if (!eventDetailUnrepliedSection || !eventDetailUnrepliedTbody) return;

    if (!showUnreplied) {
      setHidden(eventDetailUnrepliedSection, true);
      eventDetailUnrepliedTbody.innerHTML = '';
      return;
    }

    setHidden(eventDetailUnrepliedSection, false);
    const unrepliedView = notReplied.map(rowToView)
      .filter(v => detailViewState.classFilter === 'ALL' || v.cls === detailViewState.classFilter)
      .sort((a, b) => {
        const classCompare = compareClassOrder(a.cls, b.cls);
        if (classCompare !== 0) return classCompare;
        return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
      });

    if (!unrepliedView.length) {
      eventDetailUnrepliedTbody.innerHTML =
        '<tr><td colspan="3" class="muted">目前沒有未回覆名單</td></tr>';
      return;
    }

    eventDetailUnrepliedTbody.innerHTML = '';
    unrepliedView.forEach(v => {
      const row = v.row;

      const tr = document.createElement('tr');

      const cls = v.cls;
      const name = v.name;
      const instrument = v.instrument;

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

  async function handleViewResults(eventId, ev, triggerBtn) {
    latestViewResultsRequestId += 1;
    const requestId = latestViewResultsRequestId;

    if (typeof setButtonLoading === 'function' && triggerBtn) {
      if (latestViewResultsButton && latestViewResultsButton !== triggerBtn) {
        setButtonLoading(latestViewResultsButton, false);
      }
      latestViewResultsButton = triggerBtn;
      setButtonLoading(triggerBtn, true);
    }

    const session = getAdminSession();
    if (!session || !session.adminToken) {
      showToast('請先登入管理員');
      return;
    }

    if (requestId !== latestViewResultsRequestId) {
      return;
    }

    eventDetailTitle.textContent = ev.title || eventId;
    currentEventDetailData = null;
    if (detailShowUnrepliedToggle) { detailShowUnrepliedToggle.checked = false; }
    if (eventDetailUnrepliedSection) { setHidden(eventDetailUnrepliedSection, true); eventDetailUnrepliedTbody.innerHTML = ''; }
    eventDetailMeta.textContent = '';
    if (eventDetailContent) {
      eventDetailContent.textContent = '';
      eventDetailContent.classList.add('hidden');
    }
    eventDetailStats.textContent = '載入中...';
    eventDetailTbody.innerHTML = '<tr><td colspan="9" class="muted">載入中...</td></tr>';
    signatureViewer.classList.add('hidden');
    setHidden(eventDetailSection, false);

    try {
      const data = await getAdminEventDetailCached(session.adminToken, eventId, { ttlMs: 60 * 1000 });

      if (requestId !== latestViewResultsRequestId) {
        return;
      }
      const eventInfo = data.event || {};
      const replied = data.replied || [];
      const notReplied = data.notReplied || [];
      const total = data.totalRoster || 0;
      const repliedCount = data.repliedCount || 0;
      const notRepliedCount = data.notRepliedCount || 0;
      const replyRate = (data.replyRate != null ? data.replyRate + '%' : '-');

      eventDetailTitle.textContent = eventInfo.title || ev.title || eventId;

      const dateStr = eventInfo.date || eventInfo.startAt || '';
      const placeStr = eventInfo.place || '';
      const contactStr = eventInfo.contact || '';
      const ddlStr = eventInfo.deadline || '';

      const metaParts = [];
      if (dateStr) metaParts.push(`日期：${dateStr}`);
      if (placeStr) metaParts.push(`地點：${placeStr}`);
      if (ddlStr) {
        const ddlDisplay = formatDeadlineDisplay(ddlStr);
        metaParts.push(`截止：${ddlDisplay}`);
      }
      if (contactStr) metaParts.push(`聯絡人：${contactStr}`);
      eventDetailMeta.textContent = metaParts.join('｜');

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

      const hasBusFields = replied.some(row => {
        try {
          const ans = safeParseAnswer(row.answer);
          return !!(ans.goBus || ans.backBus);
        } catch (e) {
          return false;
        }
      });

      eventDetailStats.textContent =
        `名單總數：${total}｜已回覆：${repliedCount}｜未回覆：${notRepliedCount}｜回覆率：${replyRate}`;

      const detailMode = isParentAttendanceEventId(eventId) ? 'parentAttendance' : 'default';
      currentEventDetailData = { replied, notReplied, hasBusFields, detailMode };
      buildClassFilterButtons(currentEventDetailData);
      syncDetailControlsUI();
      renderEventDetailTables();
    } catch (err) {
      if (requestId === latestViewResultsRequestId) {
        console.error(err);
        showToast('載入活動明細失敗，請稍後再試');
        eventDetailStats.textContent = '載入失敗';
      }
    } finally {
      if (
        typeof setButtonLoading === 'function' &&
        triggerBtn &&
        triggerBtn === latestViewResultsButton &&
        requestId === latestViewResultsRequestId
      ) {
        setButtonLoading(triggerBtn, false);
      }
    }
  }

  function openSignatureViewer(studentName, url) {
    if (!signatureViewer || !signatureViewerImage) return;
    signatureViewer.classList.remove('hidden');
    signatureViewerInfo.textContent = studentName ? `${studentName} 的簽名` : '家長簽名';
    signatureViewerImage.src = url || '';
  }

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

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginError.classList.add('hidden');

    const formData = new FormData(loginForm);
    const token = (formData.get('adminToken') || '').toString().trim();
    if (!token) {
      loginError.textContent = '請輸入管理員 token';
      loginError.classList.remove('hidden');
      return;
    }

    if (typeof setButtonLoading === 'function' && loginSubmitBtn) {
      setButtonLoading(loginSubmitBtn, true);
    }

    try {
      const res = await authAdmin(token);
      if (!res.ok || res.role !== 'admin') {
        loginError.textContent = '管理員登入失敗，請確認 token';
        loginError.classList.remove('hidden');
        return;
      }
      saveAdminSession(token);
      renderLoggedIn();
      showToast('管理員登入成功');
      loadSummary();
    } catch (err) {
      console.error(err);
      loginError.textContent = '登入失敗，請稍後再試';
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
    showToast('已登出');
  });

  if (detailShowUnrepliedToggle) {
    detailShowUnrepliedToggle.addEventListener('change', () => {
      renderEventDetailTables();
    });
  }

  const adminSession = getAdminSession();
  if (adminSession && adminSession.adminToken) {
    renderLoggedIn();
    loadSummary();
  }
});


