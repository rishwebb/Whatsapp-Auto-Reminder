require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const cloudSync = require('./cloudSync');
const ReminderScheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 4000;

const AUTH_DIR = path.join(__dirname, 'auth_info');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const CONFIG_EXAMPLE = path.join(__dirname, 'config.example.json');
const DAILY_PLAN_FILE = path.join(__dirname, 'daily_plan.json');
const HISTORY_FILE = path.join(__dirname, 'history_logs.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🛡️ Health check & Uptime Keep-Alive for Render
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime(), state: connectionState }));
app.get('/ping', (req, res) => res.status(200).send('pong'));

// -------------------------------------------------------------
// Configuration Management
// -------------------------------------------------------------
let config = {};

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (_) {
            config = {};
        }
    } else if (fs.existsSync(CONFIG_EXAMPLE)) {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_EXAMPLE, 'utf8'));
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        } catch (_) {
            config = {};
        }
    }

    config.timezone = config.timezone || 'Asia/Kolkata';
    config.catchUpIfMissed = config.catchUpIfMissed !== undefined ? config.catchUpIfMissed : true;
    config.simulateTyping = config.simulateTyping !== undefined ? config.simulateTyping : true;
    config.reminders = Array.isArray(config.reminders) ? config.reminders : [];
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        cloudSync.syncSettingsToCloud(config);
    } catch (e) {
        console.error('[CONFIG SAVE ERROR]', e.message);
    }
}

function normalizePhone(rawPhone) {
    if (!rawPhone) return '';
    let cleaned = String(rawPhone).replace(/\D/g, '');
    if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
    return cleaned;
}

// -------------------------------------------------------------
// WhatsApp Socket State & Concurrency Shield
// -------------------------------------------------------------
let sock = null;
let currentQR = null;
let connectionState = 'DISCONNECTED';
let connectedUser = null;
let isStartingSocket = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
const sseClients = new Set();

function broadcastEvent(type, data) {
    const payload = `data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`;
    for (const client of sseClients) {
        try {
            client.res.write(payload);
        } catch (_) {
            sseClients.delete(client);
        }
    }
}

function cleanupSocket() {
    if (sock) {
        try {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.end?.();
        } catch (_) {}
        sock = null;
    }
}

function scheduleReconnect(delay = null) {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectAttempts++;
    const waitTime = delay !== null ? delay : Math.min(3000 * Math.pow(1.4, reconnectAttempts - 1), 30000);
    console.log(`[AUTO-HEAL] Reconnecting in ${Math.round(waitTime / 1000)}s (Attempt #${reconnectAttempts})...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startWhatsApp();
    }, waitTime);
}

// Stealth Presence Shield
async function enforceOfflinePresence() {
    if (!sock || connectionState !== 'CONNECTED') return;
    try {
        await sock.sendPresenceUpdate('unavailable').catch(() => {});
    } catch (_) {}
}

setInterval(enforceOfflinePresence, 10 * 60 * 1000);

// -------------------------------------------------------------
// Baileys WhatsApp Engine (Using Local Multi-File Auth)
// -------------------------------------------------------------
async function startWhatsApp() {
    if (isStartingSocket) return;
    isStartingSocket = true;

    connectionState = 'CONNECTING';
    broadcastEvent('STATE_CHANGE', { state: connectionState });

    try {
        cleanupSocket();

        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            markOnlineOnConnect: false,
            browser: ['WA Reminder Dispatcher', 'Safari', '17.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('creds.update', async () => {
            await saveCreds();
            cloudSync.queueAuthSync();
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                connectionState = 'QR_READY';
                try {
                    currentQR = await QRCode.toDataURL(qr);
                } catch (_) {
                    currentQR = null;
                }
                console.log('\n======================================================');
                console.log(' [WHATSAPP REMINDER] Scan QR code to link device:');
                console.log(` Dashboard URL: http://localhost:${PORT}`);
                console.log('======================================================\n');
                try {
                    qrcodeTerminal.generate(qr, { small: true });
                } catch (_) {}
                broadcastEvent('QR', { qr: currentQR });
                broadcastEvent('STATE_CHANGE', { state: connectionState });
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                connectionState = 'DISCONNECTED';
                currentQR = null;
                connectedUser = null;

                console.log(`[WHATSAPP] Connection closed (Status: ${statusCode || 'Unknown'}).`);
                broadcastEvent('STATE_CHANGE', { state: connectionState, error: statusCode });

                if (statusCode === DisconnectReason.loggedOut) {
                    reconnectAttempts = 0;
                    console.log('[WHATSAPP] Device logged out. Clearing credentials...');
                    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
                    await cloudSync.clearCloudAuth();
                    scheduleReconnect(3000);
                } else {
                    scheduleReconnect();
                }
            } else if (connection === 'open') {
                connectionState = 'CONNECTED';
                reconnectAttempts = 0;
                currentQR = null;
                connectedUser = sock.user;
                const myPhone = sock.user?.id ? sock.user.id.split(':')[0] : 'Unknown';
                console.log(`\n🎉 [WHATSAPP] Connected successfully as +${myPhone} (${sock.user?.name || 'User'})!`);
                broadcastEvent('STATE_CHANGE', { state: connectionState, user: sock.user });

                setTimeout(enforceOfflinePresence, 2000);
            }
        });
    } catch (err) {
        console.error('[WHATSAPP INIT ERROR]', err);
        connectionState = 'DISCONNECTED';
        broadcastEvent('STATE_CHANGE', { state: connectionState, error: err.message });
        scheduleReconnect(5000);
    } finally {
        isStartingSocket = false;
    }
}

