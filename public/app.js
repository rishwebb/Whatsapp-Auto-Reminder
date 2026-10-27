// PillPulse Multi-Target WhatsApp Reminder & Auto-Message Controller

let appState = {
    connectionState: 'DISCONNECTED',
    connectedUser: null,
    currentQR: null,
    cloud: { configured: false, connected: false, database: null },
    config: {
        timezone: 'Asia/Kolkata',
        catchUpIfMissed: true,
        reminders: []
    },
    scheduler: {
        currentTime: '--:--:--',
        currentDate: '',
        dailyPlan: null,
        history: []
    }
};

let activeFilter = 'all';
let eventSource = null;
let clockInterval = null;

// DOM Elements
const waDot = document.getElementById('waDot');
const waStatusText = document.getElementById('waStatusText');
const cloudDot = document.getElementById('cloudDot');
const cloudStatusText = document.getElementById('cloudStatusText');
const liveClock = document.getElementById('liveClock');
const liveTz = document.getElementById('liveTz');

const waConnectingView = document.getElementById('waConnectingView');
const waQrView = document.getElementById('waQrView');
const qrImage = document.getElementById('qrImage');
const waConnectedView = document.getElementById('waConnectedView');
const connectedName = document.getElementById('connectedName');
const connectedPhone = document.getElementById('connectedPhone');
const btnUnpair = document.getElementById('btnUnpair');

const selTimezone = document.getElementById('selTimezone');
const chkCatchUp = document.getElementById('chkCatchUp');
const globalSettingsForm = document.getElementById('globalSettingsForm');

const planDateBadge = document.getElementById('planDateBadge');
const slotsTimeline = document.getElementById('slotsTimeline');
const btnRerollPlan = document.getElementById('btnRerollPlan');

const remindersContainer = document.getElementById('remindersContainer');
const countAll = document.getElementById('countAll');
const countContinuous = document.getElementById('countContinuous');
const countOneTime = document.getElementById('countOneTime');

const historyTableBody = document.getElementById('historyTableBody');
const historyCounter = document.getElementById('historyCounter');
const toastContainer = document.getElementById('toastContainer');

// Modal Elements
const reminderModal = document.getElementById('reminderModal');
const modalTitle = document.getElementById('modalTitle');
const reminderForm = document.getElementById('reminderForm');
const editReminderId = document.getElementById('editReminderId');
const inputTitle = document.getElementById('inputTitle');
const inputPhone = document.getElementById('inputPhone');
const inputContactName = document.getElementById('inputContactName');
const inputEnabled = document.getElementById('inputEnabled');

const typeCardContinuous = document.getElementById('typeCardContinuous');
const typeCardOneTime = document.getElementById('typeCardOneTime');
const continuousFieldsSection = document.getElementById('continuousFieldsSection');
const oneTimeFieldsSection = document.getElementById('oneTimeFieldsSection');
const modalSlotsContainer = document.getElementById('modalSlotsContainer');

const inputOneTimeDate = document.getElementById('inputOneTimeDate');
const inputOneTimeTime = document.getElementById('inputOneTimeTime');
const inputOneTimeMessage = document.getElementById('inputOneTimeMessage');

const btnOpenNewModal = document.getElementById('btnOpenNewModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');

// -------------------------------------------------------------
// Toast Helper
// -------------------------------------------------------------
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// -------------------------------------------------------------
// Real-Time Clock
// -------------------------------------------------------------
function startClock() {
    if (clockInterval) clearInterval(clockInterval);

    function update() {
        const tz = appState.config?.timezone || 'Asia/Kolkata';
        liveTz.textContent = tz;
        try {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', {
                timeZone: tz,
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            liveClock.textContent = timeString;
        } catch (_) {
            liveClock.textContent = new Date().toLocaleTimeString();
        }
    }

    update();
    clockInterval = setInterval(update, 1000);
}

