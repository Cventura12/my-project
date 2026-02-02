const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = {
  async submitCheckIn(userId, freeText) {
    const res = await fetch(`${API_BASE}/api/coach/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, free_text: freeText }),
    });
    if (!res.ok) throw new Error('Failed to submit check-in');
    return res.json();
  },

  async getTodayStatus(userId) {
    const res = await fetch(`${API_BASE}/api/coach/today?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error('Failed to get today status');
    return res.json();
  },

  async submitEveningSignal(entryId, response) {
    const res = await fetch(`${API_BASE}/api/coach/evening-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_id: entryId, response }),
    });
    if (!res.ok) throw new Error('Failed to submit evening signal');
    return res.json();
  },
};