// Send WhatsApp text message with simulated typing
async function sendTextMessage(targetPhone, text, simulateTyping = true) {
    if (!sock || connectionState !== 'CONNECTED') {
        throw new Error('WhatsApp is not connected. Please scan the QR code first!');
    }

    const clean = normalizePhone(targetPhone);
    if (!clean || clean.length < 8) {
        throw new Error(`Invalid phone number: "${targetPhone}". Format must include country code (e.g. 919876543210).`);
    }

    const jid = `${clean}@s.whatsapp.net`;

    if (simulateTyping && config.simulateTyping !== false) {
        try {
            await sock.sendPresenceUpdate('composing', jid);
            const typingDelay = Math.min(3000, Math.max(1200, (text || '').length * 35));
            await new Promise(r => setTimeout(r, typingDelay));
            await sock.sendPresenceUpdate('paused', jid);
        } catch (_) {}
    }

    console.log(`[WHATSAPP SEND] Sending to ${jid}...`);
    const sent = await sock.sendMessage(jid, { text });
    console.log(`[WHATSAPP SEND SUCCESS] Delivered to ${jid}! ID: ${sent.key.id}`);

    setTimeout(enforceOfflinePresence, 1500);

    return {
        success: true,
        messageId: sent.key.id,
        timestamp: new Date().toISOString()
    };
}

// -------------------------------------------------------------
// Scheduler Instance
// -------------------------------------------------------------
const scheduler = new ReminderScheduler({
    configFile: CONFIG_FILE,
    dailyPlanFile: DAILY_PLAN_FILE,
    historyFile: HISTORY_FILE,
    onTriggerReminder: async ({ reminderTitle, slotName, phone, message, type, isManualTest, variationIndex, totalVariations }) => {
        try {
            const res = await sendTextMessage(phone, message, true);
            broadcastEvent('REMINDER_SENT', {
                reminderTitle,
                slotName,
                phone,
                message,
                type,
                isManualTest,
                variationInfo: totalVariations > 1 ? `Variation #${variationIndex} of ${totalVariations}` : null,
                timestamp: res.timestamp
            });
            return res;
        } catch (err) {
            console.error(`[REMINDER FAILED] ${reminderTitle} to ${phone}:`, err.message);
            return { success: false, error: err.message };
        }
    },
    onScheduleUpdated: (dailyPlan) => {
        broadcastEvent('SCHEDULE_UPDATE', { dailyPlan });
    },
    onConfigChanged: (newConfig) => {
        saveConfig();
        broadcastEvent('CONFIG_UPDATE', { config: newConfig });
    }
});

