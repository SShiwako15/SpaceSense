function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length) query.set(key, value.join(','));
    } else {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch {
    throw new Error('Cannot reach the reservation service. Make sure the API is running.');
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let detail = '';
    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => ({}));
      detail = body.detail || body.message || body.title || body.error || '';
      if (!detail && body.errors) detail = Object.values(body.errors).flat().join(' ');
    } else {
      detail = (await response.text().catch(() => '')).slice(0, 250);
    }
    throw new Error(detail || `Request failed (${response.status}).`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  resources: (filters = {}) => request(`/resources${queryString(filters)}`),
  availability: (id, start, end) => request(`/resources/${encodeURIComponent(id)}/availability${queryString({ start, end })}`),
  reservations: (from, to) => request(`/reservations${queryString({ from, to })}`),
  createReservation: (body) => request('/reservations', { method: 'POST', body: JSON.stringify(body) }),
  updateReservation: (id, body) => request(`/reservations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  cancelReservation: (id) => request(`/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  naturalSearch: (prompt) => request('/search/natural', { method: 'POST', body: JSON.stringify({ prompt }) }),
  utilization: (from, to) => request(`/stats/utilization${queryString({ from, to })}`),
  allocationSample: () => request('/allocations/sample'),
  solveAllocation: (events) => request('/allocations/solve', { method: 'POST', body: JSON.stringify({ events }) }),
};
