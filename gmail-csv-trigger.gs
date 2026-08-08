/**
 * Gmail → Sante Products CSV webhook
 * Run on a time-driven trigger (e.g. every 5 min). Finds the latest
 * "Products CSV is ready" email from Sante, extracts the CSV link, POSTs to your backend.
 */

var SANTE_FROM = 'receipt@santehq.com';
var SANTE_SUBJECT = 'Products CSV is ready';
var CSV_URL_REGEX = /https:\/\/sante\.nyc3\.digitaloceanspaces\.com\/products-export\/[^"'\s]+\.csv/gi;

var SCRIPT_PROP_LAST_THREAD_ID = 'SANTE_LAST_PROCESSED_THREAD_ID';

/**
 * Main entry: check Gmail for a *new* Sante CSV email and send CSV URL to webhook.
 * Only runs the webhook when the latest Sante CSV email is different from the last one processed.
 * Call this from a time-driven trigger (e.g. every 5 minutes).
 */
function checkSanteCsvAndNotify() {
  var webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    Logger.log('WEBHOOK_URL not set in Script Properties. Add it under Project Settings → Script Properties.');
    return;
  }

  var thread = findLatestSanteCsvThread();
  if (!thread) {
    Logger.log('No Sante CSV email found.');
    return;
  }

  var threadId = thread.getId();
  var lastProcessedId = PropertiesService.getScriptProperties().getProperty(SCRIPT_PROP_LAST_THREAD_ID);
  if (lastProcessedId === threadId) {
    Logger.log('Latest Sante CSV email already processed (same thread). Skipping.');
    return;
  }

  var csvUrl = extractCsvUrlFromThread(thread);
  if (!csvUrl) {
    Logger.log('No CSV URL found in the latest Sante CSV email.');
    return;
  }

  var result = postCsvUrlToWebhook(webhookUrl, csvUrl);
  if (result.success) {
    PropertiesService.getScriptProperties().setProperty(SCRIPT_PROP_LAST_THREAD_ID, threadId);
    Logger.log('Sent CSV URL to webhook: ' + csvUrl);
  } else {
    Logger.log('Failed to POST to webhook: ' + result.error);
  }
}

function getWebhookUrl() {
  return PropertiesService.getScriptProperties().getProperty('WEBHOOK_URL');
}

function findLatestSanteCsvThread() {
  var query = 'from:' + SANTE_FROM + ' subject:"' + SANTE_SUBJECT + '"';
  var threads = GmailApp.search(query, 0, 1);
  return threads.length > 0 ? threads[0] : null;
}

function extractCsvUrlFromThread(thread) {
  var messages = thread.getMessages();
  if (messages.length === 0) return null;
  var msg = messages[messages.length - 1];
  var html = msg.getBody();
  if (!html) return null;
  var match = html.match(CSV_URL_REGEX);
  return match ? decodeHtmlEntities(match[0]) : null;
}

// Sante's presigned CSV URLs carry a query string (X-Amz-Signature=...) joined
// by "&", which shows up HTML-escaped (sometimes double-escaped, "&amp;amp;")
// in the raw email body. Undo that before using the URL, or the signature
// breaks and the download gets rejected with 400.
function decodeHtmlEntities(str) {
  var prev;
  do {
    prev = str;
    str = str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  } while (str !== prev);
  return str;
}

function postCsvUrlToWebhook(webhookUrl, csvUrl) {
  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  var payload = JSON.stringify({ csv_url: csvUrl });
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: payload,
    muteHttpExceptions: true
  };
  if (secret) {
    options.headers = { 'Authorization': 'Bearer ' + secret };
  }
  try {
    var resp = UrlFetchApp.fetch(webhookUrl, options);
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      return { success: true };
    }
    var body = resp.getContentText();
    var errMsg = 'HTTP ' + code + (body ? ': ' + body : '');
    return { success: false, error: errMsg };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * One-time: mark the latest Sante CSV thread as read so we don't re-send.
 * Optional. Call from checkSanteCsvAndNotify after successful POST if you want.
 */
function markThreadRead(thread) {
  thread.markRead();
}
