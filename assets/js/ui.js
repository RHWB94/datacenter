
function showToast(message, timeoutMs) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.classList.add('hidden');
  }, timeoutMs || 2500);
}

function setHidden(idOrEl, hidden) {
  const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (!el) return;
  if (hidden) el.classList.add('hidden');
  else el.classList.remove('hidden');
}
