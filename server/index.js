const express = require('express');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 8080;

const SANTE_CSV_PREFIX = 'https://sante.nyc3.digitaloceanspaces.com/products-export/';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || ''; // owner/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
// When the app is behind a path (e.g. DO routing rule /tagmaker-server -> this service), set BASE_PATH=/tagmaker-server
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/$/, '');

app.use(express.json());

function isValidCsvUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (!u.startsWith(SANTE_CSV_PREFIX)) return false;
  // Sante's CSV links are presigned (query string after the .csv path), so only
  // the path portion is required to end in .csv, not the whole URL.
  const pathOnly = u.split('?')[0];
  return pathOnly.endsWith('.csv');
}

function downloadCsv(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        const dateParam = (url.match(/X-Amz-Date=([^&]+)/) || [])[1];
        console.log('downloadCsv: non-200, status=', res.statusCode, 'X-Amz-Date=', dateParam);
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          console.log('downloadCsv: error body:', Buffer.concat(chunks).toString().slice(0, 400));
          reject(new Error(`HTTP ${res.statusCode}`));
        });
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function githubApi(method, path, body) {
  const [owner, repo] = GITHUB_REPO.split('/');
  if (!owner || !repo) return Promise.reject(new Error('GITHUB_REPO not set'));
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const opts = {
    method,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'tagmaker-csv-service'
    }
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(url + (GITHUB_BRANCH ? `?ref=${GITHUB_BRANCH}` : ''), opts).then((r) => {
    if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j.message || `GitHub API ${r.status}`)));
    return r.json();
  });
}

async function pushCsvToGitHub(csvBuffer) {
  const path = 'products.csv';
  const content = csvBuffer.toString('base64');
  let sha = null;
  try {
    const existing = await githubApi('GET', path);
    sha = existing.sha;
  } catch (e) {
    if (e.message && (e.message.includes('404') || e.message.includes('Not Found'))) {
      // file doesn't exist yet, create it
    } else throw e;
  }
  await githubApi('PUT', path, {
    message: 'Update products.csv from Sante',
    content,
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {})
  });
}

// Route handler for webhook (shared for root and BASE_PATH)
async function handleWebhook(req, res) {
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

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    res.status(500).json({ error: 'GITHUB_TOKEN and GITHUB_REPO not configured' });
    return;
  }

  try {
    const buffer = await downloadCsv(csvUrl);
    await pushCsvToGitHub(buffer);
    const rows = buffer.toString().split('\n').length - 1;
    res.status(200).json({ ok: true, rows, pushed: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message || 'Failed to download or push CSV' });
  }
}

// Health and webhook: at root (direct URL) and under BASE_PATH (routing rule)
app.get('/health', (req, res) => res.status(200).send('ok'));
app.post('/webhook', handleWebhook);
if (BASE_PATH) {
  app.get(BASE_PATH + '/health', (req, res) => res.status(200).send('ok'));
  app.post(BASE_PATH + '/webhook', handleWebhook);
}

app.listen(PORT, () => {
  console.log(`Tagmaker CSV service listening on port ${PORT}; pushes to GitHub repo: ${GITHUB_REPO || '(not set)'}`);
});
