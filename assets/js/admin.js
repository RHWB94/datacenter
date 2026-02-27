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

  // 排排站大作戰：排序/篩選
  const detailSortPills = document.getElementById('detail-sort-pills');
  const detailClassFilters = document.getElementById('detail-class-filters');

  // 簽名顯示區
  const signatureViewer = document.getElementById('signature-viewer');
  const signatureViewerInfo = document.getElementById('signature-viewer-info');
  const signatureViewerImage = document.getElementById('signature-viewer-image');

  // 目前這一場活動的詳細資料（含 replied / notReplied + 是否有搭車欄位）
  let currentEventDetailData = null;

  // 「查看結果」請求的最新編號與按鈕：確保只處理最後一次點擊
  let latestViewResultsRequestId = 0;
  let latestViewResultsButton = null;

  const studentEntryLink = document.querySelector('.admin-entry-link');
  if (studentEntryLink) {
    studentEntryLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 切換到學生端時，清除兩邊登入狀態與管理端快取，然後導向 index 頁
      try { clearAdminSession(); } catch (_) {}
      try { clearStudentSession(); } catch (_) {}
      clearAdminDetailCache();
      currentEventDetailData = null;
      latestViewResultsRequestId = 0;
      latestViewResultsButton = null;
      window.location.href = 'index.html';
    });
  }

// ===== 管理端：活動詳細快取（避免切換活動每次等 3-5 秒）=====
// eventId -> { data, fetchedAt }
const adminEventDetailCache = new Map();
// eventId -> Promise（避免同一活動重複發 request）
const adminEventDetailInFlight = new Map();

// 解析 deadline：支援 "YYYY/MM/DD" 以及可能的 "YYYY/MM/DD HH:mm" / "YYYY/MM/DD HH:mm:ss"
function parseDeadlineToMs(deadlineStr) {
  const s0 = (deadlineStr || '').toString().trim();
  if (!s0) return null;

  // normalize: YYYY/MM/DD -> YYYY-MM-DD
  let s = s0.replace(/\//g, '-');

  // if has space before time, replace with 'T'
  if (/\d\s+\d/.test(s)) {
    s = s.replace(/\s+/, 'T');
  }

  // if only date, add time
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s = s + 'T00:00:00';
  }

  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

// 顯示用：將 deadline 字串轉成「YYYY/M/D，23:59:59」或保留原時間
function formatDeadlineDisplay(deadlineStr) {
  const raw = (deadlineStr || '').toString().trim();
  if (!raw) return '';

  // 抓出日期部分（允許 YYYY/M/D 或 YYYY-MM-DD）
  const dateMatch = raw.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);
  if (!dateMatch) return raw;

  let datePart = dateMatch[1].replace(/-/g, '/'); // 一律用 /

  // 判斷是否已經有時間
  const timeMatch = raw.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (timeMatch) {
    // 若原本就有時間，就顯示「日期 時間」
    return `${datePart} ${timeMatch[1]}`;
  }

  // 只有日期：補上 23:59:59
  return `${datePart}，23:59:59`;
}

function isFreshCache(entry, ttlMs) {
  if (!entry) return false;
  const ttl = ttlMs != null ? ttlMs : 0;
  if (ttl <= 0) return true; // ttl<=0 表示永遠視為新（不建議，但保留彈性）
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
  // entries: [ [eventId, info], ... ]
  const withMs = entries.map(([eid, info]) => {
    const ev = (info && info.event) || {};
    const ms = parseDeadlineToMs(ev.deadline);
    return { eid, ms };
  });

  // 有 deadline 的先排序；沒有的丟後面
  withMs.sort((a, b) => {
    const ta = a.ms, tb = b.ms;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return tb - ta; // 新到舊
  });

  return withMs.slice(0, 5).map(x => x.eid);
}

function clearAdminDetailCache() {
  adminEventDetailCache.clear();
  adminEventDetailInFlight.clear();
}

