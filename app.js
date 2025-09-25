// reply/app.js
(function(){
  const Q = new URLSearchParams(location.search);
  const isIndex = !!document.getElementById('selClass');
  const C = () => window.APP_CONFIG || { apiBase:'' };

  function absUrl(path){
    // build absolute URL relative to current directory
    const u = new URL(path, location.href);
    return u.toString();
  }


  function apiUrl(path){ // GAS Web App: ?path=...
    const base = C().apiBase.replace(/\/exec.*/,'/exec');
    const u = new URL(base);
    u.searchParams.set('path', path);
    return u.toString();
  }
  async function post(path, body){
    const r = await fetch(apiUrl(path), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body||{})
    });
    return r.json();
  }
  async function get(path, query){
    const u = new URL(apiUrl(path));
    Object.entries(query||{}).forEach(([k,v]) => u.searchParams.set(k, v));
    const r = await fetch(u.toString(), { method:'GET' });
    return r.json();
  }

  function setOptions(sel, arr){
    sel.innerHTML = '';
    arr.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    });
  }
  function rosterClasses(){ return Object.keys(C().LOCAL_ROSTER || {}); }
  function rosterNames(cls){ return (C().LOCAL_ROSTER||{})[cls] || []; }

  // CSV helper
  function toCSV(rows){
    const esc = v => {
      if (v==null) return '';
      const s = String(v).replace(/"/g,'""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    return rows.map(r => r.map(esc).join(',')).join('\n');
  }
  function download(name, content){
    const blob = new Blob([content], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }

  
  function showError(msg){
    let el = document.getElementById('errorBanner');
    if(!el){
      el = document.createElement('div');
      el.id='errorBanner';
      el.style.cssText='background:#fce8e6;color:#b80600;border:1px solid #f28b82;padding:10px;border-radius:8px;margin:10px 0;';
      document.querySelector('.container')?.prepend(el);
    }
    el.textContent = '⚠ ' + msg;
    console.error(msg);
  }

  // ===== A 頁：登入 =====
  if (isIndex){
    const selClass = document.getElementById('selClass');
    const selName  = document.getElementById('selName');
    const inpPIN   = document.getElementById('inpPIN');
    const btnLogin = document.getElementById('btnLogin');
    const btnClear = document.getElementById('btnClear');
    const adminHint= document.getElementById('adminHint');

    // init roster
    setOptions(selClass, rosterClasses());
    setOptions(selName, rosterNames(selClass.value));
    selClass.addEventListener('change', () => setOptions(selName, rosterNames(selClass.value)));
    adminHint.textContent = (C().ADMIN_HINT || '') + '';
    // roster sanity check
    try {
      const hasRoster = C().LOCAL_ROSTER && Object.keys(C().LOCAL_ROSTER).length > 0;
      if (!hasRoster || selClass.options.length === 0) {
        adminHint.textContent = '⚠️ LOCAL_ROSTER 為空或未載入，請確認 /reply/config.js 是否正確且已被載入。';
      }
    } catch (e) {
      adminHint.textContent = '⚠️ 無法讀取 LOCAL_ROSTER，請檢查 /reply/config.js。';
    }

    btnClear.addEventListener('click', () => {
      selClass.selectedIndex = 0;
      setOptions(selName, rosterNames(selClass.value));
      inpPIN.value='';
    });

    btnLogin.addEventListener('click', async () => { console.log('[LOGIN] click');
      const cls = selClass.value;
      const name= selName.value;
      const pin = (inpPIN.value||'').trim();

      if (!pin){
        alert('請輸入 PIN 或 管理金鑰'); return;
      }

      // 以「5 碼全數字」視為學生；否則嘗試管理者
      if (/^\d{5}$/.test(pin)){
        if (!cls || !name){ alert('請選擇班級與姓名'); return; }
        console.log('[LOGIN] student auth start', {cls,name});
        const res = await post('auth', { class: cls, name, pin });
        console.log('[LOGIN] student auth result', res);
        if (!res.ok){ showError('登入失敗：' + (res.message||res.error)); return; }
        // 保存必要資訊
        sessionStorage.setItem('role','student');
        sessionStorage.setItem('class',cls);
        sessionStorage.setItem('name',name);
        sessionStorage.setItem('pin',pin); // 僅用於本次回覆，若要更安全可改成每次再輸入
        const next = absUrl('event.html?role=student&class='+encodeURIComponent(cls)+'&name='+encodeURIComponent(name));
        console.log('[LOGIN] redirect ->', next);
        location.href = next;
      }else{
        // 管理者
        const adminToken = pin;
        console.log('[LOGIN] admin auth start');
        const res = await post('auth', { adminToken });
        console.log('[LOGIN] admin auth result', res);
        if (!res.ok){ showError('管理者驗證失敗：' + (res.message||res.error)); return; }
        sessionStorage.setItem('role','admin');
        sessionStorage.setItem('adminToken', adminToken);
        const next = absUrl('event.html?role=admin');
        console.log('[LOGIN] redirect ->', next);
        location.href = next;
      }
    });

    // 預設選第一個班與第一個人
    if (selClass.options.length>0 && selName.options.length===0){
      setOptions(selName, rosterNames(selClass.value));
    }
    return;
  }

  // ===== B 頁：活動回條 =====
  const pageTitle = document.getElementById('pageTitle');
  const roleBadge = document.getElementById('roleBadge');
  const btnBack   = document.getElementById('btnBack');
  const helloText = document.getElementById('helloText');
  const adminPanel= document.getElementById('adminPanel');
  const eventsArea= document.getElementById('eventsArea');

  btnBack.addEventListener('click', () => location.href='./index.html');

  const role = Q.get('role') || sessionStorage.getItem('role') || 'student';

  if (role==='student'){
    roleBadge.textContent = '學生';
    const cls = Q.get('class') || sessionStorage.getItem('class') || '';
    const name= Q.get('name')  || sessionStorage.getItem('name')  || '';
    pageTitle.textContent = '活動回條（學生）';
    helloText.textContent = `${name || ''} 同學您好`;

    renderForStudent(cls, name).catch(e=>{
      console.error(e);
      helloText.textContent = '載入失敗：' + e.message;
    });
  }else if (role==='admin'){
    roleBadge.textContent = '管理者';
    pageTitle.textContent = '活動回條（管理）';
    helloText.textContent = '管理者模式';
    adminPanel.style.display = '';

    // 管理者載入下拉名單
    const elClass = document.getElementById('adminClass');
    const elName  = document.getElementById('adminName');
    setOptions(elClass, rosterClasses());
    setOptions(elName, rosterNames(elClass.value));
    elClass.addEventListener('change', () => setOptions(elName, rosterNames(elClass.value)));

    document.getElementById('btnLoadStudent').addEventListener('click', async ()=>{
      const cls = elClass.value, name = elName.value;
      await renderForAdminStudent(cls, name);
    });

    document.getElementById('btnSummary').addEventListener('click', async ()=>{
      await renderSummary();
    });

    document.getElementById('btnExportCSV').addEventListener('click', ()=>{
      // 將目前畫面上卡片資料彙整成 CSV
      const rows = [['eventId','title','answer','lastReplyTs','class','name']];
      document.querySelectorAll('.event-card').forEach(card=>{
        const eventId = card.getAttribute('data-id')||'';
        const title   = card.querySelector('.ev-title')?.textContent||'';
        const answer  = card.querySelector('textarea')?.value || card.querySelector('input[type="text"]')?.value || '';
        const last    = card.querySelector('.lastTs')?.textContent||'';
        const cls     = document.getElementById('adminClass')?.value || (sessionStorage.getItem('class')||'');
        const name    = document.getElementById('adminName')?.value  || (sessionStorage.getItem('name')||'');
        rows.push([eventId, title, answer, last, cls, name]);
      });
      download('reply-export.csv', '\ufeff' + toCSV(rows));
    });

    // 初始也把所有 open 活動畫上（無選人狀態）
    renderEventsSkeleton().catch(err => console.error('renderEventsSkeleton failed:', err));
  }

  async function renderForStudent(cls, name){
    const [ev, latest] = await Promise.all([
      get('events', {}),
      get('latestAll', { class: cls, name })
    ]);
    if (!ev.ok){ throw new Error(ev.message||'events 讀取失敗'); }
    const mapLatest = new Map();
    (latest.latest||[]).forEach(r => mapLatest.set(String(r.eventId), r));
    drawEventCards(ev.events||[], { mode:'student', cls, name, mapLatest });
  }

  async function renderForAdminStudent(cls, name){
    helloText.textContent = `管理者模式：目前載入 ${cls}／${name}`;
    const [ev, latest] = await Promise.all([
      get('events', {}),
      get('adminStudentLatestAll', { adminToken: sessionStorage.getItem('adminToken')||'', class: cls, name })
    ]);
    if (!ev.ok){ throw new Error(ev.message||'events 讀取失敗'); }
    if (!latest.ok){ throw new Error(latest.message||'latest 讀取失敗'); }
    const mapLatest = new Map();
    (latest.latest||[]).forEach(r => mapLatest.set(String(r.eventId), r));
    drawEventCards(ev.events||[], { mode:'admin', cls, name, mapLatest });
  }

  async function renderSummary(){
    const res = await get('adminSummary', { adminToken: sessionStorage.getItem('adminToken')||'' });
    const area = document.getElementById('summaryArea');
    if (!res.ok){ area.textContent = '統計載入失敗：' + (res.message||res.error); return; }
    const s = res.summary || {};
    const rows = [['eventId','title','已回覆','名單總數','回覆率']];
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>eventId</th><th>標題</th><th>已回覆</th><th>名單總數</th><th>回覆率</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    Object.keys(s).forEach(eid => {
      const it = s[eid];
      const rate = it.total ? Math.round((it.replied/it.total)*100) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${eid}</td><td>${it.title||''}</td><td>${it.replied||0}</td><td>${it.total||0}</td><td>${rate}%</td>`;
      tbody.appendChild(tr);
      rows.push([eid, it.title||'', it.replied||0, it.total||0, `${rate}%`]);
    });
    table.appendChild(tbody);
    const areaNode = document.getElementById('summaryArea');
    areaNode.innerHTML = '';
    areaNode.appendChild(table);

    // 也把 summary 轉成 CSV 供立即下載（使用者仍可點上面的「匯出 CSV」匯出卡片資料）
    const btn = document.createElement('button');
    btn.textContent = '下載統計 CSV';
    btn.style.marginTop = '10px';
    btn.addEventListener('click', ()=> download('summary.csv', '\ufeff' + toCSV(rows)));
    areaNode.appendChild(btn);
  }

  async function renderEventsSkeleton(){
    const ev = await get('events', {});
    if (!ev.ok){ throw new Error(ev.message||'events 讀取失敗'); }
    drawEventCards(ev.events||[], { mode:'admin-skeleton' });
  }

  function drawEventCards(events, ctx){
    eventsArea.innerHTML = '';
    if (!events.length){
      const none = document.createElement('div');
      none.className = 'card';
      none.textContent = '目前沒有 open 活動';
      eventsArea.appendChild(none);
      return;
    }
    events.forEach(ev => {
      const latest = ctx.mapLatest?.get(String(ev.eventId));
      const answered = !!latest;
      const disabledByDeadline = isDisabledByDeadline(ev) && String(ev.allowEdit).toLowerCase()!=='true';

      const card = document.createElement('div');
      card.className = 'card event-card' + (answered ? ' answered':'');
      card.setAttribute('data-id', ev.eventId);

      const title = document.createElement('h3');
      title.className = 'ev-title';
      title.textContent = `${ev.title || '(未命名活動)'}（${ev.eventId}）`;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        <div class="kv">
          <div>日期</div><div>${ev.date||'-'}</div>
          <div>地點</div><div>${ev.place||'-'}</div>
          <div>聯絡</div><div>${ev.contact||'-'}</div>
          <div>截止</div><div>${ev.deadline||'-'}</div>
        </div>`;
      card.appendChild(meta);

      const ansWrap = document.createElement('div');
      ansWrap.style.marginTop = '10px';
      const ta = document.createElement('textarea');
      ta.rows = 3;
      ta.placeholder = '請在此輸入你的回覆（例如：出席／不克前來／備註）';
      ta.value = latest?.answer || '';
      if ((ctx.mode==='student' && (answered || disabledByDeadline)) || (ctx.mode!=='student' && false)){
        ta.disabled = answered || (ctx.mode==='student' && disabledByDeadline);
      }
      ansWrap.appendChild(ta);
      card.appendChild(ansWrap);

      const actions = document.createElement('div');
      actions.className = 'flex';
      const btnSubmit = document.createElement('button');
      btnSubmit.textContent = answered ? '修改答案' : '送出答案';
      const info = document.createElement('span');
      info.className = 'note right lastTs';
      info.textContent = latest?.lastReplyTs ? (`最後更新：${latest.lastReplyTs}`) : '';

      // 控制按鈕狀態
      if (ctx.mode==='student'){
        btnSubmit.disabled = disabledByDeadline;
      }

      btnSubmit.addEventListener('click', async ()=>{
        if (ctx.mode==='admin-skeleton'){
          alert('請先於上方選擇學生並「載入該生回覆」'); return;
        }
        const answer = ta.value.trim();
        if (!answer){ alert('請輸入答案'); return; }

        if (ctx.mode==='student'){
          const pin = sessionStorage.getItem('pin') || prompt('為安全起見，請再次輸入 5 碼 PIN');
          if (!/^\d{5}$/.test(pin||'')){ alert('PIN 必須剛好 5 碼'); return; }
          const body = { eventId: ev.eventId, class: ctx.cls, name: ctx.name, answer, pin };
          const res = await post('reply', body);
          if (!res.ok){ alert('送出失敗：'+(res.message||res.error)); return; }
          info.textContent = '最後更新：' + (res.ts || new Date().toISOString());
          card.classList.add('answered');
          ta.disabled = true;
          btnSubmit.textContent = '修改答案';
        }else{
          const adminToken = sessionStorage.getItem('adminToken') || prompt('請輸入管理金鑰');
          if (!adminToken){ alert('需要管理金鑰'); return; }
          const cls = document.getElementById('adminClass').value;
          const name= document.getElementById('adminName').value;
          const body = { eventId: ev.eventId, class: cls, name, answer, adminToken };
          const res = await post('adminReply', body);
          if (!res.ok){ alert('送出失敗：'+(res.message||res.error)); return; }
          info.textContent = '最後更新：' + (res.ts || new Date().toISOString());
          card.classList.add('answered');
          ta.disabled = false; // 管理者不受限，仍可改
        }
      });

      actions.appendChild(btnSubmit);
      actions.appendChild(info);
      card.appendChild(actions);

      eventsArea.appendChild(card);
    });
  }

  function isDisabledByDeadline(ev){
    if (!ev.deadline) return false;
    const d = new Date(ev.deadline);
    if (isNaN(d.getTime())) return false;
    return new Date() > d;
  }
})();
