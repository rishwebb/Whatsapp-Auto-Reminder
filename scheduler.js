/**
 * Advanced Multi-Target Scheduler Engine for WhatsApp Reminders
 * 
 * Features:
 * 1. Arbitrary number of slots per continuous reminder (Add/Remove as many as you want!).
 * 2. Custom window durations: from 2 minutes, 10 minutes, 1 hour, to 3 hours (startTime HH:MM to endTime HH:MM).
 * 3. Message variations / Random text pool: define multiple text versions per slot, picks one randomly each time!
 * 4. Anti-bot humanization: dynamic template placeholders ({name}, {time}, {date}) and typing simulation.
 * 5. One-Time scheduled messages with exact date & time (e.g. Midnight birthday surprise).
 * 6. Bulletproof state persistence to MongoDB Atlas so Render restarts never duplicate or miss reminders.
 */

const fs = require('fs');
const path = require('path');
const cloudSync = require('./cloudSync');

class ReminderScheduler {
    constructor(options = {}) {
        this.configFile = options.configFile;
        this.dailyPlanFile = options.dailyPlanFile;
        this.historyFile = options.historyFile;
        this.onTriggerReminder = options.onTriggerReminder || (async () => {});
        this.onScheduleUpdated = options.onScheduleUpdated || (() => {});
        this.onConfigChanged = options.onConfigChanged || (() => {});

        this.config = null;
        this.dailyPlan = null;
        this.history = [];
        this.timer = null;
        this.isProcessing = false;
    }

