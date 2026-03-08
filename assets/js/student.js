const FORM_DEFINITIONS = {
  default: {
    title: '活動回覆',
    fields: [
      {
        id: 'attend',
        label: '是否參加本次活動？',
        type: 'radio',
        options: ['參加', '不參加']
      },
      {
        id: 'note',
        label: '備註（若有需要可填寫）',
        type: 'textarea',
        placeholder: '例如：接送安排、身體狀況、其他補充說明'
      }
    ]
  },

  '20250301-consent': {
    title: '家長同意書',
    fields: [
      {
        id: 'content',
        type: 'textblock',
        value: '請詳閱活動內容與注意事項，確認後再勾選同意並完成簽名。'
      },
      {
        id: 'agree',
        type: 'checkbox',
        label: '我已閱讀並同意上述內容'
      },
      {
        id: 'parentName',
        type: 'text',
        label: '家長姓名',
        placeholder: '請輸入家長姓名'
      },
      {
        id: 'signature',
        type: 'signature',
        label: '家長簽名'
      }
    ]
  },

  '20260321a-parent-attendance': {
    title: '家長出席統計',
    appendDefaultParentNote: false,
    fields: [
      {
        id: 'parentAttendance',
        label: '家長是否出席',
        type: 'radio',
        variant: 'reply-consent',
        optionsAlign: 'left',
        required: true,
        options: ['出席', '不出席']
      },
      {
        id: 'attendeeCount',
        label: '出席人數',
        type: 'select',
        required: true,
        options: ['1', '2', '3', '4']
      },
      {
        id: 'seatNote',
        label: '備註',
        type: 'textarea',
        placeholder: '若需備註請於此填寫'
      },
      {
        id: 'parentSignature',
        label: '家長簽名',
        type: 'signature',
        required: true
      }
    ]
  },

  '20260321b-parent-attendance': {
    title: '家長出席統計',
    appendDefaultParentNote: false,
    fields: [
      {
        id: 'parentAttendance',
        label: '家長是否出席',
        type: 'radio',
        variant: 'reply-consent',
        optionsAlign: 'left',
        required: true,
        options: ['出席', '不出席']
      },
      {
        id: 'attendeeCount',
        label: '出席人數',
        type: 'select',
        required: true,
        options: ['1', '2', '3', '4']
      },
      {
        id: 'seatNote',
        label: '備註',
        type: 'textarea',
        placeholder: '若需備註請於此填寫'
      },
      {
        id: 'parentSignature',
        label: '家長簽名',
        type: 'signature',
        required: true
      }
    ]
  }

};

function getFormDefinition(ev) {
  const eventId = ev && ev.eventId ? String(ev.eventId) : '';
  return FORM_DEFINITIONS[eventId] || FORM_DEFINITIONS.default;
}

function isParentAttendanceEvent(ev) {
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return id.endsWith('-parent-attendance');
}

function isConsentEvent(ev){
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return id.endsWith('-consent');
}

  // 依據活動 ID 判斷是否為需要搭乘巴士的同意書活動，這裡列出所有相關活動 ID，未來如果有新增需要搭乘巴士的同意書活動，再將其 ID 加入此陣列即可
const BUS_TRIP_EVENT_IDS = ['20260307-consent', '20260307c-consent', '20260316a-consent', '20260316b-consent', '20260316c-consent'];

  // 依據活動 ID 判斷是否為家長出席統計活動，這裡列出所有相關活動 ID，未來如果有新增家長出席統計活動，再將其 ID 加入此陣列即可
const PARENT_BUS_EVENT_IDS = ['20260316a-consent', '20260316b-consent', '20260316c-consent'];

const EVENT_CUSTOM_DESCRIPTIONS = {
  // 依活動 ID 客製化補充說明，可自由調整文字與換行（使用 \n）
  // '20260321a-parent-attendance': '第一行說明\n第二行說明'
  '20260321a-parent-attendance': '1. 學期團務說明\n2. 6/18成果發表會工作分配\n3. 樂團現況更新',
  '20260321b-parent-attendance': '1. 學期團務說明\n2. 6/18成果發表會工作分配\n3. 樂團現況更新'
};

function formatDeadlineDisplay(deadlineStr) {
  const raw = (deadlineStr || '').toString().trim();
  if (!raw) return '';

  const dateMatch = raw.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!dateMatch) return raw;

  const y = dateMatch[1];
  const m = dateMatch[2].padStart(2, '0');
  const d = dateMatch[3].padStart(2, '0');

  const timeMatch = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let hh = '23';
  let mm = '59';
  let ss = '59';
  if (timeMatch) {
    hh = String(timeMatch[1]).padStart(2, '0');
    mm = String(timeMatch[2]).padStart(2, '0');
    ss = String(timeMatch[3] || '00').padStart(2, '0');
  }

  return `${y}-${m}-${d} | ${hh}:${mm}:${ss}`;
}
function isParentBusEvent(ev){
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return PARENT_BUS_EVENT_IDS.includes(id);
}

function isBusTripEvent(ev){
  if (!ev || !ev.eventId) return false;
  const id = String(ev.eventId || '');
  return BUS_TRIP_EVENT_IDS.includes(id);
}

let _eventsCache = [];
let _latestCache = [];
let _currentEvent = null;
let _rosterByClass = {}; // { className: [ '摮貊?A', '摮貊?B', ... ] }

