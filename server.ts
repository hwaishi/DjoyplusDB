import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import cookieParser from 'cookie-parser';
import Database from 'better-sqlite3';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'djoyplus.db');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL,
    is_verified INTEGER NOT NULL,
    is_approved INTEGER NOT NULL,
    is_active INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_digest TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    csrf_token TEXT NOT NULL
  );
`);

// Migrate legacy JSON files if they exist and DB is empty
const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
if (userCount.cnt === 0) {
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  if (fs.existsSync(USERS_FILE)) {
    try {
      const legacyUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (email, password_hash, salt, role, is_verified, is_approved, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((users) => {
        for (const u of users) {
          insertUser.run(
            u.email,
            u.passwordHash || u.password_hash,
            u.salt,
            u.role,
            u.isVerified ? 1 : (u.is_verified ? 1 : 0),
            u.isApproved ? 1 : (u.is_approved ? 1 : 0),
            u.isActive !== false ? 1 : 0,
            u.createdAt || new Date().toISOString()
          );
        }
      });
      tx(legacyUsers);
      console.log('Migrated legacy users.json to SQLite');
    } catch (e) {
      console.error('Error migrating users.json:', e);
    }
  }
}

const CODE_SECRET = process.env.CODE_SECRET || crypto.randomBytes(32).toString('hex');

// Rate limiter for Gemini requests
const geminiRateLimiter = (() => {
  const requests: number[] = [];
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const windowStart = now - 60000;
    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }
    if (requests.length >= 10) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded for Gemini requests. Please try again later.' });
    }
    requests.push(now);
    next();
  };
})();

interface InquiryRecord {
  date: string;
  timestamp: string;
  inquiryId: string;
  customerName: string;
  phoneNumber: string; // Whatsapp / Username
  gender?: string;
  ageGroup?: string;
  state?: string;
  sourceCampaign?: string;
  messageSummary: string; // Status / Remark
  agentAssigned?: string;
  status: string;
  progress?: string;
}

let demoInquiries: InquiryRecord[] = [];

// Password hashing with crypto.scryptSync
function hashPassword(password: string, existingSalt?: string): { passwordHash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return { passwordHash: derivedKey, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const { passwordHash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(hash, 'hex'));
}

function isValidPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 6;
}

function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

function getEmailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass }
  });
}

async function sendTransactionalEmail(to: string, subject: string, text: string) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error('SMTP email transport is not configured. Please configure SMTP environment variables.');
  }
  const from = process.env.SMTP_FROM || 'D\' Joy Plus <noreply@djoyplus.com>';
  await transporter.sendMail({
    from,
    to,
    subject,
    text
  });
}

const rateLimitMap = new Map<string, number[]>();
function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let timestamps = rateLimitMap.get(key) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);
  if (timestamps.length >= limit) {
    rateLimitMap.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const sessionId = req.cookies?.sessionId || req.headers['x-session-token'];
  
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }

  const now = Date.now();
  const session = db.prepare('SELECT * FROM sessions WHERE session_id = ? AND expires_at > ?').get(sessionId, now) as any;

  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid.' });
  }

  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const clientCsrf = req.headers['x-csrf-token'];
    if (!clientCsrf || clientCsrf !== session.csrf_token) {
      return res.status(403).json({ success: false, error: 'CSRF token missing or invalid.' });
    }
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(session.email) as any;

  if (!user || !user.is_active) {
    return res.status(401).json({ success: false, error: 'Account disabled or not found.' });
  }

  if (!user.is_verified || !user.is_approved) {
    return res.status(403).json({ success: false, error: 'Account pending email verification or administration approval.' });
  }

  (req as any).user = {
    email: user.email,
    role: user.role,
    isVerified: !!user.is_verified,
    isApproved: !!user.is_approved,
    isActive: !!user.is_active
  };
  next();
};

const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || user.role !== 'Administration') {
    return res.status(403).json({ success: false, error: 'Forbidden: Administration access required.' });
  }
  next();
};

const requireManagerOrAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const user = (req as any).user;
  if (!user || (user.role !== 'Administration' && user.role !== 'Manager')) {
    return res.status(403).json({ success: false, error: 'Forbidden: Manager or Administration access required.' });
  }
  next();
};

const verifyWebhookSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim() === '' || webhookSecret === 'my_whatsapp_webhook_secret') {
    return res.status(403).json({ status: 'error', code: 'CONFIG_ERROR', message: 'Webhook secret not configured on server.' });
  }
  const providedSecret = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!providedSecret || providedSecret !== webhookSecret) {
    return res.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Unauthorized: Invalid or missing inbound CRM webhook secret header.' });
  }
  next();
};

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // --- Auth API Routes ---

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = req.body.password;
      const confirmPassword = req.body.confirmPassword;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Valid email address is required.' });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'Passwords do not match.' });
      }

      if (!isValidPassword(password)) {
        return res.status(400).json({ success: false, error: 'Your password must be at least 6 characters.' });
      }

      if (!checkRateLimit(`signup:${email}`, 5, 3600000)) {
        return res.status(429).json({ success: false, error: 'Too many signup attempts. Please try again later.' });
      }

      const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
      if (existingUser) {
        if (!existingUser.is_verified) {
          const rawCode = String(crypto.randomInt(100000, 1000000));
          const codeDigest = crypto.createHmac('sha256', CODE_SECRET).update(rawCode).digest('hex');
          
          db.prepare('DELETE FROM codes WHERE email = ? AND type = ?').run(email, 'verify');
          db.prepare('INSERT INTO codes (email, code_digest, type, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(email, codeDigest, 'verify', Date.now() + 10 * 60 * 1000, 0, Date.now());

          try {
            await sendTransactionalEmail(email, "Verify your D' Joy Plus account", `Your verification code is: ${rawCode}\n\nThis code expires in 10 minutes.`);
          } catch (emailErr: any) {
            console.error('Email delivery error:', emailErr);
            return res.status(500).json({ success: false, error: 'Account exists but verification email delivery failed: ' + emailErr.message });
          }

          return res.json({ success: true, message: 'Account already exists but is unverified. A new verification code has been sent.' });
        }
        return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
      }

      const { passwordHash, salt } = hashPassword(password);
      const adminSetupEmail = normalizeEmail(process.env.ADMIN_SETUP_EMAIL || '');
      const isFirstAdmin = adminSetupEmail !== '' && email === adminSetupEmail;

      const role = isFirstAdmin ? 'Administration' : 'Employee';
      const isApproved = isFirstAdmin ? 1 : 0;

      db.prepare(`
        INSERT INTO users (email, password_hash, salt, role, is_verified, is_approved, is_active, created_at)
        VALUES (?, ?, ?, ?, 0, ?, 1, ?)
      `).run(email, passwordHash, salt, role, isApproved, new Date().toISOString());

      const rawCode = String(crypto.randomInt(100000, 1000000));
      const codeDigest = crypto.createHmac('sha256', CODE_SECRET).update(rawCode).digest('hex');

      db.prepare('DELETE FROM codes WHERE email = ? AND type = ?').run(email, 'verify');
      db.prepare('INSERT INTO codes (email, code_digest, type, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(email, codeDigest, 'verify', Date.now() + 10 * 60 * 1000, 0, Date.now());

      try {
        await sendTransactionalEmail(
          email,
          "Verify your D' Joy Plus account",
          `Your verification code is: ${rawCode}\n\nThis code expires in 10 minutes.`
        );
      } catch (emailErr: any) {
        console.error('Email delivery error:', emailErr);
        return res.status(500).json({ success: false, error: 'Account created, but verification email delivery failed: ' + emailErr.message });
      }

      res.json({ success: true, message: 'Account created. Please check your email for the verification code.' });
    } catch (err: any) {
      console.error('Signup error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  app.post('/api/auth/verify', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const codeInput = (req.body.code || '').trim();

      if (!email || !codeInput) {
        return res.status(400).json({ success: false, error: 'Email and verification code are required.' });
      }

      if (!checkRateLimit(`verify:${email}`, 5, 300000)) {
        return res.status(429).json({ success: false, error: 'Too many verification attempts. Please request a new code.' });
      }

      const codeRecord = db.prepare('SELECT * FROM codes WHERE email = ? AND type = ?').get(email, 'verify') as any;

      if (!codeRecord || codeRecord.expires_at < Date.now()) {
        return res.status(400).json({ success: false, error: 'Invalid or expired verification code.' });
      }

      if (codeRecord.attempts >= 5) {
        db.prepare('DELETE FROM codes WHERE id = ?').run(codeRecord.id);
        return res.status(400).json({ success: false, error: 'Maximum attempts exceeded for this code. Please request a new one.' });
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(crypto.createHmac('sha256', CODE_SECRET).update(codeInput).digest('hex'), 'hex'),
        Buffer.from(codeRecord.code_digest, 'hex')
      );

      if (!isValid) {
        db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE id = ?').run(codeRecord.id);
        const updated = db.prepare('SELECT attempts FROM codes WHERE id = ?').get(codeRecord.id) as any;
        if (updated && updated.attempts >= 5) {
          db.prepare('DELETE FROM codes WHERE id = ?').run(codeRecord.id);
          return res.status(400).json({ success: false, error: 'Maximum attempts exceeded for this code. Please request a new one.' });
        }
        return res.status(400).json({ success: false, error: 'Incorrect verification code.' });
      }

      const verifyTx = db.transaction(() => {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
        if (!user) {
          throw new Error('User not found.');
        }

        const adminSetupEmail = normalizeEmail(process.env.ADMIN_SETUP_EMAIL || '');
        const isFirstAdmin = adminSetupEmail !== '' && email === adminSetupEmail;

        db.prepare(`
          UPDATE users SET is_verified = 1, is_approved = CASE WHEN ? = 1 THEN 1 ELSE is_approved END, role = CASE WHEN ? = 1 THEN 'Administration' ELSE role END
          WHERE email = ?
        `).run(isFirstAdmin ? 1 : 0, isFirstAdmin ? 1 : 0, email);

        db.prepare('DELETE FROM codes WHERE email = ? AND type = ?').run(email, 'verify');
      });

      verifyTx();
      res.json({ success: true, message: 'Email verified. You can now sign in.' });
    } catch (err: any) {
      console.error('Verify error:', err);
      res.status(400).json({ success: false, error: err.message || err.toString() });
    }
  });

  app.post('/api/auth/resend-code', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const type = req.body.type === 'reset' ? 'reset' : 'verify';

      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
      }

      if (!checkRateLimit(`resend:${email}`, 3, 60000)) {
        return res.status(429).json({ success: false, error: 'Please wait 60 seconds before requesting a new code.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
      if (!user) {
        return res.json({ success: true, message: 'If the email exists, a new code has been sent.' });
      }

      const rawCode = String(crypto.randomInt(100000, 1000000));
      const codeDigest = crypto.createHmac('sha256', CODE_SECRET).update(rawCode).digest('hex');

      db.prepare('DELETE FROM codes WHERE email = ? AND type = ?').run(email, type);
      db.prepare('INSERT INTO codes (email, code_digest, type, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(email, codeDigest, type, Date.now() + 10 * 60 * 1000, 0, Date.now());

      const subject = type === 'reset' ? "Password Reset Code - D' Joy Plus" : "Verify your D' Joy Plus account";
      await sendTransactionalEmail(email, subject, `Your new verification code is: ${rawCode}\n\nThis code expires in 10 minutes.`);

      res.json({ success: true, message: 'A new code has been sent to your email.' });
    } catch (err: any) {
      console.error('Resend error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const password = req.body.password;

      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required.' });
      }

      if (!checkRateLimit(`login:${email}`, 10, 300000)) {
        return res.status(429).json({ success: false, error: 'Too many login attempts. Please try again later.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      if (!user.is_active) {
        return res.status(403).json({ success: false, error: 'This account has been disabled by Administration.' });
      }

      if (!user.is_verified) {
        return res.status(403).json({ success: false, error: 'Email not verified. Please verify your email first.', unverified: true });
      }

      if (!user.is_approved) {
        return res.status(403).json({ success: false, error: 'Waiting for administration approval.', pendingApproval: true });
      }

      const sessionId = crypto.randomBytes(32).toString('hex');
      const csrfToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 7 * 24 * 3600 * 1000;

      db.prepare('INSERT INTO sessions (session_id, email, expires_at, csrf_token) VALUES (?, ?, ?, ?)')
        .run(sessionId, email, expiresAt, csrfToken);

      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 3600 * 1000
      });

      res.json({
        success: true,
        csrfToken,
        user: {
          email: user.email,
          role: user.role
        }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const sessionId = req.cookies?.sessionId || req.headers['x-session-token'];
    if (sessionId) {
      db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    }
    res.clearCookie('sessionId');
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = (req as any).user;
    const sessionId = req.cookies?.sessionId;
    let csrfToken = '';
    if (sessionId) {
      const session = db.prepare('SELECT csrf_token FROM sessions WHERE session_id = ?').get(sessionId) as any;
      if (session) csrfToken = session.csrf_token;
    }
    res.json({
      success: true,
      csrfToken,
      user: {
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        isApproved: user.isApproved,
        isActive: user.isActive
      }
    });
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
      }

      if (!checkRateLimit(`forgot:${email}`, 3, 300000)) {
        return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

      if (user && user.is_active) {
        const rawCode = String(crypto.randomInt(100000, 1000000));
        const codeDigest = crypto.createHmac('sha256', CODE_SECRET).update(rawCode).digest('hex');

        db.prepare('DELETE FROM codes WHERE email = ? AND type = ?').run(email, 'reset');
        db.prepare('INSERT INTO codes (email, code_digest, type, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(email, codeDigest, 'reset', Date.now() + 10 * 60 * 1000, 0, Date.now());

        await sendTransactionalEmail(
          email,
          "Password Reset Code - D' Joy Plus",
          `Your password reset code is: ${rawCode}\n\nThis code expires in 10 minutes.`
        );
      }

      res.json({ success: true, message: 'If the email exists in our system, a password reset code has been sent.' });
    } catch (err: any) {
      console.error('Forgot password error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const codeInput = (req.body.code || '').trim();
      const newPassword = req.body.newPassword;
      const confirmPassword = req.body.confirmPassword;

      if (!email || !codeInput || !newPassword) {
        return res.status(400).json({ success: false, error: 'All fields are required.' });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'Passwords do not match.' });
      }

      if (!isValidPassword(newPassword)) {
        return res.status(400).json({ success: false, error: 'Your password must be at least 6 characters.' });
      }

      const codeRecord = db.prepare('SELECT * FROM codes WHERE email = ? AND type = ?').get(email, 'reset') as any;

      if (!codeRecord || codeRecord.expires_at < Date.now()) {
        return res.status(400).json({ success: false, error: 'Invalid or expired password reset code.' });
      }

      if (codeRecord.attempts >= 5) {
        db.prepare('DELETE FROM codes WHERE id = ?').run(codeRecord.id);
        return res.status(400).json({ success: false, error: 'Maximum attempts exceeded for this code. Please request a new one.' });
      }

      const isValid = crypto.timingSafeEqual(
        Buffer.from(crypto.createHmac('sha256', CODE_SECRET).update(codeInput).digest('hex'), 'hex'),
        Buffer.from(codeRecord.code_digest, 'hex')
      );

      if (!isValid) {
        db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE id = ?').run(codeRecord.id);
        const updated = db.prepare('SELECT attempts FROM codes WHERE id = ?').get(codeRecord.id) as any;
        if (updated && updated.attempts >= 5) {
          db.prepare('DELETE FROM codes WHERE id = ?').run(codeRecord.id);
          return res.status(400).json({ success: false, error: 'Maximum attempts exceeded for this code. Please request a new one.' });
        }
        return res.status(400).json({ success: false, error: 'Incorrect password reset code.' });
      }

      const resetTx = db.transaction(() => {
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
        if (!user) {
          throw new Error('User not found.');
        }

        const { passwordHash, salt } = hashPassword(newPassword);
        db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE email = ?').run(passwordHash, salt, email);

        db.prepare('DELETE FROM codes WHERE email = ? AND type = ?').run(email, 'reset');
        db.prepare('DELETE FROM sessions WHERE email = ?').run(email);
      });

      resetTx();
      res.json({ success: true, message: 'Password successfully reset. You can now sign in with your new password.' });
    } catch (err: any) {
      console.error('Reset password error:', err);
      res.status(400).json({ success: false, error: err.message || err.toString() });
    }
  });

  // --- Admin API Routes ---

  app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    const users = db.prepare('SELECT email, role, is_verified, is_approved, is_active, created_at FROM users').all() as any[];
    res.json({
      success: true,
      users: users.map(u => ({
        email: u.email,
        role: u.role,
        isVerified: !!u.is_verified,
        isApproved: !!u.is_approved,
        isActive: !!u.is_active,
        createdAt: u.created_at
      }))
    });
  });

  app.post('/api/admin/users/:email/status', requireAuth, requireAdmin, (req, res) => {
    const targetEmail = normalizeEmail(req.params.email);
    const { isApproved, isActive } = req.body;
    const currentUser = (req as any).user;

    const targetUser = db.prepare('SELECT * FROM users WHERE email = ?').get(targetEmail) as any;
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const newApproved = isApproved !== undefined ? (isApproved ? 1 : 0) : targetUser.is_approved;
    const newActive = isActive !== undefined ? (isActive ? 1 : 0) : targetUser.is_active;

    if (targetUser.role === 'Administration' && (newActive === 0 || newApproved === 0)) {
      const activeAdmins = db.prepare("SELECT email FROM users WHERE role = 'Administration' AND is_active = 1 AND is_approved = 1").all() as any[];
      if (activeAdmins.length <= 1 && activeAdmins.some(a => a.email === targetEmail)) {
        return res.status(400).json({ success: false, error: 'Cannot disable or unapprove the last active administrator.' });
      }
    }

    db.prepare('UPDATE users SET is_approved = ?, is_active = ? WHERE email = ?').run(newApproved, newActive, targetEmail);

    if (newActive === 0) {
      db.prepare('DELETE FROM sessions WHERE email = ?').run(targetEmail);
    }

    res.json({ success: true, message: 'User status updated successfully.' });
  });

  app.post('/api/admin/users/:email/role', requireAuth, requireAdmin, (req, res) => {
    const targetEmail = normalizeEmail(req.params.email);
    const newRole = req.body.role;

    if (!['Administration', 'Manager', 'Employee'].includes(newRole)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified.' });
    }

    const targetUser = db.prepare('SELECT * FROM users WHERE email = ?').get(targetEmail) as any;
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (targetUser.role === 'Administration' && newRole !== 'Administration') {
      const activeAdmins = db.prepare("SELECT email FROM users WHERE role = 'Administration' AND is_active = 1 AND is_approved = 1").all() as any[];
      if (activeAdmins.length <= 1 && activeAdmins.some(a => a.email === targetEmail)) {
        return res.status(400).json({ success: false, error: 'Cannot demote the last active administrator.' });
      }
    }

    db.prepare('UPDATE users SET role = ? WHERE email = ?').run(newRole, targetEmail);
    res.json({ success: true, message: 'User role updated successfully.' });
  });

  // Cleanup dry run endpoint for identifying seeded or demo test accounts
  app.post('/api/admin/cleanup-dry-run', requireAuth, requireAdmin, (req, res) => {
    try {
      const users = db.prepare('SELECT email, role, is_verified, is_approved, is_active, created_at FROM users').all() as any[];
      const seededUsers = users.filter(u => u.email.includes('demo') || u.email.includes('test') || u.email.includes('example.com'));
      
      res.json({
        success: true,
        dryRun: true,
        affectedUsersCount: seededUsers.length,
        affectedUsers: seededUsers.map(u => u.email),
        message: 'Dry run completed. No records have been deleted. Review the list above before requesting approval for deletion.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // SMTP Connection & Authentication Test Route
  app.get('/api/admin/smtp-test', requireAuth, requireAdmin, async (req, res) => {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    const missing = [];
    if (!host) missing.push('SMTP_HOST');
    if (!port) missing.push('SMTP_PORT');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    if (!from) missing.push('SMTP_FROM');

    if (missing.length > 0) {
      return res.json({
        success: false,
        status: 'missing_settings',
        missingVariables: missing,
        error: `Missing required environment variables: ${missing.join(', ')}`
      });
    }

    try {
      const transporter = getEmailTransporter();
      if (!transporter) {
        return res.json({ success: false, status: 'config_error', error: 'Email transporter could not be initialized.' });
      }
      await transporter.verify();
      res.json({ success: true, status: 'connected', message: 'SMTP connection and authentication verified successfully.' });
    } catch (err: any) {
      if (err.code === 'EAUTH' || err.responseCode === 535) {
        res.json({ success: false, status: 'auth_rejected', error: 'SMTP Authentication rejected. Please verify your Gmail App Password.' });
      } else {
        res.json({ success: false, status: 'connection_failed', error: 'SMTP Connection failed: ' + err.message });
      }
    }
  });

  // --- Inquiries API Routes ---

  app.get('/api/inquiries', requireAuth, async (req, res) => {
    try {
      const mode = req.query.mode === 'live' ? 'live' : 'demo';
      const currentUser = (req as any).user;

      let rawData: InquiryRecord[] = [];

      if (mode === 'demo') {
        rawData = demoInquiries;
      } else {
        const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
        const readSecret = process.env.APPS_SCRIPT_READ_SECRET;

        if (!appsScriptUrl || !readSecret || readSecret.trim() === '') {
          return res.status(503).json({ success: false, error: 'Live Google Sheets read access not configured.' });
        }

        const envelope = { operation: 'read', credential: readSecret };
        const response = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope)
        });

        if (!response.ok) {
          throw new Error(`Apps Script responded with HTTP status ${response.status}`);
        }
        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
          rawData = result.data;
        } else {
          return res.status(502).json({ success: false, error: result.message || 'Failed to read data from Google Sheets ("DJ Client Base").' });
        }
      }

      let filteredData = rawData;
      if (currentUser.role === 'Employee') {
        filteredData = rawData.filter(inq => {
          const assigned = (inq.agentAssigned || '').trim().toLowerCase();
          const empEmail = currentUser.email.toLowerCase();
          const empUserPart = empEmail.split('@')[0];
          return assigned === empEmail || assigned === empUserPart;
        });
      }

      res.json({ success: true, inquiries: filteredData });
    } catch (err: any) {
      console.error('Fetch inquiries error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // CSV Export
  app.get('/api/inquiries/export', requireAuth, requireManagerOrAdmin, async (req, res) => {
    try {
      const mode = req.query.mode === 'live' ? 'live' : 'demo';
      let rawData: InquiryRecord[] = [];

      if (mode === 'demo') {
        rawData = demoInquiries;
      } else {
        const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
        const readSecret = process.env.APPS_SCRIPT_READ_SECRET;
        if (!appsScriptUrl || !readSecret) {
          return res.status(503).json({ success: false, error: 'Live read access not configured.' });
        }
        const response = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'read', credential: readSecret })
        });
        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
          rawData = result.data;
        }
      }

      const headers = ['Date In', 'Name', 'Whatsapp / Username', 'Gender', 'Age Group', 'State', 'Status / Remark', 'Progress'];
      const csvRows = [headers.join(',')];
      for (const inq of rawData) {
        const row = [
          inq.date,
          `"${(inq.customerName || '').replace(/"/g, '""')}"`,
          `"${inq.phoneNumber}"`,
          `"${inq.gender || 'Unknown'}"`,
          `"${inq.ageGroup || ''}"`,
          `"${inq.state || ''}"`,
          `"${(inq.messageSummary || '').replace(/"/g, '""')}"`,
          `"${inq.progress || ''}"`
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="DJ_Client_Base_Export.csv"');
      res.send(csvRows.join('\n'));
    } catch (err: any) {
      res.status(500).send('Export error: ' + err.toString());
    }
  });

  // Excel (.xlsx) Export matching “MP Ads Spend vs Revenue vs Client Inquiries” template ("DJ Client Base" sheet)
  app.get('/api/inquiries/export-excel', requireAuth, requireManagerOrAdmin, async (req, res) => {
    try {
      const mode = req.query.mode === 'live' ? 'live' : 'demo';
      let rawData: InquiryRecord[] = [];

      if (mode === 'demo') {
        rawData = demoInquiries;
      } else {
        const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
        const readSecret = process.env.APPS_SCRIPT_READ_SECRET;
        if (!appsScriptUrl || !readSecret) {
          return res.status(503).json({ success: false, error: 'Live read access not configured.' });
        }
        const response = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operation: 'read', credential: readSecret })
        });
        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
          rawData = result.data;
        }
      }

      const wb = XLSX.utils.book_new();
      const wsData: any[][] = [];

      // Row 1: Legend (H1: Status, I1: 25%, J1: 50%, K1: 75%, L1: 100%)
      wsData.push(['', '', '', '', '', '', '', 'Status', '25%', '50%', '75%', '100%']);
      // Row 2: Headers (A2: '', B2: Date In, C2: Name, D2: Whatsapp / Username, E2: Gender (F/M/Unknown), F2: Age Group, G2: State, H2: Status / Remark)
      wsData.push(['', 'Date In', 'Name', 'Whatsapp / Username', 'Gender (F/M/Unknown)', 'Age Group', 'State', 'Status / Remark']);

      for (const inq of rawData) {
        wsData.push([
          '',
          inq.date,
          inq.customerName,
          String(inq.phoneNumber || ''),
          inq.gender || 'Unknown',
          inq.ageGroup || '',
          inq.state || '',
          inq.messageSummary || ''
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths and text formatting for column D (Whatsapp / Username)
      ws['!cols'] = [
        { wch: 5 },  // A
        { wch: 12 }, // B: Date In
        { wch: 22 }, // C: Name
        { wch: 20 }, // D: Whatsapp / Username
        { wch: 15 }, // E: Gender
        { wch: 12 }, // F: Age Group
        { wch: 15 }, // G: State
        { wch: 45 }  // H: Status / Remark
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'DJ Client Base');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="MP Ads Spend vs Revenue vs Client Inquiries.xlsx"');
      res.send(buf);
    } catch (err: any) {
      console.error('Excel export error:', err);
      res.status(500).send('Excel export error: ' + err.toString());
    }
  });

  // --- CRM Webhook Ingestion ---
  app.post('/api/webhook/whatsapp', verifyWebhookSecret, async (req, res) => {
    try {
      const body = req.body;
      const { inquiryId, customerName, phoneNumber, gender, ageGroup, state, sourceCampaign, messageSummary, agentAssigned, status, progress } = body;

      if (!inquiryId || !customerName || !phoneNumber) {
        return res.status(400).json({ status: 'error', code: 'INVALID_PAYLOAD', message: 'Missing required inquiry fields.' });
      }

      const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
      const writeSecret = process.env.APPS_SCRIPT_WRITE_SECRET;

      if (!appsScriptUrl || !writeSecret || writeSecret.trim() === '') {
        return res.status(503).json({ status: 'error', code: 'CONFIG_ERROR', message: 'Apps Script write-only endpoint not configured.' });
      }

      const newInquiry: InquiryRecord = {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        inquiryId,
        customerName,
        phoneNumber,
        gender: gender || 'Unknown',
        ageGroup: ageGroup || '',
        state: state || '',
        sourceCampaign: sourceCampaign || 'Direct_WhatsApp',
        messageSummary: messageSummary || '',
        agentAssigned: agentAssigned || 'Unassigned',
        status: status || 'New',
        progress: progress || ''
      };

      const envelope = { operation: 'write', credential: writeSecret, payload: newInquiry };
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      });

      if (!response.ok) {
        return res.status(503).json({ status: 'error', code: 'APPS_SCRIPT_UNAVAILABLE', message: `Apps Script unreachable (HTTP ${response.status})` });
      }

      const result = await response.json();
      if (result.status === 'success' || result.status === 'updated') {
        return res.json({ status: 'success', message: 'Inquiry successfully synced to Google Sheets ("DJ Client Base").' });
      } else {
        return res.status(503).json({ status: 'error', code: 'SHEETS_WRITE_FAILED', message: result.message || 'Google Sheets rejected the write.' });
      }
    } catch (err: any) {
      console.error('Webhook error:', err);
      res.status(500).json({ status: 'error', code: 'INTERNAL_ERROR', message: err.toString() });
    }
  });

  // --- Gemini Mapper Proxy ---
  app.post('/api/gemini/map', requireAuth, geminiRateLimiter, async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ success: false, error: 'Gemini API key not configured on server.' });
      }

      const payload = req.body.payload;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Map the following WhatsApp inquiry JSON payload into standard CRM format { inquiryId, customerName, phoneNumber, gender, ageGroup, state, sourceCampaign, messageSummary, agentAssigned, status, progress } for worksheet "DJ Client Base":\n${JSON.stringify(payload)}`
      });

      res.json({ success: true, result: response.text });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