// -------------------------------------------------------------
// Render Device State
// -------------------------------------------------------------
function renderDeviceState() {
    const state = appState.connectionState;
    waDot.className = 'indicator-dot';

    if (state === 'CONNECTED') {
        waDot.classList.add('dot-green');
        waStatusText.textContent = 'WA Connected';

        waConnectingView.classList.add('hidden');
        waQrView.classList.add('hidden');
        waConnectedView.classList.remove('hidden');
        btnUnpair.classList.remove('hidden');

        const u = appState.connectedUser;
        const phone = u?.id ? u.id.split(':')[0] : 'Linked User';
        connectedPhone.textContent = `+${phone}`;
        connectedName.textContent = u?.name ? `${u.name}'s Account` : 'Active WhatsApp Session';
    } else if (state === 'QR_READY' && appState.currentQR) {
        waDot.classList.add('dot-amber');
        waStatusText.textContent = 'Scan QR Code';

        waConnectingView.classList.add('hidden');
        waConnectedView.classList.add('hidden');
        waQrView.classList.remove('hidden');
        btnUnpair.classList.add('hidden');

        qrImage.src = appState.currentQR;
    } else {
        waDot.classList.add('dot-red');
        waStatusText.textContent = state === 'CONNECTING' ? 'Connecting...' : 'Disconnected';

        waQrView.classList.add('hidden');
        waConnectedView.classList.add('hidden');
        waConnectingView.classList.remove('hidden');
        btnUnpair.classList.add('hidden');
    }

    // Cloud status pill
    cloudDot.className = 'indicator-dot';
    if (appState.cloud?.connected) {
        cloudDot.classList.add('dot-green');
        cloudStatusText.textContent = `MongoDB: ${appState.cloud.database}`;
    } else if (appState.cloud?.configured) {
        cloudDot.classList.add('dot-amber');
        cloudStatusText.textContent = 'Connecting MongoDB...';
    } else {
        cloudDot.classList.add('dot-blue');
        cloudStatusText.textContent = 'Local Storage Mode';
    }
}

function renderSystemSettings() {
    if (!appState.config) return;
    selTimezone.value = appState.config.timezone || 'Asia/Kolkata';
    chkCatchUp.checked = appState.config.catchUpIfMissed !== undefined ? Boolean(appState.config.catchUpIfMissed) : true;
}

function formatHourLabel(h) {
    const num = parseInt(h, 10);
    const suffix = num >= 12 ? 'PM' : 'AM';
    const hour12 = num % 12 === 0 ? 12 : num % 12;
    return `${hour12}:00 ${suffix}`;
}

