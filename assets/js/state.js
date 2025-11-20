// Simple state helpers for student/admin sessions

const STORAGE_KEYS = {
  student: 'renhe_replies_student',
  admin: 'renhe_replies_admin'
};

function saveStudentSession(cls, name) {
  const obj = { class: cls, name: name };
  try {
    // 使用 sessionStorage，只在當前分頁生命週期內保存登入狀態
    sessionStorage.setItem(STORAGE_KEYS.student, JSON.stringify(obj));
  } catch (e) {
    // 若瀏覽器不支援或被封鎖，就直接略過（不影響功能）
  }
}

function getStudentSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.student);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearStudentSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.student);
  } catch (e) {}
  // 兼容舊版本：順便把曾經存在 localStorage 的舊資料清掉
  try {
    localStorage.removeItem(STORAGE_KEYS.student);
  } catch (e) {}
}

function saveAdminSession(token) {
  localStorage.setItem(STORAGE_KEYS.admin, JSON.stringify({ adminToken: token }));
}

function getAdminSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.admin);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearAdminSession() {
  localStorage.removeItem(STORAGE_KEYS.admin);
}
