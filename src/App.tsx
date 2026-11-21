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
  ArrowUpRight,
  AlertCircle,
  DatabaseBackup,
  LogOut,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Mail,
  CheckCircle2
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

interface UserProfile {
  email: string;
  role: 'Administration' | 'Manager' | 'Employee';
  isVerified?: boolean;
  isApproved?: boolean;
  isActive?: boolean;
  createdAt?: string;
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
  // Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [csrfToken, setCsrfToken] = useState<string>('');
  const [authView, setAuthView] = useState<'login' | 'signup' | 'verify' | 'forgot' | 'reset' | 'pending_approval'>('login');
  const [authEmailInput, setAuthEmailInput] = useState('');
  const [authPasswordInput, setAuthPasswordInput] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  // App state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'simulator' | 'webhook' | 'gas' | 'ai' | 'blueprint' | 'admin'>('dashboard');
  const [dataMode, setDataMode] = useState<'demo' | 'live'>('demo');
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sheetTab, setSheetTab] = useState<'raw' | 'summary'>('raw');

  // Admin users list state
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);

  // Webhook Tester State
  const [selectedPreset, setSelectedPreset] = useState<keyof typeof PRESET_PAYLOADS>('manychat');
  const [customPayloadJson, setCustomPayloadJson] = useState(JSON.stringify(PRESET_PAYLOADS.manychat, null, 2));
  const [webhookResponse, setWebhookResponse] = useState<any>(null);
  const [isSendingWebhook, setIsSendingWebhook] = useState(false);

  // GAS Generator Config State
  const [gasSpreadsheetId, setGasSpreadsheetId] = useState('YOUR_SPREADSHEET_ID_HERE');
  const [gasSheetName, setGasSheetName] = useState('DJ Client Base');
  const [gasDeduplicate, setGasDeduplicate] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Migration State
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // AI Assistant State
  const [aiPlatformName, setAiPlatformName] = useState('Custom WhatsApp CRM');
  const [aiSamplePayload, setAiSamplePayload] = useState('{\n  "event": "message.received",\n  "contact": {\n    "full_name": "Jane Doe",\n    "phone": "+60129876543"\n  },\n  "message_body": "Hello world"\n}');
  const [aiAnalysisResult, setAiAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Check session on mount
  useEffect(() => {
    fetchCurrentUser();
  }, []);

  // Fetch inquiries when currentUser or dataMode changes
  useEffect(() => {
    if (currentUser?.isVerified && currentUser?.isApproved) {
      fetchInquiries();
    }
  }, [currentUser, dataMode]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown > 0) {
      const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCountdown]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        if (data.csrfToken) setCsrfToken(data.csrfToken);
        if (!data.user.isVerified) {
          setAuthView('verify');
        } else if (!data.user.isApproved) {
          setAuthView('pending_approval');
        }
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      setCurrentUser(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken }
      });
    } catch (e) {}
    setCurrentUser(null);
    setCsrfToken('');
    setAuthView('login');
  };

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/inquiries?mode=${dataMode}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setInquiries(data.inquiries || data.data || []);
      } else {
        setErrorMsg(data.error || 'Failed to load inquiries.');
        setInquiries([]);
      }
    } catch (err: any) {
      setErrorMsg(err.toString());
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: authEmailInput, password: authPasswordInput })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        if (data.csrfToken) setCsrfToken(data.csrfToken);
        if (!data.user.isVerified) {
          setAuthView('verify');
        } else if (!data.user.isApproved) {
          setAuthView('pending_approval');
        } else {
          fetchInquiries();
        }
      } else {
        if (data.unverified) {
          setAuthView('verify');
        } else if (data.pendingApproval) {
          setAuthView('pending_approval');
        }
        setAuthError(data.error || 'Login failed.');
      }
    } catch (err: any) {
      setAuthError(err.toString());
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmailInput, password: authPasswordInput, confirmPassword: authConfirmPassword })
      });
      const data = await res.json();
      if (data.success) {
        setAuthMessage(data.message);
        setAuthView('verify');
        setResendCountdown(60);
      } else {
        setAuthError(data.error || 'Signup failed.');
      }
    } catch (err: any) {
      setAuthError(err.toString());
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmailInput, code: authCodeInput })
      });
      const data = await res.json();
      if (data.success) {
        setAuthMessage(data.message);
        setTimeout(() => {
          setAuthView('login');
          setAuthPasswordInput('');
          setAuthMessage('Email verified. You can now sign in.');
        }, 1500);
      } else {
        setAuthError(data.error || 'Verification failed.');
      }
    } catch (err: any) {
      setAuthError(err.toString());
    }
  };

  const handleResendCode = async (type: 'verify' | 'reset') => {
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmailInput, type })
      });
      const data = await res.json();
      if (data.success) {
        setAuthMessage(data.message);
        setResendCountdown(60);
      } else {
        setAuthError(data.error || 'Failed to resend code.');
      }
    } catch (err: any) {
      setAuthError(err.toString());
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmailInput })
      });
      const data = await res.json();
      if (data.success) {
        setAuthMessage(data.message);
        setAuthView('reset');
        setResendCountdown(60);
      } else {
        setAuthError(data.error || 'Request failed.');
      }
    } catch (err: any) {
      setAuthError(err.toString());
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmailInput, code: authCodeInput, newPassword: authPasswordInput, confirmPassword: authConfirmPassword })
      });
      const data = await res.json();
      if (data.success) {
        setAuthMessage(data.message);
        setTimeout(() => {
          setAuthView('login');
          setAuthPasswordInput('');
          setAuthConfirmPassword('');
        }, 2000);
      } else {
        setAuthError(data.error || 'Password reset failed.');
      }
    } catch (err: any) {
      setAuthError(err.toString());
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setAdminUsers(data.users);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (currentUser?.role === 'Administration' && activeTab === 'admin') {
      fetchAdminUsers();
    }
  }, [currentUser, activeTab]);

  const handleAdminStatusChange = async (targetEmail: string, isApproved: boolean, isActive: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetEmail)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ isApproved, isActive })
      });
      const data = await res.json();
      if (data.success) {
        fetchAdminUsers();
      } else {
        alert(data.error || 'Action failed.');
      }
    } catch (err: any) {
      alert('Action failed: ' + err.toString());
    }
  };

  const handleAdminRoleChange = async (targetEmail: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(targetEmail)}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        fetchAdminUsers();
      } else {
        alert(data.error || 'Role change failed.');
      }
    } catch (err: any) {
      alert('Role change failed: ' + err.toString());
    }
  };

  const handleResetData = async () => {
    if (dataMode === 'live') {
      alert('Reset is restricted to Demo Sandbox records only.');
      return;
    }
    try {
      const res = await fetch('/api/inquiries/reset', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
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

  const handleRunMigration = async (dryRun: boolean) => {
    try {
      setIsMigrating(true);
      setMigrationResult(null);
      const res = await fetch('/api/admin/migrate-legacy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ dryRun })
      });
      const data = await res.json();
      setMigrationResult(data);
      if (!dryRun && data.success) {
        await fetchInquiries();
      }
    } catch (err: any) {
      setMigrationResult({ success: false, error: err.toString() });
    } finally {
      setIsMigrating(false);
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
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify(parsedPayload)
      });
      const data = await res.json();
      setWebhookResponse(data);
      if (data.status === 'success' || data.status === 'updated') {
        await fetchInquiries();
      }
    } catch (err: any) {
      setWebhookResponse({ status: 'error', code: 'SIMULATOR_ERROR', message: err.toString() });
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
      const res = await fetch('/api/gemini/map', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ platformName: aiPlatformName, jsonPayload: parsed })
      });
      const data = await res.json();
      if (data.success) {
        setAiAnalysisResult(data.result || data.analysis);
      } else {
        setAiAnalysisResult('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      setAiAnalysisResult('Error parsing JSON payload or request failed: ' + err.toString());
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Compute Daily Summaries
  const summaryMap = inquiries.reduce((acc: Record<string, { date: string; total: number; phones: Set<string>; qualified: number; closed: number }>, item) => {
    const d = item.date || new Date().toISOString().split('T')[0];
    if (!acc[d]) {
      acc[d] = { date: d, total: 0, phones: new Set(), qualified: 0, closed: 0 };
    }
    acc[d].total += 1;
    if (item.phoneNumber) acc[d].phones.add(item.phoneNumber);
    if (item.status === 'Qualified') acc[d].qualified += 1;
    if (item.status === 'Closed') acc[d].closed += 1;
    return acc;
  }, {});

  const dailySummaries = Object.values(summaryMap).sort((a, b) => b.date.localeCompare(a.date));

  // Filtered inquiries
  const filteredInquiries = inquiries.filter(item => {
    const matchesSearch = 
      (item.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.phoneNumber || '').includes(searchTerm) ||
      (item.sourceCampaign || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.messageSummary || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalInquiriesCount = inquiries.length;
  const uniqueLeadsCount = new Set(inquiries.map(i => i.phoneNumber)).size;
  const closedCount = inquiries.filter(i => i.status === 'Closed').length;
  const conversionRate = totalInquiriesCount > 0 ? ((closedCount / totalInquiriesCount) * 100).toFixed(1) : '0.0';

  const generatedGasCode = `/**
 * Google Apps Script Maintained Receiver & Source of Truth for WhatsApp Inquiries
 * Worksheet: DJ Client Base ("MP Ads Spend vs Revenue vs Client Inquiries")
 */

const SPREADSHEET_ID = "${gasSpreadsheetId}";
const SHEET_NAME = "DJ Client Base";
const DEDUPLICATE_SAME_DAY = ${gasDeduplicate};
const SUPPORTED_STATUSES = ["New", "In Progress", "Qualified", "Closed", "Lost"];

function doPost(e) {
  try {
    const rawData = e.postData.contents;
    const envelope = JSON.parse(rawData);
    
    const operation = envelope.operation;
    const credential = envelope.credential;
    
    if (!operation || !credential || typeof credential !== "string" || credential.trim() === "") {
      return createJsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Missing or invalid operation/credential." });
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const readSecret = scriptProps.getProperty("APPS_SCRIPT_READ_SECRET");
    const writeSecret = scriptProps.getProperty("APPS_SCRIPT_WRITE_SECRET");
    
    if (operation === "read") {
      if (!readSecret || readSecret.trim() === "" || credential !== readSecret) {
        return createJsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Unauthorized read credential." });
      }
      return handleRead();
    } else if (operation === "write") {
      if (!writeSecret || writeSecret.trim() === "" || credential !== writeSecret) {
        return createJsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Unauthorized write credential." });
      }
      return handleWrite(envelope.payload);
    } else if (operation === "migrate") {
      if (!writeSecret || writeSecret.trim() === "" || credential !== writeSecret) {
        return createJsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Unauthorized migration credential." });
      }
      return handleMigration(envelope.payload);
    } else {
      return createJsonResponse({ status: "error", code: "INVALID_OPERATION", message: "Unknown operation." });
    }
  } catch (err) {
    return createJsonResponse({ status: "error", code: "SERVER_ERROR", message: err.toString() });
  }
}

function handleRead() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    return createJsonResponse({ status: "error", code: "SHEET_NOT_FOUND", message: '"DJ Client Base" sheet not found.' });
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 2) {
    return createJsonResponse({ status: "success", data: [] });
  }

  const rows = [];
  // Row 1 is legend, Row 2 is headers, data begins at row 3 (index 2)
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row[1] && !row[3]) continue;
    rows.push({
      date: String(row[1] instanceof Date ? Utilities.formatDate(row[1], "Asia/Kuala_Lumpur", "yyyy-MM-dd") : row[1]),
      customerName: String(row[2] || "").replace(/^'/, ""),
      phoneNumber: String(row[3] || "").replace(/^'/, ""),
      gender: String(row[4] || "Unknown"),
      ageGroup: String(row[5] || ""),
      state: String(row[6] || ""),
      messageSummary: String(row[7] || "").replace(/^'/, ""),
      status: "New"
    });
  }

  return createJsonResponse({ status: "success", data: rows.reverse() });
}

function handleWrite(payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ status: "busy", code: "BUSY", message: "Server busy. Try again later." });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return createJsonResponse({ status: "error", code: "SHEET_NOT_FOUND", message: '"DJ Client Base" sheet not found.' });
    }

    const now = new Date();
    const timezone = "Asia/Kuala_Lumpur";
    const dateStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
    const timeStr = Utilities.formatDate(now, timezone, "HH:mm");

    const customerName = String(payload.customerName || payload.name || "Unknown");
    const rawPhone = String(payload.phoneNumber || payload.phone || "");
    const phoneNumber = rawPhone.trim();
    
    if (!phoneNumber) {
      return createJsonResponse({ status: "error", code: "INVALID_INPUT", message: "Validation error: Missing required phone number or username." });
    }

    const gender = String(payload.gender || "Unknown");
    const ageGroup = String(payload.ageGroup || "");
    const state = String(payload.state || "");
    const newRemark = String(payload.messageSummary || payload.text || payload.message || "");

    const safeText = function(val) {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (s.startsWith("=") || s.startsWith("+") || (s.startsWith("0") && s.length > 1) || s.startsWith("@")) {
        return "'" + s;
      }
      return s;
    };

    if (DEDUPLICATE_SAME_DAY && phoneNumber) {
      const existingRowIndex = findRowByPhone(sheet, phoneNumber, timezone);
      if (existingRowIndex > 0) {
        const existingRemark = String(sheet.getRange(existingRowIndex, 8).getValue() || "");
        const dateFormatted = dateStr.split("-").reverse().join("/");
        const formattedNewRemark = newRemark ? "[" + dateFormatted + " " + timeStr + "] " + newRemark : "";
        
        let updatedRemark = existingRemark;
        if (formattedNewRemark && !existingRemark.includes(newRemark)) {
          updatedRemark = existingRemark ? existingRemark + "\\n" + formattedNewRemark : formattedNewRemark;
        }

        sheet.getRange(existingRowIndex, 8).setValue(safeText(updatedRemark));
        SpreadsheetApp.flush();
        return createJsonResponse({ status: "updated", action: "updated", row: existingRowIndex });
      }
    }

    const dateFormattedInit = dateStr.split("-").reverse().join("/");
    const initialRemark = newRemark ? "[" + dateFormattedInit + " " + timeStr + "] " + newRemark : "";

    sheet.appendRow([
      "",
      dateStr,
      safeText(customerName),
      safeText(phoneNumber),
      safeText(gender),
      safeText(ageGroup),
      safeText(state),
      safeText(initialRemark)
    ]);

    SpreadsheetApp.flush();
    return createJsonResponse({ status: "success", action: "appended" });

  } catch (error) {
    return createJsonResponse({ status: "error", code: "WRITE_ERROR", message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function handleMigration(payload) {
  const records = payload && payload.records;
  const dryRun = payload && !!payload.dryRun;

  if (!Array.isArray(records)) {
    return createJsonResponse({ status: "error", code: "INVALID_INPUT", message: "Migration payload must contain an array of records." });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return createJsonResponse({ status: "busy", code: "BUSY", message: "Server busy during migration." });
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return createJsonResponse({ status: "error", code: "SHEET_NOT_FOUND", message: '"DJ Client Base" sheet not found.' });
    }

    const data = sheet.getDataRange().getValues();
    const existingPhones = new Set();

    for (let i = 2; i < data.length; i++) {
      const rPhone = String(data[i][3] || "").replace(/^'/, "").trim();
      if (rPhone) existingPhones.add(rPhone);
    }

    let wouldImport = 0;
    let imported = 0;
    let skipped = 0;
    let conflicted = 0;
    let failed = 0;

    const rowsToAppend = [];

    for (const rec of records) {
      try {
        const rDate = String(rec.date || "").trim();
        const rName = String(rec.customerName || rec.name || "Unknown").trim();
        const rPhone = String(rec.phoneNumber || rec.phone || "").trim();
        const rGender = String(rec.gender || "Unknown").trim();
        const rAge = String(rec.ageGroup || "").trim();
        const rState = String(rec.state || "").trim();
        const rRemark = String(rec.messageSummary || rec.text || "").trim();

        if (!rDate || !rPhone) {
          failed++;
          continue;
        }

        if (existingPhones.has(rPhone)) {
          skipped++;
          continue;
        }

        wouldImport++;

        if (!dryRun) {
          const safeText = function(val) {
            if (val === null || val === undefined) return "";
            const s = String(val);
            if (s.startsWith("=") || s.startsWith("+") || (s.startsWith("0") && s.length > 1) || s.startsWith("@")) {
              return "'" + s;
            }
            return s;
          };

          rowsToAppend.push([
            "",
            rDate,
            safeText(rName),
            safeText(rPhone),
            safeText(rGender),
            safeText(rAge),
            safeText(rState),
            safeText(rRemark)
          ]);
          imported++;
        }
      } catch (e) {
        failed++;
      }
    }

    if (!dryRun && rowsToAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
      SpreadsheetApp.flush();
    }

    return createJsonResponse({
      status: "success",
      stats: {
        wouldImport,
        imported: dryRun ? 0 : imported,
        skipped,
        conflicted,
        failed
      }
    });

  } catch (err) {
    return createJsonResponse({ status: "error", code: "MIGRATE_ERROR", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function findRowByPhone(sheet, phoneNumber, timezone) {
  const data = sheet.getDataRange().getValues();
  for (let i = 2; i < data.length; i++) {
    const rowPhone = String(data[i][3] || "").replace(/^'/, "").trim();
    if (rowPhone === phoneNumber.trim()) {
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

  // If not signed in or not verified/approved, render Auth Views
  if (!currentUser || !currentUser.isVerified || !currentUser.isApproved) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex bg-gradient-to-tr from-emerald-500 to-teal-400 p-3 rounded-2xl shadow-lg shadow-emerald-950/50 mb-2">
              <FileSpreadsheet className="w-8 h-8 text-slate-950 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {authView === 'login' && "Sign in to D' Joy Plus"}
              {authView === 'signup' && "Create an Account"}
              {authView === 'verify' && "Email Verification"}
              {authView === 'forgot' && "Forgot Password"}
              {authView === 'reset' && "Reset Password"}
              {authView === 'pending_approval' && "Waiting for Approval"}
            </h1>
            <p className="text-xs text-slate-400">
              {authView === 'login' && "Secure staff dashboard & Google Sheets sync"}
              {authView === 'signup' && "Register a new staff account"}
              {authView === 'verify' && "Enter the 6-digit code sent to your email"}
              {authView === 'forgot' && "Enter your email to receive a password reset code"}
              {authView === 'reset' && "Enter your reset code and new password"}
              {authView === 'pending_approval' && "Your email is verified. Administration approval is required for lead access."}
            </p>
          </div>

          {authError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {authMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{authMessage}</span>
            </div>
          )}

          {/* LOGIN VIEW */}
          {authView === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmailInput}
                  onChange={(e) => setAuthEmailInput(e.target.value)}
                  placeholder="staff@djoyplus.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authPasswordInput}
                    onChange={(e) => setAuthPasswordInput(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Use at least 6 characters.
                </p>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => { setAuthView('signup'); setAuthError(null); setAuthMessage(null); }}
                  className="text-emerald-400 hover:underline"
                >
                  Create an Account
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthView('forgot'); setAuthError(null); setAuthMessage(null); }}
                  className="text-slate-400 hover:text-white hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-emerald-950/50 mt-2"
              >
                Sign In
              </button>
            </form>
          )}

          {/* SIGNUP VIEW */}
          {authView === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={authEmailInput}
                  onChange={(e) => setAuthEmailInput(e.target.value)}
                  placeholder="staff@djoyplus.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authPasswordInput}
                    onChange={(e) => setAuthPasswordInput(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Use at least 6 characters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  value={authConfirmPassword}
                  onChange={(e) => setAuthConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => { setAuthView('login'); setAuthError(null); setAuthMessage(null); }}
                  className="text-emerald-400 hover:underline"
                >
                  Already have an account? Sign In
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-emerald-950/50 mt-2"
              >
                Create Account
              </button>
            </form>
          )}

          {/* VERIFY VIEW */}
          {authView === 'verify' && (
            <form onSubmit={handleVerifySubmit} className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
                  <Mail className="w-4 h-4" />
                  <span>Verification code sent to:</span>
                </div>
                <div className="font-mono text-white font-medium">{authEmailInput}</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={authCodeInput}
                  onChange={(e) => setAuthCodeInput(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-center text-lg font-mono text-emerald-400 tracking-widest focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  disabled={resendCountdown > 0}
                  onClick={() => handleResendCode('verify')}
                  className="text-emerald-400 hover:underline disabled:opacity-50"
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend Code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthView('signup'); setAuthError(null); setAuthMessage(null); }}
                  className="text-slate-400 hover:text-white hover:underline"
                >
                  Correct Email
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-emerald-950/50 mt-2"
              >
                Verify Email
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD VIEW */}
          {authView === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Your Account Email
                </label>
                <input
                  type="email"
                  required
                  value={authEmailInput}
                  onChange={(e) => setAuthEmailInput(e.target.value)}
                  placeholder="staff@djoyplus.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => { setAuthView('login'); setAuthError(null); setAuthMessage(null); }}
                  className="text-emerald-400 hover:underline"
                >
                  Back to Sign In
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-emerald-950/50 mt-2"
              >
                Send Reset Code
              </button>
            </form>
          )}

          {/* RESET PASSWORD VIEW */}
          {authView === 'reset' && (
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  6-Digit Reset Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={authCodeInput}
                  onChange={(e) => setAuthCodeInput(e.target.value)}
                  placeholder="123456"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-center text-lg font-mono text-emerald-400 tracking-widest focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={authPasswordInput}
                  onChange={(e) => setAuthPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Use at least 6 characters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={authConfirmPassword}
                  onChange={(e) => setAuthConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-lg shadow-emerald-950/50 mt-2"
              >
                Reset Password
              </button>
            </form>
          )}

          {/* PENDING APPROVAL VIEW */}
          {authView === 'pending_approval' && (
            <div className="space-y-4 text-center">
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-xl text-xs space-y-2">
                <p className="font-semibold text-white text-sm">Waiting for Administration Approval</p>
                <p>Your email ({currentUser?.email || authEmailInput}) has been verified successfully. Because this app contains customer records, an administrator must approve your account before granting lead access.</p>
              </div>

              <button
                onClick={handleLogout}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2.5 px-4 rounded-lg text-sm transition"
              >
                Sign Out / Return to Login
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Signed in as <strong className="text-white">{currentUser.email}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('webhook')}
              className="hidden md:inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition shadow-sm"
            >
              <Webhook className="w-4 h-4" />
              <span>Webhook Sandbox</span>
            </button>

            {currentUser.role === 'Administration' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'admin' ? 'bg-purple-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Manage Accounts</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center space-x-1.5 px-3 text-xs font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
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
                Live Google Sheet (Source of Truth)
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
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <strong>Dashboard Read Error:</strong> {errorMsg}
              </div>
            </div>
            <button
              onClick={fetchInquiries}
              className="bg-red-600 hover:bg-red-500 text-white px-3.5 py-1.5 rounded text-xs font-semibold transition flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Read</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm">Fetching records from Google Sheets source of truth...</p>
          </div>
        ) : (
          <>
            {/* ADMIN USERS TAB */}
            {activeTab === 'admin' && currentUser.role === 'Administration' && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">Staff Account Management</h1>
                  <p className="text-sm text-slate-400">Approve registrations, disable accounts, and assign roles (Administration only)</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
                          <th className="p-4">Email</th>
                          <th className="p-4">Role</th>
                          <th className="p-4">Verified</th>
                          <th className="p-4">Approved</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {adminUsers.map((u, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30 transition">
                            <td className="p-4 font-mono text-white font-medium">{u.email}</td>
                            <td className="p-4">
                              <select
                                value={u.role}
                                onChange={(e) => handleAdminRoleChange(u.email, e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                              >
                                <option value="Administration">Administration</option>
                                <option value="Manager">Manager</option>
                                <option value="Employee">Employee</option>
                              </select>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.isVerified ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {u.isVerified ? 'Verified' : 'Unverified'}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.isApproved ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {u.isApproved ? 'Approved' : 'Pending Approval'}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                {u.isActive ? 'Active' : 'Disabled'}
                              </span>
                            </td>
                             <td className="p-4 text-right space-x-2">
                              {!u.isApproved && (
                                <button
                                  onClick={() => handleAdminStatusChange(u.email, true, !!u.isActive)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-medium transition"
                                >
                                  Approve
                                </button>
                              )}
                              {u.isActive ? (
                                <button
                                  onClick={() => handleAdminStatusChange(u.email, !!u.isApproved, false)}
                                  className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 px-3 py-1 rounded text-xs font-medium transition"
                                >
                                  Disable
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleAdminStatusChange(u.email, !!u.isApproved, true)}
                                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded text-xs font-medium transition"
                                >
                                  Enable
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

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
                        {dataMode === 'live' ? '🟢 Live Google Sheet' : '🟡 Demo Sandbox'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      Role: <strong className="text-white">{currentUser.role}</strong> {currentUser.role === 'Employee' ? '(Showing only assigned leads)' : '(Showing all leads)'}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {(currentUser.role === 'Administration' || currentUser.role === 'Manager') && (
                      <a
                        href={`/api/inquiries/export?mode=${dataMode}`}
                        className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium transition"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Export Leads CSV</span>
                      </a>
                    )}
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
                      <span className="text-3xl font-extrabold text-white">
                        {errorMsg ? '—' : totalInquiriesCount}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">leads saved</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Raw_Inquiries tab</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Unique Leads</span>
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        <Users className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline">
                      <span className="text-3xl font-extrabold text-white">
                        {errorMsg ? '—' : uniqueLeadsCount}
                      </span>
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
                      <span className="text-3xl font-extrabold text-white">
                        {errorMsg ? '—' : closedCount}
                      </span>
                      <span className="ml-2 text-xs text-purple-400 font-medium">Converted</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Daily_Summary rollup</p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Conversion Rate</span>
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline">
                      <span className="text-3xl font-extrabold text-white">
                        {errorMsg ? '—' : `${conversionRate}%`}
                      </span>
                      <span className="ml-2 text-xs text-amber-400 font-medium">Target: 25%</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Live formula ratio</p>
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
                        {errorMsg ? (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-red-400">
                              Unable to load recent inquiries due to storage read error.
                            </td>
                          </tr>
                        ) : inquiries.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-slate-500">
                              0 inquiries found. (Sheet read successfully).
                            </td>
                          </tr>
                        ) : (
                          inquiries.slice(0, 5).map((item, idx) => (
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
                          ))
                        )}
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

                        {(currentUser.role === 'Administration' || currentUser.role === 'Manager') && (
                          <a
                            href={`/api/inquiries/export?mode=${dataMode}`}
                            className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-sm font-medium transition"
                          >
                            <Download className="w-4 h-4 text-emerald-400" />
                            <span>Export CSV</span>
                          </a>
                        )}
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
                          {errorMsg ? (
                            <tr>
                              <td colSpan={9} className="text-center py-12 text-red-400">
                                Storage read error: {errorMsg}
                              </td>
                            </tr>
                          ) : filteredInquiries.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="text-center py-12 text-slate-500">
                                0 inquiries found. (Sheet read successfully).
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
                          {errorMsg ? (
                            <tr>
                              <td colSpan={6} className="text-center py-12 text-red-400">
                                Summary unavailable due to storage read error.
                              </td>
                            </tr>
                          ) : dailySummaries.length === 0 ? (
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
                      <span className="text-xs text-slate-400 font-mono">Authenticated via session</span>
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

                  {/* Right: Response Inspector */}
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
                          </div>
                          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto">
                            <pre className="text-xs font-mono text-emerald-300">
                              {JSON.stringify(webhookResponse, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-slate-500 text-sm">
                          Click "Simulate Webhook Delivery" to test payload parsing and deduplication.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. GOOGLE APPS SCRIPT GENERATOR & MIGRATION TAB */}
            {activeTab === 'gas' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Google Apps Script Generator & Migration</h1>
                    <p className="text-sm text-slate-400">Maintained receiver supporting JSON POST envelopes (<code className="text-emerald-400 font-mono">read</code>, <code className="text-emerald-400 font-mono">write</code>, <code className="text-emerald-400 font-mono">migrate</code>)</p>
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
                    <span>{copiedCode ? 'Copied Code.gs!' : 'Copy Maintained Code.gs'}</span>
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
                      <div className="text-xs text-slate-400">Preserves message/agent on follow-up updates</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={gasDeduplicate}
                      onChange={(e) => setGasDeduplicate(e.target.checked)}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Migration Section (Admin only) */}
                {currentUser.role === 'Administration' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center space-x-2">
                          <DatabaseBackup className="w-4 h-4 text-teal-400" />
                          <span>Legacy Live Records Migration Tool</span>
                        </h2>
                        <p className="text-xs text-slate-400">Safely migrate historical records preserving original dates, timestamps, and IDs (Administration only)</p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRunMigration(true)}
                          disabled={isMigrating}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs font-semibold transition"
                        >
                          Run Migration Dry Run
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Execute live migration into Google Sheets?')) {
                              handleRunMigration(false);
                            }
                          }}
                          disabled={isMigrating}
                          className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-2 rounded-lg text-xs font-semibold transition"
                        >
                          Execute Live Migration
                        </button>
                      </div>
                    </div>

                    {migrationResult && (
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                        <pre className="text-xs font-mono text-teal-300">
                          {JSON.stringify(migrationResult, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Code Preview Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">Code.gs (Google Apps Script - Fail-Closed Authentication & Migration)</span>
                    <span className="text-xs text-emerald-400 font-mono">Distinct Read/Write Secrets + Status Preservation</span>
                  </div>
                  <div className="p-4 bg-slate-950 overflow-x-auto max-h-96">
                    <pre className="text-xs font-mono text-emerald-300 leading-relaxed">
                      {generatedGasCode}
                    </pre>
                  </div>
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <h1 className="text-2xl font-bold text-white tracking-tight">Technical Blueprint & Source of Truth Architecture</h1>
                    <p className="text-sm text-slate-400">Complete architectural specification and workflow guide</p>
                  </div>
                  <a
                    href="/assets/aistudio/whatsapp_inquiry_to_google_sheets_automation_blueprint_8d9b025b.md"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-sm font-medium transition"
                  >
                    <span>Download Production Blueprint</span>
                    <Download className="w-4 h-4" />
                  </a>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6 text-slate-300 leading-relaxed text-sm">
                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">1. Email-Based Staff Authentication & Roles</h2>
                    <p className="text-slate-400">
                      Individual staff accounts with email verification, 6-character alphanumeric passwords, admin approval workflows, and role permissions (Administration, Manager, Employee).
                    </p>
                  </div>

                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="text-xl font-bold text-white mb-2">2. Fail-Closed Authentication & Distinct Secrets</h2>
                    <p className="text-slate-400">
                      Express uses <code className="text-emerald-400 font-mono">APPS_SCRIPT_READ_SECRET</code> exclusively for reads and <code className="text-emerald-400 font-mono">APPS_SCRIPT_WRITE_SECRET</code> exclusively for writes. The CRM webhook uses <code className="text-emerald-400 font-mono">WHATSAPP_WEBHOOK_SECRET</code> via header <code className="text-emerald-400 font-mono">X-Webhook-Secret</code>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        <p>WhatsApp Sheets Automation Hub • Email Authentication & Role Permissions Edition</p>
      </footer>
    </div>
  );
}
