const SESSION_KEY = "ai-dataset-session";

export function getSession() {
  try {
    const storedSession = localStorage.getItem(SESSION_KEY);
    return storedSession ? JSON.parse(storedSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