const SIGNATURE_WIDTH = 960;
const SIGNATURE_HEIGHT = 540;


const SIGNATURE_EXPORT_WIDTH = 480;
const SIGNATURE_EXPORT_HEIGHT = 270;

function initSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  let isEmpty = true;

  function resize() {
    const ratio = window.devicePixelRatio || 1;

    canvas.width = SIGNATURE_WIDTH * ratio;
    canvas.height = SIGNATURE_HEIGHT * ratio;

    canvas.style.width = '100%';
    canvas.style.height = '100%';

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
  }

  function getPos(evt) {
    const rect = canvas.getBoundingClientClientRect ? canvas.getBoundingClientRect() : canvas.getBoundingClientRect();
    const hasTouch = evt.touches && evt.touches.length > 0;
    const point = hasTouch ? evt.touches[0] : evt;

    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;

    const scaleX = rect.width ? (SIGNATURE_WIDTH / rect.width) : 1;
    const scaleY = rect.height ? (SIGNATURE_HEIGHT / rect.height) : 1;

    return {
      x: x * scaleX,
      y: y * scaleY
    };
  }

  function startDraw(evt) {
    drawing = true;
    const pos = getPos(evt);
    lastX = pos.x;
    lastY = pos.y;
  }

  function draw(evt) {
    if (!drawing) return;
    const pos = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
    isEmpty = false;
  }

  function endDraw() {
    drawing = false;
  }

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDraw(e);
  });
  canvas.addEventListener('mousemove', (e) => {
    e.preventDefault();
    draw(e);
  });
  window.addEventListener('mouseup', () => {
    endDraw();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDraw(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    endDraw();
  }, { passive: false });

  resize();
  window.addEventListener('resize', () => {
    resize();
  });

  function clear() {
    isEmpty = true;
    resize();
  }

  function getDataURL() {
    if (isEmpty) return '';

    const tmp = document.createElement('canvas');
    tmp.width = SIGNATURE_EXPORT_WIDTH;
    tmp.height = SIGNATURE_EXPORT_HEIGHT;
    const tctx = tmp.getContext('2d');

    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);
    tctx.drawImage(canvas, 0, 0, SIGNATURE_EXPORT_WIDTH, SIGNATURE_EXPORT_HEIGHT);

    let quality = 0.8;
    let dataUrl = tmp.toDataURL('image/jpeg', quality);

    while (dataUrl.length > 350000 && quality > 0.4) {
      quality -= 0.1;
      dataUrl = tmp.toDataURL('image/jpeg', quality);
    }

    return dataUrl;
  }

  return {
    clear,
    getDataURL,
    resize
  };
}



function buildDrivePreviewUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';

  if (trimmed.includes('/preview')) {
    return trimmed;
  }

  const fileMatch = trimmed.match(/\/file\/d\/([^/]+)\//);
  if (fileMatch && fileMatch[1]) {
    return 'https://drive.google.com/file/d/' + fileMatch[1] + '/preview';
  }

  const idMatch = trimmed.match(/[?&]id=([^&]+)/);
  if (idMatch && idMatch[1]) {
    return 'https://drive.google.com/file/d/' + idMatch[1] + '/preview';
  }

  return trimmed;
}


