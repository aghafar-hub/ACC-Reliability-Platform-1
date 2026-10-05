const API_BASE = "http://localhost:3001";
const TOKEN_KEY = "acc_new_frontend_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// No GET /auth/me endpoint exists (noted gap) — on reload, the user's
// email/roles for the TopBar avatar are read straight back out of the JWT
// payload itself rather than re-fetched, since the server already put them
// there at login time (see api/src/routes/auth.js).
export function getStoredUser() {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { userId: payload.uid, email: payload.email, orgId: payload.org, roles: payload.roles || [] };
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export function logout() {
  setToken(null);
}

// Fetches every page of a paginated list endpoint ({items, page, limit,
// total}) since the API caps `limit` at 200 and this fleet has 900+
// lubrication points / 800+ oil samples — no single-request "give me
// everything" endpoint exists yet (see the report for this gap).
async function fetchAllPages(path, itemsKey) {
  const limit = 200;
  let page = 1;
  let all = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await request(`${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=${limit}`);
    all = all.concat(data[itemsKey] || []);
    if (all.length >= data.total || !data[itemsKey]?.length) break;
    page++;
  }
  return all;
}

export async function getEquipmentCount() {
  const data = await request("/equipment?limit=1");
  return data.total;
}

export async function getLubricationPointsCount() {
  const data = await request("/lubrication-points?limit=1");
  return data.total;
}

export async function getAllEquipment() {
  return fetchAllPages("/equipment", "equipment");
}

export async function getAllLubricationPoints() {
  return fetchAllPages("/lubrication-points", "lubricationPoints");
}

export async function getAllOilSamples() {
  return fetchAllPages("/oil-samples", "samples");
}

export async function getAllOilActions() {
  return fetchAllPages("/oil-actions", "actions");
}

export async function getAllRoutines() {
  return fetchAllPages("/routines", "routines");
}

export async function getAllOilInventoryProducts() {
  const data = await request("/oil-inventory/products");
  return data.products || [];
}

export async function getAllOilInventoryMovements() {
  return fetchAllPages("/oil-inventory/movements", "movements");
}
