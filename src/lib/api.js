// ── API LAYER ──
// One place where HTTP status codes become human sentences (UX contract).
// Mock mode returns prototype data with a small latency so loading states
// are visible and testable; live mode hits API Gateway with the Cognito token.

import { getSession, clearSession } from './auth.js';
import * as mock from '../data/mock.js';

const MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const FRIENDLY = {
  400: "That request didn't look right. Check the form and try again.",
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have access to that.",
  404: "We couldn't find that.",
  409: 'That name is already taken.',
  429: "You're doing that too fast. Give it a few seconds.",
  500: 'Something broke on our side. Please try again.',
  502: 'Skill Exchange is briefly unavailable. Please retry.',
  503: 'Skill Exchange is briefly unavailable. Please retry.',
};

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const session = getSession();
  if (auth || session) {
    if (auth && !session) throw new ApiError(401, FRIENDLY[401]);
    if (session?.idToken) headers.Authorization = session.idToken;
  }
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Couldn't reach Skill Exchange. Check your connection and retry.");
  }
  if (res.status === 401 && session) {
    // Token present but rejected → clear session once, globally; pages stand down.
    clearSession();
    throw new ApiError(401, FRIENDLY[401]);
  }
  if (!res.ok) {
    let serverMsg;
    try { serverMsg = (await res.json()).message; } catch { /* keep friendly */ }
    throw new ApiError(res.status, serverMsg || FRIENDLY[res.status] || FRIENDLY[500]);
  }
  if (res.status === 204) return null;
  return res.json();
}

const delay = (ms = 220) => new Promise(r => setTimeout(r, ms));

// ── Mock-mode purchase persistence so My Library behaves realistically ──
const MOCK_LIB_KEY = 'se_mock_library';
function mockLibrary() {
  try { return JSON.parse(localStorage.getItem(MOCK_LIB_KEY)) || []; } catch { return []; }
}
function mockAddToLibrary(id) {
  const lib = mockLibrary();
  if (!lib.includes(id)) { lib.push(id); localStorage.setItem(MOCK_LIB_KEY, JSON.stringify(lib)); }
}

// Live backend returns cents + *Count fields; the UI keeps the prototype's
// shape (dollars, `reviews`, `downloads`) — normalize here, in one place.
export function normalizeSkill(s) {
  if (!s || s.price !== undefined) return s; // already UI-shaped (mock)
  return {
    id: s.skillId,
    title: s.title,
    category: s.category,
    author: s.sellerUsername,
    sellerId: s.sellerId,
    price: (s.priceCents || 0) / 100,
    rating: s.rating || 0,
    reviews: s.reviewsCount || 0,
    downloads: s.downloadsCount || 0,
    platforms: s.platforms || [],
    verified: !!s.sellerVerified,
    featured: !!s.featured,
    skillBadge: s.skillBadge || null,
    timeSaved: s.timeSavedHours,
    description: s.description,
    usage: s.usageInstructions,
    pocUrl: s.pocUrl,
    pocScreenshot: !!s.pocScreenshotUrl,
    pocScreenshotUrl: s.pocScreenshotUrl,
    sellerBadges: s.sellerBadges || [],
    status: s.status,
    createdAt: s.createdAt,
    iconUrl: s.iconUrl || null,
  };
}

// ── Public, read-only ──

export async function getStats() {
  if (MOCK) { await delay(); return mock.STATS; }
  return request('/stats');
}

export async function listSkills() {
  if (MOCK) { await delay(); return mock.SKILLS; }
  const data = await request('/skills');
  return (data.skills || []).map(normalizeSkill);
}

export async function getSkill(id) {
  if (MOCK) {
    await delay();
    const s = mock.SKILLS.find(x => x.id === String(id));
    if (!s) throw new ApiError(404, FRIENDLY[404]);
    return s;
  }
  return normalizeSkill(await request(`/skills/${encodeURIComponent(id)}`));
}

export async function getReviews(skillId) {
  if (MOCK) { await delay(); return mock.REVIEWS[String(skillId)] || []; }
  const data = await request(`/skills/${encodeURIComponent(skillId)}/reviews`);
  return data.reviews || [];
}

export async function getProfile(username) {
  if (MOCK) {
    await delay();
    const p = mock.PROFILES[username];
    if (!p) throw new ApiError(404, FRIENDLY[404]);
    return { ...p, skills: mock.SKILLS.filter(s => s.author === username) };
  }
  const data = await request(`/profiles/${encodeURIComponent(username)}`);
  return { ...data.profile, skills: (data.skills || []).map(normalizeSkill) };
}

export async function getLeaderboard() {
  if (MOCK) { await delay(); return { builders: mock.LB_BUILDERS, skills: mock.LB_SKILLS }; }
  return request('/leaderboard');
}