    /**
     * Parse date components in target timezone (e.g. Asia/Kolkata)
     */
    getTimeInZone(timezone = 'Asia/Kolkata') {
        const now = new Date();
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            const parts = formatter.formatToParts(now);
            const getPart = (type) => {
                const found = parts.find(p => p.type === type);
                return found ? parseInt(found.value, 10) : 0;
            };

            const year = getPart('year');
            const month = String(getPart('month')).padStart(2, '0');
            const day = String(getPart('day')).padStart(2, '0');
            const hour = getPart('hour');
            const minute = getPart('minute');
            const second = getPart('second');

            const dateStr = `${year}-${month}-${day}`;
            const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
            const totalSeconds = hour * 3600 + minute * 60 + second;

            return {
                date: dateStr,
                time: timeStr,
                year,
                month,
                day,
                hour,
                minute,
                second,
                totalSeconds,
                rawDate: now
            };
        } catch (e) {
            const y = now.getUTCFullYear();
            const m = String(now.getUTCMonth() + 1).padStart(2, '0');
            const d = String(now.getUTCDate()).padStart(2, '0');
            const h = now.getUTCHours();
            const min = now.getUTCMinutes();
            const s = now.getUTCSeconds();
            return {
                date: `${y}-${m}-${d}`,
                time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
                year: y,
                month: m,
                day: d,
                hour: h,
                minute: min,
                second: s,
                totalSeconds: h * 3600 + min * 60 + s,
                rawDate: now
            };
        }
    }

    async init(config) {
        this.config = config;
        this.loadHistory();
        this.loadDailyPlan();

        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.tick(), 10000);
        console.log(`[SCHEDULER] Multi-target engine active in timezone: ${this.config.timezone || 'Asia/Kolkata'} ⏰`);

        setTimeout(() => this.tick(), 2000);
    }

    updateConfig(newConfig) {
        this.config = newConfig;
        this.syncConfigToPlan();
    }

    loadHistory() {
        if (fs.existsSync(this.historyFile)) {
            try {
                this.history = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
            } catch (_) {
                this.history = [];
            }
        } else {
            this.history = [];
        }
    }

    saveHistory() {
        try {
            fs.writeFileSync(this.historyFile, JSON.stringify(this.history.slice(0, 100), null, 2), 'utf8');
        } catch (e) {
            console.error('[SCHEDULER] Failed saving history:', e.message);
        }
    }

    loadDailyPlan() {
        const current = this.getTimeInZone(this.config?.timezone || 'Asia/Kolkata');
        let plan = null;

        if (fs.existsSync(this.dailyPlanFile)) {
            try {
                plan = JSON.parse(fs.readFileSync(this.dailyPlanFile, 'utf8'));
            } catch (_) {
                plan = null;
            }
        }

        if (!plan || plan.date !== current.date) {
            console.log(`[SCHEDULER] Generating new randomized daily plan for ${current.date}...`);
            this.dailyPlan = this.generateNewDailyPlan(current.date);
        } else {
            this.dailyPlan = plan;
            this.syncConfigToPlan();
        }
    }

    saveDailyPlan() {
        if (!this.dailyPlan) return;
        try {
            fs.writeFileSync(this.dailyPlanFile, JSON.stringify(this.dailyPlan, null, 2), 'utf8');
            cloudSync.syncDailyPlanToCloud(this.dailyPlan);
        } catch (e) {
            console.error('[SCHEDULER] Failed saving daily plan:', e.message);
        }
    }

    /**
     * Converts a time string (HH:MM or HH:MM:SS) to total seconds from midnight
     */
    timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const parts = String(timeStr).split(':').map(p => parseInt(p, 10) || 0);
        const h = parts[0] || 0;
        const m = parts[1] || 0;
        const s = parts[2] || 0;
        return h * 3600 + m * 60 + s;
    }

    /**
     * Converts total seconds from midnight to HH:MM:SS format
     */
    secondsToTime(totalSec) {
        const secNorm = ((totalSec % 86400) + 86400) % 86400;
        const h = Math.floor(secNorm / 3600);
        const m = Math.floor((secNorm % 3600) / 60);
        const s = secNorm % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * Generate a random target time within ANY custom time window (2 min, 10 min, 1 hr, 3 hr)
     */
    getRandomTimeInWindow(startTimeStr, endTimeStr) {
        const startSec = this.timeToSeconds(startTimeStr);
        let endSec = this.timeToSeconds(endTimeStr);

        // If endTime is before or equal to startTime, assume end of hour or +1 hour
        if (endSec <= startSec) {
            endSec = startSec + 3600;
        }

        const windowSeconds = endSec - startSec;

        let targetSec;
        if (windowSeconds <= 30) {
            targetSec = startSec;
        } else if (windowSeconds <= 120) {
            // Short window (e.g. 1-2 minutes)
            targetSec = startSec + Math.floor(Math.random() * windowSeconds);
        } else {
            // Buffer 10 seconds from each edge for natural feel
            const buffer = Math.min(60, Math.floor(windowSeconds * 0.05));
            const availableRange = windowSeconds - buffer * 2;
            const offset = buffer + Math.floor(Math.random() * (availableRange > 0 ? availableRange : windowSeconds));
            targetSec = startSec + offset;
        }

        return {
            startSec,
            endSec,
            targetSec,
            timeString: this.secondsToTime(targetSec)
        };
    }

    /**
     * Pick a random message variation from the slot's text pool and replace placeholders
     */
    pickRandomMessage(slotOrRem, contactName = 'Friend') {
        let pool = [];

        if (Array.isArray(slotOrRem.messages) && slotOrRem.messages.length > 0) {
            pool = slotOrRem.messages.filter(m => typeof m === 'string' && m.trim().length > 0);
        } else if (slotOrRem.message) {
            pool = [slotOrRem.message];
        } else if (slotOrRem.oneTime?.message) {
            pool = [slotOrRem.oneTime.message];
        }

        if (pool.length === 0) {
            pool = ['Friendly reminder from WhatsApp! 💊'];
        }

        const chosenIndex = Math.floor(Math.random() * pool.length);
        let text = pool[chosenIndex];

        // Format placeholders
        const now = new Date();
        text = text
            .replace(/\{name\}/gi, contactName)
            .replace(/\{date\}/gi, now.toLocaleDateString())
            .replace(/\{time\}/gi, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

        return {
            text,
            variationIndex: chosenIndex + 1,
            totalVariations: pool.length
        };
    }

    /**
     * Generate daily timetable combining both continuous random slots and one-time messages
     */
    generateNewDailyPlan(dateStr) {
        const reminders = Array.isArray(this.config?.reminders) ? this.config.reminders : [];
        const items = [];

        reminders.forEach(rem => {
            // 1. Continuous (Daily) Reminders - supports arbitrary number of slots & flexible windows!
            if (rem.type === 'continuous' && Array.isArray(rem.slots)) {
                rem.slots.forEach(slot => {
                    const startTime = slot.startTime || (slot.startHour !== undefined ? `${String(slot.startHour).padStart(2, '0')}:00` : '08:00');
                    const endTime = slot.endTime || (slot.endHour !== undefined ? `${String(slot.endHour).padStart(2, '0')}:00` : '09:00');

                    const timing = this.getRandomTimeInWindow(startTime, endTime);

                    // Normalize messages array
                    const messages = Array.isArray(slot.messages) && slot.messages.length > 0
                        ? slot.messages
                        : (slot.message ? [slot.message] : ['Friendly daily routine reminder 💊']);

                    items.push({
                        planItemId: `${rem.id}_slot_${slot.id}`,
                        reminderId: rem.id,
                        reminderTitle: rem.title || 'Daily Routine',
                        type: 'continuous',
                        phone: rem.phone,
                        contactName: rem.contactName || 'Recipient',
                        slotId: slot.id,
                        slotName: slot.name || `Slot ${slot.id}`,
                        startTime,
                        endTime,
                        startSec: timing.startSec,
                        endSec: timing.endSec,
                        targetSec: timing.targetSec,
                        targetTime: timing.timeString,
                        messages,
                        enabled: Boolean(rem.enabled && slot.enabled),
                        sent: false,
                        sentAt: null,
                        status: 'pending'
                    });
                });
            }
            // 2. One-Time Scheduled Messages (e.g. Birthday at midnight 00:00)
            else if (rem.type === 'one_time' && rem.oneTime) {
                if (rem.oneTime.date === dateStr) {
                    const isDelivered = rem.oneTime.status === 'delivered';
                    const targetTime = rem.oneTime.time ? `${rem.oneTime.time}:00` : '00:00:00';
                    const targetSec = this.timeToSeconds(targetTime);

                    const messages = Array.isArray(rem.oneTime.messages) && rem.oneTime.messages.length > 0
                        ? rem.oneTime.messages
                        : (rem.oneTime.message ? [rem.oneTime.message] : ['Happy Birthday! 🎂 Wishing you the best!']);

                    items.push({
                        planItemId: `${rem.id}_onetime`,
                        reminderId: rem.id,
                        reminderTitle: rem.title || 'One-Time Message',
                        type: 'one_time',
                        phone: rem.phone,
                        contactName: rem.contactName || 'Recipient',
                        slotId: 0,
                        slotName: 'Scheduled Auto Message',
                        startTime: rem.oneTime.time || '00:00',
                        endTime: rem.oneTime.time || '00:00',
                        startSec: targetSec,
                        endSec: targetSec + 3600,
                        targetSec: targetSec,
                        targetTime: targetTime,
                        messages,
                        enabled: Boolean(rem.enabled && !isDelivered),
                        sent: isDelivered,
                        sentAt: rem.oneTime.deliveredAt || null,
                        status: isDelivered ? 'delivered' : 'pending'
                    });
                }
            }
        });

        const newPlan = {
            date: dateStr,
            timezone: this.config?.timezone || 'Asia/Kolkata',
            createdAt: new Date().toISOString(),
            items
        };

        try {
            fs.writeFileSync(this.dailyPlanFile, JSON.stringify(newPlan, null, 2), 'utf8');
            cloudSync.syncDailyPlanToCloud(newPlan);
        } catch (_) {}

        return newPlan;
    }

    /**
     * Merge updated configuration into today's active plan without wiping already sent statuses
     */
    syncConfigToPlan() {
        if (!this.dailyPlan || !Array.isArray(this.dailyPlan.items)) {
            const current = this.getTimeInZone(this.config?.timezone || 'Asia/Kolkata');
            this.dailyPlan = this.generateNewDailyPlan(current.date);
            return;
        }

        const currentItems = this.dailyPlan.items;
        const reminders = Array.isArray(this.config?.reminders) ? this.config.reminders : [];
        const updatedItems = [];
        let changed = false;

        reminders.forEach(rem => {
            if (rem.type === 'continuous' && Array.isArray(rem.slots)) {
                rem.slots.forEach(slot => {
                    const planItemId = `${rem.id}_slot_${slot.id}`;
                    const existing = currentItems.find(i => i.planItemId === planItemId);

                    const startTime = slot.startTime || (slot.startHour !== undefined ? `${String(slot.startHour).padStart(2, '0')}:00` : '08:00');
                    const endTime = slot.endTime || (slot.endHour !== undefined ? `${String(slot.endHour).padStart(2, '0')}:00` : '09:00');
                    const messages = Array.isArray(slot.messages) && slot.messages.length > 0
                        ? slot.messages
                        : (slot.message ? [slot.message] : ['Friendly daily routine reminder 💊']);

                    if (existing) {
                        existing.reminderTitle = rem.title;
                        existing.phone = rem.phone;
                        existing.contactName = rem.contactName;
                        existing.slotName = slot.name;
                        existing.messages = messages;
                        existing.enabled = Boolean(rem.enabled && slot.enabled);

                        // If window timing was changed and slot not yet sent, re-calculate target
                        if ((existing.startTime !== startTime || existing.endTime !== endTime) && !existing.sent) {
                            existing.startTime = startTime;
                            existing.endTime = endTime;
                            const timing = this.getRandomTimeInWindow(startTime, endTime);
                            existing.startSec = timing.startSec;
                            existing.endSec = timing.endSec;
                            existing.targetSec = timing.targetSec;
                            existing.targetTime = timing.timeString;
                            changed = true;
                        }
                        updatedItems.push(existing);
                    } else {
                        const timing = this.getRandomTimeInWindow(startTime, endTime);
                        updatedItems.push({
                            planItemId,
                            reminderId: rem.id,
                            reminderTitle: rem.title || 'Daily Routine',
                            type: 'continuous',
                            phone: rem.phone,
                            contactName: rem.contactName || 'Recipient',
                            slotId: slot.id,
                            slotName: slot.name || `Slot ${slot.id}`,
                            startTime,
                            endTime,
                            startSec: timing.startSec,
                            endSec: timing.endSec,
                            targetSec: timing.targetSec,
                            targetTime: timing.timeString,
                            messages,
                            enabled: Boolean(rem.enabled && slot.enabled),
                            sent: false,
                            sentAt: null,
                            status: 'pending'
                        });
                        changed = true;
                    }
                });
            } else if (rem.type === 'one_time' && rem.oneTime) {
                if (rem.oneTime.date === this.dailyPlan.date) {
                    const planItemId = `${rem.id}_onetime`;
                    const existing = currentItems.find(i => i.planItemId === planItemId);
                    const isDelivered = rem.oneTime.status === 'delivered';
                    const targetTime = rem.oneTime.time ? `${rem.oneTime.time}:00` : '00:00:00';
                    const targetSec = this.timeToSeconds(targetTime);
                    const messages = Array.isArray(rem.oneTime.messages) && rem.oneTime.messages.length > 0
                        ? rem.oneTime.messages
                        : (rem.oneTime.message ? [rem.oneTime.message] : ['Happy Birthday! 🎂']);

                    if (existing) {
                        existing.reminderTitle = rem.title;
                        existing.phone = rem.phone;
                        existing.contactName = rem.contactName;
                        existing.messages = messages;
                        existing.targetTime = targetTime;
                        existing.targetSec = targetSec;
                        existing.enabled = Boolean(rem.enabled && !isDelivered);
                        existing.sent = isDelivered;
                        updatedItems.push(existing);
                    } else {
                        updatedItems.push({
                            planItemId,
                            reminderId: rem.id,
                            reminderTitle: rem.title || 'One-Time Message',
                            type: 'one_time',
                            phone: rem.phone,
                            contactName: rem.contactName || 'Recipient',
                            slotId: 0,
                            slotName: 'Scheduled Auto Message',
                            startTime: rem.oneTime.time || '00:00',
                            endTime: rem.oneTime.time || '00:00',
                            startSec: targetSec,
                            endSec: targetSec + 3600,
                            targetSec: targetSec,
                            targetTime: targetTime,
                            messages,
                            enabled: Boolean(rem.enabled && !isDelivered),
                            sent: isDelivered,
                            sentAt: rem.oneTime.deliveredAt || null,
                            status: isDelivered ? 'delivered' : 'pending'
                        });
                        changed = true;
                    }
                }
            }
        });

        this.dailyPlan.items = updatedItems;
        this.saveDailyPlan();
        this.onScheduleUpdated(this.dailyPlan);
    }

    /**
     * Heartbeat tick - evaluates all pending continuous and one-time messages
     */
    async tick() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const current = this.getTimeInZone(this.config?.timezone || 'Asia/Kolkata');

            // 1. Day Rollover check
            if (!this.dailyPlan || this.dailyPlan.date !== current.date) {
                console.log(`[SCHEDULER] Day rollover to ${current.date}. Generating fresh plan...`);
                this.dailyPlan = this.generateNewDailyPlan(current.date);
                this.onScheduleUpdated(this.dailyPlan);
                this.isProcessing = false;
                return;
            }

            const items = this.dailyPlan.items || [];

            for (const item of items) {
                if (!item.enabled || item.sent) continue;

                const phone = item.phone?.trim();
                if (!phone) continue;

                let shouldTrigger = false;

                // Continuous custom window check
                if (item.type === 'continuous') {
                    // Check if current time has reached or passed targetSec
                    if (current.totalSeconds >= item.targetSec && current.totalSeconds <= item.endSec) {
                        shouldTrigger = true;
                    }
                    // Catch-up mode: if server woke up after sleep, but is still within window
                    else if (this.config?.catchUpIfMissed && current.totalSeconds >= item.startSec && current.totalSeconds <= item.endSec) {
                        console.log(`[SCHEDULER] Catch-up triggered for slot: ${item.reminderTitle} -> ${item.slotName}`);
                        shouldTrigger = true;
                    }
                }
                // One-Time scheduled message check
                else if (item.type === 'one_time') {
                    if (current.totalSeconds >= item.targetSec) {
                        console.log(`[SCHEDULER] One-Time Scheduled Trigger reached for ${item.reminderTitle} (Target: ${item.targetTime}, Now: ${current.time})`);
                        shouldTrigger = true;
                    }
                }

                if (shouldTrigger) {
                    await this.dispatchItem(item);
                }
            }
        } catch (err) {
            console.error('[SCHEDULER TICK ERROR]', err.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async dispatchItem(item, isManualTest = false) {
        // Pick one message at random from variations
        const { text, variationIndex, totalVariations } = this.pickRandomMessage(item, item.contactName);

        try {
            const result = await this.onTriggerReminder({
                reminderId: item.reminderId,
                reminderTitle: item.reminderTitle,
                slotName: item.slotName,
                phone: item.phone,
                contactName: item.contactName,
                message: text,
                type: item.type,
                variationIndex,
                totalVariations,
                isManualTest
            });

            if (result && result.success) {
                const nowIso = new Date().toISOString();
                const logEntry = {
                    id: `rem_${Date.now()}_${item.slotId || '0'}`,
                    date: this.dailyPlan?.date,
                    reminderId: item.reminderId,
                    reminderTitle: item.reminderTitle,
                    type: item.type,
                    slotName: item.slotName,
                    phone: item.phone,
                    contactName: item.contactName,
                    message: text,
                    variationInfo: totalVariations > 1 ? `Variation #${variationIndex} of ${totalVariations}` : null,
                    timestamp: nowIso,
                    status: 'delivered',
                    messageId: result.messageId || null,
                    isManualTest
                };

                if (!isManualTest) {
                    item.sent = true;
                    item.sentAt = nowIso;
                    item.status = 'delivered';
                    this.saveDailyPlan();

                    if (item.type === 'one_time' && Array.isArray(this.config?.reminders)) {
                        const parent = this.config.reminders.find(r => r.id === item.reminderId);
                        if (parent && parent.oneTime) {
                            parent.oneTime.status = 'delivered';
                            parent.oneTime.deliveredAt = nowIso;
                            this.onConfigChanged(this.config);
                        }
                    }
                }

                this.history.unshift(logEntry);
                this.saveHistory();
                cloudSync.logReminderHistoryToCloud(logEntry);

                this.onScheduleUpdated(this.dailyPlan);
                return { success: true, logEntry };
            } else {
                return { success: false, error: result?.error };
            }
        } catch (err) {
            console.error('[DISPATCH ERROR]', err.message);
            return { success: false, error: err.message };
        }
    }

    async triggerTest(reminderId, slotId = null) {
        const reminders = Array.isArray(this.config?.reminders) ? this.config.reminders : [];
        const rem = reminders.find(r => r.id === reminderId);
        if (!rem) {
            throw new Error(`Reminder with ID "${reminderId}" not found.`);
        }

        const phone = rem.phone?.trim();
        if (!phone) {
            throw new Error(`Recipient phone number is empty for "${rem.title}". Please set a phone number first.`);
        }

        let targetSlot = null;
        let slotName = 'Test Message';

        if (rem.type === 'continuous') {
            targetSlot = (rem.slots || []).find(s => s.id === parseInt(slotId, 10)) || rem.slots?.[0];
            slotName = targetSlot?.name || 'Continuous Slot';
        } else {
            targetSlot = rem.oneTime || {};
            slotName = 'One-Time Message';
        }

        const dummyItem = {
            reminderId: rem.id,
            reminderTitle: rem.title,
            type: rem.type,
            slotName,
            phone: rem.phone,
            contactName: rem.contactName,
            messages: targetSlot.messages || (targetSlot.message ? [targetSlot.message] : ['Test reminder! 💊'])
        };

        return await this.dispatchItem(dummyItem, true);
    }

    getState() {
        const current = this.getTimeInZone(this.config?.timezone || 'Asia/Kolkata');
        return {
            currentTime: current.time,
            currentDate: current.date,
            timezone: this.config?.timezone || 'Asia/Kolkata',
            dailyPlan: this.dailyPlan,
            history: this.history.slice(0, 50)
        };
    }
}

module.exports = ReminderScheduler;
