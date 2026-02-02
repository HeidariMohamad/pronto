# 🕒 Pronto

**The ultimate minimalist PWA for smart work hours tracking.**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black&style=flat-square)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?logo=vite&logoColor=white&style=flat-square)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/Progressive_Web_App-Yes-blue?style=flat-square)](https://web.dev/progressive-web-apps/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Pronto is a high-performance, privacy-focused Progressive Web App (PWA) designed to manage work shifts, track hours, and predict exit times with precision. It works entirely offline using a local IndexedDB.

---

## ✨ Key Features

- **🚀 Smart Exit Prediction**: Automatically calculates exactly when you should clock out to hit your daily target.
- **📅 Semester Management**: Organize different work schedules for distinct time periods (semesters).
- **✅ Daily Targets & Balance**: Keep track of your worked hours vs. target balance in real-time.
- **📸 Photo Verification**: Attach photos to your clock-in/out entries for quick visual reference.
- **🌍 Internationalization**: Full support for English, Portuguese (PT-BR), and Farsi (FA).
- **🌓 Modern UI**: Sleek, glassmorphic design system with full support for Dark Mode.
- **💾 Data Control**: Export and restore your clinical data anytime via JSON backups.
- **🛡 Offline First**: Your data stays on your device. Powered by Dexie.js (IndexedDB).

---

## 🛠 Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Database**: [Dexie.js](https://dexie.org/) (High-performance wrapper for IndexedDB)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Styling**: Vanilla CSS with modern custom properties & TailwindCSS
- **Persistence**: `vite-plugin-pwa` for reliable offline experience

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/HeidariMohamad/pronto.git
   cd pronto
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

### Building for Production

To create a production build with service workers enabled:
```bash
npm run build
```
The output will be in the `dist/` folder, ready for deployment.

---

## 📱 Use Case: Multi-Shift Support

Pronto is built to handle complex workdays:
- **Morning Shift**: 08:00 - 12:00
- **Afternoon Shift**: 13:00 - 17:00
- **Midnight Shifts**: Fully supported 24h logic (e.g., 22:00 to 02:00).

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 🙌 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

Developed with ❤️ for productivity.
