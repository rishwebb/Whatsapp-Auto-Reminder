# 💊 PillPulse — WhatsApp Medicine & Daily Routine Reminder

A reliable, intelligent WhatsApp reminder bot built with **Node.js**, **@whiskeysockets/baileys**, and **MongoDB Atlas Cloud Persistence**.

Designed specifically for **Render Free Tier**, it completely eliminates ephemeral disk wipes, session logouts, and "Bad MAC" errors, while using **randomized 1-hour time windows** so reminder messages appear naturally human and non-automated.

---

## ✨ Features

- **🎯 Randomized Daily 1-Hour Windows**: Define 3 daily slots (e.g., Morning `08:00–09:00`, Afternoon `13:00–14:00`, Night `20:00–21:00`). Every day at midnight, the engine automatically selects a random minute & second (e.g., `08:24:18`, `13:47:05`, `20:12:44`) within each window to dispatch your message.
- **🛡️ Battle-Tested Cloud Persistence**: Employs local filesystem Baileys execution (`useMultiFileAuthState`) backed by debounced MongoDB Atlas cloud syncing (`cloudSync.js`). Even if Render sleeps, restarts, or redeploys, your login session and scheduled states survive without getting logged out.
- **🔄 Smart Catch-Up & De-duplication**: Reminders already sent today are tracked in state and database. If Render restarts midday, it will never double-send. If the server wakes up during a scheduled window, it catches up immediately.
- **🕵️ Stealth Presence Shield**: Automatically requests `unavailable` presence so your WhatsApp account never appears as "Online 24/7" to contacts.
- **🌐 Glassmorphism Web Dashboard**: Real-time status monitoring, QR code pairing, recipient configuration, custom messages per slot, manual test reminder trigger, and delivery history logs.
- **🔒 Public Repository Safe**: Strictly structured with `.env.example` and `.gitignore` to ensure zero secrets, tokens, or personal phone numbers can ever be committed to GitHub.

---

## 🚀 Quick Start (Local)

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd "Whatsapp Reminder"
npm install
```

### 2. Configure Environment

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` (optional for local testing, mandatory for Render cloud persistence):
```env
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
DB_NAME=whatsapp_reminder
```

### 3. Run the Server

```bash
npm start
```

Open `http://localhost:4000` in your browser. Scan the displayed QR code with WhatsApp (**Settings > Linked Devices > Link a Device**) and configure your recipient!

---

## ☁️ Deploying to Render (100% Free)

Because Render free tier supports deploying public GitHub repositories across separate accounts:

1. Create a **New Public GitHub Repository** (e.g. `whatsapp-reminder`) and push this code.
   *(The included `.gitignore` guarantees that `.env`, `auth_info/`, `config.json`, and session files are never committed).*
2. Log into your Render account.
3. Click **New +** > **Web Service**.
4. Connect your GitHub repository.
5. In **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `MONGODB_URI`: `mongodb+srv://...` (your free MongoDB Atlas M0 cluster URI)
   - `DB_NAME`: `whatsapp_reminder`
6. Click **Deploy Web Service**!
7. Once deployed, open your Render web URL, scan the QR code once, and you are all set!

### 24/7 Uptime (Keep-Alive)
Render free services spin down after 15 minutes of HTTP inactivity. To keep your reminder service awake 24/7:
- Register a free HTTP monitor on [UptimeRobot](https://uptimerobot.com) or [Cron-job.org](https://cron-job.org).
- Set it to ping your service URL at `/healthz` or `/ping` every **5 to 10 minutes**:
  `https://your-service-name.onrender.com/healthz`

---

## 🛠️ Configuration Structure

Settings can be managed either via the web dashboard or in `config.json`:

```json
{
  "active": true,
  "timezone": "Asia/Kolkata",
  "target": {
    "phone": "919876543210",
    "name": "Friend / Mom"
  },
  "slots": [
    {
      "id": 1,
      "name": "Morning Medicine",
      "startHour": 8,
      "endHour": 9,
      "message": "Good morning! Time for your morning medicines 💊 Have a great day!",
      "enabled": true
    },
    {
      "id": 2,
      "name": "Afternoon Medicine",
      "startHour": 13,
      "endHour": 14,
      "message": "Afternoon reminder! Please remember your afternoon medicines 💧 Stay hydrated!",
      "enabled": true
    },
    {
      "id": 3,
      "name": "Night Medicine",
      "startHour": 20,
      "endHour": 21,
      "message": "Good evening! Don't forget your night medicines before bed 🌙 Sleep well!",
      "enabled": true
    }
  ],
  "catchUpIfMissed": true
}
```

---

## 🛡️ License
MIT License.
