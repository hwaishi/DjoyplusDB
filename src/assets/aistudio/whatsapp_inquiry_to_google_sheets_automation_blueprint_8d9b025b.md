# WhatsApp Inquiry to Google Sheets Automation Blueprint (Secure Source of Truth Edition)

This guide provides an end-to-end technical blueprint for extracting WhatsApp inquiry data from a third-party platform (e.g., Respond.io, Wati, SleekFlow, ManyChat, or a custom CRM) and compiling daily metrics inside your Google Sheet securely.

---

## 1. Recommended Google Sheet Structure

Organize your Google Sheet into two tabs:

1. **`Raw_Inquiries`** *(Automated Data Log)*
   * **Columns:** `Date` | `Timestamp` | `Inquiry_ID` | `Customer_Name` | `Phone_Number` | `Source_Campaign` | `Message_Summary` | `Agent_Assigned` | `Status`
2. **`Daily_Summary`** *(Automated Daily Rollup)*
   * **Columns:** `Date` | `Total_Inquiries` | `Unique_Leads` | `Qualified_Leads` | `Closed_Won` | `Conversion_Rate`

---

## 2. Maintained Google Apps Script Receiver (`Code.gs`)

The maintained Apps Script receiver accepts secure **JSON POST envelopes** sent exclusively by Express (`read` and `write` operations verified against separate script properties).

### Step 1: Open Google Apps Script
1. Open your Google Sheet.
2. Navigate to **Extensions > Apps Script**.
3. Replace any existing code with the script below.

