# WhatsApp Inquiry to Google Sheets Automation Blueprint

This guide provides an end-to-end technical blueprint for extracting WhatsApp inquiry data from a third-party platform (e.g., Respond.io, Wati, SleekFlow, ManyChat, or a custom CRM) and compiling daily metrics inside your existing Google Sheet.

---

## 1. Recommended Google Sheet Structure

To prevent data corruption and keep daily reporting clean, organize your existing Google Sheet into two tabs:

1. **`Raw_Inquiries`** *(Automated Data Log)*
   * **Columns:** `Date` | `Timestamp` | `Inquiry_ID` | `Customer_Name` | `Phone_Number` | `Source_Campaign` | `Message_Summary` | `Agent_Assigned` | `Status`
2. **`Daily_Summary`** *(Automated Daily Rollup)*
   * **Columns:** `Date` | `Total_Inquiries` | `Unique_Leads` | `Qualified_Leads` | `Closed_Won` | `Conversion_Rate`

---

## 2. Approach A: Real-Time Webhook + Google Apps Script (Zero Monthly Cost)

Best if your third-party WhatsApp platform supports **Outgoing Webhooks** (JSON payloads triggered on new messages or conversation updates).

### Step 1: Open Google Apps Script
1. Open your existing Google Sheet.
2. Navigate to **Extensions** > **Apps Script**.
3. Delete any default placeholder code in `Code.gs`.

### Step 2: Paste the Webhook Receiver & Deduplication Script
Copy and paste the following script into `Code.gs`. It automatically formats the date (`YYYY-MM-DD`), prevents duplicate entries for the same phone number on the same day (optional toggle), and appends/updates rows in `Raw_Inquiries`.

```javascript
/**
 * Google Apps Script Webhook Receiver for WhatsApp Inquiries
 * Deploy as Web App -> Execute as: Me | Who has access: Anyone
 */

const SHEET_NAME = "Raw_Inquiries";
const DEDUPLICATE_SAME_DAY = true; // Set to false to log every individual message

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000); // Prevent race conditions on simultaneous inquiries

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      return createJsonResponse({ status: "error", message: `Sheet '${SHEET_NAME}' not found.` });
    }

    // Parse incoming JSON payload from 3rd-party WhatsApp platform
    const rawData = e.postData.contents;
    const payload = JSON.parse(rawData);

    // Map payload fields (adjust keys to match your 3rd-party platform's JSON structure)
    const now = new Date();
    const timezone = ss.getSpreadsheetTimeZone();
    const dateStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd");
    const timestampStr = Utilities.formatDate(now, timezone, "yyyy-MM-dd HH:mm:ss");

    const inquiryId = payload.id || payload.message_id || Utilities.getUuid();
    const customerName = payload.contact?.name || payload.name || "Unknown";
    const phoneNumber = String(payload.contact?.phone || payload.phone || "").replace(/[^0-9+]/g, "");
    const sourceCampaign = payload.source || payload.utm_campaign || "Organic / Direct";
    const messageSummary = payload.text || payload.message || "";
    const agentAssigned = payload.assignee || "Unassigned";
    const status = payload.status || "New";

    // Optional: Deduplicate same-day inquiries from the same phone number
    if (DEDUPLICATE_SAME_DAY && phoneNumber) {
      const existingRowIndex = findRowByDateAndPhone(sheet, dateStr, phoneNumber);
      if (existingRowIndex > 0) {
        // Update existing row's latest message, timestamp, agent, and status
        sheet.getRange(existingRowIndex, 2).setValue(timestampStr);
        sheet.getRange(existingRowIndex, 7).setValue(messageSummary);
        sheet.getRange(existingRowIndex, 8).setValue(agentAssigned);
        sheet.getRange(existingRowIndex, 9).setValue(status);
        
        return createJsonResponse({ status: "updated", row: existingRowIndex });
      }
    }

    // Append new inquiry row
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

/**
 * Helper: Finds an existing row matching both Date (Col A) and Phone Number (Col E)
 */
function findRowByDateAndPhone(sheet, dateStr, phoneNumber) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowDate = data[i][0] instanceof Date 
      ? Utilities.formatDate(data[i][0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd")
      : String(data[i][0]);
    const rowPhone = String(data[i][4]);
    
    if (rowDate === dateStr && rowPhone === phoneNumber) {
      return i + 1; // 1-indexed row number
    }
  }
  return -1;
}

/**
 * Helper: Returns standard JSON HTTP response
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Step 3: Deploy as a Web App
1. Click **Deploy** > **New deployment**.
2. Click the gear icon next to *Select type* and choose **Web app**.
3. Set **Execute as**: `Me (your-email@gmail.com)`.
4. Set **Who has access**: `Anyone`.
5. Click **Deploy**, authorize permissions, and copy the **Web app URL**.

### Step 4: Connect to Your Third-Party Platform
1. Open your WhatsApp platform's **Settings > Integrations / Webhooks**.
2. Paste the **Web app URL**.
3. Select trigger events (e.g., `contact.created`, `message.received`, or `conversation.closed`).
4. Send a test WhatsApp message and verify the new row appears in `Raw_Inquiries`.

---

## 3. Approach B: Scheduled Daily Batch Sync (No-Code / API Polling)

Best if your third-party platform **does not support webhooks** and requires fetching data via REST API once per day (e.g., at 11:55 PM) using **Make.com**, **n8n**, or a **Time-Driven Apps Script Trigger**.

### Workflow Logic
1. **Trigger:** Cron schedule set to run daily at `23:55` (`Asia/Kuala_Lumpur` / your local timezone).
2. **HTTP Request:** `GET https://api.your-whatsapp-platform.com/v1/inquiries?date=today` with header `Authorization: Bearer YOUR_API_KEY`.
3. **Iterator / Loop:** Loop through the returned array of inquiry objects.
4. **Google Sheets Action:** Upsert (Update or Insert) each record into `Raw_Inquiries` keyed by `Inquiry_ID` or `Date + Phone_Number`.

