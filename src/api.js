async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => req('GET', '/api/me').catch(() => ({ user: null })),
  signup: (username, email, password) => req('POST', '/api/auth/signup', { username, email, password }),
  login: (email, password) => req('POST', '/api/auth/login', { email, password }),
  logout: () => req('POST', '/api/auth/logout'),
  listings: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
    return req('GET', `/api/listings?${qs}`);
  },
  listing: (id) => req('GET', `/api/listings/${id}`),
  createListing: (data) => req('POST', '/api/listings', data),
  deleteListing: (id) => req('DELETE', `/api/listings/${id}`),
  review: (id, verdict, comment) => req('POST', `/api/listings/${id}/reviews`, { verdict, comment }),
  mine: () => req('GET', '/api/mine'),
};
