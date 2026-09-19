const crypto = require('crypto');

// Clave secreta para la firma y verificación matemática de tokens JWT
const JWT_SECRET = process.env.CRISPY_JWT_SECRET || process.env.JWT_SECRET || 'crispy-pos-jwt-secret-key-2026-auth-token';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let output = str.replace(/-/g, '+').replace(/_/g, '/');
  while (output.length % 4) {
    output += '=';
  }
  return Buffer.from(output, 'base64').toString('utf8');
}

/**
 * Genera un token JWT estándar (RFC 7519) firmado con HMAC-SHA256
 */
function createSession(user, expiresInSeconds = 12 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: user.id || user.username,
    username: user.username,
    role: user.role,
    shift: user.shift || 'ambos',
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Valida la firma matemática y expiración del JWT
 */
function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Token expirado
    }
    return payload;
  } catch (e) {
    return null;
  }
}

function extractToken(req) {
  const authHeader = req.get('authorization') || req.get('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }
  return req.get('x-mugrosito-token') || req.get('x-crispy-token') || req.get('x-basilico-session') || null;
}

function requireSession(req, res, next) {
  const token = extractToken(req);
  const user = getSession(token);
  if (!user) {
    return res.status(401).json({ error: 'Sesión no válida o expirada. Debes iniciar sesión primero.' });
  }
  req.user = user;
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    return next();
  };
}

module.exports = { createSession, getSession, requireSession, requireRole };