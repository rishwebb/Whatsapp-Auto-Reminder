// PillPulse Multi-Target WhatsApp Reminder & Auto-Message Controller

let appState = {
    connectionState: 'DISCONNECTED',
    connectedUser: null,
    currentQR: null,
    cloud: { configured: false, connected: false, database: null },
    config: {
        timezone: 'Asia/Kolkata',
        catchUpIfMissed: true,
        simulateTyping: true,
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
const chkTyping = document.getElementById('chkTyping');
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
const btnAddSlot = document.getElementById('btnAddSlot');

const inputOneTimeDate = document.getElementById('inputOneTimeDate');
const inputOneTimeTime = document.getElementById('inputOneTimeTime');
const modalOneTimeMessagesContainer = document.getElementById('modalOneTimeMessagesContainer');
const btnAddOneTimeVariation = document.getElementById('btnAddOneTimeVariation');

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
    chkTyping.checked = appState.config.simulateTyping !== undefined ? Boolean(appState.config.simulateTyping) : true;
}

function formatTime12h(timeStr) {
    if (!timeStr) return '--:--';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const s = parts[2] ? `:${parts[2]}` : '';
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m}${s} ${suffix}`;
}

function calculateWindowSpanText(startStr, endStr) {
    const sParts = (startStr || '08:00').split(':').map(Number);
    const eParts = (endStr || '09:00').split(':').map(Number);
    let sMin = sParts[0] * 60 + (sParts[1] || 0);
    let eMin = eParts[0] * 60 + (eParts[1] || 0);
    if (eMin <= sMin) eMin += 1440;
    const diff = eMin - sMin;
    if (diff >= 60 && diff % 60 === 0) {
        return `${diff / 60}h window`;
    }
    if (diff >= 60) {
        return `${Math.floor(diff / 60)}h ${diff % 60}m window`;
    }
    return `${diff}m window`;
}

// -------------------------------------------------------------
// Render Configured Reminders List
// -------------------------------------------------------------
function renderRemindersList() {
    const reminders = appState.config?.reminders || [];

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

        let bodyHtml = '';
        if (isContinuous) {
            const slots = rem.slots || [];
            let pillsHtml = '';
            slots.forEach(s => {
                const span = calculateWindowSpanText(s.startTime, s.endTime);
                const varCount = Array.isArray(s.messages) ? s.messages.length : (s.message ? 1 : 0);
                pillsHtml += `
                    <div class="slot-summary-pill">
                        <strong>${s.name}:</strong> ${formatTime12h(s.startTime)} - ${formatTime12h(s.endTime)} (${span})
                        <span class="variations-badge">${varCount} var 🎲</span>
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
            const varCount = Array.isArray(ot.messages) ? ot.messages.length : 1;
            bodyHtml = `
                <div class="one-time-summary">
                    <div class="flex items-center gap-3">
                        <span class="one-time-time-tag">📅 ${ot.date || 'Today'} at ${formatTime12h(ot.time || '00:00')}</span>
                        <span class="variations-badge">${varCount} variation(s) 🎲</span>
                        <span class="slot-status-badge ${isDelivered ? 'status-badge-delivered' : 'status-badge-pending'}">
                            ${isDelivered ? '✓ Delivered' : '⏳ Scheduled'}
                        </span>
                    </div>
                    <div class="reminder-content-box mt-2">
                        "${(ot.messages && ot.messages[0]) || ot.message || 'No message'}"
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
        const spanText = isContinuous ? calculateWindowSpanText(item.startTime, item.endTime) : '';
        const subLabel = isContinuous
            ? `Window: ${formatTime12h(item.startTime)} - ${formatTime12h(item.endTime)} (${spanText})`
            : `One-Time Message`;

        const varCount = Array.isArray(item.messages) ? item.messages.length : 1;

        card.innerHTML = `
            <div class="slot-card-left">
                <div class="flex items-center gap-2">
                    <span class="type-tag ${isContinuous ? 'continuous' : 'one_time'}" style="font-size: 0.65rem;">
                        ${isContinuous ? 'Daily' : 'One-Time'}
                    </span>
                    <span class="slot-card-title">${item.reminderTitle} (${item.slotName})</span>
                    <span class="variations-badge">${varCount} var 🎲</span>
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
                <div>${item.message}</div>
                ${item.variationInfo ? `<span style="font-size: 0.68rem; color: var(--accent-purple);">${item.variationInfo}</span>` : ''}
            </td>
            <td>
                <span style="color: #34d399; font-weight: 700; font-size: 0.76rem;">✓ Delivered</span>
            </td>
        `;
        historyTableBody.appendChild(tr);
    });
}

// -------------------------------------------------------------
// Modal Dialog & Dynamic Slot/Variations Management
// -------------------------------------------------------------
let modalSlotCounter = 0;

function createSlotCardElement(slotData = null) {
    modalSlotCounter++;
    const slotId = slotData?.id || modalSlotCounter;
    const slotName = slotData?.name || `Slot ${slotId}`;
    const startTime = slotData?.startTime || '08:00';
    const endTime = slotData?.endTime || '09:00';
    const enabled = slotData?.enabled !== undefined ? Boolean(slotData.enabled) : true;

    const messages = Array.isArray(slotData?.messages) && slotData.messages.length > 0
        ? slotData.messages
        : (slotData?.message ? [slotData.message] : ['Friendly reminder 💊']);

    const card = document.createElement('div');
    card.className = 'modal-slot-card';
    card.dataset.slotId = slotId;

    let variationsHtml = '';
    messages.forEach((msg, idx) => {
        variationsHtml += `
            <div class="variation-row">
                <textarea class="slot-variation-msg" rows="2" placeholder="Reminder message variation...">${msg}</textarea>
                <button type="button" class="btn-remove-variation" title="Delete variation" ${messages.length === 1 ? 'style="display:none;"' : ''}>✕</button>
            </div>
        `;
    });

    const spanText = calculateWindowSpanText(startTime, endTime);

    card.innerHTML = `
        <div class="modal-slot-header">
            <div class="flex items-center gap-2">
                <input type="checkbox" class="modal-slot-en" id="slot_chk_${slotId}" ${enabled ? 'checked' : ''}>
                <input type="text" class="modal-slot-name" value="${slotName}" placeholder="Slot Name (e.g. Morning Medicine)" style="width: 200px; font-weight: 700;">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger btn-delete-slot">
                🗑️ Remove Slot
            </button>
        </div>

        <div class="window-inputs-row">
            <span class="text-xs text-muted" style="font-weight: 700;">WINDOW:</span>
            <input type="time" class="modal-slot-start" value="${startTime}">
            <span class="text-xs text-muted">to</span>
            <input type="time" class="modal-slot-end" value="${endTime}">
            <span class="window-span-badge">${spanText}</span>
        </div>

        <div>
            <div class="flex items-center justify-between mb-1">
                <label class="mb-0 text-xs">Text Variations (Picks 1 at random each day) 🎲</label>
                <button type="button" class="btn btn-sm btn-outline btn-add-variation py-1">
                    + Add Variation
                </button>
            </div>
            <div class="message-variations-container slot-variations-list">
                ${variationsHtml}
            </div>
            <small class="form-help">Tip: Use {name}, {time}, {date} placeholders.</small>
        </div>
    `;

    // Hook listeners inside slot card
    const startInput = card.querySelector('.modal-slot-start');
    const endInput = card.querySelector('.modal-slot-end');
    const spanBadge = card.querySelector('.window-span-badge');

    const updateSpan = () => {
        spanBadge.textContent = calculateWindowSpanText(startInput.value, endInput.value);
    };
    startInput.addEventListener('change', updateSpan);
    endInput.addEventListener('change', updateSpan);

    // Add variation listener
    const variationsList = card.querySelector('.slot-variations-list');
    const btnAddVar = card.querySelector('.btn-add-variation');

    btnAddVar.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'variation-row';
        row.innerHTML = `
            <textarea class="slot-variation-msg" rows="2" placeholder="Another text variation..."></textarea>
            <button type="button" class="btn-remove-variation" title="Delete variation">✕</button>
        `;
        row.querySelector('.btn-remove-variation').addEventListener('click', () => {
            row.remove();
            updateRemoveButtonsVisibility(variationsList);
        });
        variationsList.appendChild(row);
        updateRemoveButtonsVisibility(variationsList);
    });

    // Remove variation listeners
    variationsList.querySelectorAll('.btn-remove-variation').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.variation-row').remove();
            updateRemoveButtonsVisibility(variationsList);
        });
    });

    // Delete slot listener
    card.querySelector('.btn-delete-slot').addEventListener('click', () => {
        card.remove();
    });

    return card;
}

function updateRemoveButtonsVisibility(container) {
    const rows = container.querySelectorAll('.variation-row');
    rows.forEach(r => {
        const btn = r.querySelector('.btn-remove-variation');
        if (btn) btn.style.display = rows.length > 1 ? 'block' : 'none';
    });
}

function renderOneTimeMessagesUI(messages = null) {
    const list = Array.isArray(messages) && messages.length > 0 ? messages : ['Happy Birthday!! 🎂🎉'];
    modalOneTimeMessagesContainer.innerHTML = '';

    list.forEach(msg => {
        const row = document.createElement('div');
        row.className = 'variation-row';
        row.innerHTML = `
            <textarea class="ot-variation-msg" rows="2" placeholder="One-time message variation...">${msg}</textarea>
            <button type="button" class="btn-remove-variation" title="Delete variation" ${list.length === 1 ? 'style="display:none;"' : ''}>✕</button>
        `;
        row.querySelector('.btn-remove-variation').addEventListener('click', () => {
            row.remove();
            updateRemoveButtonsVisibility(modalOneTimeMessagesContainer);
        });
        modalOneTimeMessagesContainer.appendChild(row);
    });
}

btnAddOneTimeVariation.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'variation-row';
    row.innerHTML = `
        <textarea class="ot-variation-msg" rows="2" placeholder="Another message version..."></textarea>
        <button type="button" class="btn-remove-variation" title="Delete variation">✕</button>
    `;
    row.querySelector('.btn-remove-variation').addEventListener('click', () => {
        row.remove();
        updateRemoveButtonsVisibility(modalOneTimeMessagesContainer);
    });
    modalOneTimeMessagesContainer.appendChild(row);
    updateRemoveButtonsVisibility(modalOneTimeMessagesContainer);
});

btnAddSlot.addEventListener('click', () => {
    modalSlotsContainer.appendChild(createSlotCardElement());
});

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

    modalSlotsContainer.innerHTML = '';
    modalSlotCounter = 0;

    // Default 3 dynamic slots
    const defaults = [
        { id: 1, name: 'Morning Medicine', startTime: '08:00', endTime: '09:00', messages: ['Good morning! Time for your morning medicines 💊 Have a great day!', 'Morning! Quick reminder to take your meds and drink water 💧'] },
        { id: 2, name: 'Afternoon Medicine', startTime: '13:00', endTime: '14:00', messages: ['Afternoon reminder! Please remember your afternoon medicines 💧 Stay hydrated!', 'Hey! Don\'t forget your afternoon pills 💊'] },
        { id: 3, name: 'Night Medicine', startTime: '20:00', endTime: '21:00', messages: ['Good evening! Don\'t forget your night medicines before bed 🌙 Sleep well!', 'Night reminder! Time for your evening meds 💊 Sweet dreams!'] }
    ];

    defaults.forEach(d => modalSlotsContainer.appendChild(createSlotCardElement(d)));

    const today = new Date().toISOString().split('T')[0];
    inputOneTimeDate.value = today;
    inputOneTimeTime.value = '00:00';
    renderOneTimeMessagesUI(['Happy Birthday!! 🎂🎉 Wishing you the most wonderful year ahead!']);

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

    modalSlotsContainer.innerHTML = '';
    modalSlotCounter = 0;

    if (rem.type === 'continuous') {
        const slots = Array.isArray(rem.slots) && rem.slots.length > 0 ? rem.slots : [];
        slots.forEach(s => modalSlotsContainer.appendChild(createSlotCardElement(s)));
    } else {
        const ot = rem.oneTime || {};
        inputOneTimeDate.value = ot.date || new Date().toISOString().split('T')[0];
        inputOneTimeTime.value = ot.time || '00:00';
        renderOneTimeMessagesUI(ot.messages || (ot.message ? [ot.message] : null));
    }

    reminderModal.classList.remove('hidden');
}

function closeModal() {
    reminderModal.classList.add('hidden');
}

document.querySelectorAll('input[name="reminderType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateModalTypeUI(e.target.value);
    });
});

btnOpenNewModal.addEventListener('click', openCreateModal);
btnCloseModal.addEventListener('click', closeModal);
btnCancelModal.addEventListener('click', closeModal);

// Modal Form Submit
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
            const slotId = parseInt(card.dataset.slotId, 10) || (idx + 1);
            const enabled = card.querySelector('.modal-slot-en').checked;
            const name = card.querySelector('.modal-slot-name').value.trim() || `Slot ${idx + 1}`;
            const startTime = card.querySelector('.modal-slot-start').value || '08:00';
            const endTime = card.querySelector('.modal-slot-end').value || '09:00';

            const varInputs = card.querySelectorAll('.slot-variation-msg');
            const messages = Array.from(varInputs).map(i => i.value.trim()).filter(Boolean);

            return {
                id: slotId,
                name,
                startTime,
                endTime,
                messages: messages.length > 0 ? messages : ['Friendly reminder 💊'],
                enabled
            };
        });
    } else {
        const otInputs = modalOneTimeMessagesContainer.querySelectorAll('.ot-variation-msg');
        const messages = Array.from(otInputs).map(i => i.value.trim()).filter(Boolean);

        payload.oneTime = {
            date: inputOneTimeDate.value,
            time: inputOneTimeTime.value,
            messages: messages.length > 0 ? messages : ['Happy Birthday! 🎂']
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
            showToast(`Reminder "${payload.title}" saved! 🎉`, 'success');
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
    showToast('Simulating typing & sending test to WhatsApp... ⏳', 'info');
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
                catchUpIfMissed: chkCatchUp.checked,
                simulateTyping: chkTyping.checked
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

// Re-roll Plan
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

// SSE Stream
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