---

## 4. Automating the `Daily_Summary` Tab

Add these formulas to your **`Daily_Summary`** tab so daily metrics calculate automatically as `Raw_Inquiries` grows:

* **Column A (`Date`):** Auto-generate unique dates from raw data (put in cell `A2`):
  ```excel
  =SORT(UNIQUE(FILTER(Raw_Inquiries!A2:A, Raw_Inquiries!A2:A <> "")), 1, FALSE)
  ```
* **Column B (`Total_Inquiries`):** Count all inquiries for that date (put in `B2` and drag down):
  ```excel
  =IF(A2="", "", COUNTIF(Raw_Inquiries!$A$2:$A, A2))
  ```
* **Column C (`Unique_Leads`):** Count distinct phone numbers per day (put in `C2` and drag down):
  ```excel
  =IF(A2="", "", COUNTA(UNIQUE(FILTER(Raw_Inquiries!$E$2:$E, Raw_Inquiries!$A$2:$A = A2))))
  ```
* **Column D (`Closed_Won`):** Count converted inquiries per day (put in `D2` and drag down):
  ```excel
  =IF(A2="", "", COUNTIFS(Raw_Inquiries!$A$2:$A, A2, Raw_Inquiries!$I$2:$I, "Closed"))
  ```
* **Column E (`Conversion_Rate`):** Calculate daily conversion percentage (put in `E2` and drag down):
  ```excel
  =IF(B2=0, 0, D2/B2)
  ```

---

## 5. Production Checklist & Troubleshooting

* **Payload Field Mismatch:** Different platforms structure JSON differently (e.g., `payload.contact.phone` vs. `payload.sender.wa_id`). Log `e.postData.contents` into a temporary debug cell or `console.log()` during your first test to verify exact key names.
* **Phone Number Formatting:** Always prefix phone numbers or strip symbols consistently so Google Sheets does not treat `+6012...` as a math formula.
* **Re-deploying Code Changes:** In Google Apps Script, editing `Code.gs` does **not** automatically update your live Webhook URL. Always click **Deploy > Manage deployments > Edit (pencil icon) > Version: New version > Deploy** after making code changes.