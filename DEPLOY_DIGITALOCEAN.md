# Deploying on DigitalOcean App Platform

Your app has two parts:

1. **Static site** (existing) — GitHub → DO Static Site.
2. **CSV service** (new) — Node.js Web Service that receives the Gmail webhook and serves `products.csv`.

## 1. Add the CSV Web Service component

1. In the [DigitalOcean App Platform](https://cloud.digitalocean.com/apps) dashboard, open your app.
2. **Add Component** → **Web Service**.
3. **Source**: Same GitHub repo. Set **Source Directory** to `server` (so DO uses only the `server/` folder for this component).
4. **Build Command**: `npm install` (or leave default if DO runs it).
5. **Run Command**: `npm start`.
6. **HTTP Port**: `8080` (or leave default; the app uses `process.env.PORT`).

## 2. Add a volume for the CSV

So `products.csv` survives redeploys:

1. In the Web Service component, open **Resources** or **Volumes**.
2. Add a **Volume**; mount path: `/data`.
3. In the same component, add an **Environment Variable**:  
   **Key:** `DATA_DIR`  
   **Value:** `/data`

## 3. Optional: secure the webhook

To only accept requests from your Gmail Apps Script:

1. In the Web Service, add an env var:  
   **Key:** `WEBHOOK_SECRET`  
   **Value:** (generate a long random string, e.g. `openssl rand -hex 32`)
2. In [Gmail Apps Script](GMAIL_APPS_SCRIPT_SETUP.md), add the same value as the `WEBHOOK_SECRET` script property.

## 4. Deploy and get the CSV service URL

Deploy the app. The Web Service gets a URL like:

`https://your-app-csv-xxxxx.ondigitalocean.app`

(You see it in the component’s **Live App** / **URL**.)

## 5. Point the static site at the CSV service

1. In your repo, open **index.html**.
2. Set the CSV origin to that URL:
   ```html
   <script>window.PRODUCTS_CSV_ORIGIN = 'https://your-app-csv-xxxxx.ondigitalocean.app';</script>
   ```
   (Use the real URL from step 4; no trailing slash.)
3. Commit and push. Your static site will then load `products.csv` from the CSV service.

## 6. Configure Gmail Apps Script

In [GMAIL_APPS_SCRIPT_SETUP.md](GMAIL_APPS_SCRIPT_SETUP.md):

- **WEBHOOK_URL**: `https://your-app-csv-xxxxx.ondigitalocean.app/webhook`
- **WEBHOOK_SECRET**: (same value as in step 3, if you set it)

## 7. Load the first CSV

Until the first Sante email arrives, the service has no file. Either:

- **Option A:** Trigger a “Products CSV” export in Sante so the email is sent; the Gmail script will call the webhook and the CSV will appear.
- **Option B:** Call the webhook once manually with a current Sante CSV link:
  ```bash
  curl -X POST https://your-app-csv-xxxxx.ondigitalocean.app/webhook \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
    -d '{"csv_url":"https://sante.nyc3.digitaloceanspaces.com/products-export/YOUR-ID.csv"}'
  ```
  (Get a real `csv_url` from a recent Sante “Products CSV is ready” email.)

## Summary

| Component    | Source / Dir | Env / Volume |
|-------------|---------------|--------------|
| Static Site | GitHub, root  | —            |
| Web Service | GitHub, `server/` | `DATA_DIR=/data`, volume mounted at `/data`; optional `WEBHOOK_SECRET` |

After deployment, set `window.PRODUCTS_CSV_ORIGIN` in **index.html** to the Web Service URL and configure the Gmail script with that URL + `/webhook`.
