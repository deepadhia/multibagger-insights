# Google Drive upload setup

The backend can upload downloaded announcements (earnings, concall transcripts, investor presentations) to a Google Drive folder in a structured way: **Announcements / SYMBOL / QUARTER / filename.pdf**.

You can use either **OAuth (personal Gmail)** or a **Service Account (Shared Drive / Workspace)**.

- **Personal Gmail (no Workspace):** use **OAuth**. You sign in once with "Connect Google Drive"; files go to your My Drive. No Shared Drive needed.
- **Google Workspace:** you can use a **Service Account** and a **Shared Drive** for unattended uploads.

---

## 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top → **New Project**.
3. Name it (e.g. `multibagger-insights`) and create.

---

## 2. Enable the Drive API

1. In the same project, open **APIs & Services** → **Library**.
2. Search for **Google Drive API**.
3. Open it and click **Enable**.

---

## 3a. Option: OAuth (personal Gmail – recommended if you don’t have Workspace)

1. Go to **APIs & Services** → **Credentials**.
2. Click **Create credentials** → **OAuth client ID**.
3. If prompted, configure the **OAuth consent screen** (External, add your email as test user).
4. Application type: **Web application**.
5. Add **Authorized redirect URI**: `http://localhost:4000/api/auth/drive/callback` (for local dev). For production add your backend URL, e.g. `https://your-api.com/api/auth/drive/callback`.
6. Create and download the JSON (e.g. `client_secret_xxx.json`). Put it in `backend/secrets/` (or another path) and **do not commit it**.

Then in `.env.local`:

```env
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
GOOGLE_OAUTH_CLIENT_JSON_PATH=./backend/secrets/client_secret_xxx.json
FRONTEND_URL=http://localhost:8080
BACKEND_URL=http://localhost:4000
```

**Folder ID:** In [Google Drive](https://drive.google.com), create or open a folder in **My Drive**, open it, and copy the ID from the URL: `https://drive.google.com/drive/folders/FOLDER_ID`.

In the app, open a stock → **Announcements** tab → click **Connect Google Drive**. Sign in with your Gmail and allow access. After that, **Upload to Drive** will use your Drive.

---

## 3b. Option: Service Account (for Shared Drive / Workspace)

1. Go to **APIs & Services** → **Credentials**.
2. Click **Create credentials** → **Service account**.
3. Give it a name (e.g. `drive-uploader`) and click **Create and continue** (role optional for now).
4. After the SA is created, open it and go to the **Keys** tab.
5. **Add key** → **Create new key** → **JSON** → Create.  
   A JSON file will download. **Keep it private** (do not commit to git).

The JSON looks like:

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "drive-uploader@your-project.iam.gserviceaccount.com",
  ...
}
```

---

## 4. Use a Shared Drive (required)

Service accounts cannot use storage in regular "My Drive". You must use a **Shared Drive** (available with **Google Workspace**).

1. In [Google Drive](https://drive.google.com), go to **Shared drives** in the left sidebar (if you don’t see it, you need a Google Workspace account).
2. Create a new Shared Drive (e.g. **Multibagger**) or pick an existing one.
3. Open the Shared Drive → **Manage members** → **Add members**.
4. Add the **service account email** (from your JSON: `client_email`, e.g. `drive-uploader@your-project.iam.gserviceaccount.com`) with role **Content manager** or **Manager**.
5. Inside the Shared Drive, create a folder (e.g. **Announcements**) or use the Shared Drive root.
6. Open that folder and copy the **folder ID** from the URL:
   - URL format: `https://drive.google.com/drive/folders/FOLDER_ID`
   - Use this `FOLDER_ID` as `GOOGLE_DRIVE_FOLDER_ID`.

**Personal Gmail (no Workspace):** Shared Drives are not available. You’d need Google Workspace, or use another storage option.

---

## 5. Configure the backend

Set **one** of the following, plus the folder ID.

### Option A: JSON file path (recommended for local dev)

Put the downloaded JSON somewhere safe (e.g. project root but in `.gitignore`, or `backend/secrets/drive-sa.json`). Then in `.env.local` (or your environment):

```env
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./backend/secrets/drive-sa.json
```

### Option B: JSON as string (e.g. for hosted deployments)

Use the full JSON as a single value. In many hosts you can set a multi-line env; escape newlines as `\n`:

```env
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com",...}
```

If both `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` and `GOOGLE_SERVICE_ACCOUNT_JSON` are set, the **path** is used first.

---

## 6. Restart the backend

Restart your Express server so it picks up the new env vars. Upload is then available at:

- **POST /api/transcripts/upload-to-drive**  
  Body (optional): `{ "symbol": "TIMETECHNO" }` to upload only that symbol; omit to upload all downloaded announcements.

- **GET /api/transcripts/drive-status**  
  Returns `{ driveConfigured: true }` or `false` so the UI can show/hide an “Upload to Drive” button.

---

## Troubleshooting

### "Service Accounts do not have storage quota"

The folder must be inside a **Shared Drive**, not in "My Drive". See **§ 4. Use a Shared Drive** above. The backend sends `supportsAllDrives: true` so Shared Drive folders work. Personal Gmail accounts need Google Workspace to use Shared Drives.

### "Insufficient permission of parent"

If upload fails with **insufficient permission** or **403**:

1. Ensure the folder is inside a **Shared Drive** and the **service account email** is a member of that Shared Drive (Content manager or Manager).
2. Use the folder ID of a folder inside the Shared Drive (or the Shared Drive root ID) as `GOOGLE_DRIVE_FOLDER_ID`.

---

## Summary: env vars

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_DRIVE_FOLDER_ID` | Yes (for upload) | ID of the Drive folder (My Drive or Shared Drive). |
| **OAuth (personal Gmail)** | | |
| `GOOGLE_OAUTH_CLIENT_JSON_PATH` | For OAuth | Path to OAuth client JSON (`client_secret_*.json`). |
| `FRONTEND_URL` | For OAuth redirect | e.g. `http://localhost:8080`. |
| `BACKEND_URL` | For OAuth redirect | e.g. `http://localhost:4000`. |
| **Service account (Shared Drive)** | | |
| `GOOGLE_SERVICE_ACCOUNT_JSON_PATH` | For SA | Path to the service account JSON file. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | For SA | Full JSON string of the service account key. |

If neither OAuth nor service account is configured, the upload endpoint returns `503`; the rest of the app continues to work.
