# Tagmaker — Shelf Tag Designer

Design and print shelf tags from your Sante product catalog. Uses a CSV of products (`products.csv`) and a visual designer to build printable tags with variables (title, price, SKU, barcode, etc.).

## What’s in this repo

- **Static app** — `index.html`, `app.js`, `styles.css`: the Shelf Tag Designer UI. Loads `products.csv` from the same origin.
- **products.csv** — Product data (can be updated manually or via the Sante → Gmail → webhook flow).
- **server/** — Node.js webhook service. When Gmail sends a new Sante “Products CSV is ready” link, the service downloads that CSV and pushes it to this repo (updating `products.csv`). Used when deployed (e.g. DigitalOcean).
- **gmail-csv-trigger.gs** — Google Apps Script that watches Gmail and only runs when there is a **new** email from Sante; it then POSTs the CSV URL to your webhook.

## Run locally

- **Designer only:** Open `index.html` in a browser (or use any static server). It will load `products.csv` from the same directory.
- **Webhook (optional):** From `server/`: `npm install` then `npm start`. Set env vars if you want to test the GitHub push flow (see [DEPLOY_DIGITALOCEAN.md](DEPLOY_DIGITALOCEAN.md)).

## Gmail → webhook (new Sante emails only)

The Apps Script runs on a time-driven trigger (e.g. every 5 minutes) but **only acts when there is a new email from Sante**. It finds the latest “Products CSV is ready” message from `receipt@santehq.com`, and if that message is different from the last one already processed, it extracts the CSV URL and POSTs it to your webhook. Same email = no duplicate calls.

Full setup: [GMAIL_APPS_SCRIPT_SETUP.md](GMAIL_APPS_SCRIPT_SETUP.md).

## Deploy (DigitalOcean)

Static site serves the app and `products.csv`; the CSV web service receives the webhook, downloads the Sante CSV, and pushes it to GitHub so the static site always has the latest products.

Steps: [DEPLOY_DIGITALOCEAN.md](DEPLOY_DIGITALOCEAN.md).

## Docs

| Doc | Purpose |
|-----|--------|
| [GMAIL_APPS_SCRIPT_SETUP.md](GMAIL_APPS_SCRIPT_SETUP.md) | Configure Gmail Apps Script (only runs for new Sante emails). |
| [DEPLOY_DIGITALOCEAN.md](DEPLOY_DIGITALOCEAN.md) | Deploy static site + CSV web service on DigitalOcean App Platform. |
