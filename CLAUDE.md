# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tagmaker is a browser-based shelf tag designer for creating and printing custom product labels. It integrates with the Sante POS system to fetch product catalogs and prints via browser or directly to Epson thermal label printers.

## Running the Project

**Frontend (no build step):** Open `index.html` in a browser, or serve with:
```bash
python -m http.server
```

**Webhook service (Node.js backend):**
```bash
cd server
npm install
npm start       # listens on http://localhost:8080
```

No linting, testing, or build tools are configured.

## Architecture

The system has two independent parts:

### 1. Static Frontend (`index.html`, `app.js`, `styles.css`)
Pure vanilla JavaScript — no framework, no build step. The app has two modes toggled at runtime:

- **Designer Mode:** Drag-and-drop canvas editor for building tag templates. Elements (text, variables, barcodes, shapes) are positioned absolutely. Templates are saved to `localStorage` or exported as JSON files.
- **Print Mode:** Product search against `products.csv` (loaded via Papa Parse from the same origin). Selected products are printed either via browser (HTML2Canvas → print dialog) or Epson Direct (ePOS SDK → TCP port 8008).

Key libraries loaded via CDN/local:
- `Papa Parse` — CSV parsing
- `JsBarcode` — barcode generation
- `HTML2Canvas` — browser print path
- `epos-2.27.0.js` — Epson ePOS SDK for direct printer communication

### 2. Webhook Service (`server/index.js`)
A minimal Express server (port 8080) with two endpoints:
- `GET /health` — health check
- `POST /webhook` — receives a Sante CSV URL, downloads it, and pushes `products.csv` to GitHub via the GitHub API

Required environment variables:
- `GITHUB_TOKEN` — GitHub Personal Access Token
- `GITHUB_REPO` — `owner/repo` format

Optional:
- `GITHUB_BRANCH` — defaults to `main`
- `WEBHOOK_SECRET` — Bearer token for auth
- `BASE_PATH` — for routing in DigitalOcean App Platform

### 3. Automation Layer
**`gmail-csv-trigger.gs`** is a Google Apps Script that runs on a time-driven trigger (every 5 min). It searches Gmail for the latest Sante "Products CSV is ready" email, extracts the CSV URL, and POSTs it to the webhook — but only if the email is new (deduplication via Script Properties).

### Data Flow
```
Sante POS → Gmail → Apps Script → Webhook Service → GitHub → DigitalOcean redeploy → products.csv served to browser
```

## Deployment

Deployed on DigitalOcean App Platform as two components:
- **Static Site** — serves `index.html`, `app.js`, `styles.css`, `products.csv`
- **Web Service** — runs `server/index.js` (Node ≥18)

See `DEPLOY_DIGITALOCEAN.md` for full setup. Gmail automation setup is in `GMAIL_APPS_SCRIPT_SETUP.md`.

## Key Design Decisions

- **No database:** Templates live in `localStorage`; product data lives in `products.csv` in the GitHub repo.
- **Same-origin CSV:** `products.csv` is always fetched from the same domain as the static site (no CORS issues).
- **Dual print paths:** Browser printing is the fallback; Epson Direct gives more control over label output.
- **CSV URL validation:** The webhook validates that the CSV URL starts with `https://sante.nyc3.digitaloceanspaces.com/products-export/` and ends with `.csv` before downloading.
