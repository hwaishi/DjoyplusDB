import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.resolve(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CODES_FILE = path.join(DATA_DIR, 'verification_codes.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'live_inquiries.json');

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

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface UserRecord {
  email: string;
  passwordHash: string;
  salt: string;
  role: 'Administration' | 'Manager' | 'Employee';
  isVerified: boolean;
  isApproved: boolean;
  isActive: boolean;
  createdAt: string;
}

interface CodeRecord {
  email: string;
  code: string;
  type: 'verify' | 'reset';
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

interface SessionRecord {
  sessionId: string;
  email: string;
  expiresAt: number;
}

interface InquiryRecord {
  date: string;
  timestamp: string;
  inquiryId: string;
  customerName: string;
  phoneNumber: string;
  sourceCampaign: string;
  messageSummary: string;
  agentAssigned: string;
  status: 'New' | 'In Progress' | 'Qualified' | 'Closed' | 'Lost';
}

// In-memory demo inquiries for sandbox
let demoInquiries: InquiryRecord[] = [
  {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    inquiryId: 'WH-88392',
    customerName: 'Sarah Jenkins',
    phoneNumber: '+15552348901',
    sourceCampaign: 'Meta_FB_Promo_Nov',
    messageSummary: 'Inquired about pricing and availability for the enterprise tier.',
    agentAssigned: 'Alex Tan',
    status: 'Qualified'
  },
  {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString().replace('T', ' ').substring(0, 19),
    inquiryId: 'WH-88391',
    customerName: 'Marcus Vance',
    phoneNumber: '+15559876543',
    sourceCampaign: 'Google_Search_Brand',
    messageSummary: 'Asked for onboarding documentation and setup guide.',
    agentAssigned: 'Jessica Lee',
    status: 'Closed'
  }
];

// Durable storage helpers
function loadUsers(): UserRecord[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
  return [];
}

function saveUsers(users: UserRecord[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function loadCodes(): CodeRecord[] {
  try {
    if (fs.existsSync(CODES_FILE)) {
      return JSON.parse(fs.readFileSync(CODES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading codes:', err);
  }
  return [];
}

function saveCodes(codes: CodeRecord[]): void {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2), 'utf-8');
}

function loadSessions(): SessionRecord[] {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
  }
  return [];
}

function saveSessions(sessions: SessionRecord[]): void {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

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

// Password validation rule: exactly 6 alphanumeric characters, including at least one letter and one number
function isValidPassword(password: string): boolean {
  const regex = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9]{6}$/;
  return regex.test(password);
}

// Email normalization
function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

// Email Transporter setup
function getEmailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  // Fallback test transporter (ethereal or stub transport that logs to console and stores in data/sent_emails.json)
  return {
    sendMail: async (mailOptions: { to: string; subject: string; text: string; html?: string }) => {
      console.log('--- SIMULATED EMAIL SENT ---');
      console.log(`To: ${mailOptions.to}`);
      console.log(`Subject: ${mailOptions.subject}`);
      console.log(`Body:\n${mailOptions.text}`);
      console.log('----------------------------');
      const sentLogFile = path.join(DATA_DIR, 'sent_emails.json');
      const logs = fs.existsSync(sentLogFile) ? JSON.parse(fs.readFileSync(sentLogFile, 'utf-8')) : [];
      logs.push({ ...mailOptions, sentAt: new Date().toISOString() });
      fs.writeFileSync(sentLogFile, JSON.stringify(logs, null, 2), 'utf-8');
      return { messageId: 'simulated-' + Date.now() };
    }
  };
}

async function sendTransactionalEmail(to: string, subject: string, text: string) {
  const transporter = getEmailTransporter();
  const from = process.env.SMTP_FROM || 'D\' Joy Plus <noreply@djoyplus.com>';
  await transporter.sendMail({
    from,
    to,
    subject,
    text
  });
}

// Rate limiting helper
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

// Get current date & timestamp in Asia/Kuala_Lumpur
function getMalaysiaDateTime() {
  const now = new Date();
  const formatterDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const formatterTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const dateStr = formatterDate.format(now);
  const timeStr = formatterTime.format(now);
  return { dateStr, timestampStr: `${dateStr} ${timeStr}` };
}

// Gemini sanitization for privacy
function sanitizeJsonForAi(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      if (obj.match(/^[+\d\s()-]+$/)) return '+15550000000';
      if (obj.includes('@')) return 'user@example.com';
      return 'Sample text';
    }
    if (typeof obj === 'number') return 123;
    if (typeof obj === 'boolean') return true;
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 2).map(item => sanitizeJsonForAi(item));
  }
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('key') || lowerKey.includes('password') || lowerKey.includes('auth')) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeJsonForAi(value);
    }
  }
  return sanitized;
}

