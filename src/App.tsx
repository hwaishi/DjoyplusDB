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
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  Users,
  PhoneCall,
  MessageSquare,
  Settings,
  Code,
  Layers,
  Send,
  Zap,
  HelpCircle,
  Database,
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
    phone: "+6591234567",
    utm_campaign: "Wati_Broadcast_Promo",
    message: "Do you have enterprise billing options available?",
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
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetTab, setSheetTab] = useState<'raw' | 'summary'>('raw');
  
  // Webhook Tester State
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESET_PAYLOADS>('manychat');
  const [customPayloadJson, setCustomPayloadJson] = useState(JSON.stringify(PRESET_PAYLOADS.manychat, null, 2));
  const [webhookResponse, setWebhookResponse] = useState<any>(null);
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);

  // GAS Generator Config State
  const [gasSheetName, setGasSheetName] = useState('Raw_Inquiries');
  const [gasDeduplicate, setGasDeduplicate] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // AI Assistant State
  const [aiPlatformName, setAiPlatformName] = useState('Custom WhatsApp CRM');
  const [aiSamplePayload, setAiSamplePayload] = useState('{\n  "event": "message.received",\n  "data": {\n    "sender_name": "John Doe",\n    "wa_id": "15551234567",\n    "message_body": "Hello"\n  }\n}');
  const [aiAnalysisResult, setAiAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Search & Filter state for simulator
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Fetch inquiries on mount
  useEffect(() => {
    fetchInquiries();
  }, []);

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/inquiries');
      const data = await res.json();
      if (data.success) {
        setInquiries(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch inquiries:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetData = async () => {
    try {
      const res = await fetch('/api/inquiries/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setInquiries(data.data);
      }
    } catch (err) {
      console.error('Failed to reset inquiries:', err);
    }
  };

  const handleSendWebhook = async () => {
    try {
      setIsSendingWebhook(true);
      setWebhookResponse(null);
      const parsedPayload = JSON.parse(customPayloadJson);
      
      const res = await fetch('/api/webhook/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
 * Deploy as Web App -> Execute as: Me | Who has access: Anyone
 */

const SHEET_NAME = "${gasSheetName}";
const DEDUPLICATE_SAME_DAY = ${gasDeduplicate};

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return createJsonResponse({ status: "error", message: "Sheet '" + SHEET_NAME + "' not found." });
    }

    const rawData = e.postData.contents;
    const payload = JSON.parse(rawData);

    const now = new Date();
    const timezone = ss.getSpreadsheetTimeZone();
    const dateStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
    const timestampStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");

    const inquiryId = payload.id || payload.message_id || Utilities.getUuid();
    const customerName = payload.contact?.name || payload.name || payload.customer?.full_name || "Unknown";
    const phoneNumber = String(payload.contact?.phone || payload.phone || payload.sender?.phone || "").replace(/[^0-9+]/g, "");
    const sourceCampaign = payload.source || payload.utm_campaign || payload.campaign_name || "Organic / Direct";
    const messageSummary = payload.text || payload.message || payload.body || payload.content || "";
    const agentAssigned = payload.assignee || payload.agent?.name || "Unassigned";
    const status = payload.status || "New";

    if (DEDUPLICATE_SAME_DAY && phoneNumber) {
      const existingRowIndex = findRowByDateAndPhone(sheet, dateStr, phoneNumber);
      if (existingRowIndex > 0) {
        sheet.getRange(existingRowIndex, 2).setValue(timestampStr);
        sheet.getRange(existingRowIndex, 7).setValue(messageSummary);
        sheet.getRange(existingRowIndex, 8).setValue(agentAssigned);
        sheet.getRange(existingRowIndex, 9).setValue(status);
        return createJsonResponse({ status: "updated", row: existingRowIndex });
      }
    }

    sheet.appendRow([
      dateStr,
      timestampStr,
      inquiryId,
      customerName,
      phoneNumber,
      sourceCampaign,
      messageSummary,
      agentAssigned,
      status
    ]);

    return createJsonResponse({ status: "success", action: "appended" });

  } catch (error) {
    return createJsonResponse({ status: "error", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function findRowByDateAndPhone(sheet, dateStr, phoneNumber) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0] instanceof Date 
      ? Utilities.formatDate(data[i][0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd")
      : String(data[i][0]);
    const rowPhone = String(data[i][4]);
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
                  WhatsApp Automation
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Sync 3rd-party WhatsApp inquiries into Google Sheets automatically
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('webhook')}
              className="hidden md:inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition shadow-sm hover:shadow-emerald-900/30 shadow-emerald-900/20"
            >
              <Webhook className="w-4 h-4" />
              <span>Test Webhook Sandbox</span>
            </button>
            <button
              onClick={handleResetData}
              title="Reset Demo Inquiries"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-navbar Tabs */}
        <div className="bg-slate-900/80 backdrop-blur border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 overflow-x-auto">
          <div className="max-w-7xl mx-auto flex space-x-1 py-2">
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
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm">Loading automation cockpit...</p>
          </div>
        ) : (
          <>
            {/* 1. DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Automation Overview</h1>
                    <p className="text-sm text-slate-400">Real-time metrics synced from your WhatsApp integrations</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse"></span>
                      Webhook Listener Active
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
                      <span className="ml-2 text-xs text-emerald-400 font-medium">+12% today</span>
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
                    <p className="mt-1 text-xs text-slate-400">Deduplicated automatically</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Closed Won</span>
                      <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                        <CheckCircle2 className="w-5 h-5" />
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
                    <p className="mt-1 text-xs text-slate-400">Calculated via sheet formula</p>
                  </div>
                </div>

                {/* Quick Shortcuts & Architecture */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Recent Activity Stream */}
                  <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-base font-bold text-white flex items-center space-x-2">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                        <span>Recent WhatsApp Inquiries</span>
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
                            <th className="pb-3 font-semibold text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {inquiries.slice(0, 5).map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/30 transition">
                              <td className="py-3 pr-3">
                                <div className="font-medium text-white">{item.customerName}</div>
                                <div className="text-xs text-slate-400">{item.phoneNumber}</div>
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
                                {item.timestamp.substring(11, 16)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Architecture & Quick Actions */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                      <h2 className="text-base font-bold text-white mb-3 flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-teal-400" />
                        <span>Integration Stack</span>
                      </h2>
                      <div className="space-y-3 text-sm text-slate-300">
                        <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                          <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 mt-0.5">
                            <Webhook className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs">1. 3rd-Party Webhook</div>
                            <div className="text-xs text-slate-400">ManyChat, Wati, Respond.io, or SleekFlow triggers payload on message.</div>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                          <div className="p-1.5 rounded bg-blue-500/10 text-blue-400 mt-0.5">
                            <Code className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs">2. Google Apps Script</div>
                            <div className="text-xs text-slate-400">`doPost(e)` parses JSON, handles deduplication, and appends rows.</div>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate-800/50 border border-slate-800">
                          <div className="p-1.5 rounded bg-purple-500/10 text-purple-400 mt-0.5">
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs">3. Google Sheets Rollup</div>
                            <div className="text-xs text-slate-400">`Raw_Inquiries` & `Daily_Summary` calculate KPIs automatically.</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800 flex space-x-2">
                      <button
                        onClick={() => setActiveTab('gas')}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-3 rounded-lg text-xs font-semibold transition text-center"
                      >
                        Get Apps Script Code
                      </button>
                      <button
                        onClick={() => setActiveTab('blueprint')}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 px-3 rounded-lg text-xs font-semibold transition"
                      >
                        Read Guide
                      </button>
                    </div>
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
                    <p className="text-sm text-slate-400">Live preview of your Google Sheet structure (`Raw_Inquiries` & `Daily_Summary` tabs)</p>
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
                            link.setAttribute("download", "Raw_Inquiries_Export.csv");
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
                                No matching inquiries found. Try clearing filters or send a test webhook.
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
                        Formulas Active
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
                  <p className="text-sm text-slate-400">Test incoming JSON payloads from WhatsApp platforms against your local automation endpoint</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Payload Editor & Presets */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-white flex items-center space-x-2">
                        <Webhook className="w-4 h-4 text-emerald-400" />
                        <span>Select Platform Preset</span>
                      </h2>
                      <span className="text-xs text-slate-400 font-mono">POST /api/webhook/whatsapp</span>
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
                        JSON Payload Editor
                      </label>
                      <textarea
                        rows={10}
                        value={customPayloadJson}
                        onChange={(e) => setCustomPayloadJson(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 transition resize-y"
                      />
                    </div>

                    <button
                      onClick={handleSendWebhook}
                      disabled={isSendingWebhook}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50"
                    >
                      {isSendingWebhook ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Sending Webhook...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current" />
                          <span>Send Test Webhook Now</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Right: Response Inspector & Instructions */}
                  <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                      <h2 className="text-base font-bold text-white flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-amber-400" />
                        <span>Webhook Execution Response</span>
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
                            ✨ Check the <button onClick={() => setActiveTab('simulator')} className="text-emerald-400 underline hover:text-emerald-300">Google Sheets Simulator</button> tab to see your new row instantly reflected!
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-slate-500 text-sm">
                          Click "Send Test Webhook Now" to test payload parsing and deduplication.
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <HelpCircle className="w-4 h-4 text-teal-400" />
                        <span>Production Deployment Tip</span>
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Once you deploy your Google Apps Script as a Web App (as detailed in the <button onClick={() => setActiveTab('blueprint')} className="text-emerald-400 underline">Technical Blueprint</button>), paste your live Google Web App URL into your WhatsApp CRM's Outgoing Webhook settings.
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
                    <p className="text-sm text-slate-400">Configure and copy your customized `Code.gs` webhook receiver script</p>
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
                    <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Code.gs'}</span>
                  </button>
                </div>

                {/* Configuration Options */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <div className="text-xs text-slate-400">Update existing row if phone inures twice on same date</div>
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
                    <span className="text-xs font-mono text-slate-400">Code.gs (Google Apps Script)</span>
                    <span className="text-xs text-emerald-400 font-mono">Ready for Deployment</span>
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
                    <li>Open your Google Sheet, navigate to <strong className="text-white">Extensions &gt; Apps Script</strong>.</li>
                    <li>Paste the code above into <code className="text-emerald-400 font-mono">Code.gs</code>.</li>
                    <li>Click <strong className="text-white">Deploy &gt; New deployment</strong>, select type <strong className="text-white">Web app</strong>.</li>
                    <li>Set Execute as: <strong className="text-white">Me</strong> and Who has access: <strong className="text-white">Anyone</strong>.</li>
                    <li>Copy the Web App URL and paste it into your 3rd-party WhatsApp platform webhook settings.</li>
                  </ol>
                </div>
              </div>
            )}

            {/* 5. AI PAYLOAD MAPPER TAB */}
            {activeTab === 'ai' && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">AI Payload Mapper & Assistant</h1>
                  <p className="text-sm text-slate-400">Powered by Gemini AI to inspect custom webhook JSON structures and generate extraction code</p>
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
                          <span>Analyzing with Gemini AI...</span>
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
                        Enter your platform JSON payload and click "Generate Custom Mapping Code" to receive AI extraction logic.
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
                    <h1 className="text-2xl font-bold text-white tracking-tight">Technical Blueprint & Guide</h1>
                    <p className="text-sm text-slate-400">Complete architectural specification and step-by-step implementation guide</p>
                  </div>
                  <a
                    href="/public/assets/aistudio/whatsapp_inquiry_to_google_sheets_automation_blueprint_8d9b025b.md"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <span>Open Raw Markdown</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6 text-slate-300 leading-relaxed text-sm">
                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">1. Recommended Google Sheet Structure</h2>
                    <p className="text-slate-400 mb-3">Organize your existing Google Sheet into two tabs:</p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-300">
                      <li><strong className="text-white">`Raw_Inquiries`</strong> (Automated Data Log): Columns: <code className="text-emerald-400 font-mono text-xs">Date | Timestamp | Inquiry_ID | Customer_Name | Phone_Number | Source_Campaign | Message_Summary | Agent_Assigned | Status</code></li>
                      <li><strong className="text-white">`Daily_Summary`</strong> (Automated Daily Rollup): Columns: <code className="text-emerald-400 font-mono text-xs">Date | Total_Inquiries | Unique_Leads | Qualified_Leads | Closed_Won | Conversion_Rate</code></li>
                    </ul>
                  </div>

                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">2. Approach A: Real-Time Webhook + Google Apps Script</h2>
                    <p className="text-slate-400 mb-2">Best if your third-party WhatsApp platform supports Outgoing Webhooks (JSON payloads triggered on new messages).</p>
                    <div className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-emerald-300 space-y-1">
                      <div>// 1. Open Google Sheet &gt; Extensions &gt; Apps Script</div>
                      <div>// 2. Paste doPost(e) webhook receiver with LockService & deduplication</div>
                      <div>// 3. Deploy as Web App &gt; Execute as Me &gt; Access: Anyone</div>
                    </div>
                  </div>

                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">3. Approach B: Scheduled Daily Batch Sync (API Polling)</h2>
                    <p className="text-slate-400">
                      Best if your third-party platform does not support webhooks and requires fetching data via REST API once per day at 23:55 using Make.com, n8n, or time-driven Apps Script triggers.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-white mb-2">4. Automating the `Daily_Summary` Tab Formulas</h2>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-slate-400 font-semibold mb-1">Column A (Date):</div>
                        <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
                          =SORT(UNIQUE(FILTER(Raw_Inquiries!A2:A, Raw_Inquiries!A2:A &lt;&gt; "")), 1, FALSE)
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 font-semibold mb-1">Column B (Total_Inquiries):</div>
                        <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
                          =IF(A2="", "", COUNTIF(Raw_Inquiries!$A$2:$A, A2))
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 font-semibold mb-1">Column E (Conversion_Rate):</div>
                        <div className="bg-slate-950 p-3 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
                          =IF(B2=0, 0, D2/B2)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        <p>WhatsApp Sheets Automation Hub • Powered by Google AI Studio & Apps Script</p>
      </footer>
    </div>
  );
}
