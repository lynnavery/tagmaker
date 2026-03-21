# Gmail Apps Script setup (Sante CSV → webhook)

This script runs inside Google and checks your Gmail for the "Products CSV is ready" email from Sante, extracts the download link, and POSTs it to your backend webhook.

**If you deploy the CSV service on DigitalOcean**, see [DEPLOY_DIGITALOCEAN.md](DEPLOY_DIGITALOCEAN.md) first to get the webhook URL and optional secret.

## 1. Create the script in Google

1. Open [script.google.com](https://script.google.com) and sign in with the same Google account that receives the Sante emails.
2. Click **New project**.
3. Replace the default code in `Code.gs` with the contents of **`gmail-csv-trigger.gs`** in this repo (copy-paste the whole file).
4. Save (Ctrl+S). Name the project if you like (e.g. "Sante CSV to webhook").

## 2. Add Script Properties (webhook URL and optional secret)

1. In the Apps Script editor: **Project settings** (gear icon in the left sidebar).
2. Scroll to **Script properties** → **Add script property**.
3. Add:
   - **Property:** `WEBHOOK_URL`  
     **Value:** Your backend webhook URL, e.g. `https://your-app.railway.app/webhook`
4. (Optional) Add:
   - **Property:** `WEBHOOK_SECRET`  
     **Value:** A long random string; set the same value in your backend so it only accepts requests with `Authorization: Bearer <this secret>`.

Save. Close project settings.

## 3. Authorize the script to read Gmail

1. In the script editor, select the function **`checkSanteCsvAndNotify`** in the dropdown at the top.
2. Click **Run**.
3. When prompted, click **Review permissions** → choose your Google account → **Advanced** → **Go to &lt;project name&gt; (unsafe)** → **Allow**.
4. The first run may log "No Sante CSV email found" or "WEBHOOK_URL not set" — that’s fine. Check **Executions** in the left sidebar to confirm it ran.

## 4. Set a time-driven trigger

1. In the left sidebar, click **Triggers** (clock icon).
2. **Add trigger**:
   - **Choose function:** `checkSanteCsvAndNotify`
   - **Select event source:** Time-driven
   - **Type:** Minutes timer (or Hour timer if you prefer)
   - **Interval:** Every 5 minutes (or every hour)
3. Save. Approve the permission if asked.

After this, the script will run every 5 minutes (or your chosen interval). It **only acts when there is a new email from Sante**: it looks for the latest Sante CSV email, and if that email is different from the last one already processed, it extracts the CSV URL and POSTs it to your webhook. If the latest Sante email is the same as before, it does nothing (no duplicate webhook calls).

## 5. Point Sante to this Gmail

In Sante’s settings, set the “Products CSV” notification email to the Gmail address that this Google account uses. The script will only see emails in that inbox.

## Troubleshooting

- **"WEBHOOK_URL not set"**  
  Add the `WEBHOOK_URL` script property (step 2).

- **"No Sante CSV email found"**  
  Make sure at least one email from `receipt@santehq.com` with subject “Products CSV is ready” exists in that Gmail inbox (and wasn’t deleted).

- **"No CSV URL found"**  
  The email body may have changed. Check **View → Logs** after a run; you can temporarily log `msg.getBody()` to inspect the HTML.

- **"Failed to POST to webhook: HTTP …"**  
  The script now logs the exact status and response body. In **Executions** (left sidebar), open the latest run and expand the log to see it.  
  - **401**: `WEBHOOK_SECRET` in Script Properties does not match `WEBHOOK_SECRET` on the server (or you don’t have a secret on one side).  
  - **400**: Server didn’t get a valid `csv_url` (unlikely if the email was parsed).  
  - **500**: Server error—often `GITHUB_TOKEN and GITHUB_REPO not configured` (set env vars on the DO Web Service), or a GitHub API error (check token scope and repo name).  
  - **Connection/URL error**: Check that `WEBHOOK_URL` is correct and the CSV service is deployed and running.