// -------------------------------------------------------------
// REST API Routes
// -------------------------------------------------------------
app.get('/api/status', (req, res) => {
    res.json({
        connectionState,
        connectedUser,
        currentQR,
        cloud: cloudSync.getCloudStatus(),
        config,
        scheduler: scheduler.getState()
    });
});

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientObj = { res };
    sseClients.add(clientObj);

    res.write(`data: ${JSON.stringify({
        type: 'INIT',
        data: {
            connectionState,
            connectedUser,
            currentQR,
            cloud: cloudSync.getCloudStatus(),
            config,
            scheduler: scheduler.getState()
        }
    })}\n\n`);

    req.on('close', () => {
        sseClients.delete(clientObj);
    });
});

app.post('/api/settings', (req, res) => {
    try {
        const { timezone, catchUpIfMissed, simulateTyping } = req.body;
        if (timezone) config.timezone = timezone;
        if (catchUpIfMissed !== undefined) config.catchUpIfMissed = Boolean(catchUpIfMissed);
        if (simulateTyping !== undefined) config.simulateTyping = Boolean(simulateTyping);

        saveConfig();
        scheduler.updateConfig(config);
        broadcastEvent('CONFIG_UPDATE', { config });
        res.json({ success: true, config });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// Create a new reminder (Arbitrary slots, custom time window, multiple message variations)
app.post('/api/reminders', (req, res) => {
    try {
        const { title, type, phone, contactName, enabled, slots, oneTime } = req.body;

        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone || cleanPhone.length < 8) {
            return res.status(400).json({ success: false, error: 'Valid phone number with country code is required.' });
        }

        const newReminder = {
            id: `rem_${Date.now()}`,
            title: (title || 'New Reminder').trim(),
            type: type === 'one_time' ? 'one_time' : 'continuous',
            phone: cleanPhone,
            contactName: (contactName || cleanPhone).trim(),
            enabled: enabled !== undefined ? Boolean(enabled) : true,
            createdAt: new Date().toISOString()
        };

        if (newReminder.type === 'continuous') {
            newReminder.slots = Array.isArray(slots) && slots.length > 0
                ? slots.map((s, idx) => ({
                    id: s.id || idx + 1,
                    name: (s.name || `Slot ${idx + 1}`).trim(),
                    startTime: s.startTime || '08:00',
                    endTime: s.endTime || '09:00',
                    messages: Array.isArray(s.messages) && s.messages.length > 0
                        ? s.messages.map(m => m.trim()).filter(Boolean)
                        : (s.message ? [s.message.trim()] : ['Friendly reminder 💊']),
                    enabled: s.enabled !== undefined ? Boolean(s.enabled) : true
                }))
                : [
                    {
                        id: 1,
                        name: 'Morning Routine',
                        startTime: '08:00',
                        endTime: '09:00',
                        messages: [
                            'Good morning! Time for your morning medicines 💊 Have a great day!',
                            'Morning! Quick reminder to take your meds and drink water 💧'
                        ],
                        enabled: true
                    }
                ];
        } else {
            const rawMessages = Array.isArray(oneTime?.messages) && oneTime.messages.length > 0
                ? oneTime.messages.map(m => m.trim()).filter(Boolean)
                : (oneTime?.message ? [oneTime.message.trim()] : ['Happy Birthday! 🎂 Wishing you all the best!']);

            newReminder.oneTime = {
                date: oneTime?.date || scheduler.getTimeInZone(config.timezone).date,
                time: oneTime?.time || '00:00',
                messages: rawMessages,
                message: rawMessages[0] || '',
                status: 'pending',
                deliveredAt: null
            };
        }

        config.reminders = config.reminders || [];
        config.reminders.push(newReminder);

        saveConfig();
        scheduler.updateConfig(config);
        broadcastEvent('CONFIG_UPDATE', { config });

        res.json({ success: true, reminder: newReminder, config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update an existing reminder
app.put('/api/reminders/:id', (req, res) => {
    try {
        const { id } = req.params;
        const index = (config.reminders || []).findIndex(r => r.id === id);
        if (index === -1) {
            return res.status(404).json({ success: false, error: 'Reminder not found' });
        }

        const current = config.reminders[index];
        const { title, phone, contactName, enabled, slots, oneTime } = req.body;

        if (title !== undefined) current.title = title.trim();
        if (phone !== undefined) current.phone = normalizePhone(phone);
        if (contactName !== undefined) current.contactName = contactName.trim();
        if (enabled !== undefined) current.enabled = Boolean(enabled);

        if (current.type === 'continuous' && Array.isArray(slots)) {
            current.slots = slots.map((s, idx) => ({
                id: s.id || idx + 1,
                name: (s.name || `Slot ${idx + 1}`).trim(),
                startTime: s.startTime || '08:00',
                endTime: s.endTime || '09:00',
                messages: Array.isArray(s.messages) && s.messages.length > 0
                    ? s.messages.map(m => m.trim()).filter(Boolean)
                    : (s.message ? [s.message.trim()] : ['Friendly reminder 💊']),
                enabled: s.enabled !== undefined ? Boolean(s.enabled) : true
            }));
        }

        if (current.type === 'one_time' && oneTime) {
            const rawMessages = Array.isArray(oneTime.messages) && oneTime.messages.length > 0
                ? oneTime.messages.map(m => m.trim()).filter(Boolean)
                : (oneTime.message ? [oneTime.message.trim()] : (current.oneTime?.messages || ['Happy Birthday! 🎂']));

            current.oneTime = {
                ...current.oneTime,
                date: oneTime.date || current.oneTime?.date,
                time: oneTime.time || current.oneTime?.time,
                messages: rawMessages,
                message: rawMessages[0] || '',
                status: oneTime.status || current.oneTime?.status || 'pending'
            };
        }

        config.reminders[index] = current;
        saveConfig();
        scheduler.updateConfig(config);
        broadcastEvent('CONFIG_UPDATE', { config });

        res.json({ success: true, reminder: current, config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete a reminder
app.delete('/api/reminders/:id', (req, res) => {
    try {
        const { id } = req.params;
        config.reminders = (config.reminders || []).filter(r => r.id !== id);

        saveConfig();
        scheduler.updateConfig(config);
        broadcastEvent('CONFIG_UPDATE', { config });

        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Trigger test message
app.post('/api/reminders/:id/test', async (req, res) => {
    try {
        const { id } = req.params;
        const { slotId } = req.body || {};
        const result = await scheduler.triggerTest(id, slotId);
        if (result.success) {
            res.json({ success: true, message: 'Test message sent to WhatsApp!' });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Re-roll daily plan
app.post('/api/regenerate-plan', (req, res) => {
    try {
        const current = scheduler.getTimeInZone(config.timezone);
        scheduler.dailyPlan = scheduler.generateNewDailyPlan(current.date);
        scheduler.saveDailyPlan();
        broadcastEvent('SCHEDULE_UPDATE', { dailyPlan: scheduler.dailyPlan });
        res.json({ success: true, dailyPlan: scheduler.dailyPlan });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Logout / Unpair WhatsApp
app.post('/api/logout', async (req, res) => {
    try {
        console.log('[USER REQUEST] Unpairing WhatsApp device...');
        if (sock) {
            try { await sock.logout(); } catch (_) {}
            cleanupSocket();
        }
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
        await cloudSync.clearCloudAuth();
        connectionState = 'DISCONNECTED';
        connectedUser = null;
        currentQR = null;
        broadcastEvent('STATE_CHANGE', { state: connectionState });
        scheduleReconnect(1500);
        res.json({ success: true, message: 'WhatsApp device unpaired. Fresh QR will be generated.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// -------------------------------------------------------------
// Server Bootstrap
// -------------------------------------------------------------
async function bootstrap() {
    loadConfig();

    console.log('\n======================================================');
    console.log(' 🩺 WhatsApp Medicine & Daily Reminder Engine');
    console.log('======================================================');

    await cloudSync.initCloudSync({
        authDir: AUTH_DIR,
        configFile: CONFIG_FILE,
        dailyPlanFile: DAILY_PLAN_FILE,
        historyFile: HISTORY_FILE
    });

    await cloudSync.restoreFromCloud();
    loadConfig();

    await scheduler.init(config);

    app.listen(PORT, () => {
        console.log(`[HTTP] Web Dashboard running at: http://localhost:${PORT} 🌐`);
    });

    startWhatsApp();
}

bootstrap();
