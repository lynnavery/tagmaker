/**
 * Gmail → Sante Products CSV webhook
 * Run on a time-driven trigger (e.g. every 5 min). Finds the latest
 * "Products CSV is ready" email from Sante, extracts the CSV link, POSTs to your backend.
 */

var SANTE_FROM = 'receipt@santehq.com';
var SANTE_SUBJECT = 'Products CSV is ready';
var CSV_URL_REGEX = /https:\/\/sante\.nyc3\.digitaloceanspaces\.com\/products-export\/[^"'\s]+\.csv/gi;

/**
 * Main entry: check Gmail for Sante CSV email and send CSV URL to webhook.
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

  var csvUrl = extractCsvUrlFromThread(thread);
  if (!csvUrl) {
    Logger.log('No CSV URL found in the latest Sante CSV email.');
    return;
  }

  var success = postCsvUrlToWebhook(webhookUrl, csvUrl);
  if (success) {
    Logger.log('Sent CSV URL to webhook: ' + csvUrl);
  } else {
    Logger.log('Failed to POST to webhook.');
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
  return match ? match[0] : null;
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
  var resp = UrlFetchApp.fetch(webhookUrl, options);
  return resp.getResponseCode() >= 200 && resp.getResponseCode() < 300;
}

/**
 * One-time: mark the latest Sante CSV thread as read so we don't re-send.
 * Optional. Call from checkSanteCsvAndNotify after successful POST if you want.
 */
function markThreadRead(thread) {
  thread.markRead();
}
