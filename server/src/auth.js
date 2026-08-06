import { auth } from 'express-oauth2-jwt-bearer';

export function createAuthMiddleware({ domain, audience }) {
  if (!domain || !audience) {
    throw new Error('AUTH0_DOMAIN and AUTH0_AUDIENCE are required');
  }
  return auth({
    audience,
    issuerBaseURL: `https://${domain}/`,
    tokenSigningAlg: 'RS256',
  });
}

/** Attach userSub + optional email from JWT claims */
export function attachUser(req, _res, next) {
  const payload = req.auth?.payload || {};
  req.userSub = payload.sub;
  req.userEmail = payload.email || payload[`${payload.aud}/email`] || payload['https://peleg.trading/email'];
  if (!req.userSub) {
    return next(Object.assign(new Error('Missing subject in token'), { status: 401 }));
  }
  next();
}

export function allowlistGuard(allowedCsv) {
  const allowed = String(allowedCsv || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return (req, res, next) => {
    if (allowed.length === 0) return next();
    const email = String(req.userEmail || '').toLowerCase();
    const sub = String(req.userSub || '').toLowerCase();
    if (allowed.includes(email) || allowed.includes(sub)) return next();
    return res.status(403).json({ error: 'User not allowlisted' });
  };
}
