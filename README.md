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
