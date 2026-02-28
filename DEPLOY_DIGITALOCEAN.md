# Deploying on DigitalOcean App Platform

Your app has two parts:

1. **Static site** (existing) — GitHub → DO Static Site. It serves `products.csv` from the repo.
2. **CSV service** (new) — Node.js Web Service. When the Gmail webhook fires, it downloads the Sante CSV and **pushes it to your GitHub repo** (overwriting `products.csv`). DO then redeploys the static site so the new file is live.

No volumes: the CSV lives in the repo.

## 1. Add the CSV Web Service component

1. In the [DigitalOcean App Platform](https://cloud.digitalocean.com/apps) dashboard, open your app.
2. **Add Component** → **Web Service**.
3. **Source**: Same GitHub repo. Set **Source Directory** to `server`.
4. **Build Command**: `npm install` (or leave default).
5. **Run Command**: `npm start`.
6. **HTTP Port**: `8080` (or leave default).

## 2. GitHub Personal Access Token (PAT)

The service needs permission to push to your repo.

1. On GitHub: **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**. Name it e.g. `tagmaker-csv-push`.
3. Scope: enable **repo** (full control of private repositories).
4. Generate and **copy the token** (you won’t see it again).

## 3. Environment variables for the Web Service

In the Web Service component, add:

| Key | Value |
|-----|--------|
| `GITHUB_TOKEN` | The PAT from step 2 |
| `GITHUB_REPO` | Your repo as `owner/repo` (e.g. `myuser/tagmaker`) |
| `GITHUB_BRANCH` | (optional) Branch to update. Default: `main` |
| `WEBHOOK_SECRET` | (optional) Same secret you set in Gmail Apps Script |

Use the same GitHub account (or a machine user) that owns the repo so the push is allowed.

## 4. Deploy and get the webhook URL

Deploy the app. The Web Service gets a URL like:

`https://your-app-csv-xxxxx.ondigitalocean.app`

**WEBHOOK_URL** for Gmail Apps Script:  
`https://your-app-csv-xxxxx.ondigitalocean.app/webhook`

## 5. Gmail Apps Script

In [GMAIL_APPS_SCRIPT_SETUP.md](GMAIL_APPS_SCRIPT_SETUP.md):

- **WEBHOOK_URL**: `https://your-app-csv-xxxxx.ondigitalocean.app/webhook`
- **WEBHOOK_SECRET**: (optional) same value as in the Web Service env

## 6. Redeploys

When the webhook runs, the service pushes a new `products.csv` to GitHub. If your DO app is set to **deploy on push** (usual for GitHub source), the static site will redeploy and serve the new file. No need to change `index.html` or any frontend config: the site always loads same-origin `products.csv` from the repo.

## 7. First run

Until the first Sante email is processed, the repo’s existing `products.csv` is what the site uses. After the first webhook run, that file will be replaced by the one from Sante. To prime it manually you can:

```bash
curl -X POST https://your-app-csv-xxxxx.ondigitalocean.app/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -d '{"csv_url":"https://sante.nyc3.digitaloceanspaces.com/products-export/YOUR-ID.csv"}'
```

(Use a real `csv_url` from a recent “Products CSV is ready” email.)

## Summary

| Component    | Source / Dir | Env |
|-------------|---------------|-----|
| Static Site | GitHub, root  | —   |
| Web Service | GitHub, `server/` | `GITHUB_TOKEN`, `GITHUB_REPO`, optional `GITHUB_BRANCH`, optional `WEBHOOK_SECRET` |

No volume, no `PRODUCTS_CSV_ORIGIN`: the CSV is updated in GitHub and served by the static site after each push.
