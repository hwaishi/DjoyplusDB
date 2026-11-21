import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Initial mock data simulating real WhatsApp inquiries
let rawInquiries: InquiryRecord[] = [
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
  },
  {
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    timestamp: new Date(Date.now() - 86400000).toISOString().replace('T', ' ').substring(0, 19),
    inquiryId: 'WH-88380',
    customerName: 'Elena Rostova',
    phoneNumber: '+447911123456',
    sourceCampaign: 'WhatsApp_Direct_QR',
    messageSummary: 'Looking for bulk discount rates for 50 seats.',
    agentAssigned: 'Alex Tan',
    status: 'In Progress'
  },
  {
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    timestamp: new Date(Date.now() - 86400000 * 0.8).toISOString().replace('T', ' ').substring(0, 19),
    inquiryId: 'WH-88375',
    customerName: 'Kenji Sato',
    phoneNumber: '+819012345678',
    sourceCampaign: 'Meta_IG_Reels',
    messageSummary: 'Requested API documentation for webhook setup.',
    agentAssigned: 'Jessica Lee',
    status: 'Qualified'
  },
  {
    date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString().replace('T', ' ').substring(0, 19),
    inquiryId: 'WH-88350',
    customerName: 'Aisha Al-Mansoor',
    phoneNumber: '+971501234567',
    sourceCampaign: 'Google_Display_Network',
    messageSummary: 'General inquiry about enterprise support SLAs.',
    agentAssigned: 'Unassigned',
    status: 'New'
  }
];

async function startServer() {
  const app = express();
  app.use(express.json());

  // API Routes
  
  // Get all raw inquiries
  app.get('/api/inquiries', (req, res) => {
    res.json({ success: true, data: rawInquiries });
  });

  // Reset demo data
  app.post('/api/inquiries/reset', (req, res) => {
    rawInquiries = [
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
      },
      {
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        timestamp: new Date(Date.now() - 86400000).toISOString().replace('T', ' ').substring(0, 19),
        inquiryId: 'WH-88380',
        customerName: 'Elena Rostova',
        phoneNumber: '+447911123456',
        sourceCampaign: 'WhatsApp_Direct_QR',
        messageSummary: 'Looking for bulk discount rates for 50 seats.',
        agentAssigned: 'Alex Tan',
        status: 'In Progress'
      }
    ];
    res.json({ success: true, data: rawInquiries });
  });

  // Webhook receiver endpoint (simulates Google Apps Script doPost endpoint)
  app.post('/api/webhook/whatsapp', (req, res) => {
    try {
      const payload = req.body;
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timestampStr = now.toISOString().replace('T', ' ').substring(0, 19);

      // Support various 3rd party payload formats (ManyChat, Wati, Respond.io, SleekFlow, generic)
      const inquiryId = payload.id || payload.message_id || `WH-${Math.floor(10000 + Math.random() * 90000)}`;
      const customerName = payload.contact?.name || payload.name || payload.customer?.full_name || 'Unknown';
      const phoneNumber = String(payload.contact?.phone || payload.phone || payload.sender?.phone || '').replace(/[^0-9+]/g, '') || '+15550000000';
      const sourceCampaign = payload.source || payload.utm_campaign || payload.campaign_name || 'Organic / Direct';
      const messageSummary = payload.text || payload.message || payload.body || payload.content || '';
      const agentAssigned = payload.assignee || payload.agent?.name || 'Unassigned';
      const status = payload.status || 'New';

      // Deduplication logic (same day + same phone)
      const existingIndex = rawInquiries.findIndex(
        item => item.date === dateStr && item.phoneNumber === phoneNumber
      );

      if (existingIndex >= 0) {
        // Update existing record
        rawInquiries[existingIndex] = {
          ...rawInquiries[existingIndex],
          timestamp: timestampStr,
          messageSummary,
          agentAssigned,
          status: status as any
        };
        return res.json({
          status: 'updated',
          row: existingIndex + 2,
          message: 'Existing inquiry updated for today (deduplicated).'
        });
      }

      // Append new record
      const newRecord: InquiryRecord = {
        date: dateStr,
        timestamp: timestampStr,
        inquiryId,
        customerName,
        phoneNumber,
        sourceCampaign,
        messageSummary,
        agentAssigned,
        status: status as any
      };

      rawInquiries.unshift(newRecord);

      return res.json({
        status: 'success',
        action: 'appended',
        record: newRecord
      });
    } catch (err: any) {
      console.error('Webhook error:', err);
      return res.status(400).json({ status: 'error', message: err.toString() });
    }
  });

  // AI payload analysis endpoint using @google/genai
  app.post('/api/ai/analyze-payload', async (req, res) => {
    try {
      const { platformName, jsonPayload } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured in environment.' });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are a Google Apps Script & webhook integration expert.
A user wants to integrate a 3rd party WhatsApp platform named "${platformName}" with Google Sheets.
Here is the sample JSON webhook payload they provided:
${JSON.stringify(jsonPayload, null, 2)}

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
      res.status(500).json({ success: false, error: err.toString() });
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
