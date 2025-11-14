
// Simple state helpers for student/admin sessions

const STORAGE_KEYS = {
  student: 'renhe_replies_student',
  admin: 'renhe_replies_admin'
};

function saveStudentSession(cls, name) {
  const obj = { class: cls, name: name };
  localStorage.setItem(STORAGE_KEYS.student, JSON.stringify(obj));
}

function getStudentSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.student);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearStudentSession() {
  localStorage.removeItem(STORAGE_KEYS.student);
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
