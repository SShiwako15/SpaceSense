function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length) query.set(key, value.join(","));
    } else {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch {
    throw new Error(
      "Cannot reach the reservation service. Make sure the API is running.",
    );
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let detail = "";
    if (contentType.includes("application/json")) {
      const body = await response.json().catch(() => ({}));
      detail =
        body.error ||
        (body.errors ? Object.values(body.errors).flat().join(" ") : "") ||
        body.detail ||
        body.message ||
        body.title ||
        "";
    } else {
      detail = (await response.text().catch(() => "")).slice(0, 250);
    }
    throw new Error(detail || `Request failed (${response.status}).`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  resources: (filters = {}) => request(`/resources${queryString(filters)}`),
  availability: (id, start, end, excludeId) =>
    request(
      `/resources/${encodeURIComponent(id)}/availability${queryString({ start, end, excludeId })}`,
    ),
  reservations: (from, to, status, seriesId) =>
    request(`/reservations${queryString({ from, to, status, seriesId })}`),
  maintenance: (resourceId) => request(`/maintenance${queryString({ resourceId })}`),
  createMaintenance: (body) =>
    request("/maintenance", { method: "POST", body: JSON.stringify(body) }),
  deleteMaintenance: (id) =>
    request(`/maintenance/${encodeURIComponent(id)}`, { method: "DELETE" }),
  createReservation: (body) =>
    request("/reservations", { method: "POST", body: JSON.stringify(body) }),
  updateReservation: (id, body) =>
    request(`/reservations/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  cancelReservation: (id) =>
    request(`/reservations/${encodeURIComponent(id)}`, { method: "DELETE" }),
  cancelReservationSeries: (seriesId) =>
    request(`/reservations/series/${encodeURIComponent(seriesId)}`, { method: "DELETE" }),
  approveReservation: (id) =>
    request(`/reservations/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  rejectReservation: (id) =>
    request(`/reservations/${encodeURIComponent(id)}/reject`, { method: "POST" }),
  notifications: () => request("/notifications"),
  markNotificationRead: (id) =>
    request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "POST" }),
  naturalSearch: (prompt) =>
    request("/search/natural", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  utilization: (from, to) =>
    request(`/stats/utilization${queryString({ from, to })}`),
  forecast: (days = 14) => request(`/stats/forecast${queryString({ days })}`),
  allocationSample: () => request("/allocations/sample"),
  solveAllocation: (events) =>
    request("/allocations/solve", {
      method: "POST",
      body: JSON.stringify({ events }),
    }),
};
