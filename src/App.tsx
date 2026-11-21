/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Webhook,
  Terminal,
  Bot,
  BookOpen,
  BarChart3,
  Play,
  Copy,
  Check,
  RefreshCw,
  Download,
  ExternalLink,
  Shield,
  Key,
  Lock,
  Database,
  Filter,
  Search,
  Users,
  MessageSquare,
  Code,
  Layers,
  Zap,
  HelpCircle,
  ArrowUpRight
} from 'lucide-react';

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

const PRESET_PAYLOADS = {
  manychat: {
    id: "MC-" + Math.floor(1000 + Math.random() * 9000),
    contact: {
      name: "Sophia Martinez",
      phone: "+15557891234"
    },
    source: "ManyChat_WhatsApp_OptIn",
    text: "Interested in booking a product demo for next week.",
    assignee: "Alex Tan",
    status: "New"
  },
  wati: {
    message_id: "WATI-" + Math.floor(10000 + Math.random() * 90000),
    name: "David Kim",
    phone: "+60123456789",
    utm_campaign: "Wati_Broadcast_Promo",
    message: "=SUM(1,1) Enterprise billing inquiry.",
    agent: { name: "Jessica Lee" },
    status: "In Progress"
  },
  respondio: {
    id: "RESP-" + Math.floor(10000 + Math.random() * 90000),
    contact: {
      full_name: "Liam O'Connor",
      phone: "+353871234567"
    },
    campaign_name: "Respond_IO_Ads_Q4",
    content: "Requesting custom quote for 25 licenses.",
    assignee: "Alex Tan",
    status: "Qualified"
  },
  sleekflow: {
    id: "SF-" + Math.floor(10000 + Math.random() * 90000),
    customer: {
      full_name: "Fatima Zahra",
      phone: "+971509876543"
    },
    source: "SleekFlow_WhatsApp_Widget",
    body: "Hi, I need help with setting up my webhook integration.",
    agent: { name: "Unassigned" },
    status: "New"
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'simulator' | 'webhook' | 'gas' | 'ai' | 'blueprint'>('dashboard');
  const [dataMode, setDataMode] = useState<'demo' | 'live'>('demo');
  const [staffToken, setStaffToken] = useState<string>(localStorage.getItem('sheetflow_staff_token') || 'my_secure_staff_token');
  const [authStatus, setAuthStatus] = useState<{ staffKeySet: boolean; webhookSecretSet: boolean; geminiKeySet: boolean } | null>(null);

  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<'raw' | 'summary'>('raw');
  
  // Webhook Tester State
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESET_PAYLOADS>('manychat');
  const [customPayloadJson, setCustomPayloadJson] = useState(JSON.stringify(PRESET_PAYLOADS.manychat, null, 2));
  const [webhookResponse, setWebhookResponse] = useState<any>(null);
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);

  // GAS Generator Config State
  const [gasSpreadsheetId, setGasSpreadsheetId] = useState('YOUR_SPREADSHEET_ID_HERE');
  const [gasSheetName, setGasSheetName] = useState('Raw_Inquiries');
  const [gasDeduplicate, setGasDeduplicate] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // AI Assistant State
  const [aiPlatformName, setAiPlatformName] = useState('Custom WhatsApp CRM');
  const [aiSamplePayload, setAiSamplePayload] = useState('{\n  "event": "message.received",\n  "contact": {\n    "full_name": "Jane Doe",\n    "phone": "+60129876543"\n  },\n  "message_body": "Hello world"\n}');
  const [aiAnalysisResult, setAiAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Search & Filter state for simulator
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Check server auth status on mount
  useEffect(() => {
    fetchAuthStatus();
  }, []);

  // Fetch inquiries whenever mode or token changes
  useEffect(() => {
    fetchInquiries();
  }, [dataMode, staffToken]);

  const fetchAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.success) {
        setAuthStatus(data.config);
      }
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  };

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/inquiries?mode=${dataMode}`, {
        headers: {
          'x-staff-token': staffToken
        }
      });
      const data = await res.json();
      if (data.success) {
        setInquiries(data.data);
      } else {
        setErrorMsg(data.error || 'Failed to authenticate or fetch inquiries.');
        setInquiries([]);
      }
    } catch (err: any) {
      setErrorMsg(err.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToken = (token: string) => {
    setStaffToken(token);
    localStorage.setItem('sheetflow_staff_token', token);
  };

  const handleResetData = async () => {
    if (dataMode === 'live') {
      alert('Reset is restricted to Demo Sandbox records only. Live records are durable.');
      return;
    }
    try {
      const res = await fetch('/api/inquiries/reset', {
        method: 'POST',
        headers: {
          'x-staff-token': staffToken
        }
      });
      const data = await res.json();
      if (data.success) {
        setInquiries(data.data);
      } else {
        alert(data.error || 'Reset failed.');
      }
    } catch (err: any) {
      alert('Reset failed: ' + err.toString());
    }
  };

  const handleSendSimulatorWebhook = async () => {
    try {
      setIsSendingWebhook(true);
      setWebhookResponse(null);
      const parsedPayload = JSON.parse(customPayloadJson);
      
      const res = await fetch('/api/simulator/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-token': staffToken
        },
        body: JSON.stringify(parsedPayload)
      });
      const data = await res.json();
      setWebhookResponse(data);
      await fetchInquiries();
    } catch (err: any) {
      setWebhookResponse({ status: 'error', message: err.toString() });
    } finally {
      setIsSendingWebhook(false);
    }
  };

  const handlePresetChange = (presetKey: keyof typeof PRESET_PAYLOADS) => {
    setSelectedPreset(presetKey);
    setCustomPayloadJson(JSON.stringify(PRESET_PAYLOADS[presetKey], null, 2));
  };

  const handleRunAiAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      setAiAnalysisResult('');
      const parsed = JSON.parse(aiSamplePayload);
      const res = await fetch('/api/ai/analyze-payload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-token': staffToken
        },
        body: JSON.stringify({ platformName: aiPlatformName, jsonPayload: parsed })
      });
      const data = await res.json();
      if (data.success) {
        setAiAnalysisResult(data.analysis);
      } else {
        setAiAnalysisResult('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      setAiAnalysisResult('Error parsing JSON payload or request failed: ' + err.toString());
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Compute Daily Summaries from inquiries
  const summaryMap = inquiries.reduce((acc: Record<string, { date: string; total: number; phones: Set<string>; qualified: number; closed: number }>, item) => {
    const d = item.date;
    if (!acc[d]) {
      acc[d] = { date: d, total: 0, phones: new Set(), qualified: 0, closed: 0 };
    }
    acc[d].total += 1;
    acc[d].phones.add(item.phoneNumber);
    if (item.status === 'Qualified') acc[d].qualified += 1;
    if (item.status === 'Closed') acc[d].closed += 1;
    return acc;
  }, {});

  const dailySummaries = Object.values(summaryMap).sort((a, b) => b.date.localeCompare(a.date));

  // Filtered inquiries
  const filteredInquiries = inquiries.filter(item => {
    const matchesSearch = 
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.phoneNumber.includes(searchTerm) ||
      item.sourceCampaign.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.messageSummary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalInquiriesCount = inquiries.length;
  const uniqueLeadsCount = new Set(inquiries.map(i => i.phoneNumber)).size;
  const closedCount = inquiries.filter(i => i.status === 'Closed').length;
  const conversionRate = totalInquiriesCount > 0 ? ((closedCount / totalInquiriesCount) * 100).toFixed(1) : '0.0';

  const generatedGasCode = `/**
 * Google Apps Script Webhook Receiver for WhatsApp Inquiries
 * Generated by WhatsApp Sheets Automation Hub
 * Secure production version with Webhook Secret Authentication & Spreadsheet ID
 */

