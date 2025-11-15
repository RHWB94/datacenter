// Per-event form definitions.
// Key: eventId (from Config sheet), or "default" as fallback.
const FORM_DEFINITIONS = {
  default: {
    title: '活動回條',
    fields: [
      {
        id: 'attend',
        label: '是否參加本次活動？',
        type: 'radio',
        options: ['會參加', '不克前往']
      },
      {
        id: 'note',
        label: '備註（可不填）',
        type: 'textarea',
        placeholder: '如有特殊情況或家長留言，請在此說明'
      }
    ]
  },

  // 範例：家長同意書的專屬表單（請記得在 Config 中新增對應 eventId）
  '20250301-consent': {
    title: '家長線上同意書',
    fields: [
      {
        id: 'content',
        type: 'textblock',
        value: '這裡放同意書內文，可以很多行，系統會自動換行顯示。'
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
  }
  // 在此可針對特定 eventId 客製化，例如：
  // '20251015-camp': { ... }
};

let _eventsCache = [];
let _latestCache = [];
let _currentEvent = null;
let _rosterByClass = {}; // { className: [ '學生A', '學生B', ... ] }

// 簽名板：單純 canvas 畫線，回傳 dataURL
function initSignaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  let isEmpty = true;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    let width = rect.width || 300;
    let height = rect.height || 0;

    // 高:寬 = 9:16 => 寬:高 = 16:9（橫向長條簽名區）
    if (!height) {
      height = width * 9 / 16;
    }

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
  }

  function getPos(evt) {
    const rect = canvas.getBoundingClientRect();
    if (evt.touches && evt.touches.length > 0) {
      const t = evt.touches[0];
      return {
        x: t.clientX - rect.left,
        y: t.clientY - rect.top
      };
    }
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
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
  });

  window.addEventListener('resize', () => {
    resize();
  });

  resize();

  function clear() {
    isEmpty = true;
    resize();
  }

  function getDataURL() {
    if (isEmpty) return '';
    return canvas.toDataURL('image/png');
  }

  return {
    clear,
    getDataURL,
    resize
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('login-section');
  const studentSection = document.getElementById('student-section');

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

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
  const eventDeadlineInfoEl = document.getElementById('event-deadline-info');
  const eventFormContainer = document.getElementById('event-form-container');
  const eventStatusMessageEl = document.getElementById('event-status-message');

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
    // 清空
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

  // 載入 Roster，建立班級與姓名的下拉選單
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

      // 如果 localStorage 已經有 session，幫忙預先選好班級與姓名
      const sess = getStudentSession();
      if (sess && sess.class && sess.name && _rosterByClass[sess.class]) {
        classSelect.value = sess.class;
        buildNameOptions(sess.class, sess.name);
      } else {
        // 預設 name-select 狀態
        buildNameOptions('', null);
      }
    } catch (err) {
      console.error(err);
      classSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '載入名單失敗，請重新整理頁面';
      classSelect.appendChild(opt);
      classSelect.disabled = true;
      nameSelect.innerHTML = '';
      const opt2 = document.createElement('option');
      opt2.value = '';
      opt2.textContent = '無法載入姓名';
      nameSelect.appendChild(opt2);
      nameSelect.disabled = true;
      showToast('無法載入學生名單');
    }
  }

  // Auto session restore: 若有 session，之後會搭配 roster 一起設定下拉
  const session = getStudentSession();
  if (session && session.class && session.name) {
    renderLoggedInView(session);
    refreshEventsAndLatest();
  }

  // 無論是否已登入，都先載入 roster 來建 dropdown
  loadRosterAndBuildSelects();

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginError.classList.add('hidden');

    const cls = classSelect.value;
    const name = nameSelect.value;
    const pin = (new FormData(loginForm).get('pin') || '').toString().trim();

    if (!cls || !name || !pin) {
      loginError.textContent = '請完整選擇班級、姓名並輸入密碼。';
      loginError.classList.remove('hidden');
      return;
    }

    try {
      const res = await authStudent(cls, name, pin);
      if (!res.ok) {
        if (res.error === 'INVALID_CREDENTIALS') {
          loginError.textContent = '帳號或密碼格式錯誤。';
        } else if (res.error === 'NOT_FOUND_OR_DISABLED') {
          loginError.textContent = '找不到此學生或帳號已停用，請確認班級、姓名與密碼。';
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
      loginError.textContent = '登入失敗（網路或系統錯誤）';
      loginError.classList.remove('hidden');
    }
  });

  logoutBtn.addEventListener('click', () => {
    clearStudentSession();
    _eventsCache = [];
    _latestCache = [];
    _currentEvent = null;
    eventsListEl.innerHTML = '';
    setHidden(eventDetailSection, true);
    // 回到登入視圖，但保留下拉名單
    renderLoggedOutView();
    showToast('已登出');
  });

  backToEventsBtn.addEventListener('click', () => {
    setHidden(eventDetailSection, true);
    setHidden(eventsListEl.closest('.card'), false);
    _currentEvent = null;
  });

  async function refreshEventsAndLatest() {
    const session = getStudentSession();
    if (!session) return;

    try {
      const [evRes, latestRes] = await Promise.all([
        getEvents(),
        getStudentLatestAll(session.class, session.name)
      ]);

      if (!evRes.ok) throw new Error(evRes.error || 'events error');
      if (!latestRes.ok) throw new Error(latestRes.error || 'latest error');

      _eventsCache = evRes.events || [];
      _latestCache = latestRes.latest || [];

      renderEventsList();
    } catch (err) {
      console.error(err);
      showToast('讀取活動列表失敗');
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
      statusChip.textContent = hasReplied ? '已填寫' : '尚未填寫';

      const btn = document.createElement('button');
      btn.className = 'btn primary small';
      btn.textContent = hasReplied ? '修改回條' : '填寫回條';
      btn.addEventListener('click', () => openEventDetail(ev.eventId));

      footer.appendChild(statusChip);
      footer.appendChild(btn);
      card.appendChild(footer);

      eventsListEl.appendChild(card);
    });
  }

  async function openEventDetail(eventId) {
    const session = getStudentSession();
    if (!session) {
      showToast('請先登入');
      return;
    }

    try {
      const res = await getEvent(eventId);
      if (!res.ok) {
        showToast('找不到此活動');
        return;
      }
      const ev = res.event;
      _currentEvent = ev;

      eventTitleEl.textContent = ev.title || ev.eventId;
      eventMetaEl.textContent = [ev.date || ev.startAt || '', ev.place || ''].filter(Boolean).join('｜');
      eventDescEl.textContent = ev.statDescription || '';

      // deadline display
      if (ev.deadline) {
        eventDeadlineInfoEl.textContent = '回覆截止時間：' + ev.deadline;
      } else {
        eventDeadlineInfoEl.textContent = '';
      }

      // Build form
      const def = FORM_DEFINITIONS[ev.eventId] || FORM_DEFINITIONS.default;
      const latest = findLatestForEvent(ev.eventId);
      let existingAnswer = {};
      if (latest && latest.answer) {
        try {
          existingAnswer = JSON.parse(latest.answer);
        } catch (_) {}
      }

      buildEventForm(def, existingAnswer, ev);

      setHidden(eventsListEl.closest('.card'), true);
      setHidden(eventDetailSection, false);
      eventStatusMessageEl.textContent = '';
    } catch (err) {
      console.error(err);
      showToast('讀取活動資料失敗');
    }
  }

  function buildEventForm(def, existingAnswer, ev) {
    eventFormContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'form';

    // 儲存每個簽名欄位目前的狀態（值、pad 等）
    const signatureStates = {};

    (def.fields || []).forEach(field => {
      const wrapper = document.createElement('div');
      wrapper.className = 'form-field';

      // 純文字區塊（同意書內容）
      if (field.type === 'textblock') {
        if (field.label) {
          const title = document.createElement('div');
          title.textContent = field.label;
          wrapper.appendChild(title);
        }
        const text = document.createElement('div');
        text.className = 'textblock';
        text.textContent = field.value || '';
        wrapper.appendChild(text);
        form.appendChild(wrapper);
        return;
      }

      const label = document.createElement('label');
      label.textContent = field.label || '';
      wrapper.appendChild(label);

      if (field.type === 'radio') {
        const opts = document.createElement('div');
        opts.className = 'options';

        const current = (existingAnswer && existingAnswer[field.id]) || '';

        (field.options || []).forEach(opt => {
          const optLabel = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = field.id;
          input.value = opt;
          if (opt === current) input.checked = true;
          optLabel.appendChild(input);
          optLabel.appendChild(document.createTextNode(' ' + opt));
          opts.appendChild(optLabel);
        });

        wrapper.appendChild(opts);
      } else if (field.type === 'checkbox') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = field.id;

        const current = existingAnswer && existingAnswer[field.id];
        if (current === true || current === 'true' || current === '是' || current === 'on') {
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
        textarea.placeholder = field.placeholder || '';
        textarea.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(textarea);
      } else if (field.type === 'text') {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.id;
        input.placeholder = field.placeholder || '';
        input.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(input);
      } else if (field.type === 'signature') {
        const existingDataUrl = (existingAnswer && existingAnswer[field.id]) || '';

        const container = document.createElement('div');
        container.className = 'signature-container';

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'btn secondary small';
        openBtn.textContent = existingDataUrl ? '重新簽名' : '點擊簽名';

        const preview = document.createElement('div');
        preview.className = 'signature-preview';
        const img = document.createElement('img');
        preview.appendChild(img);

        container.appendChild(openBtn);
        container.appendChild(preview);
        wrapper.appendChild(container);

        // 建立全畫面簽名 modal
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
            state.openBtn.textContent = '點擊簽名';
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

        // 初始化預覽狀態
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
            showToast('請先簽名');
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
        // fallback: simple text input
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.id;
        input.value = (existingAnswer && existingAnswer[field.id]) || '';
        wrapper.appendChild(input);
      }

      form.appendChild(wrapper);
    });

    const btnRow = document.createElement('div');
    btnRow.style.marginTop = '0.8rem';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn primary full-width';
    submitBtn.textContent = '送出回條';
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
        } else if (field.type === 'textarea' || field.type === 'text') {
          const el = form.querySelector(`[name="${field.id}"]`);
          answerObj[field.id] = el ? el.value : '';
        } else if (field.type === 'signature') {
          const state = signatureStates[field.id];
          answerObj[field.id] = state ? state.value : '';
        }
      });

      try {
        const res = await postReply({
          eventId: ev.eventId,
          class: session.class,
          name: session.name,
          answer: answerObj
        });
        if (!res.ok) {
          if (res.error === 'DEADLINE_PASSED') {
            eventStatusMessageEl.textContent = '已超過回覆截止時間，無法再送出或修改。';
          } else {
            eventStatusMessageEl.textContent = '送出失敗：' + (res.error || '未知錯誤');
          }
          return;
        }
        eventStatusMessageEl.textContent = '已成功送出回條（時間：' + res.ts + '）';
        showToast('送出成功');
        await refreshEventsAndLatest();
      } catch (err) {
        console.error(err);
        eventStatusMessageEl.textContent = '送出失敗（網路或系統錯誤）';
      }
    });

    eventFormContainer.appendChild(form);
  }
});