```javascript
/**
 * Google Apps Script Maintained Receiver & Source of Truth for WhatsApp Inquiries
 * Handles secure JSON POST envelopes with operation ("read" or "write") and separate credentials.
 */

const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
const SHEET_NAME = "Raw_Inquiries";
const DEDUPLICATE_SAME_DAY = true;
const SUPPORTED_STATUSES = ["New", "In Progress", "Qualified", "Closed", "Lost"];

function doPost(e) {
  try {
    const rawData = e.postData.contents;
    const envelope = JSON.parse(rawData);
    
    const operation = envelope.operation;
    const credential = envelope.credential;
    
    const scriptProps = PropertiesService.getScriptProperties();
    const readSecret = scriptProps.getProperty("APPS_SCRIPT_READ_SECRET");
    const writeSecret = scriptProps.getProperty("APPS_SCRIPT_WRITE_SECRET");
    const fallbackSecret = scriptProps.getProperty("WHATSAPP_WEBHOOK_SECRET");
    
    if (operation === "read") {
      if (!readSecret && !fallbackSecret || (credential !== readSecret && credential !== fallbackSecret)) {
        return createJsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Unauthorized read credential." });
      }
      return handleRead();
    } else if (operation === "write") {
      if (!writeSecret && !fallbackSecret || (credential !== writeSecret && credential !== fallbackSecret)) {
        return createJsonResponse({ status: "error", code: "UNAUTHORIZED", message: "Unauthorized write credential." });
      }
      return handleWrite(envelope.payload);
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
    return createJsonResponse({ status: "error", code: "SHEET_NOT_FOUND", message: "Raw_Inquiries sheet not found." });
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return createJsonResponse({ status: "success", data: [] });
  }

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] && !row[4]) continue;
    rows.push({
      date: String(row[0] instanceof Date ? Utilities.formatDate(row[0], "Asia/Kuala_Lumpur", "yyyy-MM-dd") : row[0]),
      timestamp: String(row[1] || ""),
      inquiryId: String(row[2] || "").replace(/^'/, ""),
      customerName: String(row[3] || "").replace(/^'/, ""),
      phoneNumber: String(row[4] || "").replace(/^'/, ""),
      sourceCampaign: String(row[5] || "").replace(/^'/, ""),
      messageSummary: String(row[6] || "").replace(/^'/, ""),
      agentAssigned: String(row[7] || "").replace(/^'/, ""),
      status: String(row[8] || "New")
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
      return createJsonResponse({ status: "error", code: "SHEET_NOT_FOUND", message: "Raw_Inquiries sheet not found." });
    }

    const now = new Date();
    const timezone = "Asia/Kuala_Lumpur";
    const dateStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
    const timestampStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");

    const inquiryId = payload.id || payload.message_id || Utilities.getUuid();
    const customerName = String(payload.contact?.name || payload.name || payload.contact?.full_name || payload.customer?.full_name || "Unknown");
    const rawPhone = String(payload.contact?.phone || payload.phone || payload.sender?.phone || payload.customer?.phone || "");
    const phoneNumber = rawPhone.replace(/[^0-9+]/g, "");
    
    if (!phoneNumber) {
      return createJsonResponse({ status: "error", code: "INVALID_INPUT", message: "Validation error: Missing required phone number." });
    }

    const sourceCampaign = String(payload.source || payload.utm_campaign || payload.campaign_name || "Organic / Direct");
    
    const hasMessage = payload.text !== undefined || payload.message !== undefined || payload.body !== undefined || payload.content !== undefined;
    const messageSummary = hasMessage ? String(payload.text || payload.message || payload.body || payload.content || "") : null;

    const hasAgent = payload.assignee !== undefined || payload.agent?.name !== undefined;
    const agentAssigned = hasAgent ? String(payload.assignee || payload.agent?.name || "Unassigned") : null;

    let status = payload.status !== undefined ? String(payload.status) : null;
    if (status !== null) {
      if (!SUPPORTED_STATUSES.includes(status)) {
        return createJsonResponse({ status: "error", code: "INVALID_STATUS", message: "Unsupported status value." });
      }
    }

    const safeText = function(val) {
      if (val === null || val === undefined) return "";
      const s = String(val);
      if (s.startsWith("=") || s.startsWith("+") || (s.startsWith("0") && s.length > 1)) {
        return "'" + s;
      }
      return s;
    };

    if (DEDUPLICATE_SAME_DAY && phoneNumber) {
      const existingRowIndex = findRowByDateAndPhone(sheet, dateStr, phoneNumber, timezone);
      if (existingRowIndex > 0) {
        const existingMessage = sheet.getRange(existingRowIndex, 7).getValue();
        const existingAgent = sheet.getRange(existingRowIndex, 8).getValue();
        const existingStatus = sheet.getRange(existingRowIndex, 9).getValue();
        
        sheet.getRange(existingRowIndex, 2).setValue(timestampStr);
        sheet.getRange(existingRowIndex, 7).setValue(messageSummary !== null ? safeText(messageSummary) : existingMessage);
        sheet.getRange(existingRowIndex, 8).setValue(agentAssigned !== null ? safeText(agentAssigned) : existingAgent);
        sheet.getRange(existingRowIndex, 9).setValue(status !== null ? safeText(status) : existingStatus);
        
        SpreadsheetApp.flush();
        return createJsonResponse({ status: "updated", action: "updated", row: existingRowIndex });
      }
    }

    sheet.appendRow([
      dateStr,
      timestampStr,
      safeText(inquiryId),
      safeText(customerName),
      safeText(phoneNumber),
      safeText(sourceCampaign),
      safeText(messageSummary !== null ? messageSummary : ""),
      safeText(agentAssigned !== null ? agentAssigned : "Unassigned"),
      safeText(status !== null ? status : "New")
    ]);

    SpreadsheetApp.flush();
    return createJsonResponse({ status: "success", action: "appended" });

  } catch (error) {
    return createJsonResponse({ status: "error", code: "WRITE_ERROR", message: error.toString() });
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
}
```

### Step 2: Configure Script Properties
1. Go to **Project Settings (Gear icon) > Script Properties**.
2. Add:
   * `APPS_SCRIPT_READ_SECRET`: `<your-read-secret>`
   * `APPS_SCRIPT_WRITE_SECRET`: `<your-write-secret>`

### Step 3: Deploy as Web App
1. Click **Deploy > New deployment** > **Web app**.
2. Execute as: **Me**, Who has access: **Anyone**.
3. Copy the Web App URL and set it as `APPS_SCRIPT_WEB_APP_URL` in your server environment.

---

## 3. CRM Integration
Configure your WhatsApp CRM to send webhooks to:
`POST https://your-server-domain.run.app/api/webhook/whatsapp`
With header:
`X-Webhook-Secret: <your-whatsapp-webhook-secret>`