// Session authentication middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '') || req.headers['x-session-token'];
  
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }

  const sessions = loadSessions();
  const now = Date.now();
  const session = sessions.find(s => s.sessionId === token && s.expiresAt > now);

  if (!session) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid.' });
  }

  const users = loadUsers();
  const user = users.find(u => u.email === session.email);

  if (!user || !user.isActive) {
    return res.status(401).json({ success: false, error: 'Account disabled or not found.' });
  }

  if (!user.isVerified || !user.isApproved) {
    return res.status(403).json({ success: false, error: 'Account pending email verification or administration approval.' });
  }

  (req as any).user = user;
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

// CRM Webhook Secret Verification Middleware
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

  // --- Auth API Routes ---

  // Signup
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
        return res.status(400).json({ success: false, error: 'Password must be exactly 6 alphanumeric characters, including at least one letter and one number.' });
      }

      if (!checkRateLimit(`signup:${email}`, 5, 3600000)) {
        return res.status(429).json({ success: false, error: 'Too many signup attempts. Please try again later.' });
      }

      const users = loadUsers();
      if (users.some(u => u.email === email)) {
        return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
      }

      const { passwordHash, salt } = hashPassword(password);
      const adminSetupEmail = normalizeEmail(process.env.ADMIN_SETUP_EMAIL || 'admin@djoyplus.com');
      const isFirstAdmin = email === adminSetupEmail;

      const newUser: UserRecord = {
        email,
        passwordHash,
        salt,
        role: isFirstAdmin ? 'Administration' : 'Employee',
        isVerified: false,
        isApproved: isFirstAdmin ? true : false, // First setup admin is pre-approved upon email verification
        isActive: true,
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      saveUsers(users);

      // Generate 6-digit verification code
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codes = loadCodes().filter(c => !(c.email === email && c.type === 'verify'));
      codes.push({
        email,
        code,
        type: 'verify',
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
        createdAt: Date.now()
      });
      saveCodes(codes);

      // Send verification email
      await sendTransactionalEmail(
        email,
        "Verify your D' Joy Plus account",
        `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`
      );

      res.json({ success: true, message: 'Account created. Please check your email for the verification code.' });
    } catch (err: any) {
      console.error('Signup error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Verify Email Code
  app.post('/api/auth/verify', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const code = (req.body.code || '').trim();

      if (!email || !code) {
        return res.status(400).json({ success: false, error: 'Email and verification code are required.' });
      }

      if (!checkRateLimit(`verify:${email}`, 5, 300000)) {
        return res.status(429).json({ success: false, error: 'Too many verification attempts. Please request a new code.' });
      }

      const codes = loadCodes();
      const codeRecord = codes.find(c => c.email === email && c.type === 'verify');

      if (!codeRecord || codeRecord.expiresAt < Date.now()) {
        return res.status(400).json({ success: false, error: 'Invalid or expired verification code.' });
      }

      if (codeRecord.attempts >= 5) {
        return res.status(400).json({ success: false, error: 'Maximum attempts exceeded for this code. Please request a new one.' });
      }

      if (codeRecord.code !== code) {
        codeRecord.attempts += 1;
        saveCodes(codes);
        return res.status(400).json({ success: false, error: 'Incorrect verification code.' });
      }

      // Mark verified
      const users = loadUsers();
      const user = users.find(u => u.email === email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }

      user.isVerified = true;
      saveUsers(users);

      // Remove used code
      saveCodes(codes.filter(c => !(c.email === email && c.type === 'verify')));

      res.json({ success: true, message: 'Email verified. You can now sign in.' });
    } catch (err: any) {
      console.error('Verify error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Resend Code
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

      const users = loadUsers();
      const user = users.find(u => u.email === email);
      if (!user) {
        // Return success to prevent email enumeration
        return res.json({ success: true, message: 'If the email exists, a new code has been sent.' });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codes = loadCodes().filter(c => !(c.email === email && c.type === type));
      codes.push({
        email,
        code,
        type,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
        createdAt: Date.now()
      });
      saveCodes(codes);

      const subject = type === 'reset' ? "Password Reset Code - D' Joy Plus" : "Verify your D' Joy Plus account";
      await sendTransactionalEmail(email, subject, `Your new verification code is: ${code}\n\nThis code expires in 10 minutes.`);

      res.json({ success: true, message: 'A new code has been sent to your email.' });
    } catch (err: any) {
      console.error('Resend error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Login
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

      const users = loadUsers();
      const user = users.find(u => u.email === email);

      if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ success: false, error: 'This account has been disabled by Administration.' });
      }

      if (!user.isVerified) {
        return res.status(403).json({ success: false, error: 'Email not verified. Please verify your email first.', unverified: true });
      }

      if (!user.isApproved) {
        return res.status(403).json({ success: false, error: 'Waiting for administration approval.', pendingApproval: true });
      }

      // Create session token
      const sessionId = crypto.randomBytes(32).toString('hex');
      const sessions = loadSessions();
      const expiresAt = Date.now() + 7 * 24 * 3600 * 1000; // 7 days
      sessions.push({ sessionId, email, expiresAt });
      saveSessions(sessions);

      res.json({
        success: true,
        token: sessionId,
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

  // Logout
  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || req.headers['x-session-token'];
    if (token) {
      let sessions = loadSessions();
      sessions = sessions.filter(s => s.sessionId !== token);
      saveSessions(sessions);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  // Get current user profile
  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = (req as any).user as UserRecord;
    res.json({
      success: true,
      user: {
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        isApproved: user.isApproved,
        isActive: user.isActive
      }
    });
  });

  // Forgot Password
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required.' });
      }

      if (!checkRateLimit(`forgot:${email}`, 3, 300000)) {
        return res.status(429).json({ success: false, error: 'Too requests. Please try again later.' });
      }

      const users = loadUsers();
      const user = users.find(u => u.email === email);

      // Always show the same confirmation whether or not the account exists (prevent email enumeration)
      if (user && user.isActive) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codes = loadCodes().filter(c => !(c.email === email && c.type === 'reset'));
        codes.push({
          email,
          code,
          type: 'reset',
          expiresAt: Date.now() + 10 * 60 * 1000,
          attempts: 0,
          createdAt: Date.now()
        });
        saveCodes(codes);

        await sendTransactionalEmail(
          email,
          "Password Reset Code - D' Joy Plus",
          `Your password reset code is: ${code}\n\nThis code expires in 10 minutes.`
        );
      }

      res.json({ success: true, message: 'If the email exists in our system, a password reset code has been sent.' });
    } catch (err: any) {
      console.error('Forgot password error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Reset Password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const code = (req.body.code || '').trim();
      const newPassword = req.body.newPassword;
      const confirmPassword = req.body.confirmPassword;

      if (!email || !code || !newPassword) {
        return res.status(400).json({ success: false, error: 'All fields are required.' });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'Passwords do not match.' });
      }

      if (!isValidPassword(newPassword)) {
        return res.status(400).json({ success: false, error: 'Password must be exactly 6 alphanumeric characters, including at least one letter and one number.' });
      }

      const codes = loadCodes();
      const codeRecord = codes.find(c => c.email === email && c.type === 'reset');

      if (!codeRecord || codeRecord.expiresAt < Date.now() || codeRecord.code !== code) {
        return res.status(400).json({ success: false, error: 'Invalid or expired password reset code.' });
      }

      const users = loadUsers();
      const user = users.find(u => u.email === email);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }

      const { passwordHash, salt } = hashPassword(newPassword);
      user.passwordHash = passwordHash;
      user.salt = salt;
      saveUsers(users);

      // Invalidate reset code and existing sessions
      saveCodes(codes.filter(c => !(c.email === email && c.type === 'reset')));
      let sessions = loadSessions();
      sessions = sessions.filter(s => s.email !== email);
      saveSessions(sessions);

      res.json({ success: true, message: 'Password successfully reset. You can now sign in with your new password.' });
    } catch (err: any) {
      console.error('Reset password error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // --- Admin API Routes ---

  // Get all users (Admin only)
  app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    const users = loadUsers();
    res.json({
      success: true,
      users: users.map(u => ({
        email: u.email,
        role: u.role,
        isVerified: u.isVerified,
        isApproved: u.isApproved,
        isActive: u.isActive,
        createdAt: u.createdAt
      }))
    });
  });

  // Approve or disable account (Admin only)
  app.post('/api/admin/users/:email/status', requireAuth, requireAdmin, (req, res) => {
    const targetEmail = normalizeEmail(req.params.email);
    const { isApproved, isActive } = req.body;
    const currentUser = (req as any).user as UserRecord;

    const users = loadUsers();
    const targetUser = users.find(u => u.email === targetEmail);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (targetEmail === currentUser.email && (isActive === false || isApproved === false)) {
      return res.status(400).json({ success: false, error: 'You cannot disable or unapprove your own administrator account.' });
    }

    if (isApproved !== undefined) targetUser.isApproved = !!isApproved;
    if (isActive !== undefined) targetUser.isActive = !!isActive;

    saveUsers(users);

    // Invalidate sessions if deactivated
    if (!targetUser.isActive) {
      let sessions = loadSessions();
      sessions = sessions.filter(s => s.email !== targetEmail);
      saveSessions(sessions);
    }

    res.json({ success: true, message: 'User status updated successfully.' });
  });

  // Change Role (Admin only)
  app.post('/api/admin/users/:email/role', requireAuth, requireAdmin, (req, res) => {
    const targetEmail = normalizeEmail(req.params.email);
    const newRole = req.body.role;
    const currentUser = (req as any).user as UserRecord;

    if (!['Administration', 'Manager', 'Employee'].includes(newRole)) {
      return res.status(400).json({ success: false, error: 'Invalid role specified.' });
    }

    const users = loadUsers();
    const targetUser = users.find(u => u.email === targetEmail);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Prevent demoting or removing the last active administrator
    if (targetUser.role === 'Administration' && newRole !== 'Administration') {
      const activeAdmins = users.filter(u => u.role === 'Administration' && u.isActive && u.isApproved);
      if (activeAdmins.length <= 1) {
        return res.status(400).json({ success: false, error: 'Cannot demote the last active administrator.' });
      }
    }

    targetUser.role = newRole;
    saveUsers(users);

    res.json({ success: true, message: 'User role updated successfully.' });
  });

  // --- Inquiries API Routes (Role-based filtering & Export restriction) ---

  app.get('/api/inquiries', requireAuth, async (req, res) => {
    try {
      const mode = req.query.mode === 'live' ? 'live' : 'demo';
      const currentUser = (req as any).user as UserRecord;

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
          throw new Error(result.message || 'Failed to retrieve live leads from Google Sheet.');
        }
      }

      // Filter based on role permissions:
      // - Administration & Manager: see all rows
      // - Employee: view only leads assigned to that employee (agentAssigned matches user name/email or unassigned/legacy)
      let filteredData = rawData;
      if (currentUser.role === 'Employee') {
        const emailUser = currentUser.email.split('@')[0].toLowerCase();
        filteredData = rawData.filter(item => {
          const agent = (item.agentAssigned || '').toLowerCase();
          return (
            agent === 'unassigned' ||
            agent.includes(emailUser) ||
            agent.includes(currentUser.email.toLowerCase())
          );
        });
      }

      res.json({ success: true, mode, role: currentUser.role, data: filteredData });
    } catch (err: any) {
      console.error('Inquiries get error:', err);
      res.status(502).json({ success: false, error: err.toString() });
    }
  });

  // Authorized Export Endpoint (Administration and Manager only - Employees forbidden)
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
          return res.status(503).json({ success: false, error: 'Live read not configured.' });
        }
        const envelope = { operation: 'read', credential: readSecret };
        const response = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope)
        });
        const result = await response.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
          rawData = result.data;
        }
      }

      const csvRows = [
        ['Date', 'Timestamp', 'Inquiry_ID', 'Customer_Name', 'Phone_Number', 'Source_Campaign', 'Message_Summary', 'Agent_Assigned', 'Status'],
        ...rawData.map(i => [i.date, i.timestamp, i.inquiryId, i.customerName, i.phoneNumber, i.sourceCampaign, i.messageSummary, i.agentAssigned, i.status])
      ];

      const csvContent = csvRows.map(e => e.map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=Inquiries_Export_${mode}.csv`);
      res.send(csvContent);
    } catch (err: any) {
      console.error('Export error:', err);
      res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Reset demo data
  app.post('/api/inquiries/reset', requireAuth, requireManagerOrAdmin, (req, res) => {
    demoInquiries = [
      {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        inquiryId: 'WH-88392',
        customerName: 'Sarah Jenkins',
        phoneNumber: '+15552348901',
        sourceCampaign: 'Meta_FB_Promo_Nov',
        messageSummary: 'Inquired about pricing and availability for the enterprise tier.',
        agentAssigned: 'Alex Tan',
        status: 'Qualified'
      },
      {
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString().replace('T', ' ').substring(0, 19),
        inquiryId: 'WH-88391',
        customerName: 'Marcus Vance',
        phoneNumber: '+15559876543',
        sourceCampaign: 'Google_Search_Brand',
        messageSummary: 'Asked for onboarding documentation and setup guide.',
        agentAssigned: 'Jessica Lee',
        status: 'Closed'
      }
    ];
    res.json({ success: true, data: demoInquiries });
  });

  // Live WhatsApp Webhook Endpoint (CRM write access, verified via X-Webhook-Secret header)
  app.post('/api/webhook/whatsapp', verifyWebhookSecret, async (req, res) => {
    try {
      const payload = req.body;
      const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
      const writeSecret = process.env.APPS_SCRIPT_WRITE_SECRET;

      if (!appsScriptUrl || !writeSecret || writeSecret.trim() === '') {
        return res.status(503).json({ status: 'error', code: 'CONFIG_ERROR', message: 'Apps Script write access not configured on server.' });
      }

      const envelope = {
        operation: 'write',
        credential: writeSecret,
        payload
      };

      const gsResponse = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      });

      if (!gsResponse.ok) {
        return res.status(502).json({ status: 'error', code: 'STORAGE_HTTP_ERROR', message: `Google Sheets storage HTTP error (${gsResponse.status})` });
      }

      const gsResult = await gsResponse.json();

      if (gsResult.status === 'error' && gsResult.code === 'UNAUTHORIZED') {
        return res.status(503).json({ status: 'error', code: 'BACKEND_CONFIG_ERROR', message: 'Backend configuration error: Internal Apps Script write credential rejected.' });
      }

      if (gsResult.status === 'busy' || gsResult.code === 'BUSY') {
        return res.status(503).json({ status: 'busy', code: 'BUSY', message: gsResult.message || 'Google Sheets is busy (lock contention).' });
      }

      if (gsResult.status === 'error') {
        const code = gsResult.code || 'STORAGE_ERROR';
        if (code === 'INVALID_INPUT' || code === 'INVALID_STATUS') {
          return res.status(400).json({ status: 'error', code, message: gsResult.message || 'Invalid input or unsupported status.' });
        }
        return res.status(503).json({ status: 'error', code, message: gsResult.message || 'Temporary storage error.' });
      }

      if (gsResult.status === 'success' || gsResult.status === 'updated') {
        return res.json({
          status: gsResult.status,
          action: gsResult.action || gsResult.status,
          message: 'Lead successfully saved in Google Sheets source of truth.'
        });
      }

      return res.status(502).json({ status: 'error', code: 'UNKNOWN_RESPONSE', message: 'Unexpected response from Google Sheets receiver.' });
    } catch (err: any) {
      console.error('Live webhook forwarding error:', err);
      return res.status(503).json({ status: 'error', code: 'RETRYABLE_ERROR', message: `Temporary storage unavailable: ${err.toString()}` });
    }
  });

  // Manually invoked migration endpoint (Administration only)
  app.post('/api/admin/migrate-legacy', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { dryRun = true } = req.body || {};
      if (!fs.existsSync(LEGACY_JSON_FILE)) {
        return res.json({ success: true, message: 'No legacy json file found at data/live_inquiries.json.', stats: { wouldImport: 0, imported: 0, skipped: 0, conflicted: 0, failed: 0 } });
      }

      const content = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
      const legacyRecords: InquiryRecord[] = JSON.parse(content);

      if (!Array.isArray(legacyRecords) || legacyRecords.length === 0) {
        return res.json({ success: true, message: 'Legacy file is empty.', stats: { wouldImport: 0, imported: 0, skipped: 0, conflicted: 0, failed: 0 } });
      }

      const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
      const writeSecret = process.env.APPS_SCRIPT_WRITE_SECRET;

      if (!appsScriptUrl || !writeSecret || writeSecret.trim() === '') {
        return res.status(503).json({ success: false, error: 'Migration requires APPS_SCRIPT_WEB_APP_URL and APPS_SCRIPT_WRITE_SECRET configured.' });
      }

      const envelope = {
        operation: 'migrate',
        credential: writeSecret,
        payload: {
          records: legacyRecords,
          dryRun: !!dryRun
        }
      };

      const gsResponse = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      });

      if (!gsResponse.ok) {
        return res.status(502).json({ success: false, error: `Migration storage HTTP error (${gsResponse.status})` });
      }

      const gsResult = await gsResponse.json();
      if (gsResult.status === 'success') {
        return res.json({
          success: true,
          dryRun: !!dryRun,
          message: dryRun ? 'Migration dry run completed successfully. Zero writes performed.' : 'Live migration completed successfully. Original file left intact.',
          stats: gsResult.stats
        });
      } else {
        return res.status(503).json({ success: false, error: gsResult.message || 'Migration failed in Apps Script.' });
      }
    } catch (err: any) {
      console.error('Migration error:', err);
      return res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Authenticated Simulator Endpoint (Manager or Admin)
  app.post('/api/simulator/send', requireAuth, requireManagerOrAdmin, (req, res) => {
    try {
      const payload = req.body;
      const { dateStr, timestampStr } = getMalaysiaDateTime();

      const inquiryId = payload.id || payload.message_id || `WH-${Math.floor(10000 + Math.random() * 90000)}`;
      const customerName = String(
        payload.contact?.name || 
        payload.name || 
        payload.contact?.full_name || 
        payload.customer?.full_name || 
        'Unknown'
      );
      
      const rawPhone = String(
        payload.contact?.phone || 
        payload.phone || 
        payload.sender?.phone || 
        payload.customer?.phone || 
        ''
      );
      const phoneNumber = rawPhone.replace(/[^0-9+]/g, '');

      if (!phoneNumber) {
        return res.status(400).json({ status: 'error', code: 'INVALID_INPUT', message: 'Validation error: Missing required phone number.' });
      }

      const sourceCampaign = String(payload.source || payload.utm_campaign || payload.campaign_name || 'Organic / Direct');
      
      const hasMessage = payload.text !== undefined || payload.message !== undefined || payload.body !== undefined || payload.content !== undefined;
      const messageSummary = hasMessage ? String(payload.text || payload.message || payload.body || payload.content || '') : null;

      const hasAgent = payload.assignee !== undefined || payload.agent?.name !== undefined;
      const agentAssigned = hasAgent ? String(payload.assignee || payload.agent?.name || 'Unassigned') : null;

      let status = payload.status !== undefined ? String(payload.status) : null;
      const supportedStatuses = ['New', 'In Progress', 'Qualified', 'Closed', 'Lost'];
      if (status !== null) {
        if (!supportedStatuses.includes(status)) {
          return res.status(400).json({ status: 'error', code: 'INVALID_STATUS', message: 'Unsupported status value.' });
        }
      }

      const existingIndex = demoInquiries.findIndex(
        item => item.date === dateStr && item.phoneNumber === phoneNumber
      );

      if (existingIndex >= 0) {
        const existing = demoInquiries[existingIndex];
        demoInquiries[existingIndex] = {
          ...existing,
          timestamp: timestampStr,
          messageSummary: messageSummary !== null ? messageSummary : existing.messageSummary,
          agentAssigned: agentAssigned !== null ? agentAssigned : existing.agentAssigned,
          status: status !== null ? (status as InquiryRecord['status']) : existing.status
        };
        return res.json({
          status: 'updated',
          row: existingIndex + 2,
          mode: 'demo',
          message: 'Existing demo inquiry updated for today (deduplicated).'
        });
      }

      const newRecord: InquiryRecord = {
        date: dateStr,
        timestamp: timestampStr,
        inquiryId,
        customerName,
        phoneNumber,
        sourceCampaign,
        messageSummary: messageSummary !== null ? messageSummary : '',
        agentAssigned: agentAssigned !== null ? agentAssigned : 'Unassigned',
        status: status !== null ? (status as InquiryRecord['status']) : 'New'
      };

      demoInquiries.unshift(newRecord);

      return res.json({
        status: 'success',
        action: 'appended',
        mode: 'demo',
        record: newRecord
      });
    } catch (err: any) {
      console.error('Simulator webhook error:', err);
      return res.status(500).json({ status: 'error', code: 'SERVER_ERROR', message: err.toString() });
    }
  });

  // AI payload analysis endpoint (Protected by requireAuth & manager/admin)
  app.post('/api/ai/analyze-payload', requireAuth, requireManagerOrAdmin, geminiRateLimiter, async (req, res) => {
    try {
      const { platformName, jsonPayload } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured in environment.' });
      }

      const sanitizedPayload = sanitizeJsonForAi(jsonPayload);

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a Google Apps Script & webhook integration expert.
A user wants to integrate a 3rd party WhatsApp platform named "${platformName}" with Google Sheets.
Here is the sanitized sample JSON webhook payload structure:
${JSON.stringify(sanitizedPayload, null, 2)}

Provide a concise, expert analysis with:
1. Exact JavaScript snippet to extract customerName, phoneNumber, sourceCampaign, messageSummary, agentAssigned, and status from this specific JSON structure in Google Apps Script (doPost).
2. Key fields mapped.
3. Potential gotchas (e.g. nested contact objects, phone formatting).`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      res.json({ success: true, analysis: response.text });
    } catch (err: any) {
      console.error('AI Analysis error:', err);
      const safeMessage = err.toString().replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
      res.status(500).json({ success: false, error: safeMessage });
    }
  });

  // Production vs. Development middleware setup
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' }
    });
    app.use(vite.middlewares);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

startServer();
