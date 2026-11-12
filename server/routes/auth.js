import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { upsertUser, getUserById, getStorageUsage, noteUserConnection } from '../db.js';

const router = Router();

function getJwtSecret() {
  return process.env.JWT_SECRET || 'pronto-dev-secret-change-in-production';
}

function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || '';
}

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, isAdmin: !!user.is_admin, sessionNonce: user.session_nonce ?? getUserById(user.id)?.session_nonce ?? null },
    getJwtSecret(),
    { expiresIn: '90d' }
  );
}

// Auth middleware
export function requireAuth(req, res, next) {
  const token = req.cookies?.pronto_session || 
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const user = getUserById(decoded.id);
    if (!user || (user.session_nonce ?? null) !== (decoded.sessionNonce ?? null)) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Admin only middleware
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const user = getUserById(req.user.id);
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Google Sign-In verification
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing credential token' });
    }

    const googleClientId = getGoogleClientId();
    if (!googleClientId) {
      return res.status(500).json({
        error: 'GOOGLE_CLIENT_ID is not configured on the server. Set GOOGLE_CLIENT_ID in server/.env'
      });
    }

    const client = new OAuth2Client(googleClientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId
    });
    const payload = ticket.getPayload();
    const googleUser = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };

    const adminEmails = getAdminEmails();
    const isAdmin = adminEmails.includes(googleUser.email.toLowerCase()) ? 1 : 0;

    const user = upsertUser({
      id: `usr_${googleUser.sub}`,
      google_id: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.picture,
      is_admin: isAdmin
    });

    const token = generateToken(user);
    noteUserConnection(user.id);
    const storage = getStorageUsage(user.id);

    res.cookie('pronto_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        isAdmin: !!user.is_admin,
        isBanned: !!user.is_banned,
        banReason: user.ban_reason || ''
      },
      storageUsage: storage
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Failed to verify Google credential' });
  }
});

// Check active session & get current user info with storage metrics
router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  noteUserConnection(user.id);
  const storage = getStorageUsage(user.id);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      isAdmin: !!user.is_admin,
      isBanned: !!user.is_banned,
      banReason: user.ban_reason || ''
    },
    storageUsage: storage
  });
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('pronto_session');
  res.json({ success: true });
});

export default router;

