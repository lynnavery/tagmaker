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

app.use(express.json());

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

// Health check for DO App Platform
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// Webhook: receive csv_url from Gmail Apps Script, download and push to GitHub
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
});

app.listen(PORT, () => {
  console.log(`Tagmaker CSV service listening on port ${PORT}; pushes to GitHub repo: ${GITHUB_REPO || '(not set)'}`);
});