export async function checkUsername(username) {
  if (MOCK) {
    await delay(120);
    const taken = !!mock.PROFILES[username];
    return { available: !taken, suggestions: taken ? [`${username}_dev`, `${username}_ai`, `${username}_hq`] : [] };
  }
  return request(`/username-check?u=${encodeURIComponent(username)}`);
}

/* Only spendable once, and only on a handle we auto-derived for a federated
   user who never chose one. The server is the authority on both rules. */
export async function changeUsername(username) {
  if (MOCK) { await delay(300); return { username }; }
  return request('/me/username', { method: 'POST', body: { username }, auth: true });
}

// ── Authenticated ──

export async function getMe() {
  if (MOCK) {
    await delay();
    const s = getSession();
    const p = mock.PROFILES[s?.username];
    return p
      ? { ...p, skills: mock.SKILLS.filter(x => x.author === s.username) }
      : { name: s?.name || 'You', username: s?.username || 'you', bio: '', location: '', badges: [], verified: false, skills: [] };
  }
  const data = await request('/me', { auth: true });
  return { ...data.profile, skills: (data.skills || []).map(normalizeSkill) };
}

export async function getLibrary() {
  if (MOCK) {
    await delay();
    return mock.SKILLS.filter(s => mockLibrary().includes(s.id));
  }
  const data = await request('/library', { auth: true });
  return (data.skills || []).map(normalizeSkill);
}

export async function downloadSkill(id) {
  if (MOCK) {
    await delay();
    mockAddToLibrary(String(id));
    return { url: `data:text/markdown;charset=utf-8,${encodeURIComponent('# Mock SKILL.md\nThis is a mock download.')}` };
  }
  return request(`/skills/${encodeURIComponent(id)}/download`, { method: 'POST', auth: true });
}

export async function buySkill(id) {
  if (MOCK) {
    await delay(400);
    mockAddToLibrary(String(id));
    return { status: 'paid-mock' };
  }
  return request(`/skills/${encodeURIComponent(id)}/buy`, { method: 'POST', auth: true });
}

export async function confirmPurchase(id, payload) {
  if (MOCK) return { status: 'paid-mock' };
  return request(`/skills/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: payload, auth: true });
}

export async function postReview(skillId, { rating, text }) {
  if (MOCK) {
    await delay();
    const s = getSession();
    const list = mock.REVIEWS[String(skillId)] || (mock.REVIEWS[String(skillId)] = []);
    list.push({ reviewId: `mock-${Date.now()}`, user: s?.username || 'you', rating, text });
    return list[list.length - 1];
  }
  return request(`/skills/${encodeURIComponent(skillId)}/reviews`, { method: 'POST', body: { rating, text }, auth: true });
}

export async function publishSkill(form) {
  if (MOCK) { await delay(500); return { skillId: `mock-${Date.now()}`, status: 'pending' }; }
  // 1. Create the skill record + get presigned S3 PUT URLs
  const created = await request('/skills', {
    method: 'POST', auth: true,
    body: {
      title: form.title, category: form.category, description: form.description,
      usageInstructions: form.usage, platforms: form.platforms,
      priceCents: form.price === 'paid' ? Math.round(Number(form.amount) * 100) : 0,
      timeSavedHours: Number(form.timeSaved), pocUrl: form.pocUrl,
      skillFileName: form.file?.name, screenshotFileName: form.screenshot?.name,
      screenshotContentType: form.screenshot?.type,
    },
  });
  // 2. Upload both files straight to S3 (never through Lambda)
  const put = (url, file, type) => fetch(url, { method: 'PUT', headers: { 'Content-Type': type }, body: file })
    .then(r => { if (!r.ok) throw new ApiError(r.status, 'File upload failed. Please retry.'); });
  await put(created.skillFileUploadUrl, form.file, 'text/markdown');
  await put(created.screenshotUploadUrl, form.screenshot, form.screenshot.type);
  // 3. Mark uploads complete → status pending review
  await request(`/skills/${created.skillId}/submit`, { method: 'POST', auth: true });
  return created;
}

export async function applyVerification({ skillUrl, note }) {
  if (MOCK) { await delay(); return { applicationId: `mock-${Date.now()}`, status: 'submitted' }; }
  return request('/verify', { method: 'POST', body: { skillUrl, note }, auth: true });
}

export async function updateProfile({ name, bio, location }) {
  if (MOCK) { await delay(); return { updated: true }; }
  return request('/me', { method: 'POST', body: { name, bio, location }, auth: true });
}

/* Two-step, same shape as skill publishing: ask for a presigned PUT, then send
   the bytes straight to S3 — image data never passes through Lambda. */
export async function uploadAvatar(file) {
  if (MOCK) { await delay(400); return { updated: true }; }
  const { uploadUrl } = await request('/me/avatar', { method: 'POST', body: { contentType: file.type }, auth: true });
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!res.ok) throw new ApiError(res.status, 'Photo upload failed. Please retry.');
  return { updated: true };
}
