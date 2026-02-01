# Pronto PWA

A Progressive Web App for personal time tracking, built with React, Vite, and Firebase.

## Features
- **Offline First**: Works without internet using local database (IndexedDB).
- **PWA**: Installable on Android/iOS home screens.
- **Sync**: Backups data to Firebase when online.
- **Theming**: Default, Olive, and Eastbay themes.

## Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Configure Firebase**
    - Create a project at [console.firebase.google.com](https://console.firebase.google.com).
    - Enable **Authentication** (Anonymous).
    - Enable **Firestore Database**.
    - Copy your config keys into `src/services/firebase.js`.

3.  **Run Locally**
    ```bash
    npm run dev
    ```
    Open the URL (usually `http://localhost:5173`) in your browser.

4.  **Build for Production**
    ```bash
    npm run build
    ```
    The output will be in `dist/`. You can deploy this folder to Firebase Hosting, Vercel, or Netlify.

## PWA Notes
To test PWA installation:
1.  Run the production build.
2.  Serve the `dist` folder via HTTPS (or localhost).
3.  Look for the "Install" icon in Chrome address bar.
