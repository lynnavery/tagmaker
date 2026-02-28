const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8080;

// Use DATA_DIR=/data on DO (volume mount); default ./data for local dev
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CSV_PATH = path.join(DATA_DIR, 'products.csv');

const SANTE_CSV_PREFIX = 'https://sante.nyc3.digitaloceanspaces.com/products-export/';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

app.use(express.json());

function ensureDataDir() {
  const fs = require('fs');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function isValidCsvUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  return u.startsWith(SANTE_CSV_PREFIX) && u.endsWith('.csv');
}

function downloadCsv(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Health check for DO App Platform
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Webhook: receive csv_url from Gmail Apps Script, download and save
app.post('/webhook', async (req, res) => {
  if (WEBHOOK_SECRET) {
    const auth = req.headers.authorization;
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const csvUrl = req.body && (req.body.csv_url || req.body.csvUrl);
  if (!isValidCsvUrl(csvUrl)) {
    res.status(400).json({ error: 'Missing or invalid csv_url' });
    return;
  }

  try {
    ensureDataDir();
    const buffer = await downloadCsv(csvUrl);
    const fs = require('fs');
    fs.writeFileSync(CSV_PATH, buffer);
    res.status(200).json({ ok: true, rows: buffer.toString().split('\n').length - 1 });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Failed to download or save CSV' });
  }
});

// Serve products.csv with CORS so the static site can fetch it
app.get('/products.csv', (req, res) => {
  const fs = require('fs');
  if (!fs.existsSync(CSV_PATH)) {
    res.status(404).set('Access-Control-Allow-Origin', '*').send('products.csv not yet loaded. Trigger a Sante CSV email or POST the CSV URL to /webhook.');
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.sendFile(CSV_PATH);
});

ensureDataDir();
app.listen(PORT, () => {
  console.log(`Tagmaker CSV service listening on port ${PORT}; CSV path: ${CSV_PATH}`);
});
