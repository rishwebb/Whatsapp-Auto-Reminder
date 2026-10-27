/**
 * Cloud Sync Engine for Render Free Tier (MongoDB Atlas M0 Free Tier)
 * 
 * Solves Render Free Tier's Ephemeral Disk Limitation for $0:
 * 1. On Startup: Automatically restores auth session files, config, and daily schedule state from MongoDB Atlas.
 * 2. At Runtime: Operates Baileys 100% against local disk (Zero Bad MAC errors, Zero database latency).
 * 3. In Background: Asynchronously and debounced syncs auth keys, schedule states, and history to MongoDB.
 * 4. Fallback: If MONGODB_URI is not provided, seamlessly runs in local disk mode with zero errors.
 */

const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

let client = null;
let db = null;
let isConnected = false;
let authDir = '';
let configFile = '';
let dailyPlanFile = '';
let historyFile = '';
let authSyncTimeout = null;

async function initCloudSync(paths = {}) {
    authDir = paths.authDir;
    configFile = paths.configFile;
    dailyPlanFile = paths.dailyPlanFile;
    historyFile = paths.historyFile;

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        console.log('[CLOUD SYNC] MONGODB_URI not set. Running in local filesystem mode.');
        return { enabled: false, connected: false };
    }

    try {
        console.log('[CLOUD SYNC] Connecting to MongoDB Atlas for cloud persistence...');
        client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 10000
        });
        await client.connect();
        db = client.db(process.env.DB_NAME || 'whatsapp_reminder');
        isConnected = true;
        console.log(`[CLOUD SYNC] Connected to MongoDB Atlas (${db.databaseName}) successfully! 🛡️`);
        return { enabled: true, connected: true };
    } catch (err) {
        console.error('[CLOUD SYNC ERROR] Failed to connect to MongoDB Atlas:', err.message);
        console.log('[CLOUD SYNC] Falling back to local filesystem storage.');
        isConnected = false;
        return { enabled: true, connected: false, error: err.message };
    }
}

/**
 * Restore credentials, configs, and schedule state from MongoDB Atlas
 * Runs BEFORE Baileys starts up so that existing login is restored instantly.
 */
async function restoreFromCloud() {
    if (!isConnected || !db) return { restored: false, reason: 'Not connected' };

    let restoredAuthCount = 0;

    try {
        // 1. Restore Auth State (Baileys Session)
        const credsFile = path.join(authDir, 'creds.json');
        const localCredsExist = fs.existsSync(credsFile);

        const authCollection = db.collection('wa_auth_backup');
        const authDocs = await authCollection.find({}).toArray();

        if (!localCredsExist && authDocs.length > 0) {
            console.log(`[CLOUD RESTORE] Local auth_info is empty. Restoring ${authDocs.length} session files from MongoDB...`);
            if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

            for (const doc of authDocs) {
                const targetFilePath = path.join(authDir, doc._id);
                try {
                    fs.writeFileSync(targetFilePath, doc.content, 'utf8');
                    restoredAuthCount++;
                } catch (e) {
                    console.error(`[CLOUD RESTORE ERROR] Writing ${doc._id}:`, e.message);
                }
            }
            console.log(`[CLOUD RESTORE] Successfully restored ${restoredAuthCount} session files! WhatsApp session is restored. 🎉`);
        } else if (localCredsExist) {
            console.log('[CLOUD RESTORE] Local creds.json already exists. Using active local session.');
        }

        // 2. Restore Configuration
        const settingsCollection = db.collection('reminder_settings');
        const configDoc = await settingsCollection.findOne({ _id: 'config' });
        if (configDoc) {
            const { _id, updatedAt, ...cloudConfig } = configDoc;
            let localConfig = {};
            if (fs.existsSync(configFile)) {
                try { localConfig = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) {}
            }
            const mergedConfig = { ...localConfig, ...cloudConfig };
            fs.writeFileSync(configFile, JSON.stringify(mergedConfig, null, 2), 'utf8');
            console.log('[CLOUD RESTORE] Restored config.json from MongoDB Atlas.');
        }

        // 3. Restore Today's Daily Schedule State (Prevents double sending upon restart!)
        const stateCollection = db.collection('reminder_state');
        const dailyPlanDoc = await stateCollection.findOne({ _id: 'daily_plan' });
        if (dailyPlanDoc) {
            const { _id, updatedAt, ...planData } = dailyPlanDoc;
            fs.writeFileSync(dailyPlanFile, JSON.stringify(planData, null, 2), 'utf8');
            console.log(`[CLOUD RESTORE] Restored daily schedule plan for ${planData.date} from MongoDB Atlas.`);
        }

        // 4. Restore History Logs
        const historyCollection = db.collection('reminder_history');
        const historyDocs = await historyCollection.find({}).sort({ timestamp: -1 }).limit(100).toArray();
        if (historyDocs.length > 0) {
            const sanitized = historyDocs.map(({ _id, ...rest }) => rest);
            fs.writeFileSync(historyFile, JSON.stringify(sanitized, null, 2), 'utf8');
            console.log(`[CLOUD RESTORE] Restored ${sanitized.length} reminder history logs from MongoDB Atlas.`);
        }

        return { restored: true, authCount: restoredAuthCount };
    } catch (err) {
        console.error('[CLOUD RESTORE ERROR]', err.message);
        return { restored: false, error: err.message };
    }
}

