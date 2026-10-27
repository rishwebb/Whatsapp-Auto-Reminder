# 💊 PillPulse — Autonomous Multi-Target WhatsApp Reminder

An intelligent, battle-tested WhatsApp reminder engine and scheduler built with **Node.js**, **@whiskeysockets/baileys**, and **MongoDB Atlas Cloud Persistence**.

Designed specifically for **Render Free Tier**, it completely eliminates ephemeral disk wipes, session logouts, and "Bad MAC" errors, using the same rock-solid architecture as WhatsApp Chat Logger.

---

## ✨ Advanced Features

### 🔄 1. Continuous (Daily) Routines with Dynamic Windows
- **Unlimited Custom Slots**: Add, edit, or remove as many daily slots as you want (Morning meds, Lunch hydration, Afternoon pills, Gym, Night medicines).
- **Fully Flexible Window Durations**: Set any custom time window per slot:
  - 10-minute window: e.g. `08:00 to 08:10`
  - 15-minute window: e.g. `13:00 to 13:15`
  - 1-hour window: e.g. `20:00 to 21:00`
  - 2-hour window: e.g. `21:00 to 23:00`
- **Autonomous Human Jitter**: The engine autonomously selects a random minute and second within your chosen window each day (e.g. `08:04:19`, `13:09:47`, `20:41:03`) so messages never appear like an automated robot.

### 🎲 2. Multi-Message Variation Pool (Anti-Bot Rotation)
- Add multiple versions of your text for any slot or one-time message (e.g. 3, 5, or 10 variations).
- Each time the reminder triggers, it **randomly selects one version** from the pool. The recipient never receives the exact same repetitive text!
- **Dynamic Placeholders**: Supports `{name}`, `{time}`, `{date}` templates (e.g. `"Good morning {name}! Time for your medicine 💊"`).

### 💬 3. Simulated Human Typing Indicator
- Displays the WhatsApp **typing indicator** (`composing...`) to the recipient for 1.5–3 seconds right before the message dispatches, mimicking real human behavior.
- Immediately returns to **stealth offline presence** so your account never shows as "Online 24/7".

### 🎯 4. One-Time Scheduled Auto Messages
- Schedule messages for a specific date and time (e.g. **Midnight Birthday Wish at 00:00**, anniversary, or doctor appointment).
- Once dispatched, it marks as `Delivered ✅` and will not repeat.

### 👥 5. Multi-Target Contact Profiles
- Add separate reminders for different phone numbers with their own contact names (Mom, Dad, Rahul, Bestie), with individual "+ Add New Reminder", "⚡ Send Test", "✏️ Edit", and "🗑️ Delete" controls.

### 🛡️ 6. Zero Logouts (Chat Logger Cloud Persistence)
- Employs local filesystem Baileys execution (`useMultiFileAuthState`) backed by debounced MongoDB Atlas cloud backup (`cloudSync.js`).
- Even when Render restarts, spins down, or redeploys, your login keys and schedule states are restored in seconds with **zero Bad MAC errors**.

---

## 🚀 Quick Start (Local)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional locally, required on Render)
```bash
cp .env.example .env
```
Edit `.env`:
```env
PORT=4000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
DB_NAME=whatsapp_reminder
```

### 3. Run Server
```bash
npm start
```
Open `http://localhost:4000` in your browser, scan the QR code once with WhatsApp (**Settings > Linked Devices > Link a Device**), and configure your reminders!

---

## ☁️ Deploying to Render (100% Free)

1. **Push to a new Public GitHub Repository**:
   ```powershell
   git remote add origin https://github.com/<your-username>/whatsapp-reminder.git
   git push -u origin master
   ```
   *(The included `.gitignore` guarantees that `.env`, `auth_info/`, `config.json`, and database files are never committed).*

2. **On Render (New Web Service)**:
   - Create a Web Service connected to your public repo.
   - Set Environment Variables:
     - `NODE_ENV`: `production`
     - `PORT`: `10000`
     - `MONGODB_URI`: `mongodb+srv://...` (your free MongoDB Atlas M0 cluster URI)
     - `DB_NAME`: `whatsapp_reminder`

3. **24/7 Uptime**:
   - Register a free HTTP ping on [UptimeRobot](https://uptimerobot.com) targeting `https://your-app.onrender.com/healthz` every 5–10 minutes.

---

## 🛡️ License
MIT License.
