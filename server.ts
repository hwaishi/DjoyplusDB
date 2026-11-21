import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.resolve(__dirname, 'data');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'live_inquiries.json');

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
  if (!staffKey || staffKey.trim() === '' || staffKey === 'my_secure_staff_token') {
    return res.status(503).json({ success: false, error: 'STAFF_API_KEY is not configured or uses insecure example value on server.' });
  }
  const token = req.headers['x-staff-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!token || token !== staffKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing staff token.' });
  }
  next();
};

// CRM Webhook Secret Verification Middleware (Header only: X-Webhook-Secret)
const verifyWebhookSecret = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim() === '' || webhookSecret === 'my_whatsapp_webhook_secret') {
    return res.status(503).json({ status: 'error', code: 'CONFIG_ERROR', message: 'WHATSAPP_WEBHOOK_SECRET is not configured on server.' });
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

  // Check auth status
  app.get('/api/auth/status', (req, res) => {
    const staffKey = process.env.STAFF_API_KEY || '';
    const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || '';
    const staffKeySet = staffKey.length > 0 && staffKey !== 'my_secure_staff_token';
    const webhookSecretSet = webhookSecret.length > 0 && webhookSecret !== 'my_whatsapp_webhook_secret';
    const geminiKeySet = !!process.env.GEMINI_API_KEY;
    const appsScriptUrlSet = !!process.env.APPS_SCRIPT_WEB_APP_URL;
    res.json({
      success: true,
      config: {
        staffKeySet,
        webhookSecretSet,
        geminiKeySet,
        appsScriptUrlSet
      }
    });
  });

  // Get inquiries (mode=demo or mode=live)
  app.get('/api/inquiries', staffAuth, async (req, res) => {
    const mode = req.query.mode === 'live' ? 'live' : 'demo';
    if (mode === 'demo') {
      return res.json({ success: true, mode: 'demo', data: demoInquiries });
    }

    // Live mode: Google Sheets is source of truth via Apps Script POST envelope (operation: "read")
    const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
    const readSecret = process.env.APPS_SCRIPT_READ_SECRET || process.env.APPS_SCRIPT_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET;

    if (!appsScriptUrl || !readSecret) {
      return res.status(503).json({
        success: false,
        error: 'Live Google Sheets integration not fully configured. Please set APPS_SCRIPT_WEB_APP_URL and APPS_SCRIPT_READ_SECRET.'
      });
    }

    try {
      const envelope = {
        operation: 'read',
        credential: readSecret
      };

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
        return res.json({ success: true, mode: 'live', data: result.data });
      } else {
        throw new Error(result.message || 'Failed to retrieve live leads from Google Sheet.');
      }
    } catch (err: any) {
      console.error('Dashboard live read error:', err);
      return res.status(502).json({
        success: false,
        error: `Failed to load live leads from Google Sheet: ${err.toString()}. Check sheet name "Raw_Inquiries" and deployment URL.`
      });
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

  // Live WhatsApp Webhook Endpoint (CRM write access, verified via X-Webhook-Secret header only)
  app.post('/api/webhook/whatsapp', verifyWebhookSecret, async (req, res) => {
    try {
      const payload = req.body;
      const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
      const writeSecret = process.env.APPS_SCRIPT_WRITE_SECRET || process.env.APPS_SCRIPT_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET;

      if (!appsScriptUrl || !writeSecret) {
        return res.status(503).json({ status: 'error', code: 'CONFIG_ERROR', message: 'Apps Script storage URL or write credential not configured.' });
      }

      // Construct JSON POST envelope with operation "write"
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

      // Return right error to CRM based on Apps Script stable machine-readable codes
      if (gsResult.status === 'busy' || gsResult.code === 'BUSY') {
        return res.status(503).json({ status: 'busy', code: 'BUSY', message: gsResult.message || 'Google Sheets is busy (lock contention).' });
      }

      if (gsResult.status === 'error') {
        const code = gsResult.code || 'STORAGE_ERROR';
        if (code === 'INVALID_INPUT' || code === 'INVALID_STATUS') {
          return res.status(400).json({ status: 'error', code, message: gsResult.message || 'Invalid input or unsupported status.' });
        }
        if (code === 'UNAUTHORIZED') {
          return res.status(401).json({ status: 'error', code, message: gsResult.message || 'Unauthorized Apps Script credential.' });
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

  // Manually invoked migration endpoint for legacy live records
  app.post('/api/admin/migrate-legacy', staffAuth, async (req, res) => {
    try {
      const { dryRun = true } = req.body || {};
      if (!fs.existsSync(LEGACY_JSON_FILE)) {
        return res.json({ success: true, message: 'No legacy json file found at data/live_inquiries.json.', stats: { imported: 0, skipped: 0, failed: 0 } });
      }

      const content = fs.readFileSync(LEGACY_JSON_FILE, 'utf-8');
      const legacyRecords: InquiryRecord[] = JSON.parse(content);

      if (!Array.isArray(legacyRecords) || legacyRecords.length === 0) {
        return res.json({ success: true, message: 'Legacy file is empty.', stats: { imported: 0, skipped: 0, failed: 0 } });
      }

      const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
      const writeSecret = process.env.APPS_SCRIPT_WRITE_SECRET || process.env.APPS_SCRIPT_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET;

      if (!appsScriptUrl || !writeSecret) {
        return res.status(503).json({ success: false, error: 'Migration requires APPS_SCRIPT_WEB_APP_URL and write secret configured.' });
      }

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      if (dryRun) {
        return res.json({
          success: true,
          dryRun: true,
          message: `Dry run completed. Found ${legacyRecords.length} legacy records ready for migration.`,
          stats: { imported: legacyRecords.length, skipped: 0, failed: 0 }
        });
      }

      // Perform actual migration by writing each record via write envelope
      for (const rec of legacyRecords) {
        try {
          const payload = {
            id: rec.inquiryId,
            contact: {
              name: rec.customerName,
              phone: rec.phoneNumber
            },
            source: rec.sourceCampaign,
            text: rec.messageSummary,
            assignee: rec.agentAssigned,
            status: rec.status
          };

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

          if (gsResponse.ok) {
            const resJson = await gsResponse.json();
            if (resJson.status === 'success' || resJson.status === 'updated') {
              imported++;
            } else {
              skipped++;
            }
          } else {
            failed++;
          }
        } catch (migErr) {
          failed++;
        }
      }

      return res.json({
        success: true,
        dryRun: false,
        message: 'Legacy migration completed successfully. Original file left intact.',
        stats: { imported, skipped, failed }
      });
    } catch (err: any) {
      console.error('Migration error:', err);
      return res.status(500).json({ success: false, error: err.toString() });
    }
  });

  // Authenticated Simulator Endpoint
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

  // AI payload analysis endpoint (Protected by staffAuth & geminiRateLimiter with privacy sanitization)
  app.post('/api/ai/analyze-payload', staffAuth, geminiRateLimiter, async (req, res) => {
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