function formatTime12h(timeStr) {
    if (!timeStr) return '--:--';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const s = parts[2] || '00';
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m}:${s} ${suffix}`;
}

// -------------------------------------------------------------
// Render Configured Reminders List
// -------------------------------------------------------------
function renderRemindersList() {
    const reminders = appState.config?.reminders || [];

    // Update Counters
    const contCount = reminders.filter(r => r.type === 'continuous').length;
    const otCount = reminders.filter(r => r.type === 'one_time').length;
    countAll.textContent = reminders.length;
    countContinuous.textContent = contCount;
    countOneTime.textContent = otCount;

    const filtered = reminders.filter(r => {
        if (activeFilter === 'continuous') return r.type === 'continuous';
        if (activeFilter === 'one_time') return r.type === 'one_time';
        return true;
    });

    if (filtered.length === 0) {
        remindersContainer.innerHTML = `
            <div class="empty-state">
                <p>No reminders configured for this filter.</p>
                <button class="btn btn-primary btn-sm mt-3" onclick="openCreateModal()">+ Add Your First Reminder</button>
            </div>
        `;
        return;
    }

    remindersContainer.innerHTML = '';

    filtered.forEach(rem => {
        const card = document.createElement('div');
        const isContinuous = rem.type === 'continuous';
        card.className = `reminder-item-card ${!rem.enabled ? 'paused' : ''}`;
        card.dataset.id = rem.id;

        // Content preview
        let bodyHtml = '';
        if (isContinuous) {
            const slots = rem.slots || [];
            let pillsHtml = '';
            slots.forEach(s => {
                pillsHtml += `
                    <div class="slot-summary-pill">
                        <strong>${s.name}:</strong> ${formatHourLabel(s.startHour)} - ${formatHourLabel(s.endHour)}
                    </div>
                `;
            });
            bodyHtml = `
                <div class="slots-pill-group">
                    ${pillsHtml || '<span class="text-muted">No slots configured</span>'}
                </div>
            `;
        } else {
            const ot = rem.oneTime || {};
            const isDelivered = ot.status === 'delivered';
            bodyHtml = `
                <div class="one-time-summary">
                    <div class="flex items-center gap-3">
                        <span class="one-time-time-tag">📅 ${ot.date || 'Today'} at ${ot.time || '00:00'}</span>
                        <span class="slot-status-badge ${isDelivered ? 'status-badge-delivered' : 'status-badge-pending'}">
                            ${isDelivered ? '✓ Delivered' : '⏳ Scheduled'}
                        </span>
                    </div>
                    <div class="reminder-content-box mt-2">
                        "${ot.message || 'No message'}"
                    </div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="reminder-top-row">
                <div class="reminder-meta-group">
                    <span class="type-tag ${isContinuous ? 'continuous' : 'one_time'}">
                        ${isContinuous ? '🔄 Daily Routine' : '🎯 One-Time'}
                    </span>
                    <h3 class="reminder-title">${rem.title}</h3>
                </div>

                <div class="recipient-badge">
                    <span>${rem.contactName || 'Recipient'}:</span>
                    <span class="phone">+${rem.phone}</span>
                </div>
            </div>

            <div>
                ${bodyHtml}
            </div>

            <div class="reminder-action-bar">
                <div class="flex items-center gap-2">
                    <span style="font-size: 0.78rem; color: var(--text-muted); font-weight: 600;">Status:</span>
                    <span style="font-size: 0.78rem; font-weight: 700; color: ${rem.enabled ? '#34d399' : '#94a3b8'};">
                        ${rem.enabled ? 'Active' : 'Paused'}
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    <button class="btn btn-sm btn-outline btn-test-reminder" data-id="${rem.id}">
                        ⚡ Send Test
                    </button>
                    <button class="btn btn-sm btn-secondary btn-edit-reminder" data-id="${rem.id}">
                        ✏️ Edit
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-delete-reminder" data-id="${rem.id}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;

        remindersContainer.appendChild(card);
    });

    // Attach Action Listeners
    document.querySelectorAll('.btn-test-reminder').forEach(b => {
        b.addEventListener('click', () => handleTestReminder(b.dataset.id));
    });
    document.querySelectorAll('.btn-edit-reminder').forEach(b => {
        b.addEventListener('click', () => openEditModal(b.dataset.id));
    });
    document.querySelectorAll('.btn-delete-reminder').forEach(b => {
        b.addEventListener('click', () => handleDeleteReminder(b.dataset.id));
    });
}

// -------------------------------------------------------------
// Render Today's Live Schedule Timeline
// -------------------------------------------------------------
function renderScheduleTimeline() {
    const plan = appState.scheduler?.dailyPlan;
    if (!plan || !Array.isArray(plan.items) || plan.items.length === 0) {
        slotsTimeline.innerHTML = '<div class="empty-state">No scheduled reminders active for today. Add a reminder to start!</div>';
        planDateBadge.textContent = 'No schedule today';
        return;
    }

    planDateBadge.textContent = `Today: ${plan.date} (${plan.timezone || 'Asia/Kolkata'})`;
    slotsTimeline.innerHTML = '';

    plan.items.forEach(item => {
        const card = document.createElement('div');
        const isDelivered = item.sent && item.status === 'delivered';
        const isPending = !item.sent && item.enabled;
        card.className = `slot-card ${isDelivered ? 'delivered' : isPending ? 'pending' : 'disabled'}`;

        let statusBadge = '';
        if (isDelivered) {
            statusBadge = `<span class="slot-status-badge status-badge-delivered">✓ Delivered at ${formatTime12h(item.sentAt?.split('T')[1]?.split('.')[0])}</span>`;
        } else if (isPending) {
            statusBadge = `<span class="slot-status-badge status-badge-pending">⏳ Scheduled</span>`;
        } else {
            statusBadge = `<span class="slot-status-badge status-badge-disabled">⚪ Disabled</span>`;
        }

        const isContinuous = item.type === 'continuous';
        const subLabel = isContinuous
            ? `Daily Window: ${formatHourLabel(item.startHour)} - ${formatHourLabel(item.endHour)}`
            : `One-Time Message`;

        card.innerHTML = `
            <div class="slot-card-left">
                <div class="flex items-center gap-2">
                    <span class="type-tag ${isContinuous ? 'continuous' : 'one_time'}" style="font-size: 0.65rem;">
                        ${isContinuous ? 'Daily' : 'One-Time'}
                    </span>
                    <span class="slot-card-title">${item.reminderTitle} (${item.slotName})</span>
                </div>
                <span class="slot-card-sub">To: +${item.phone} (${item.contactName}) • ${subLabel}</span>
            </div>

            <div class="slot-target-bubble">
                <span class="target-label">Target Time</span>
                <span class="target-time">${formatTime12h(item.targetTime)}</span>
            </div>

            <div>
                ${statusBadge}
            </div>
        `;

        slotsTimeline.appendChild(card);
    });
}

