import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.resolve(__dirname, 'data');
const LIVE_INQUIRIES_FILE = path.join(DATA_DIR, 'live_inquiries.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

// Initial mock data simulating demo WhatsApp inquiries
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

function loadLiveInquiries(): InquiryRecord[] {
  try {
    if (fs.existsSync(LIVE_INQUIRIES_FILE)) {
      const content = fs.readFileSync(LIVE_INQUIRIES_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error loading live inquiries:', err);
  }
  return [];
}

function saveLiveInquiries(records: InquiryRecord[]): void {
  try {
    fs.writeFileSync(LIVE_INQUIRIES_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving live inquiries:', err);
  }
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

// Gemini sanitization function for privacy
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

// Staff Auth Middleware
const staffAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const staffKey = process.env.STAFF_API_KEY;
  const token = req.headers['x-staff-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!staffKey) {
    return res.status(503).json({ success: false, error: 'STAFF_API_KEY not configured on server environment.' });
  }
  if (!token || token !== staffKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing staff token.' });
  }
  next();
};

// Webhook Secret Verification Middleware
const verifyWebhookSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ success: false, error: 'WHATSAPP_WEBHOOK_SECRET not configured on server environment.' });
  }
  const providedSecret = req.headers['x-webhook-secret'] || req.query.secret || req.headers['authorization']?.replace('Bearer ', '');
  if (!providedSecret || providedSecret !== webhookSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing webhook secret.' });
  }
  next();
};

async function startServer() {
  const app = express();
  app.use(express.json());

  // Check auth status
  app.get('/api/auth/status', (req, res) => {
    const staffKeySet = !!process.env.STAFF_API_KEY;
    const webhookSecretSet = !!process.env.WHATSAPP_WEBHOOK_SECRET;
    const geminiKeySet = !!process.env.GEMINI_API_KEY;
    res.json({
      success: true,
      config: {
        staffKeySet,
        webhookSecretSet,
        geminiKeySet
      }
    });
  });

  // Get inquiries (supports ?mode=demo or ?mode=live)
  app.get('/api/inquiries', staffAuth, (req, res) => {
    const mode = req.query.mode === 'live' ? 'live' : 'demo';
    if (mode === 'live') {
      res.json({ success: true, mode: 'live', data: loadLiveInquiries() });
    } else {
      res.json({ success: true, mode: 'demo', data: demoInquiries });
    }
  });

  // Reset demo data (only affects demo in-memory records)
  app.post('/api/inquiries/reset', staffAuth, (req, res) => {
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

  // Live WhatsApp Webhook Endpoint (Protected by webhook secret)
  app.post('/api/webhook/whatsapp', verifyWebhookSecret, (req, res) => {
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
        return res.status(400).json({ status: 'error', message: 'Validation error: Missing required phone number.' });
      }

      const sourceCampaign = String(payload.source || payload.utm_campaign || payload.campaign_name || 'Organic / Direct');
      const messageSummary = String(payload.text || payload.message || payload.body || payload.content || '');
      const agentAssigned = String(payload.assignee || payload.agent?.name || 'Unassigned');
      const status = String(payload.status || 'New') as any;

      let liveRecords = loadLiveInquiries();
      const existingIndex = liveRecords.findIndex(
        item => item.date === dateStr && item.phoneNumber === phoneNumber
      );

      if (existingIndex >= 0) {
        const existing = liveRecords[existingIndex];
        liveRecords[existingIndex] = {
          ...existing,
          timestamp: timestampStr,
          messageSummary: messageSummary || existing.messageSummary,
          agentAssigned: agentAssigned !== 'Unassigned' ? agentAssigned : existing.agentAssigned,
          status: status !== 'New' ? status : existing.status
        };
        saveLiveInquiries(liveRecords);
        return res.json({
          status: 'updated',
          row: existingIndex + 2,
          message: 'Existing live inquiry updated for today (deduplicated).'
        });
      }

      const newRecord: InquiryRecord = {
        date: dateStr,
        timestamp: timestampStr,
        inquiryId,
        customerName,
        phoneNumber,
        sourceCampaign,
        messageSummary,
        agentAssigned,
        status
      };

      liveRecords.unshift(newRecord);
      saveLiveInquiries(liveRecords);

      return res.json({
        status: 'success',
        action: 'appended',
        record: newRecord
      });
    } catch (err: any) {
      console.error('Live webhook error:', err);
      return res.status(500).json({ status: 'error', message: err.toString() });
    }
  });

  // Authenticated Simulator Endpoint (allows UI simulator to submit sample events without exposing live secret)
  app.post('/api/simulator/send', staffAuth, (req, res) => {
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
        return res.status(400).json({ status: 'error', message: 'Validation error: Missing required phone number.' });
      }

      const sourceCampaign = String(payload.source || payload.utm_campaign || payload.campaign_name || 'Organic / Direct');
      const messageSummary = String(payload.text || payload.message || payload.body || payload.content || '');
      const agentAssigned = String(payload.assignee || payload.agent?.name || 'Unassigned');
      const status = String(payload.status || 'New') as any;

      // Simulator events update demo inquiries so the sandbox reflects test runs securely
      const existingIndex = demoInquiries.findIndex(
        item => item.date === dateStr && item.phoneNumber === phoneNumber
      );

      if (existingIndex >= 0) {
        const existing = demoInquiries[existingIndex];
        demoInquiries[existingIndex] = {
          ...existing,
          timestamp: timestampStr,
          messageSummary: messageSummary || existing.messageSummary,
          agentAssigned: agentAssigned !== 'Unassigned' ? agentAssigned : existing.agentAssigned,
          status: status !== 'New' ? status : existing.status
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
        messageSummary,
        agentAssigned,
        status
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
      return res.status(500).json({ status: 'error', message: err.toString() });
    }
  });

  // AI payload analysis endpoint (Protected by staffAuth & geminiRateLimiter with privacy sanitization)
  app.post('/api/ai/analyze-payload', staffAuth, geminiRateLimiter, async (req, res) => {
    try {
      const { platformName, jsonPayload } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ success: false, error: 'GEMINI_API_KEY not configured in environment.' });
      }

      // Privacy sanitization: sanitize customer values while preserving schema structure & types
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
      // Ensure API keys are never leaked in error responses
      const safeMessage = err.toString().replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
      res.status(500).json({ success: false, error: safeMessage });
    }
  });

  // Vite middleware setup
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' }
  });

  app.use(vite.middlewares);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