/**
 * Debounced synchronization of all auth files from local disk to MongoDB
 * Runs in background without blocking Baileys encryption/decryption
 */
function queueAuthSync(delayMs = 4000) {
    if (!isConnected || !db) return;

    if (authSyncTimeout) clearTimeout(authSyncTimeout);
    authSyncTimeout = setTimeout(async () => {
        try {
            await syncAuthToCloud();
        } catch (err) {
            console.error('[AUTH SYNC ERROR]', err.message);
        }
    }, delayMs);
}

async function syncAuthToCloud() {
    if (!isConnected || !db || !fs.existsSync(authDir)) return;

    const files = fs.readdirSync(authDir);
    if (files.length === 0) return;

    const authCollection = db.collection('wa_auth_backup');
    const bulkOps = [];

    for (const file of files) {
        const fullPath = path.join(authDir, file);
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            bulkOps.push({
                updateOne: {
                    filter: { _id: file },
                    update: { $set: { _id: file, content, updatedAt: new Date() } },
                    upsert: true
                }
            });
        } catch (_) {}
    }

    if (bulkOps.length > 0) {
        await authCollection.bulkWrite(bulkOps, { ordered: false });
        console.log(`[CLOUD SYNC] Backed up ${bulkOps.length} auth session files to MongoDB Atlas.`);
    }
}

/**
 * Sync configuration settings to MongoDB
 */
async function syncSettingsToCloud(configObj) {
    if (!isConnected || !db || !configObj) return;
    try {
        const settingsCollection = db.collection('reminder_settings');
        await settingsCollection.updateOne(
            { _id: 'config' },
            { $set: { ...configObj, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (err) {
        console.error('[SETTINGS SYNC ERROR]', err.message);
    }
}

/**
 * Sync today's randomized schedule plan to MongoDB
 */
async function syncDailyPlanToCloud(dailyPlanObj) {
    if (!isConnected || !db || !dailyPlanObj) return;
    try {
        const stateCollection = db.collection('reminder_state');
        await stateCollection.updateOne(
            { _id: 'daily_plan' },
            { $set: { ...dailyPlanObj, updatedAt: new Date() } },
            { upsert: true }
        );
    } catch (err) {
        console.error('[DAILY PLAN SYNC ERROR]', err.message);
    }
}

/**
 * Record a sent reminder in MongoDB Atlas history
 */
async function logReminderHistoryToCloud(logEntry) {
    if (!isConnected || !db || !logEntry) return;
    try {
        const historyCollection = db.collection('reminder_history');
        await historyCollection.insertOne({
            ...logEntry,
            createdAt: new Date()
        });
    } catch (err) {
        console.error('[HISTORY LOG SYNC ERROR]', err.message);
    }
}

/**
 * Clear auth from cloud on explicit logout
 */
async function clearCloudAuth() {
    if (!isConnected || !db) return;
    try {
        await db.collection('wa_auth_backup').deleteMany({});
        console.log('[CLOUD SYNC] Cleared cloud auth backup on logout.');
    } catch (err) {
        console.error('[CLOUD SYNC CLEAR ERROR]', err.message);
    }
}

function getCloudStatus() {
    return {
        configured: Boolean(process.env.MONGODB_URI),
        connected: isConnected,
        database: db ? db.databaseName : null
    };
}

module.exports = {
    initCloudSync,
    restoreFromCloud,
    queueAuthSync,
    syncAuthToCloud,
    syncSettingsToCloud,
    syncDailyPlanToCloud,
    logReminderHistoryToCloud,
    clearCloudAuth,
    getCloudStatus
};
