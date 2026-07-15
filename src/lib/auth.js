// ── AUTH LAYER ──
// Mock mode (VITE_USE_MOCK=true): localStorage-backed fake session, matches
// the prototype's AuthModal behavior so the UI works with no backend.
// Live mode: Cognito over plain HTTPS (no SDK weight) — native email/password
// via InitiateAuth USER_PASSWORD_AUTH, Google via the Hosted UI code flow.

const MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const REGION = import.meta.env.VITE_AWS_REGION;
const POOL_CLIENT = import.meta.env.VITE_COGNITO_CLIENT_ID;
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN; // e.g. skillexchange-auth.auth.us-east-1.amazoncognito.com
const SITE_URL = import.meta.env.VITE_SITE_URL || window.location.origin;

const IDP_URL = `https://cognito-idp.${REGION}.amazonaws.com/`;
const SESSION_KEY = 'se_session';

// One global sign-out event: pages stand down, App clears state (UX contract).
export const AUTH_EVENT = 'se:auth-changed';
function emitAuthChanged() { window.dispatchEvent(new Event(AUTH_EVENT)); }

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!MOCK && s.expiresAt && Date.now() > s.expiresAt) return null; // expired
    return s;
  } catch { return null; }
}

function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  emitAuthChanged();
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  emitAuthChanged();
}

async function idp(target, body) {
  const res = await fetch(IDP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.__type || 'Authentication failed');
    err.code = data.__type;
    throw err;
  }
  return data;
}

function decodeJwtPayload(token) {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

function sessionFromTokens({ IdToken, AccessToken, RefreshToken, ExpiresIn }) {
  const claims = decodeJwtPayload(IdToken);
  return {
    idToken: IdToken,
    accessToken: AccessToken,
    refreshToken: RefreshToken,
    expiresAt: Date.now() + (ExpiresIn ? ExpiresIn * 1000 : 24 * 3600 * 1000) - 60_000,
    userId: claims.sub,
    email: claims.email,
    username: claims['custom:username'] || claims['cognito:username'],
    name: claims.name || claims['custom:username'] || (claims.email ? claims.email.split('@')[0] : 'You'),
  };
}

// ── Public API ──

export async function signUp({ username, email, password }) {
  if (MOCK) {
    saveSession({ userId: `mock-${username}`, email, username, name: username, mock: true });
    return getSession();
  }
  await idp('SignUp', {
    ClientId: POOL_CLIENT,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'custom:username', Value: username },
    ],
  });
  // Pool is configured to auto-verify via email link/code; sign in directly
  // (if the pool requires confirmation, Cognito returns UserNotConfirmedException
  // on sign-in and the modal shows the confirmation step).
  return signIn({ email, password });
}

export async function confirmSignUp({ email, code }) {
  if (MOCK) return getSession();
  await idp('ConfirmSignUp', { ClientId: POOL_CLIENT, Username: email, ConfirmationCode: code });
  return null;
}

export async function signIn({ email, password }) {
  if (MOCK) {
    const username = email.includes('@') ? email.split('@')[0] : email;
    saveSession({ userId: `mock-${username}`, email, username, name: username, mock: true });
    return getSession();
  }
  const data = await idp('InitiateAuth', {
    ClientId: POOL_CLIENT,
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  const s = sessionFromTokens(data.AuthenticationResult);
  saveSession(s);
  return s;
}

export function signInWithGoogle() {
  if (MOCK) {
    saveSession({ userId: 'mock-google', email: 'google@example.com', username: 'google_user', name: 'Google User', mock: true });
    return;
  }
  const redirect = encodeURIComponent(`${SITE_URL}/auth/callback`);
  window.location.href =
    `https://${COGNITO_DOMAIN}/oauth2/authorize?identity_provider=Google&response_type=code` +
    `&client_id=${POOL_CLIENT}&redirect_uri=${redirect}&scope=openid+email+profile`;
}

export async function handleOAuthCallback(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: POOL_CLIENT,
    code,
    redirect_uri: `${SITE_URL}/auth/callback`,
  });
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Google sign-in failed. Please try again.');
  const t = await res.json();
  const s = sessionFromTokens({
    IdToken: t.id_token, AccessToken: t.access_token,
    RefreshToken: t.refresh_token, ExpiresIn: t.expires_in,
  });
  saveSession(s);
  return s;
}

export async function refreshSession() {
  const s = getSession();
  if (!s?.refreshToken || MOCK) return s;
  const data = await idp('InitiateAuth', {
    ClientId: POOL_CLIENT,
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    AuthParameters: { REFRESH_TOKEN: s.refreshToken },
  });
  const next = sessionFromTokens({ ...data.AuthenticationResult, RefreshToken: s.refreshToken });
  saveSession(next);
  return next;
}

export function signOut() { clearSession(); }