// -------------------------------------------------------------
// Render History Logs Table
// -------------------------------------------------------------
function renderHistory() {
    const history = appState.scheduler?.history || [];
    historyCounter.textContent = `${history.length} Delivered`;

    if (history.length === 0) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">No reminders delivered yet.</td>
            </tr>
        `;
        return;
    }

    historyTableBody.innerHTML = '';
    history.forEach(item => {
        const tr = document.createElement('tr');
        const timeFormatted = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateFormatted = new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600;">${timeFormatted}</div>
                <div style="font-size: 0.7rem; color: var(--text-sub);">${dateFormatted}</div>
            </td>
            <td>
                <span class="mono-text">+${item.phone}</span>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${item.contactName || ''}</div>
            </td>
            <td style="max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.message}">
                ${item.message}
            </td>
            <td>
                <span style="color: #34d399; font-weight: 700; font-size: 0.76rem;">✓ Delivered</span>
            </td>
        `;
        historyTableBody.appendChild(tr);
    });
}

// -------------------------------------------------------------
// Modal Dialog Controller
// -------------------------------------------------------------
function getModalSlotsTemplate(existingSlots = null) {
    const defaults = [
        { id: 1, name: 'Morning Medicine', startHour: 8, endHour: 9, message: 'Good morning! Time for your morning medicines 💊 Have a great day!', enabled: true },
        { id: 2, name: 'Afternoon Medicine', startHour: 13, endHour: 14, message: 'Afternoon reminder! Please remember to take your afternoon medicines 💧 Stay hydrated!', enabled: true },
        { id: 3, name: 'Night Medicine', startHour: 20, endHour: 21, message: 'Good evening! Don\'t forget to take your night medicines 🌙 Sleep well!', enabled: true }
    ];

    const slots = Array.isArray(existingSlots) && existingSlots.length > 0 ? existingSlots : defaults;
    let html = '';

    slots.forEach(slot => {
        let optionsHtml = '';
        for (let i = 0; i < 24; i++) {
            const selected = i === slot.startHour ? 'selected' : '';
            optionsHtml += `<option value="${i}" ${selected}>${formatHourLabel(i)} - ${formatHourLabel(i + 1)}</option>`;
        }

        html += `
            <div class="modal-slot-card" data-slot-id="${slot.id}">
                <div class="modal-slot-row">
                    <input type="checkbox" class="modal-slot-en" id="ms_en_${slot.id}" ${slot.enabled ? 'checked' : ''}>
                    <span class="modal-slot-title">${slot.name}</span>
                    <select class="modal-slot-hour ml-auto" style="width: auto; min-width: 140px;">
                        ${optionsHtml}
                    </select>
                </div>
                <textarea class="modal-slot-msg" rows="2" placeholder="Reminder message...">${slot.message || ''}</textarea>
            </div>
        `;
    });

    return html;
}

function updateModalTypeUI(type) {
    if (type === 'continuous') {
        typeCardContinuous.classList.add('selected');
        typeCardOneTime.classList.remove('selected');
        continuousFieldsSection.classList.remove('hidden');
        oneTimeFieldsSection.classList.add('hidden');
    } else {
        typeCardOneTime.classList.add('selected');
        typeCardContinuous.classList.remove('selected');
        oneTimeFieldsSection.classList.remove('hidden');
        continuousFieldsSection.classList.add('hidden');
    }
}

