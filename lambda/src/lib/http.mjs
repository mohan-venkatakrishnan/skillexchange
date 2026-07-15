const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Superadmin-Username,X-Superadmin-Password',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

export const ok = (body) => json(200, body);
export const bad = (message) => json(400, { message });
export const unauthorized = (message = 'Unauthorized') => json(401, { message });
export const forbidden = (message = 'Forbidden') => json(403, { message });
export const notFound = (message = 'Not found') => json(404, { message });
export const conflict = (message) => json(409, { message });
export const unavailable = (message) => json(503, { message });
export const serverError = () => json(500, { message: 'Internal error' });

export function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch { return null; }
}

export function claims(event) {
  const c = event.requestContext?.authorizer?.claims;
  if (!c?.sub) return null;
  return {
    userId: c.sub,
    email: c.email,
    username: (c['custom:username'] || '').toLowerCase() || null,
    name: c.name || null,
  };
}

// Wrap a route handler: logs every request outcome, converts throws to 500.
export function route(fn) {
  return async (event) => {
    const path = `${event.httpMethod} ${event.path}`;
    try {
      const res = await fn(event);
      console.log(JSON.stringify({ path, status: res.statusCode }));
      return res;
    } catch (err) {
      console.error(JSON.stringify({ path, error: err.message, stack: err.stack }));
      return serverError();
    }
  };
}