document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('login-section');
  const studentSection = document.getElementById('student-section');

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

  const classSelect = document.getElementById('class-select');
  const nameSelect = document.getElementById('name-select');

  const studentNameEl = document.getElementById('student-name');
  const studentClassEl = document.getElementById('student-class');
  const logoutBtn = document.getElementById('logout-btn');

  const eventsListEl = document.getElementById('events-list');
  const eventsEmptyEl = document.getElementById('events-empty');

  const eventDetailSection = document.getElementById('event-detail-section');
  const backToEventsBtn = document.getElementById('back-to-events-btn');
  const eventTitleEl = document.getElementById('event-title');
  const eventMetaEl = document.getElementById('event-meta');
  const eventDescEl = document.getElementById('event-desc');
  const eventCustomDescEl = document.getElementById('event-custom-desc');
  const eventDeadlineInfoEl = document.getElementById('event-deadline-info');
  const eventFormContainer = document.getElementById('event-form-container');
  const eventStatusMessageEl = document.getElementById('event-status-message');

  const adminEntryLink = document.querySelector('.admin-entry-link');
  if (adminEntryLink) {
    adminEntryLink.addEventListener('click', (e) => {
      e.preventDefault();
      try { clearAdminSession(); } catch (_) {}
      window.location.href = 'admin.html';
    });
  }

  function renderLoggedInView(student) {
    studentNameEl.textContent = student.name;
    studentClassEl.textContent = student.class;
    setHidden(loginSection, true);
    setHidden(studentSection, false);
  }

  function renderLoggedOutView() {
    setHidden(studentSection, true);
    setHidden(loginSection, false);
  }

  function buildClassOptions() {
    classSelect.innerHTML = '';
    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = '請選擇班級';
    classSelect.appendChild(optPlaceholder);

    const classes = Object.keys(_rosterByClass).sort();
    classes.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls;
      opt.textContent = cls;
      classSelect.appendChild(opt);
    });

    classSelect.disabled = false;
  }

  function buildNameOptions(cls, preselectName) {
    nameSelect.innerHTML = '';
    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = cls ? '請選擇姓名' : '請先選擇班級';
    nameSelect.appendChild(optPlaceholder);

    if (!cls || !_rosterByClass[cls] || !_rosterByClass[cls].length) {
      nameSelect.disabled = true;
      return;
    }

    const names = Array.from(new Set(_rosterByClass[cls])).sort();
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (preselectName && preselectName === n) {
        opt.selected = true;
      }
      nameSelect.appendChild(opt);
    });
    nameSelect.disabled = false;
  }

  classSelect.addEventListener('change', () => {
    const cls = classSelect.value;
    buildNameOptions(cls, null);
  });

  async function loadRosterAndBuildSelects() {
    try {
      const res = await getRoster();
      if (!res.ok) throw new Error(res.error || 'roster error');
      const roster = res.roster || [];

      _rosterByClass = {};
      roster.forEach(r => {
        const cls = String(r.class || '').trim();
        const name = String(r.name || '').trim();
        if (!cls || !name) return;
        if (!_rosterByClass[cls]) _rosterByClass[cls] = [];
        _rosterByClass[cls].push(name);
      });

      buildClassOptions();

    } catch (err) {
      console.error(err);
      classSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '班級資料載入失敗，請重新整理';
      classSelect.appendChild(opt);
      classSelect.disabled = true;
      nameSelect.innerHTML = '';
      const opt2 = document.createElement('option');
      opt2.value = '';
      opt2.textContent = '請先載入班級資料';
      nameSelect.appendChild(opt2);
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginError.classList.add('hidden');

    const cls = classSelect.value;
    const name = nameSelect.value;
    const pin = (new FormData(loginForm).get('pin') || '').toString().trim();

    if (!cls || !name || !pin) {
      loginError.textContent = '請選擇班級、姓名並輸入 PIN 碼';
      loginError.classList.remove('hidden');
      return;
    }

    if (typeof setButtonLoading === 'function' && loginSubmitBtn) {
      setButtonLoading(loginSubmitBtn, true);
    }

    try {
      const res = await authStudent(cls, name, pin);
      if (!res.ok) {
        if (res.error === 'INVALID_CREDENTIALS') {
          loginError.textContent = 'PIN 碼錯誤';
        } else if (res.error === 'NOT_FOUND_OR_DISABLED') {
          loginError.textContent = '查無此學生，或帳號目前未開放登入';
        } else {
          loginError.textContent = '登入失敗：' + (res.error || '未知錯誤');
        }
        loginError.classList.remove('hidden');
        return;
      }
      saveStudentSession(res.class, res.name);
      renderLoggedInView({ class: res.class, name: res.name });
      showToast('登入成功');
      refreshEventsAndLatest();
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
    clearStudentSession();
    _eventsCache = [];
    _latestCache = [];
    _currentEvent = null;
    eventsListEl.innerHTML = '';
    setHidden(eventDetailSection, true);

    if (loginForm) {
      loginForm.reset();
    }
    buildClassOptions();
    buildNameOptions('', null);

    showToast('已登出');
  });

  backToEventsBtn.addEventListener('click', () => {
    setHidden(eventDetailSection, true);
    const card = eventsListEl.closest('.card');
    if (card) {
      setHidden(card, false);
    }
    _currentEvent = null;
  });

  async function refreshEventsAndLatest() {
    const session = getStudentSession();
    if (!session) return;

    try {
      const [evRes, latestRes] = await Promise.all([
        getEvents(session.class, session.name),
        getStudentLatestAll(session.class, session.name)
      ]);

      if (!evRes.ok) throw new Error(evRes.error || 'events error');
      if (!latestRes.ok) throw new Error(latestRes.error || 'latest error');

      _eventsCache = evRes.events || [];
      _latestCache = latestRes.latest || [];

      renderEventsList();
    } catch (err) {
      console.error(err);
      showToast('載入活動資料失敗');
    }
  }

  function findLatestForEvent(eventId) {
    return _latestCache.find(r => String(r.eventId) === String(eventId)) || null;
  }

  function renderEventsList() {
    eventsListEl.innerHTML = '';
    if (!_eventsCache.length) {
      eventsEmptyEl.classList.remove('hidden');
      return;
    }
    eventsEmptyEl.classList.add('hidden');

    _eventsCache.forEach(ev => {
      const latest = findLatestForEvent(ev.eventId);
      const hasReplied = !!latest;

      const card = document.createElement('div');
      card.className = 'event-card';

      const title = document.createElement('div');
      title.className = 'event-title';
      title.textContent = ev.title || ev.eventId;
      card.appendChild(title);

      const metaLine = document.createElement('div');
      metaLine.className = 'event-meta-line';
      const dateText = ev.date || ev.startAt || '';
      const placeText = ev.place || '';
      metaLine.textContent = [dateText, placeText].filter(Boolean).join('｜');
      card.appendChild(metaLine);

      const footer = document.createElement('div');
      footer.className = 'event-card-footer';

      const statusChip = document.createElement('span');
      statusChip.className = 'event-status-chip ' + (hasReplied ? 'done' : 'pending');
      statusChip.textContent = hasReplied ? '已回覆' : '待回覆';

      const btn = document.createElement('button');
      btn.className = 'btn primary small';
      btn.textContent = hasReplied ? '查看 / 修改' : '前往填寫';
      btn.addEventListener('click', () => openEventDetail(ev.eventId, btn));

      footer.appendChild(statusChip);
      footer.appendChild(btn);
      card.appendChild(footer);

      eventsListEl.appendChild(card);
    });
  }

  async function openEventDetail(eventId, triggerBtn) {
    const session = getStudentSession();
    if (!session) {
      showToast('請先登入');
      return;
    }

    if (typeof setButtonLoading === 'function' && triggerBtn) {
      setButtonLoading(triggerBtn, true);
    }

    try {
      const res = await getEvent(eventId);
      if (!res.ok) {
        showToast('找不到活動資料');
        return;
      }
      const ev = res.event;
      _currentEvent = ev;

      eventTitleEl.textContent = ev.title || ev.eventId;
      eventMetaEl.textContent = [ev.date || ev.startAt || '', ev.place || ''].filter(Boolean).join('｜');
      eventDescEl.textContent = ev.statDescription || '';
      if (eventCustomDescEl) {
        const customDesc = EVENT_CUSTOM_DESCRIPTIONS[ev.eventId] || '';
        eventCustomDescEl.textContent = customDesc;
        eventCustomDescEl.classList.toggle('hidden', !customDesc);
      }

      if (ev.deadline) {
        const ddlDisplay = formatDeadlineDisplay(ev.deadline);
        eventDeadlineInfoEl.textContent = '回覆截止：' + ddlDisplay;
      } else {
        eventDeadlineInfoEl.textContent = '';
      }

      eventFormContainer.innerHTML = '';

      const rawPdfUrl = (ev.pdfUrl || '').toString().trim();
      if (rawPdfUrl) {
        const pdfWrapper = document.createElement('div');
        pdfWrapper.className = 'event-pdf-wrapper';

        const iframe = document.createElement('iframe');
        iframe.className = 'event-pdf-frame';
        iframe.src = buildDrivePreviewUrl(rawPdfUrl);
        iframe.width = '100%';
        iframe.height = (window.innerWidth && window.innerWidth < 640) ? '420' : '520';
        iframe.style.border = 'none';
        iframe.setAttribute('allow', 'autoplay');
        iframe.setAttribute('loading', 'lazy');

        pdfWrapper.appendChild(iframe);
        eventFormContainer.appendChild(pdfWrapper);
      }

      const def = getFormDefinition(ev);
      const latest = findLatestForEvent(ev.eventId);
      let existingAnswer = {};
      if (latest && latest.answer) {
        try {
          existingAnswer = JSON.parse(latest.answer);
        } catch (_) {}
      }

      buildEventForm(def, existingAnswer, ev);

      const eventsCard = eventsListEl.closest('.card');
      if (eventsCard) {
        setHidden(eventsCard, true);
      }
      setHidden(eventDetailSection, false);
      eventStatusMessageEl.textContent = '';
    } catch (err) {
      console.error(err);
      showToast('開啟活動失敗');
    } finally {
      if (typeof setButtonLoading === 'function' && triggerBtn) {
        setButtonLoading(triggerBtn, false);
      }
    }
  }

  function buildEventForm(def, existingAnswer, ev) {

    const form = document.createElement('form');
    form.className = 'form dynamic-form';

    const isConsent = isConsentEvent(ev);
    const isBusTripConsent = isConsent && isBusTripEvent(ev);
    const isParentAttendance = isParentAttendanceEvent(ev);
    const includeDefaultParentNote = def.appendDefaultParentNote !== false;

    const signatureStates = {};

    (def.fields || []).forEach(field => {
      if (isConsent && field.type !== 'textblock') {
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'form-field';
      wrapper.classList.add(field.width === 'half' ? 'form-field-half' : 'form-field-full');
      if (field.className) {
        String(field.className).split(/\s+/).filter(Boolean).forEach(cls => wrapper.classList.add(cls));
      }

      if (field.type === 'heading') {
        const heading = document.createElement('div');
        heading.className = 'form-heading';
        heading.textContent = field.label || '';
        wrapper.appendChild(heading);
        form.appendChild(wrapper);
        return;
      }

      if (field.type === 'divider') {
        const divider = document.createElement('div');
        divider.className = 'form-divider';
        wrapper.appendChild(divider);
        form.appendChild(wrapper);
        return;
      }

      if (field.type === 'textblock') {
        if (field.label) {
          const title = document.createElement('div');
          title.className = 'form-field-title';
          title.textContent = field.label;
          wrapper.appendChild(title);
        }
        const text = document.createElement('div');
        text.className = 'textblock';
        if (field.variant) {
          text.classList.add('textblock-' + field.variant);
        }
        text.textContent = field.value || '';
        wrapper.appendChild(text);
        form.appendChild(wrapper);
        return;
      }

      const label = document.createElement('label');
      label.className = 'form-field-label';
      label.textContent = field.label || '';
      wrapper.appendChild(label);

      if (field.description) {
        const description = document.createElement('div');
        description.className = 'form-field-description';
        description.textContent = field.description;
        wrapper.appendChild(description);
      }

      if (field.type === 'radio') {
        const opts = document.createElement('div');
        const useConsentStyle = field.variant === 'reply-consent';
        opts.className = useConsentStyle ? 'reply-consent-options' : 'options';
        if (useConsentStyle && field.optionsAlign === 'left') {
          opts.classList.add('reply-consent-options-left');
        }
        if (field.variant === 'choice-chips' && !useConsentStyle) {
          opts.classList.add('options-choice-chips');
        }

        const current = (existingAnswer && existingAnswer[field.id]) || '';

        (field.options || []).forEach(opt => {
          const optLabel = document.createElement('label');
          if (useConsentStyle) {
            optLabel.className = 'reply-consent-option';
          } else if (field.variant === 'choice-chips') {
            optLabel.className = 'option-chip';
          }
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = field.id;
          input.value = opt;
          if (opt === current) input.checked = true;
          optLabel.appendChild(input);
          if (useConsentStyle) {
            const span = document.createElement('span');
            span.className = 'reply-consent-label';
            span.textContent = opt;
            optLabel.appendChild(span);
          } else {
            optLabel.appendChild(document.createTextNode(' ' + opt));
          }
          opts.appendChild(optLabel);
        });

        wrapper.appendChild(opts);
      } else if (field.type === 'checkbox') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = field.id;

        const current = existingAnswer && existingAnswer[field.id];
        if (current === true || current === 'true' || current === 'on') {
          input.checked = true;
        }

        const checkboxLabel = document.createElement('label');
        checkboxLabel.appendChild(input);
        const text = field.checkboxLabel || field.label || '';
        if (text) {
          checkboxLabel.appendChild(document.createTextNode(' ' + text));
        }
        wrapper.innerHTML = '';
        wrapper.appendChild(checkboxLabel);
      } else if (field.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.name = field.id;
        textarea.className = 'form-input';
        textarea.placeholder = field.placeholder || '';
        textarea.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(textarea);
      } else if (field.type === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.id;
        input.className = 'form-input';
        input.placeholder = field.placeholder || '';
        input.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(input);
      } else if (field.type === 'select') {
        const select = document.createElement('select');
        select.name = field.id;
        select.className = 'form-input';

        const current = (existingAnswer && existingAnswer[field.id]) || '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = field.placeholder || '請選擇';
        select.appendChild(placeholder);

        (field.options || []).forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (String(current) === String(opt)) {
            option.selected = true;
          }
          select.appendChild(option);
        });

        wrapper.appendChild(select);
      } else if (field.type === 'signature') {
        const existingDataUrl = (existingAnswer && existingAnswer[field.id]) || '';

        const container = document.createElement('div');
        container.className = 'signature-container';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn secondary small';
        openBtn.textContent = existingDataUrl ? '?蝪賢?' : '暺?蝪賢?';

        const preview = document.createElement('div');
        preview.className = 'signature-preview';
        const img = document.createElement('img');
        preview.appendChild(img);

        container.appendChild(openBtn);
        container.appendChild(preview);
        wrapper.appendChild(container);

        const modal = document.createElement('div');
        modal.className = 'signature-modal';

        const modalContent = document.createElement('div');
        modalContent.className = 'signature-modal-content';

        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'signature-canvas-wrapper';

        const canvas = document.createElement('canvas');
        canvas.className = 'signature-canvas';
        canvasWrapper.appendChild(canvas);
        modalContent.appendChild(canvasWrapper);

        const footer = document.createElement('div');
        footer.className = 'signature-modal-footer';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn secondary small';
        resetBtn.textContent = '↻';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn secondary small';
        cancelBtn.textContent = 'X';

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'btn primary small';
        okBtn.textContent = 'O';

        footer.appendChild(resetBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        modalContent.appendChild(footer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        const pad = initSignaturePad(canvas);

        const state = {
          value: existingDataUrl || '',
          pad,
          modal,
          modalContent,
          canvasWrapper,
          openBtn,
          preview,
          img
        };
        signatureStates[field.id] = state;

        function updatePreview() {
          if (state.value) {
            state.img.src = state.value;
            state.preview.classList.remove('hidden');
            state.openBtn.textContent = '重新簽名';
          } else {
            state.img.src = '';
            state.preview.classList.add('hidden');
            state.openBtn.textContent = '開始簽名';
          }
          state.openBtn.disabled = false;
        }

        function openModal() {
          state.modal.classList.add('active');
          state.openBtn.disabled = true;
          state.pad.clear();
          requestAnimationFrame(() => {
            state.pad.resize();
          });
        }

        function closeModal() {
          state.modal.classList.remove('active');
          state.openBtn.disabled = false;
        }

        updatePreview();

        openBtn.addEventListener('click', () => {
          openModal();
        });

        cancelBtn.addEventListener('click', () => {
          closeModal();
        });

        okBtn.addEventListener('click', () => {
          const dataUrl = state.pad.getDataURL();
          if (!dataUrl) {
            showToast('請先完成簽名');
            return;
          }
          state.value = dataUrl;
          updatePreview();
          closeModal();
        });

        resetBtn.addEventListener('click', () => {
          state.pad.clear();
        });

      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.id;
        input.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(input);
      }

      form.appendChild(wrapper);
    });

    if (isParentAttendance) {
      const attendanceInputs = form.querySelectorAll('input[name="parentAttendance"]');
      const countField = form.querySelector('[name="attendeeCount"]');
      const countWrapper = countField ? countField.closest('.form-field') : null;

      function syncParentAttendanceFields() {
        const checked = form.querySelector('input[name="parentAttendance"]:checked');
        const attending = checked && checked.value === '出席';
        if (!countWrapper || !countField) return;
        countWrapper.style.display = attending ? '' : 'none';
        if (!attending) {
          countField.value = '';
        }
      }

      attendanceInputs.forEach(input => {
        input.addEventListener('change', syncParentAttendanceFields);
      });
      syncParentAttendanceFields();
    }

    if (isConsent) {
      const consentSection = document.createElement('section');
      consentSection.className = 'reply-section';

      const questionP = document.createElement('p');
      questionP.className = 'reply-question';

      const session = getStudentSession();
      const studentName = session && session.name ? session.name : '';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'reply-question-name';
      nameSpan.textContent = studentName;

      questionP.append('是否同意 ');
      questionP.appendChild(nameSpan);
      questionP.append(' 參加本次活動？');
      consentSection.appendChild(questionP);

      const optionsDiv = document.createElement('div');
      optionsDiv.className = 'reply-consent-options';

      const currentConsent = existingAnswer && existingAnswer.consentChoice;

      ['同意', '不同意'].forEach(val => {
        const optLabel = document.createElement('label');
        optLabel.className = 'reply-consent-option';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'consentChoice';
        input.value = val;
        if (currentConsent === val) {
          input.checked = true;
        }

        const span = document.createElement('span');
        span.className = 'reply-consent-label';
        span.textContent = val;

        optLabel.appendChild(input);
        optLabel.appendChild(span);
        optionsDiv.appendChild(optLabel);
      });

      consentSection.appendChild(optionsDiv);

      if (isBusTripConsent) {
        const existingGoBus = existingAnswer && existingAnswer.goBus;
        const existingBackBus = existingAnswer && existingAnswer.backBus;

        const goWrapper = document.createElement('div');
        goWrapper.className = 'reply-bus-field';

        const goLabel = document.createElement('div');
        goLabel.className = 'reply-bus-label';
        goLabel.textContent = '學生去程是否搭車';
        goWrapper.appendChild(goLabel);

        const goOptions = document.createElement('div');
        goOptions.className = 'reply-consent-options';

        ['是', '否'].forEach(val => {
          const optLabel = document.createElement('label');
          optLabel.className = 'reply-consent-option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'goBus';
          input.value = val;
          if (existingGoBus === val) {
            input.checked = true;
          }

          const span = document.createElement('span');
          span.className = 'reply-consent-label';
          span.textContent = val;

          optLabel.appendChild(input);
          optLabel.appendChild(span);
          goOptions.appendChild(optLabel);
        });

        goWrapper.appendChild(goOptions);
        consentSection.appendChild(goWrapper);

        const backWrapper = document.createElement('div');
        backWrapper.className = 'reply-bus-field';

        const backLabel = document.createElement('div');
        backLabel.className = 'reply-bus-label';
        backLabel.textContent = '學生回程是否搭車';
        backWrapper.appendChild(backLabel);

        const backOptions = document.createElement('div');
        backOptions.className = 'reply-consent-options';

        ['是', '否'].forEach(val => {
          const optLabel = document.createElement('label');
          optLabel.className = 'reply-consent-option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'backBus';
          input.value = val;
          if (existingBackBus === val) {
            input.checked = true;
          }

          const span = document.createElement('span');
          span.className = 'reply-consent-label';
          span.textContent = val;

          optLabel.appendChild(input);
          optLabel.appendChild(span);
          backOptions.appendChild(optLabel);
        });

        backWrapper.appendChild(backOptions);
        consentSection.appendChild(backWrapper);
      }

      
      const showParentBus = isConsent && isParentBusEvent(ev);
      if (showParentBus) {
        const existingParentBus = existingAnswer && existingAnswer.parentBus;
        const existingParentCount = existingAnswer && existingAnswer.parentBusCount;

        const parentWrapper = document.createElement('div');
        parentWrapper.className = 'reply-bus-field';

        const parentLabel = document.createElement('div');
        parentLabel.className = 'reply-bus-label';
        parentLabel.textContent = '家長是否搭車';
        parentWrapper.appendChild(parentLabel);

        const parentOptions = document.createElement('div');
        parentOptions.className = 'reply-consent-options';

        ['是', '否'].forEach(val => {
          const optLabel = document.createElement('label');
          optLabel.className = 'reply-consent-option';

          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'parentBus';
          input.value = val;
          if (existingParentBus === val) input.checked = true;

          const span = document.createElement('span');
          span.className = 'reply-consent-label';
          span.textContent = val;

          optLabel.appendChild(input);
          optLabel.appendChild(span);
          parentOptions.appendChild(optLabel);
        });

        parentWrapper.appendChild(parentOptions);

        const countWrapper = document.createElement('div');
        countWrapper.className = 'reply-bus-field';
        countWrapper.style.display = existingParentBus === '是' ? '' : 'none';

        const countLabel = document.createElement('div');
        countLabel.className = 'reply-bus-label';
        countLabel.textContent = '搭車人數（1-5）';

        const countInput = document.createElement('select');
        countInput.name = 'parentBusCount';
        countInput.className = 'reply-parent-count-input';

        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '請選擇';
        countInput.appendChild(emptyOpt);

        for (let i = 1; i <= 5; i++) {
          const opt = document.createElement('option');
          opt.value = String(i);
          opt.textContent = String(i);
          if (String(existingParentCount || '') === String(i)) {
            opt.selected = true;
          }
          countInput.appendChild(opt);
        }

        countWrapper.appendChild(countLabel);
        countWrapper.appendChild(countInput);

        parentWrapper.appendChild(countWrapper);
        consentSection.appendChild(parentWrapper);

        parentOptions.querySelectorAll('input[name="parentBus"]').forEach(r => {
          r.addEventListener('change', () => {
            if (r.value === '是' && r.checked) {
              countWrapper.style.display = '';
            } else if (r.value === '否' && r.checked) {
              countWrapper.style.display = 'none';
              countInput.value = '';
            }
          });
        });
      }

      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'reply-note-wrapper';

      const noteLabel = document.createElement('label');
      noteLabel.className = 'reply-note-label';
      noteLabel.textContent = '家長備註（限 50 字）';

      const noteTextarea = document.createElement('textarea');
      noteTextarea.name = 'parentNote';
      noteTextarea.className = 'reply-note-textarea';
      noteTextarea.rows = 2;
      noteTextarea.maxLength = 50;
      noteTextarea.placeholder = '若有需要補充說明，請填寫在此';
      noteTextarea.value = (existingAnswer && existingAnswer.parentNote) || '';

      noteWrapper.appendChild(noteLabel);
      noteWrapper.appendChild(noteTextarea);
      consentSection.appendChild(noteWrapper);

      const sigWrapper = document.createElement('div');
      sigWrapper.className = 'reply-signature-field';

      const sigLabel = document.createElement('div');
      sigLabel.textContent = '家長簽名';
      sigWrapper.appendChild(sigLabel);

      const container = document.createElement('div');
      container.className = 'signature-container';

      const existingSig = existingAnswer && (existingAnswer.parentSignature || existingAnswer.signature || '');

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn secondary small';
      openBtn.textContent = existingSig ? '重新簽名' : '開始簽名';

      const preview = document.createElement('div');
      preview.className = 'signature-preview';
      const img = document.createElement('img');
      preview.appendChild(img);

      container.appendChild(openBtn);
      container.appendChild(preview);
      sigWrapper.appendChild(container);
      consentSection.appendChild(sigWrapper);

      const modal = document.createElement('div');
      modal.className = 'signature-modal';

      const modalContent = document.createElement('div');
      modalContent.className = 'signature-modal-content';

      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'signature-canvas-wrapper';

      const canvas = document.createElement('canvas');
      canvas.className = 'signature-canvas';
      canvasWrapper.appendChild(canvas);
      modalContent.appendChild(canvasWrapper);

      const footer = document.createElement('div');
      footer.className = 'signature-modal-footer';

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn secondary small';
      resetBtn.textContent = '↻';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn secondary small';
      cancelBtn.textContent = 'X';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'btn primary small';
      okBtn.textContent = 'O';

      footer.appendChild(resetBtn);
      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);
      modalContent.appendChild(footer);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      const pad = initSignaturePad(canvas);

      const state = {
        value: existingSig || '',
        pad,
        modal,
        modalContent,
        canvasWrapper,
        openBtn,
        preview,
        img
      };
      signatureStates['consentSignature'] = state;

      function updatePreview() {
        if (state.value) {
          state.img.src = state.value;
          state.preview.classList.remove('hidden');
          state.openBtn.textContent = '重新簽名';
        } else {
          state.img.src = '';
          state.preview.classList.add('hidden');
          state.openBtn.textContent = '開始簽名';
        }
        state.openBtn.disabled = false;
      }

      function openModal() {
        state.modal.classList.add('active');
        state.openBtn.disabled = true;
        state.pad.clear();
        requestAnimationFrame(() => {
          state.pad.resize();
        });
      }

      function closeModal() {
        state.modal.classList.remove('active');
        state.openBtn.disabled = false;
      }

      updatePreview();

      openBtn.addEventListener('click', () => {
        openModal();
      });

      cancelBtn.addEventListener('click', () => {
        closeModal();
      });

      okBtn.addEventListener('click', () => {
        const dataUrl = state.pad.getDataURL();
        if (!dataUrl) {
          showToast('請先完成簽名');
          return;
        }
        state.value = dataUrl;
        updatePreview();
        closeModal();
      });

      resetBtn.addEventListener('click', () => {
        state.pad.clear();
      });

      form.appendChild(consentSection);
    } else if (includeDefaultParentNote) {
      const noteWrapper = document.createElement('div');
      noteWrapper.className = 'form-field';

      const noteLabel = document.createElement('label');
      noteLabel.textContent = '家長備註（限 50 字）';

      const noteTextarea = document.createElement('textarea');
      noteTextarea.name = 'parentNote';
      noteTextarea.rows = 2;
      noteTextarea.maxLength = 50;
      noteTextarea.placeholder = '若有需要補充說明，請填寫在此';
      noteTextarea.value = (existingAnswer && existingAnswer.parentNote) || '';

      noteWrapper.appendChild(noteLabel);
      noteWrapper.appendChild(noteTextarea);
      form.appendChild(noteWrapper);
    }

    const btnRow = document.createElement('div');
    btnRow.className = 'form-submit-row';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn primary';
    submitBtn.textContent = '送出回覆';
    btnRow.appendChild(submitBtn);
    form.appendChild(btnRow);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const session = getStudentSession();
      if (!session) {
        showToast('請先登入');
        return;
      }

      const answerObj = {};
      (def.fields || []).forEach(field => {
        if (field.type === 'radio') {
          const checked = form.querySelector(`input[name="${field.id}"]:checked`);
          answerObj[field.id] = checked ? checked.value : '';
        } else if (field.type === 'checkbox') {
          const el = form.querySelector(`input[name="${field.id}"]`);
          answerObj[field.id] = !!(el && el.checked);
        } else if (field.type === 'textarea' || field.type === 'text' || field.type === 'select') {
          const el = form.querySelector(`[name="${field.id}"]`);
          answerObj[field.id] = el ? el.value : '';
        } else if (field.type === 'signature') {
          const state = signatureStates[field.id];
          answerObj[field.id] = state ? state.value : '';
        }
      });

      const noteEl = includeDefaultParentNote ? form.querySelector('textarea[name="parentNote"]') : null;
      if (noteEl) {
        let txt = noteEl.value || '';
        if (txt.length > 50) {
          txt = txt.slice(0, 50);
        }
        answerObj.parentNote = txt;
      }

      for (const field of (def.fields || [])) {
        if (!field.required || !field.id) continue;

        if (isParentAttendance && field.id === 'attendeeCount') {
          const attendanceValue = answerObj.parentAttendance || '';
          if (attendanceValue !== '出席') {
            answerObj.attendeeCount = '';
            continue;
          }
        }

        if (field.type === 'radio' || field.type === 'select' || field.type === 'text' || field.type === 'textarea') {
          const value = answerObj[field.id];
          if (value == null || String(value).trim() === '') {
            eventStatusMessageEl.textContent = `請填寫「${field.label || field.id}」`;
            return;
          }
        } else if (field.type === 'checkbox') {
          if (!answerObj[field.id]) {
            eventStatusMessageEl.textContent = `請勾選「${field.label || field.id}」`;
            return;
          }
        } else if (field.type === 'signature') {
          const state = signatureStates[field.id];
          if (!state || !state.value) {
            eventStatusMessageEl.textContent = `請完成「${field.label || field.id}」`;
            return;
          }
        }
      }

      if (isConsent) {
        const consentChecked = form.querySelector('input[name="consentChoice"]:checked');
        if (!consentChecked) {
          eventStatusMessageEl.textContent = '請選擇是否同意';
          return;
        }
        answerObj.consentChoice = consentChecked.value;

        if (isBusTripConsent) {
          const goChecked = form.querySelector('input[name="goBus"]:checked');
          const backChecked = form.querySelector('input[name="backBus"]:checked');

          if (!goChecked) {
            eventStatusMessageEl.textContent = '請選擇學生去程是否搭車';
            return;
          }
          if (!backChecked) {
            eventStatusMessageEl.textContent = '請選擇學生回程是否搭車';
            return;
          }

          answerObj.goBus = goChecked.value;
          answerObj.backBus = backChecked.value;
        }

        if (isParentBusEvent(ev)) {
          const parentBusChecked = form.querySelector('input[name="parentBus"]:checked');
          answerObj.parentBus = parentBusChecked ? parentBusChecked.value : '';

          const parentCountInput = form.querySelector('[name="parentBusCount"]');
          let countVal = parentCountInput ? parentCountInput.value : '';
          if (countVal !== '') {
            const num = parseInt(countVal, 10);
            if (!Number.isNaN(num)) {
              let clamped = num;
              if (clamped < 1) clamped = 1;
              if (clamped > 5) clamped = 5;
              answerObj.parentBusCount = clamped;
            } else {
              answerObj.parentBusCount = '';
            }
          } else {
            answerObj.parentBusCount = '';
          }
        }

        const sigState = signatureStates['consentSignature'];
        if (!sigState || !sigState.value) {
          eventStatusMessageEl.textContent = '請完成家長簽名';
          return;
        }
        answerObj.parentSignature = sigState.value;
      }

      const answerJsonString = JSON.stringify(answerObj || {});
      if (answerJsonString.length > 48000) {
        eventStatusMessageEl.textContent = '資料過大，請縮短內容或重新簽名後再試';
        console.warn('answerJson too long:', answerJsonString.length);
        return;
      }

      if (typeof setButtonLoading === 'function') {
        setButtonLoading(submitBtn, true);
      }

      try {
        const res = await postReply({
          eventId: ev.eventId,
          class: session.class,
          name: session.name,
          answer: answerObj
        });
        if (!res.ok) {
          if (res.error === 'DEADLINE_PASSED') {
            eventStatusMessageEl.textContent = '已超過截止時間，無法送出';
          } else {
            eventStatusMessageEl.textContent = '送出失敗：' + (res.error || '未知錯誤');
          }
          return;
        }
        eventStatusMessageEl.textContent = '送出成功，時間：' + res.ts;
        showToast('送出成功');
        await refreshEventsAndLatest();
      } catch (err) {
        console.error(err);
        eventStatusMessageEl.textContent = '送出失敗，請稍後再試';
      } finally {
        if (typeof setButtonLoading === 'function') {
          setButtonLoading(submitBtn, false);
        }
      }
    });

    eventFormContainer.appendChild(form);
  }

  const existingSession = getStudentSession();
  if (existingSession && existingSession.class && existingSession.name) {
    renderLoggedInView({
      class: existingSession.class,
      name: existingSession.name
    });
    refreshEventsAndLatest();
  } else {
    clearStudentSession();
    renderLoggedOutView();
  }

  loadRosterAndBuildSelects();
});