function openCreateModal() {
    modalTitle.textContent = 'Add New Reminder';
    editReminderId.value = '';
    inputTitle.value = '';
    inputPhone.value = '';
    inputContactName.value = '';
    inputEnabled.value = 'true';

    document.querySelector('input[name="reminderType"][value="continuous"]').checked = true;
    updateModalTypeUI('continuous');

    modalSlotsContainer.innerHTML = getModalSlotsTemplate();

    // Default One-Time date to today or tomorrow
    const today = new Date().toISOString().split('T')[0];
    inputOneTimeDate.value = today;
    inputOneTimeTime.value = '00:00';
    inputOneTimeMessage.value = 'Happy Birthday!! 🎂🎉 Wishing you the most amazing year ahead!';

    reminderModal.classList.remove('hidden');
}

function openEditModal(reminderId) {
    const rem = (appState.config?.reminders || []).find(r => r.id === reminderId);
    if (!rem) return;

    modalTitle.textContent = 'Edit Reminder';
    editReminderId.value = rem.id;
    inputTitle.value = rem.title || '';
    inputPhone.value = rem.phone || '';
    inputContactName.value = rem.contactName || '';
    inputEnabled.value = rem.enabled ? 'true' : 'false';

    const typeRadio = document.querySelector(`input[name="reminderType"][value="${rem.type}"]`);
    if (typeRadio) typeRadio.checked = true;
    updateModalTypeUI(rem.type);

    if (rem.type === 'continuous') {
        modalSlotsContainer.innerHTML = getModalSlotsTemplate(rem.slots);
    } else {
        const ot = rem.oneTime || {};
        inputOneTimeDate.value = ot.date || new Date().toISOString().split('T')[0];
        inputOneTimeTime.value = ot.time || '00:00';
        inputOneTimeMessage.value = ot.message || '';
    }

    reminderModal.classList.remove('hidden');
}

function closeModal() {
    reminderModal.classList.add('hidden');
}

// Type selection toggle
document.querySelectorAll('input[name="reminderType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateModalTypeUI(e.target.value);
    });
});