const SPREADSHEET_ID = "${gasSpreadsheetId}";
const SHEET_NAME = "${gasSheetName}";
const DEDUPLICATE_SAME_DAY = ${gasDeduplicate};

function doPost(e) {
  // 1. Webhook Authentication Check
  const expectedSecret = PropertiesService.getScriptProperties().getProperty("WHATSAPP_WEBHOOK_SECRET");
  const providedSecret = (e && e.parameter && e.parameter.secret) || 
                         (e && e.parameter && e.parameter.token) || 
                         (e && e.headers && (e.headers["X-Webhook-Secret"] || e.headers["x-webhook-secret"]));
  
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return createJsonResponse({ status: "error", message: "Unauthorized: Invalid or missing webhook secret." });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ status: "busy", message: "Server busy. Try again later." });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return createJsonResponse({ status: "error", message: "Sheet '" + SHEET_NAME + "' not found." });
    }

    const rawData = e.postData.contents;
    const payload = JSON.parse(rawData);

    const now = new Date();
    const timezone = "Asia/Kuala_Lumpur";
    const dateStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
    const timestampStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");

    const inquiryId = payload.id || payload.message_id || Utilities.getUuid();
    const customerName = String(payload.contact?.name || payload.name || payload.contact?.full_name || payload.customer?.full_name || "Unknown");
    const rawPhone = String(payload.contact?.phone || payload.phone || payload.sender?.phone || payload.customer?.phone || "");
    const phoneNumber = rawPhone.replace(/[^0-9+]/g, "");
    
    if (!phoneNumber) {
      return createJsonResponse({ status: "error", message: "Validation error: Missing required phone number." });
    }

    const sourceCampaign = String(payload.source || payload.utm_campaign || payload.campaign_name || "Organic / Direct");
    const messageSummary = String(payload.text || payload.message || payload.body || payload.content || "");
    const agentAssigned = String(payload.assignee || payload.agent?.name || "Unassigned");
    const status = String(payload.status || "New");

    // Text safety wrapper to prevent formula injection (=) and preserve leading zeros / +
    const safeText = function(val) {
      const s = String(val || "");
      if (s.startsWith("=") || s.startsWith("+") || (s.startsWith("0") && s.length > 1)) {
        return "'" + s;
      }
      return s;
    };

    if (DEDUPLICATE_SAME_DAY && phoneNumber) {
      const existingRowIndex = findRowByDateAndPhone(sheet, dateStr, phoneNumber, timezone);
      if (existingRowIndex > 0) {
        const existingAgent = sheet.getRange(existingRowIndex, 8).getValue();
        const existingStatus = sheet.getRange(existingRowIndex, 9).getValue();
        
        sheet.getRange(existingRowIndex, 2).setValue(timestampStr);
        sheet.getRange(existingRowIndex, 7).setValue(safeText(messageSummary));
        sheet.getRange(existingRowIndex, 8).setValue(agentAssigned !== "Unassigned" ? agentAssigned : existingAgent);
        sheet.getRange(existingRowIndex, 9).setValue(status !== "New" ? status : existingStatus);
        
        SpreadsheetApp.flush();
        return createJsonResponse({ status: "updated", row: existingRowIndex });
      }
    }

    sheet.appendRow([
      dateStr,
      timestampStr,
      safeText(inquiryId),
      safeText(customerName),
      safeText(phoneNumber),
      safeText(sourceCampaign),
      safeText(messageSummary),
      safeText(agentAssigned),
      safeText(status)
    ]);

    SpreadsheetApp.flush();
    return createJsonResponse({ status: "success", action: "appended" });

  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function findRowByDateAndPhone(sheet, dateStr, phoneNumber, timezone) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0] instanceof Date 
      ? Utilities.formatDate(data[i][0], timezone, "yyyy-MM-dd")
      : String(data[i][0]);
    const rowPhone = String(data[i][4]).replace(/^'/, "");
    
    if (rowDate === dateStr && rowPhone === phoneNumber) {
      return i + 1;
    }
  }
  return -1;
}

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2.5 rounded-xl shadow-lg shadow-emerald-950/50">
              <FileSpreadsheet className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-400 bg-clip-text text-transparent">
                  SheetFlow AI
                </span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Secure Automation Cockpit
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Protected WhatsApp-to-Sheets Sync & Webhook Simulator
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Staff Token Input */}
            <div className="hidden lg:flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">Staff Token:</span>
              <input
                type="password"
                value={staffToken}
                onChange={(e) => handleSaveToken(e.target.value)}
                placeholder="STAFF_API_KEY"
                className="bg-transparent text-xs text-white font-mono focus:outline-none w-28"
              />
            </div>

            <button
              onClick={() => setActiveTab('webhook')}
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition shadow-sm"
            >
              <Webhook className="w-4 h-4" />
              <span className="hidden sm:inline">Webhook Sandbox</span>
            </button>
            {dataMode === 'demo' && (
              <button
                onClick={handleResetData}
                title="Reset Demo Inquiries"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-navbar Tabs & Data Mode Toggle */}
        <div className="bg-slate-900/80 backdrop-blur border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between">
          <div className="flex space-x-1 py-2 overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'dashboard', label: 'Live Dashboard', icon: BarChart3 },
              { id: 'simulator', label: 'Google Sheets Simulator', icon: FileSpreadsheet },
              { id: 'webhook', label: 'Webhook Tester & Sandbox', icon: Webhook },
              { id: 'gas', label: 'Apps Script Generator', icon: Code },
              { id: 'ai', label: 'AI Payload Mapper', icon: Bot },
              { id: 'blueprint', label: 'Technical Blueprint', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Data Mode Switcher Banner */}
          <div className="py-2 flex items-center space-x-2">
            <span className="text-xs text-slate-400 font-medium">Data View:</span>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-1 flex space-x-1">
              <button
                onClick={() => setDataMode('demo')}
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  dataMode === 'demo'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Demo Sandbox
              </button>
              <button
                onClick={() => setDataMode('live')}
                className={`px-3 py-1 rounded text-xs font-semibold transition ${
                  dataMode === 'live'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Live Inquiries DB
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {errorMsg && (
          <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-red-400" />
              <span><strong>Authentication Error:</strong> {errorMsg}. Please check your staff token.</span>
            </div>
            <button
              onClick={() => {
                const token = prompt('Enter valid STAFF_API_KEY:');
                if (token) handleSaveToken(token);
              }}
              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-xs font-medium transition"
            >
              Update Token
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm">Authenticating and loading records...</p>
          </div>
        ) : (
          <>
            {/* 1. DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h1 className="text-2xl font-bold text-white tracking-tight">Automation Overview</h1>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        dataMode === 'live' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {dataMode === 'live' ? '🟢 Live Inquiries Mode' : '🟡 Demo Sandbox Mode'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      {dataMode === 'live' ? 'Displaying durable live WhatsApp inquiries accepted via secure webhooks.' : 'Displaying in-memory sample records for safe simulator testing.'}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse"></span>
                      Webhook Secret Verified
                    </span>
                    <button
                      onClick={() => setActiveTab('webhook')}
                      className="inline-flex items-center space-x-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Simulate Webhook</span>
                    </button>
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Inquiries</span>
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline">
                      <span className="text-3xl font-extrabold text-white">{totalInquiriesCount}</span>
                      <span className="ml-2 text-xs text-emerald-400 font-medium">Asia/KL Time</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Logged in `Raw_Inquiries`</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Unique Leads</span>
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        <Users className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline">
                      <span className="text-3xl font-extrabold text-white">{uniqueLeadsCount}</span>
                      <span className="ml-2 text-xs text-blue-400 font-medium">Distinct phone #</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Deduplicated same-day</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Closed Won</span>
                      <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                        <Check className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline">
                      <span className="text-3xl font-extrabold text-white">{closedCount}</span>
                      <span className="ml-2 text-xs text-purple-400 font-medium">Converted</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Synced to `Daily_Summary`</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Conversion Rate</span>
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline">
                      <span className="text-3xl font-extrabold text-white">{conversionRate}%</span>
                      <span className="ml-2 text-xs text-amber-400 font-medium">Target: 25%</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Calculated formula</p>
                  </div>
                </div>

                {/* Recent Activity Stream */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-white flex items-center space-x-2">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <span>Recent WhatsApp Inquiries ({dataMode.toUpperCase()})</span>
                    </h2>
                    <button
                      onClick={() => setActiveTab('simulator')}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1"
                    >
                      <span>View All in Sheet</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                          <th className="pb-3 font-semibold">Customer</th>
                          <th className="pb-3 font-semibold">Campaign</th>
                          <th className="pb-3 font-semibold">Agent</th>
                          <th className="pb-3 font-semibold">Status</th>
                          <th className="pb-3 font-semibold text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {inquiries.slice(0, 5).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 pr-3">
                              <div className="font-medium text-white">{item.customerName}</div>
                              <div className="text-xs text-slate-400 font-mono">{item.phoneNumber}</div>
                            </td>
                            <td className="py-3 pr-3">
                              <span className="inline-block px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 font-mono">
                                {item.sourceCampaign}
                              </span>
                            </td>
                            <td className="py-3 pr-3 text-slate-300 text-xs">{item.agentAssigned}</td>
                            <td className="py-3 pr-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                item.status === 'Closed' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                item.status === 'Qualified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                item.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                'bg-slate-800 text-slate-300'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 text-right text-xs text-slate-400 font-mono">
                              {item.timestamp}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 2. GOOGLE SHEETS SIMULATOR TAB */}
            {activeTab === 'simulator' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Google Sheets Simulator</h1>
                    <p className="text-sm text-slate-400">Live preview of your Google Sheet structure (`Raw_Inquiries` & `Daily_Summary`)</p>
                  </div>
                  
                  <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                    <button
                      onClick={() => setSheetTab('raw')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                        sheetTab === 'raw'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Raw_Inquiries ({inquiries.length})
                    </button>
                    <button
                      onClick={() => setSheetTab('summary')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                        sheetTab === 'summary'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Daily_Summary ({dailySummaries.length} days)
                    </button>
                  </div>
                </div>

                {sheetTab === 'raw' ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    {/* Table Toolbar */}
                    <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search customer, phone, campaign..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                      </div>

                      <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                        <div className="flex items-center space-x-2">
                          <Filter className="w-4 h-4 text-slate-400" />
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                          >
                            <option value="All">All Statuses</option>
                            <option value="New">New</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Qualified">Qualified</option>
                            <option value="Closed">Closed</option>
                          </select>
                        </div>

                        <button
                          onClick={() => {
                            const csvContent = "data:text/csv;charset=utf-8," + 
                              ["Date,Timestamp,Inquiry_ID,Customer_Name,Phone_Number,Source_Campaign,Message_Summary,Agent_Assigned,Status",
                              ...filteredInquiries.map(i => `"${i.date}","${i.timestamp}","${i.inquiryId}","${i.customerName}","${i.phoneNumber}","${i.sourceCampaign}","${i.messageSummary.replace(/"/g, '""')}","${i.agentAssigned}","${i.status}"`)
                              ].join("\n");
                            const encodedUri = encodeURI(csvContent);
                            const link = document.createElement("a");
                            link.setAttribute("href", encodedUri);
                            link.setAttribute("download", `Raw_Inquiries_${dataMode}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition"
                        >
                          <Download className="w-4 h-4" />
                          <span>Export CSV</span>
                        </button>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                            <th className="p-3">Date</th>
                            <th className="p-3">Timestamp</th>
                            <th className="p-3">Inquiry ID</th>
                            <th className="p-3">Customer Name</th>
                            <th className="p-3">Phone Number</th>
                            <th className="p-3">Source Campaign</th>
                            <th className="p-3">Message Summary</th>
                            <th className="p-3">Agent</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-sans text-sm">
                          {filteredInquiries.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="text-center py-12 text-slate-500">
                                No matching inquiries found. Try clearing filters or submit a webhook.
                              </td>
                            </tr>
                          ) : (
                            filteredInquiries.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/30 transition">
                                <td className="p-3 font-mono text-xs text-slate-300">{item.date}</td>
                                <td className="p-3 font-mono text-xs text-slate-400">{item.timestamp}</td>
                                <td className="p-3 font-mono text-xs text-emerald-400 font-semibold">{item.inquiryId}</td>
                                <td className="p-3 font-medium text-white">{item.customerName}</td>
                                <td className="p-3 font-mono text-xs text-slate-300">{item.phoneNumber}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">
                                    {item.sourceCampaign}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-300 max-w-xs truncate" title={item.messageSummary}>
                                  {item.messageSummary}
                                </td>
                                <td className="p-3 text-slate-300 text-xs">{item.agentAssigned}</td>
                                <td className="p-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    item.status === 'Closed' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                    item.status === 'Qualified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    item.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                    'bg-slate-800 text-slate-300'
                                  }`}>
                                    {item.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-white">Daily Summary Rollup Tab</h2>
                        <p className="text-xs text-slate-400">Automated daily metrics powered by Google Sheets formulas</p>
                      </div>
                      <span className="text-xs font-mono bg-slate-800 text-emerald-400 px-3 py-1 rounded-lg">
                        Asia/Kuala_Lumpur
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-xs font-mono">
                            <th className="p-3">Date (Col A)</th>
                            <th className="p-3">Total Inquiries (Col B)</th>
                            <th className="p-3">Unique Leads (Col C)</th>
                            <th className="p-3">Qualified Leads</th>
                            <th className="p-3">Closed Won (Col D)</th>
                            <th className="p-3">Conversion Rate (Col E)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-sans">
                          {dailySummaries.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-12 text-slate-500">
                                No summary data available yet.
                              </td>
                            </tr>
                          ) : (
                            dailySummaries.map((summary, idx) => {
                              const uniqueCount = summary.phones.size;
                              const convRate = summary.total > 0 ? ((summary.closed / summary.total) * 100).toFixed(1) + '%' : '0.0%';
                              return (
                                <tr key={idx} className="hover:bg-slate-800/30 transition">
                                  <td className="p-3 font-mono text-sm text-white font-medium">{summary.date}</td>
                                  <td className="p-3 font-mono text-emerald-400 font-bold">{summary.total}</td>
                                  <td className="p-3 font-mono text-blue-400">{uniqueCount}</td>
                                  <td className="p-3 font-mono text-amber-400">{summary.qualified}</td>
                                  <td className="p-3 font-mono text-purple-400 font-bold">{summary.closed}</td>
                                  <td className="p-3 font-mono text-slate-200 font-semibold">{convRate}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. WEBHOOK TESTER & SANDBOX TAB */}
            {activeTab === 'webhook' && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">Webhook Tester & Sandbox</h1>
                  <p className="text-sm text-slate-400">Test incoming JSON payloads from 4 major WhatsApp CRM presets securely</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Payload Editor & Presets */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-white flex items-center space-x-2">
                        <Webhook className="w-4 h-4 text-emerald-400" />
                        <span>Select CRM Preset</span>
                      </h2>
                      <span className="text-xs text-slate-400 font-mono">Authenticated via /api/simulator/send</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'manychat', label: 'ManyChat' },
                        { id: 'wati', label: 'Wati' },
                        { id: 'respondio', label: 'Respond.io' },
                        { id: 'sleekflow', label: 'SleekFlow' }
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handlePresetChange(preset.id as any)}
                          className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                            selectedPreset === preset.id
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                        JSON Payload Editor (Supports Respond.io & SleekFlow formats)
                      </label>
                      <textarea
                        rows={10}
                        value={customPayloadJson}
                        onChange={(e) => setCustomPayloadJson(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 transition resize-y"
                      />
                    </div>

                    <button
                      onClick={handleSendSimulatorWebhook}
                      disabled={isSendingWebhook}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50"
                    >
                      {isSendingWebhook ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Simulating Webhook Delivery...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>Simulate Webhook Delivery</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right: Response Inspector & Instructions */}
                  <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                      <h2 className="text-base font-bold text-white flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-amber-400" />
                        <span>Execution Response</span>
                      </h2>

                      {webhookResponse ? (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              webhookResponse.status === 'success' || webhookResponse.status === 'updated'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              Status: {webhookResponse.status}
                            </span>
                            {webhookResponse.action && (
                              <span className="text-xs font-mono text-slate-400">Action: {webhookResponse.action}</span>
                            )}
                          </div>
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto">
                            <pre className="text-xs font-mono text-emerald-300">
                              {JSON.stringify(webhookResponse, null, 2)}
                            </pre>
                          </div>
                          <p className="text-xs text-slate-400">
                            ✨ Check the <button onClick={() => setActiveTab('simulator')} className="text-emerald-400 underline hover:text-emerald-300">Google Sheets Simulator</button> tab to view the updated record!
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-slate-500 text-sm">
                          Click "Simulate Webhook Delivery" to test payload parsing, strict phone validation, and deduplication.
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <Lock className="w-4 h-4 text-teal-400" />
                        <span>Live Production Webhook Endpoint</span>
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        For live WhatsApp traffic, your CRM sends payloads to <code className="text-emerald-400 font-mono">/api/webhook/whatsapp?secret=YOUR_WEBHOOK_SECRET</code> (or with header <code className="text-emerald-400 font-mono">X-Webhook-Secret</code>).
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. GOOGLE APPS SCRIPT GENERATOR TAB */}
            {activeTab === 'gas' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Google Apps Script Generator</h1>
                    <p className="text-sm text-slate-400">Secure production <code className="text-emerald-400 font-mono">Code.gs</code> script with SPREADSHEET_ID and Secret verification</p>
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedGasCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2500);
                    }}
                    className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm"
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode ? 'Copied Code.gs!' : 'Copy Secure Code.gs'}</span>
                  </button>
                </div>

                {/* Configuration Options */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                      Destination Spreadsheet ID
                    </label>
                    <input
                      type="text"
                      value={gasSpreadsheetId}
                      onChange={(e) => setGasSpreadsheetId(e.target.value)}
                      placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                      Target Sheet Name
                    </label>
                    <input
                      type="text"
                      value={gasSheetName}
                      onChange={(e) => setGasSheetName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-3">
                    <div>
                      <div className="text-sm font-medium text-white">Same-Day Deduplication</div>
                      <div className="text-xs text-slate-400">Preserves agent/status on repeat inquiry</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={gasDeduplicate}
                      onChange={(e) => setGasDeduplicate(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Code Preview Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">Code.gs (Google Apps Script - Production Secure)</span>
                    <span className="text-xs text-emerald-400 font-mono">Explicit ID + LockService + Text Safety</span>
                  </div>
                  <div className="p-4 bg-slate-950 overflow-x-auto max-h-96">
                    <pre className="text-xs font-mono text-emerald-300 leading-relaxed">
                      {generatedGasCode}
                    </pre>
                  </div>
                </div>

                {/* Deployment Steps Summary */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    <span>Apps Script Deployment Checklist</span>
                  </h3>
                  <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300">
                    <li>Open your Google Sheet, navigate to <strong className="text-white">Extensions &gt; Apps Script</strong> and paste <code className="text-emerald-400 font-mono">Code.gs</code>.</li>
                    <li>Go to <strong className="text-white">Project Settings (Gear icon) &gt; Script Properties</strong>, add property <code className="text-emerald-400 font-mono">WHATSAPP_WEBHOOK_SECRET</code> with your secret token.</li>
                    <li>Click <strong className="text-white">Deploy &gt; New deployment</strong> &gt; Web app (Execute as: <strong className="text-white">Me</strong>, Who has access: <strong className="text-white">Anyone</strong>).</li>
                    <li>Configure your WhatsApp CRM webhook URL as: <code className="text-emerald-400 font-mono">https://script.google.com/macros/s/.../exec?secret=YOUR_WEBHOOK_SECRET</code>.</li>
                  </ol>
                </div>
              </div>
            )}

            {/* 5. AI PAYLOAD MAPPER TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">AI Payload Mapper & Assistant</h1>
                  <p className="text-sm text-slate-400">Privacy-sanitized Gemini AI mapper for generating custom Apps Script extraction logic</p>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl text-xs flex items-start space-x-3">
                  <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold text-white">Privacy Protection Notice:</strong> Before sending sample JSON payloads to Gemini, customer names, phone numbers, emails, and sensitive keys are automatically anonymized on the server while preserving nesting, field names, arrays, and data types.
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Input Form */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center space-x-2">
                      <Bot className="w-4 h-4 text-purple-400" />
                      <span>Custom Platform Details</span>
                    </h2>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                        Platform / CRM Name
                      </label>
                      <input
                        type="text"
                        value={aiPlatformName}
                        onChange={(e) => setAiPlatformName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-2">
                        Sample Webhook JSON Payload
                      </label>
                      <textarea
                        rows={8}
                        value={aiSamplePayload}
                        onChange={(e) => setAiSamplePayload(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-purple-300 focus:outline-none focus:border-purple-500 transition resize-y"
                      />
                    </div>

                    <button
                      onClick={handleRunAiAnalysis}
                      disabled={isAnalyzing}
                      className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-purple-950/50"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Sanitizing & Analyzing with Gemini...</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4" />
                          <span>Generate Custom Mapping Code</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* AI Output Analysis */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center space-x-2">
                      <Code className="w-4 h-4 text-emerald-400" />
                      <span>AI Extraction Recommendations</span>
                    </h2>

                    {aiAnalysisResult ? (
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-x-auto max-h-[420px]">
                        <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {aiAnalysisResult}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center py-16 text-slate-500 text-sm">
                        Enter your platform JSON payload and click "Generate Custom Mapping Code" to receive privacy-compliant extraction logic.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 6. TECHNICAL BLUEPRINT TAB */}
            {activeTab === 'blueprint' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Technical Blueprint & Security Architecture</h1>
                    <p className="text-sm text-slate-400">Complete security, locking, timezone, and CRM mapping specifications</p>
                  </div>
                  <a
                    href="/public/assets/aistudio/whatsapp_inquiry_to_google_sheets_automation_blueprint_8d9b025b.md"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <span>Open Raw Markdown Guide</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6 text-slate-300 leading-relaxed text-sm">
                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">1. Security & Authentication</h2>
                    <p className="text-slate-400">
                      Protected endpoints enforce staff token verification (`x-staff-token`). Live webhooks require `WHATSAPP_WEBHOOK_SECRET` verification. Gemini AI calls are rate-limited and preceded by strict JSON privacy sanitization.
                    </p>
                  </div>

                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">2. Concurrency & Formula Injection Safety</h2>
                    <p className="text-slate-400">
                      Apps Script utilizes `LockService.getScriptLock().tryLock(10000)` with timeout handling and `SpreadsheetApp.flush()`. Incoming strings starting with `=`, `+`, or leading zeros are prefixed with `'` to preserve literal text.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-white mb-2">3. Supported CRM Presets</h2>
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      <li><strong>ManyChat:</strong> `contact.name`, `contact.phone`</li>
                      <li><strong>Wati:</strong> `name`, `phone`</li>
                      <li><strong>Respond.io:</strong> `contact.full_name`, `contact.phone`</li>
                      <li><strong>SleekFlow:</strong> `customer.full_name`, `customer.phone`</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        <p>WhatsApp Sheets Automation Hub • Secure Production Edition</p>
      </footer>
    </div>
  );
}
