# StudyDrop

StudyDrop is a student upload hub that can run locally with Python, publish as a static website, or deploy on Google using Firebase Hosting and Cloud Run.

## Features

- Drag-and-drop multi-file upload queue
- Student name, subject, category, due date, tags, and notes
- Search and folder filtering
- Grid and list views
- Local browser saving with `localStorage`
- JSON export of the upload list
- Responsive layout for phone, tablet, and desktop

## Run With Python

Use this version when you want uploaded files to save on your computer.

```powershell
python app.py
```

Then open:

```text
http://127.0.0.1:8000
```

Uploaded files are saved in the `uploads` folder.

## Host On Google With A Free Domain

Firebase Hosting gives you a free Google domain:

```text
https://YOUR-PROJECT-ID.web.app
```

Install Firebase tools:

```powershell
npm install -g firebase-tools
firebase login
```

Create a Firebase project at:

```text
https://console.firebase.google.com
```

Then deploy the website:

```powershell
firebase use --add
firebase deploy --only hosting
```

## Deploy The Python API On Google

Firebase Hosting can show the website, but Python needs Cloud Run.

Install Google Cloud CLI and login:

```powershell
gcloud auth login
gcloud config set project YOUR-PROJECT-ID
```

Deploy the Python API:

```powershell
gcloud run deploy studydrop-api --source . --region asia-south1 --allow-unauthenticated
firebase deploy --only hosting
```

The `firebase.json` file sends `/api/upload` and `/api/uploads` to the Cloud Run API.

## Publish On GitHub Pages

GitHub Pages can publish the website files, but it cannot run the Python upload server. Use GitHub Pages for the public front page, and run `app.py` locally when you need real file saving.

1. Create a new GitHub repository.
2. Upload these files to the repository root.
3. In GitHub, open **Settings > Pages**.
4. Set **Source** to **Deploy from a branch**.
5. Choose the `main` branch and `/root`, then save.

GitHub will provide a public website link after the Pages build finishes.


## Supabase cloud setup (Phase 1–4)

For the cloud version, open the Supabase project SQL Editor and run these scripts in order:

1. Run `supabase-setup.sql` to create the private documents table, bucket and owner-only policies.
2. Open `supabase-phase4-admin.sql`. Replace both occurrences of `YOUR_ADMIN_EMAIL@example.com` with the email address that should own the Admin role, then run the complete script.

The Phase 4 migration creates user profiles, a protected Admin role, cross-user Admin read/update policies, a recycle bin using soft-delete (files are retained), and document activity history. Do not put a Supabase service-role key in browser code or commit it to GitHub.

After running the migration, sign in to StudyDrop with the selected Admin email. The **Admin Control** button appears only for an account that has the database Admin role. All other users can access only their own documents.


## Phase 5 – Analytics & Reports (Milestone 1)

The Admin Control Panel now includes an **Analytics & Reports** tab with:
- Registered user and active document totals.
- Storage usage calculated from active document metadata.
- Users involved in activity for the selected period.
- Monthly activity chart for the latest six months in the selected range.
- Document category distribution.
- Date-range filters: 30 days, 90 days, 12 months, or all available activity.
- CSV export containing document metadata and activity events.

Analytics reuse the protected Admin data queries; no service-role key or new public access is introduced. Activity analytics and the CSV activity section use the latest 250 activity records currently loaded by the Admin Panel. This milestone does not yet include document sharing, version history, or email notifications.

## Phase 5 Milestone 2 — Document Sharing

1. Open Supabase Dashboard → SQL Editor.
2. Run `supabase-phase5-sharing.sql` once, after the Phase 4 admin migration.
3. Deploy the `feature/phase5-document-sharing` branch preview.
4. Sign in as the document owner, click **Share** on a document card, enter the email of an existing StudyDrop account, and choose `view` or `download`.
5. The recipient signs in and opens **Shared with Me**. The owner can share again to change permission or revoke an active share from the Share action.
6. Admin → Activity History records share and revoke events.

The share lookup returns only the matched account ID and email. Document metadata and private Storage access are protected by Supabase RLS. The UI hides download controls for view-only shares; this is not DRM, so a recipient who can view a file may still be able to save or capture it using browser/device features.