// Modal Buttons
btnOpenNewModal.addEventListener('click', openCreateModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

// Modal Form Submit (Create or Update)
reminderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btnSaveReminderModal');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const id = editReminderId.value;
    const type = document.querySelector('input[name="reminderType"]:checked').value;

    const payload = {
        title: inputTitle.value.trim(),
        type,
        phone: inputPhone.value.trim(),
        contactName: inputContactName.value.trim(),
        enabled: inputEnabled.value === 'true'
    };

    if (type === 'continuous') {
        const slotCards = modalSlotsContainer.querySelectorAll('.modal-slot-card');
        payload.slots = Array.from(slotCards).map((card, idx) => {
            const slotId = parseInt(card.dataset.slotId, 10);
            const enabled = card.querySelector('.modal-slot-en').checked;
            const startHour = parseInt(card.querySelector('.modal-slot-hour').value, 10);
            const message = card.querySelector('.modal-slot-msg').value.trim();
            const names = ['Morning Medicine', 'Afternoon Medicine', 'Night Medicine'];

            return {
                id: slotId,
                name: names[idx] || `Slot ${slotId}`,
                startHour,
                endHour: (startHour + 1) % 24,
                message,
                enabled
            };
        });
    } else {
        payload.oneTime = {
            date: inputOneTimeDate.value,
            time: inputOneTimeTime.value,
            message: inputOneTimeMessage.value.trim()
        };
    }

    try {
        const url = id ? `/api/reminders/${id}` : '/api/reminders';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Reminder "${payload.title}" saved successfully! 🎉`, 'success');
            appState.config = data.config;
            renderRemindersList();
            closeModal();
            fetchStatus();
        } else {
            showToast(data.error || 'Failed to save reminder', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Reminder';
    }
});

// Delete Reminder Handler
async function handleDeleteReminder(reminderId) {
    const rem = (appState.config?.reminders || []).find(r => r.id === reminderId);
    const confirmDelete = confirm(`Are you sure you want to delete "${rem?.title || 'this reminder'}"?`);
    if (!confirmDelete) return;

    try {
        const res = await fetch(`/api/reminders/${reminderId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Reminder deleted successfully! 🗑️', 'info');
            appState.config = data.config;
            renderRemindersList();
            fetchStatus();
        } else {
            showToast(data.error || 'Failed deleting reminder', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Test Reminder Handler
async function handleTestReminder(reminderId) {
    showToast('Sending test message to WhatsApp... ⏳', 'info');
    try {
        const res = await fetch(`/api/reminders/${reminderId}/test`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Test reminder delivered to recipient WhatsApp! 🚀', 'success');
            fetchStatus();
        } else {
            showToast(data.error || 'Failed sending test reminder', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// Filter Pills
document.querySelectorAll('.filter-pills .pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeFilter = e.currentTarget.dataset.filter;
        renderRemindersList();
    });
});

// Global Settings Form
globalSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btnSaveGlobalSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timezone: selTimezone.value,
                catchUpIfMissed: chkCatchUp.checked
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('System settings updated! ⚙️', 'success');
            appState.config = data.config;
            startClock();
        } else {
            showToast(data.error || 'Failed saving settings', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save System Settings';
    }
});

// Re-roll Today's Random Times
btnRerollPlan.addEventListener('click', async () => {
    btnRerollPlan.disabled = true;
    try {
        const res = await fetch('/api/regenerate-plan', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Re-rolled today\'s random minutes! 🎲', 'success');
            if (appState.scheduler) appState.scheduler.dailyPlan = data.dailyPlan;
            renderScheduleTimeline();
        } else {
            showToast(data.error || 'Failed to re-roll schedule', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btnRerollPlan.disabled = false;
    }
});

// Unpair WhatsApp Device
btnUnpair.addEventListener('click', async () => {
    const confirmLogout = confirm('Are you sure you want to unpair this WhatsApp account?');
    if (!confirmLogout) return;

    btnUnpair.disabled = true;
    btnUnpair.textContent = 'Unpairing...';

    try {
        const res = await fetch('/api/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Device unpaired. Loading fresh QR...', 'info');
        } else {
            showToast(data.error || 'Failed to unpair device', 'error');
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btnUnpair.disabled = false;
        btnUnpair.textContent = 'Unpair';
    }
});

// -------------------------------------------------------------
// SSE & Data Fetching
// -------------------------------------------------------------
function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/events');

    eventSource.onmessage = (e) => {
        try {
            const { type, data } = JSON.parse(e.data);

            if (type === 'INIT') {
                appState = { ...appState, ...data };
                renderDeviceState();
                renderSystemSettings();
                renderRemindersList();
                renderScheduleTimeline();
                renderHistory();
                startClock();
            } else if (type === 'QR') {
                appState.currentQR = data.qr;
                renderDeviceState();
            } else if (type === 'STATE_CHANGE') {
                appState.connectionState = data.state;
                if (data.user) appState.connectedUser = data.user;
                renderDeviceState();
            } else if (type === 'CONFIG_UPDATE') {
                appState.config = data.config;
                renderSystemSettings();
                renderRemindersList();
                startClock();
            } else if (type === 'SCHEDULE_UPDATE') {
                if (appState.scheduler) {
                    appState.scheduler.dailyPlan = data.dailyPlan;
                }
                renderScheduleTimeline();
            } else if (type === 'REMINDER_SENT') {
                showToast(`Reminder delivered to +${data.phone} (${data.reminderTitle})! 💊`, 'success');
                fetchStatus();
            }
        } catch (err) {
            console.error('[SSE ERROR]', err);
        }
    };

    eventSource.onerror = () => {
        setTimeout(fetchStatus, 3000);
    };
}

async function fetchStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        appState = { ...appState, ...data };
        renderDeviceState();
        renderSystemSettings();
        renderRemindersList();
        renderScheduleTimeline();
        renderHistory();
        startClock();
    } catch (_) {}
}

window.addEventListener('DOMContentLoaded', () => {
    connectSSE();
    fetchStatus();
    startClock();
});