function ensureSummaryRefreshButton() {
  // 在「活動回覆統計」標題旁加上「重新抓取資料」按鈕（只做一次）
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

  // keep existing h2
  const h2Clone = h2; // move node

  const btn = document.createElement('button');
  btn.id = 'summary-refresh-btn';
  btn.className = 'btn secondary small';
  btn.type = 'button';
  btn.textContent = '重新抓取資料';

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
      showToast('已重新抓取資料');
    } catch (e) {
      console.error(e);
      showToast('重新抓取失敗');
    } finally {
      if (typeof setButtonLoading === 'function') setButtonLoading(btn, false);
    }
  });

  // Replace h2 with wrap(h2 + btn)
  h2.parentNode.insertBefore(wrap, h2);
  wrap.appendChild(h2Clone);
  wrap.appendChild(btn);
}

  // 排排站大作戰：UI 狀態（跨活動保留）
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
    // 順便清空詳細區
    setHidden(eventDetailSection, true);
    signatureViewer.classList.add('hidden');
    // 清空活動詳細快取與狀態
    clearAdminDetailCache();
    currentEventDetailData = null;
    latestViewResultsRequestId = 0;
    latestViewResultsButton = null;
  }

  // 載入活動總覽統計
  async function loadSummary(opts) {
    const session = getAdminSession();
    if (!session || !session.adminToken) return;

    ensureSummaryRefreshButton();

    try {
      const res = await adminSummary(session.adminToken);
      if (!res.ok) throw new Error(res.error || 'summary error');

      const byEvent = (res.summary && res.summary.byEvent) || {};
      const entries = Object.entries(byEvent);

      // 活動列表顯示：舊到新（由上到下越新）
      entries.sort((a, b) => {
        const ea = (a[1] && a[1].event) || {};
        const eb = (b[1] && b[1].event) || {};
        const ta = parseDeadlineToMs(ea.deadline);
        const tb = parseDeadlineToMs(eb.deadline);
        if (ta == null && tb == null) return 0;
        if (ta == null) return -1; // 沒 deadline 視為最舊
        if (tb == null) return 1;
        return ta - tb; // 舊到新
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

const status = String(ev.status || '').toLowerCase();
const pillText = status === 'open' ? '開放填寫中' : '未開放填寫';
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

// 登入後預抓：只預先抓取最新五個活動（依 deadline 新到舊）
try {
  const newestFive = pickNewestFiveEventIdsByDeadline(entries);
  const forcePrefetch = !!(opts && opts.forcePrefetch);

  // 預抓不阻塞 UI
  mapLimit(newestFive, 3, async (eid) => {
    // 若不是強制，且已有快取（視為新），就跳過
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
      showToast('讀取統計資料失敗');
    }
  }

  
  // ===== 排排站大作戰：工具函式 =====
  function classOrderKey(cls) {
    const s = (cls || '').trim();
    if (!s) return [999, 999, s];
    const gradeMap = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
    const secMap = { '甲':1,'乙':2,'丙':3,'丁':4,'戊':5,'己':6,'庚':7,'辛':8,'壬':9,'癸':10 };
    const gChar = s[0];
    const secChar = s[1] || '';
    const g = gradeMap[gChar] ?? 999;
    const sec = secMap[secChar] ?? 999;
    return [g, sec, s];
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
    // 盡量相容：row 欄位、或 answer 內欄位
    const direct = row.lastReplyTs ?? row.replyAt ?? row.updatedAt ?? row.createdAt ?? row.timestamp ?? row.time ?? null;
    const candidates = [];
    if (direct != null) candidates.push(direct);

    const ans = safeParseAnswer(row.answer);
    const fromAns = ans.replyAt ?? ans.submittedAt ?? ans.updatedAt ?? ans.createdAt ?? ans.timestamp ?? ans.time ?? ans.submitTime ?? null;
    if (fromAns != null) candidates.push(fromAns);

    for (const v of candidates) {
      // number: seconds or ms
      if (typeof v === 'number' && isFinite(v)) {
        const ms = v < 2_000_000_000 ? v * 1000 : v;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d;
      }
      // string
      if (typeof v === 'string') {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d;
        // numeric string
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

    // 你指定的固定順序（第一行按鈕）
    const preferred = ['八甲', '八乙', '七甲', '七乙'];

    // 若活動內有其他班級，追加在後面（依班級順序）
    const extra = Array.from(classes).filter(c => !preferred.includes(c));
    extra.sort((a, b) => {
      const ka = classOrderKey(a);
      const kb = classOrderKey(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      return ka[2].localeCompare(kb[2], 'zh-Hant');
    });

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
        // active style
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
      // 固定四班即使該活動沒出現也要顯示；若沒有出現則 disabled
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

    // 若目前選到的班級在本活動不存在，回到 ALL
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
      { label: '依樂器', value: 'instrument' },
      { label: '新到舊', value: 'time_desc' },
      { label: '舊到新', value: 'time_asc' },
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
    // 班級 pills 是動態渲染時會處理 active；排序 pills 在 buildSortPills 處理 active
    buildSortPills();
  }



// 依照目前模式（checkbox）繪製「已回覆 / 未回覆」兩個區塊
  
  // 依照目前模式（checkbox）繪製「已回覆 / 未回覆」兩個區塊
  function renderEventDetailTables() {
    if (!currentEventDetailData) return;

    const replied = currentEventDetailData.replied || [];
    const notReplied = currentEventDetailData.notReplied || [];
    const hasBus = !!currentEventDetailData.hasBusFields; // 是否有 goBus/backBus 欄位
    const showUnreplied = detailShowUnrepliedToggle && detailShowUnrepliedToggle.checked;

    // 目前展開中的學生 key（一次只允許展開一人）
    // key: `${class}__${name}`
    if (!renderEventDetailTables._expandedKey) renderEventDetailTables._expandedKey = null;

    // 調整表頭去程/回程欄位顯示
    const detailTable = eventDetailTbody ? eventDetailTbody.closest('table') : null;
    if (detailTable) {
      const headerCells = detailTable.querySelectorAll('thead th');
      // index: 0姓名,1班級,2樂器,3結果,4去程,5回程,6簽名,7備註
      if (headerCells.length >= 8) {
        if (hasBus) {
          headerCells[4].style.display = '';
          headerCells[5].style.display = '';
        } else {
          headerCells[4].style.display = 'none';
          headerCells[5].style.display = 'none';
        }
      }
    }

    // 若有遊覽車欄位，會顯示：去程 / 回程 / 家長乘車（合併顯示）
    const COLS = hasBus ? 9 : 6;

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

      try {
        const ans = safeParseAnswer(row.answer);
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

        goBus = ans.goBus || '';
        backBus = ans.backBus || '';

        parentBus = ans.parentBus || '';
        parentBusCount =
          ans.parentBusCount != null && ans.parentBusCount !== ''
            ? String(ans.parentBusCount)
            : '';

        // 備註欄位（多 key 相容）
        noteText = normalizeNote(
          ans.parentNote ??   // ✅ 加這行
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
        console.warn('解析 answer 失敗', row.answer, e);
      }

      return { resultText, signatureUrl, goBus, backBus, parentBus, parentBusCount, noteText };
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
        noteText,
        replyTime
      };
    }

    function applyFiltersAndSort(list) {
      let out = list.slice();

      // 班級篩選
      if (detailViewState.classFilter && detailViewState.classFilter !== 'ALL') {
        out = out.filter(v => v.cls === detailViewState.classFilter);
      }

      // 排序
      const mode = detailViewState.sortMode || 'class';
      if (mode === 'instrument') {
        out.sort((a, b) => {
          const ia = a.instrument || '';
          const ib = b.instrument || '';
          const c = ia.localeCompare(ib, 'zh-Hant');
          if (c !== 0) return c;
          // 次排序：班級 → 姓名
          const ca = classOrderKey(a.cls);
          const cb = classOrderKey(b.cls);
          if (ca[0] !== cb[0]) return ca[0] - cb[0];
          if (ca[1] !== cb[1]) return ca[1] - cb[1];
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
        // class
        out.sort((a, b) => {
          const ca = classOrderKey(a.cls);
          const cb = classOrderKey(b.cls);
          if (ca[0] !== cb[0]) return ca[0] - cb[0];
          if (ca[1] !== cb[1]) return ca[1] - cb[1];
          // 次排序：姓名
          return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
        });
      }

      return out;
    }

    function collapseCurrentExpanded() {
      const key = renderEventDetailTables._expandedKey;
      if (!key) return;

      // 找到目前的 anchor row
      const anchor = eventDetailTbody.querySelector(`tr[data-expand-key="${cssEscape(key)}"]`);
      if (anchor) {
        anchor.classList.remove('detail-expanded-anchor');
        // buttons active
        anchor.querySelectorAll('button.is-active').forEach(b => b.classList.remove('is-active'));
      }

      // 移除 expand row
      const expandRow = eventDetailTbody.querySelector(`tr.detail-expand-row[data-expand-key="${cssEscape(key)}"]`);
      if (expandRow) expandRow.remove();

      renderEventDetailTables._expandedKey = null;
    }

    function ensureExpandRow(anchorTr, key) {
      // expand row already exists?
      let expandRow = eventDetailTbody.querySelector(`tr.detail-expand-row[data-expand-key="${cssEscape(key)}"]`);
      if (!expandRow) {
        expandRow = document.createElement('tr');
        expandRow.className = 'detail-expand-row';
        expandRow.dataset.expandKey = key;

        const td = document.createElement('td');
        td.colSpan = COLS;

        const wrap = document.createElement('div');
        wrap.className = 'detail-expand-wrap';

        // signature panel
        const sigPanel = document.createElement('div');
        sigPanel.className = 'detail-panel';
        sigPanel.dataset.panel = 'signature';
        sigPanel.classList.add('hidden');
        sigPanel.innerHTML = `
          <div class="detail-panel-title">簽名</div>
          <img class="detail-signature-img" alt="家長簽名" />
        `;

        // note panel
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

        // insert after anchor
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

      // 如果兩個都 hidden，整個 expand row 就移除
      const anyVisible = [...expandRow.querySelectorAll('.detail-panel')].some(p => !p.classList.contains('hidden'));
      if (!anyVisible) {
        const key = expandRow.dataset.expandKey;
        const anchor = eventDetailTbody.querySelector(`tr[data-expand-key="${cssEscape(key)}"]`);
        if (anchor) {
          anchor.classList.remove('detail-expanded-anchor');
          anchor.querySelectorAll('button.is-active').forEach(b => b.classList.remove('is-active'));
        }
        expandRow.remove();
        if (renderEventDetailTables._expandedKey === key) renderEventDetailTables._expandedKey = null;
      }
    }

    function cssEscape(str) {
      // minimal escape for attribute selector
      return String(str).replace(/["\\]/g, '\\$&');
    }

    function handleToggle(key, anchorTr, type, payload) {
      // 若點的是另一個人：先收起舊的，再展開新的
      if (renderEventDetailTables._expandedKey && renderEventDetailTables._expandedKey !== key) {
        collapseCurrentExpanded();
      }

      // 設定目前展開 key
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
            btn.classList.remove('is-active');
            // 閉眼圖示（收起）
            btn.textContent = '🙈';
          }
        } else {
          if (img) img.src = payload.signatureUrl || '';
          setPanelVisible(expandRow, 'signature', true);
          if (btn) {
            btn.classList.add('is-active');
            // 睜眼圖示（展開）
            btn.textContent = '👁️';
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
            btn.classList.remove('is-active');
            // 閉眼圖示（收起）
            btn.textContent = '🙈';
          }
        } else {
          if (box) box.textContent = payload.noteText || '';
          setPanelVisible(expandRow, 'note', true);
          if (btn) {
            btn.classList.add('is-active');
            // 睜眼圖示（展開）
            btn.textContent = '👁️';
          }
        }
      }
    }

    // ===== 上半部：已回覆名單 =====
    if (!replied.length) {
      eventDetailTbody.innerHTML =
        `<tr><td colspan="${COLS}" class="muted">目前尚無回覆。</td></tr>`;
    } else {
      eventDetailTbody.innerHTML = '';
      renderEventDetailTables._expandedKey = null;

      const viewRows = applyFiltersAndSort(replied.map(rowToView));

      if (!viewRows.length) {
        eventDetailTbody.innerHTML = `<tr><td colspan="${COLS}" class="muted">沒有符合篩選條件的資料。</td></tr>`;
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
        tdResult.textContent = resultText || '-';

        const tdGoBus = document.createElement('td');
        tdGoBus.textContent = goBus || '-';

        const tdBackBus = document.createElement('td');
        tdBackBus.textContent = backBus || '-';

        // 家長乘車顯示：若不搭乘顯示「否」，若搭乘顯示「X人」
        const tdParentBus = document.createElement('td');
        let parentDisplay = '-';
        if (parentBus === '是' && parentBusCount) {
          parentDisplay = `${parentBusCount}人`;
        } else if (parentBus === '否' || parentBus === '' || !parentBus) {
          parentDisplay = '否';
        }
        tdParentBus.textContent = parentDisplay;

        const tdSignature = document.createElement('td');
        const btnSig = document.createElement('button');
        btnSig.className = 'btn secondary small detail-eye-btn';
        btnSig.textContent = '🙈'; // 初始為「閉眼」圖示
        btnSig.dataset.action = 'sig';
        btnSig.title = '檢視簽名';

        if (signatureUrl) {
          btnSig.addEventListener('click', () => {
            handleToggle(key, tr, 'signature', { signatureUrl });
          });
        } else {
          btnSig.disabled = true;
          btnSig.textContent = '無簽名';
        }
        tdSignature.appendChild(btnSig);

        const tdNote = document.createElement('td');
        if (noteText) {
          const btnNote = document.createElement('button');
          btnNote.className = 'btn secondary small detail-eye-btn';
          btnNote.textContent = '🙈'; // 初始為「閉眼」圖示
          btnNote.dataset.action = 'note';
          btnNote.title = '檢視備註';
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

        if (hasBus) {
          tr.appendChild(tdGoBus);
          tr.appendChild(tdBackBus);
          tr.appendChild(tdParentBus);
        }

        tr.appendChild(tdSignature);
        tr.appendChild(tdNote);

        eventDetailTbody.appendChild(tr);
      });
    }

    // 原本頁面最底下的 signature-viewer 會造成捲動困擾：這裡一律收起不用
    if (signatureViewer) {
      signatureViewer.classList.add('hidden');
      if (signatureViewerImage) signatureViewerImage.src = '';
    }

    // ===== 下半部：未回覆名單 =====
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
        const ca = classOrderKey(a.cls);
        const cb = classOrderKey(b.cls);
        if (ca[0] !== cb[0]) return ca[0] - cb[0];
        if (ca[1] !== cb[1]) return ca[1] - cb[1];
        return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
      });

    if (!unrepliedView.length) {
      eventDetailUnrepliedTbody.innerHTML =
        '<tr><td colspan="3" class="muted">目前沒有未回覆名單。</td></tr>';
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

  // 點「查看結果」→ 載入單一活動詳細
  async function handleViewResults(eventId, ev, triggerBtn) {
    // 每次點擊都遞增請求編號，僅最後一次點擊的請求可以更新畫面
    latestViewResultsRequestId += 1;
    const requestId = latestViewResultsRequestId;

    // 只讓「最後一個被點擊」的按鈕顯示載入動畫，其餘立即關閉
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

    // 若在等待過程中已經有更新的請求出現，這個舊請求就直接停止（不再動畫面）
    if (requestId !== latestViewResultsRequestId) {
      return;
    }

    // 預先清空畫面（只會在「目前仍是最後一次點擊」的情況下執行）
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
    // 這裡只是暫時佔位，不需要精準符合 hasBus 狀態，直接使用目前表頭的總欄數 9
    eventDetailTbody.innerHTML = '<tr><td colspan="9" class="muted">載入中…</td></tr>';
    signatureViewer.classList.add('hidden');
    setHidden(eventDetailSection, false);

    try {
      const data = await getAdminEventDetailCached(session.adminToken, eventId, { ttlMs: 60 * 1000 });

      // 回來時再次確認：若這時已經有更新的點擊，就忽略這次結果
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
      if (ddlStr) {
        const ddlDisplay = formatDeadlineDisplay(ddlStr);
        metaParts.push(`截止：${ddlDisplay}`);
      }
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

      // ✅ 判斷這個活動是否有遊覽車欄位（只要有任一回覆帶 goBus/backBus 即為 true）
      const hasBusFields = replied.some(row => {
        try {
          const ans = safeParseAnswer(row.answer);
          return !!(ans.goBus || ans.backBus);
        } catch (e) {
          return false;
        }
      });

      // 統計文字
      eventDetailStats.textContent =
        `總人數：${total}　已回覆：${repliedCount}　未回覆：${notRepliedCount}　回覆率：${replyRate}`;

      // 儲存明細資料，交給 renderEventDetailTables 處理（含未回覆名單 + 是否顯示搭車欄位）
      currentEventDetailData = { replied, notReplied, hasBusFields };
      buildClassFilterButtons(currentEventDetailData);
      syncDetailControlsUI();
      renderEventDetailTables();
    } catch (err) {
      // 發生錯誤時，也只在這仍是最後一次點擊的情況下更新畫面
      if (requestId === latestViewResultsRequestId) {
        console.error(err);
        showToast('載入活動詳細失敗（網路或系統錯誤）');
        eventDetailStats.textContent = '載入失敗。';
      }
    } finally {
      // 只有當這個請求仍是最後一次點擊時，才結束按鈕載入狀態
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
    // 已改為表格列內展開顯示，保留此函式避免舊程式呼叫出錯。
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