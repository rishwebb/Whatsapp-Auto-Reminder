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

const AUTH_TOKEN_KEY = 'pillpulse_auth_token';

function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

function setAuthToken(token) {
    if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

function showLockScreen() {
    const loginOverlay = document.getElementById('loginOverlay');
    const btnLockDashboard = document.getElementById('btnLockDashboard');
    if (loginOverlay) {
        loginOverlay.classList.remove('hidden');
        const pwdInput = document.getElementById('loginPasswordInput');
        if (pwdInput) {
            pwdInput.value = '';
            setTimeout(() => pwdInput.focus(), 150);
        }
    }
    if (btnLockDashboard) btnLockDashboard.classList.add('hidden');
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
}

function hideLockScreen() {
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.classList.add('hidden');
    const currentHash = window.location.hash;
    if (currentHash === '#reminders') {
        switchView('reminders');
    } else if (currentHash === '#construction') {
        switchView('construction');
    } else {
        switchView('portal');
    }
}

async function authFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = {
        ...(options.headers || {})
    };
    if (token) {
        headers['x-access-token'] = token;
    }

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        setAuthToken('');
        showLockScreen();
        throw new Error('Authentication required');
    }
    return res;
}

let activeFilter = 'all';
let eventSource = null;
let clockInterval = null;

// Views & Navigation Elements
const portalHomeView = document.getElementById('portalHomeView');
const constructionView = document.getElementById('constructionView');
const remindersView = document.getElementById('remindersView');
const btnNavJapanese = document.getElementById('btnNavJapanese');
const btnNavReminders = document.getElementById('btnNavReminders');
const btnBackToPortalFromReminders = document.getElementById('btnBackToPortalFromReminders');
const btnBackFromConstruction = document.getElementById('btnBackFromConstruction');

function switchView(viewName) {
    if (portalHomeView) portalHomeView.classList.add('hidden');
    if (constructionView) constructionView.classList.add('hidden');
    if (remindersView) remindersView.classList.add('hidden');
    if (mobileFabAdd) mobileFabAdd.classList.add('hidden');

    if (viewName === 'reminders') {
        if (remindersView) remindersView.classList.remove('hidden');
        if (mobileFabAdd && window.innerWidth <= 768) mobileFabAdd.classList.remove('hidden');
        window.location.hash = '#reminders';
    } else if (viewName === 'construction') {
        if (constructionView) constructionView.classList.remove('hidden');
        window.location.hash = '#construction';
    } else {
        if (portalHomeView) portalHomeView.classList.remove('hidden');
        window.location.hash = '#portal';
    }
}

btnNavReminders?.addEventListener('click', () => switchView('reminders'));
btnNavJapanese?.addEventListener('click', () => switchView('construction'));
btnBackToPortalFromReminders?.addEventListener('click', () => switchView('portal'));
btnBackFromConstruction?.addEventListener('click', () => switchView('portal'));

window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash === '#reminders') switchView('reminders');
    else if (hash === '#construction') switchView('construction');
    else switchView('portal');
});

// DOM Elements
const btnLockDashboard = document.getElementById('btnLockDashboard');
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
const deviceCard = document.getElementById('deviceCard');

// WhatsApp Device Modal Elements
const deviceModal = document.getElementById('deviceModal');
const btnDeviceMenu = document.getElementById('btnDeviceMenu');
const btnCloseDeviceModal = document.getElementById('btnCloseDeviceModal');
const btnCloseDeviceModalFooter = document.getElementById('btnCloseDeviceModalFooter');
const btnModalUnpair = document.getElementById('btnModalUnpair');
const modalConnectedName = document.getElementById('modalConnectedName');
const modalConnectedPhone = document.getElementById('modalConnectedPhone');
const modalWaConnectedSection = document.getElementById('modalWaConnectedSection');
const modalWaDisconnectedSection = document.getElementById('modalWaDisconnectedSection');
const btnModalGoToQr = document.getElementById('btnModalGoToQr');

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
const historyFooter = document.getElementById('historyFooter');
const btnToggleHistory = document.getElementById('btnToggleHistory');
const toggleHistoryText = document.getElementById('toggleHistoryText');
const toggleHistoryIcon = document.getElementById('toggleHistoryIcon');
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
const mobileFabAdd = document.getElementById('mobileFabAdd');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');

// -------------------------------------------------------------
// Toast Helper
// -------------------------------------------------------------
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let iconSvg = `<svg class="icon-svg toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    if (type === 'success') {
        iconSvg = `<svg class="icon-svg toast-svg text-success" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="icon-svg toast-svg text-danger" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    }

    toast.innerHTML = `<span class="toast-icon-wrap">${iconSvg}</span><span>${message}</span>`;
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

        // Hide WhatsApp card from main feed to prevent mistouches and clutter
        if (deviceCard) deviceCard.classList.add('hidden');

        const u = appState.connectedUser;
        const phone = u?.id ? u.id.split(':')[0] : 'Linked User';
        connectedPhone.textContent = `+${phone}`;
        connectedName.textContent = u?.name ? `${u.name}'s Account` : 'Active WhatsApp Session';

        if (modalConnectedPhone) modalConnectedPhone.textContent = `+${phone}`;
        if (modalConnectedName) modalConnectedName.textContent = u?.name ? `${u.name}'s Account` : 'Active WhatsApp Session';
        if (modalWaConnectedSection) modalWaConnectedSection.classList.remove('hidden');
        if (modalWaDisconnectedSection) modalWaDisconnectedSection.classList.add('hidden');
    } else if (state === 'QR_READY' && appState.currentQR) {
        waDot.classList.add('dot-amber');
        waStatusText.textContent = 'Scan QR Code';

        waConnectingView.classList.add('hidden');
        waConnectedView.classList.add('hidden');
        waQrView.classList.remove('hidden');
        btnUnpair.classList.add('hidden');

        // Show device card on dashboard so user can scan QR
        if (deviceCard) deviceCard.classList.remove('hidden');

        qrImage.src = appState.currentQR;

        if (modalWaConnectedSection) modalWaConnectedSection.classList.add('hidden');
        if (modalWaDisconnectedSection) modalWaDisconnectedSection.classList.remove('hidden');
    } else {
        waDot.classList.add('dot-red');
        waStatusText.textContent = state === 'CONNECTING' ? 'Connecting...' : 'Disconnected';

        waQrView.classList.add('hidden');
        waConnectedView.classList.add('hidden');
        waConnectingView.classList.remove('hidden');
        btnUnpair.classList.add('hidden');

        // Show device card on dashboard while connecting
        if (deviceCard) deviceCard.classList.remove('hidden');

        if (modalWaConnectedSection) modalWaConnectedSection.classList.add('hidden');
        if (modalWaDisconnectedSection) modalWaDisconnectedSection.classList.remove('hidden');
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

function formatIsoToLocalTime(isoStr) {
    if (!isoStr) return '--:--';
    try {
        const d = new Date(isoStr);
        const tz = appState.config?.timezone || 'Asia/Kolkata';
        return d.toLocaleTimeString('en-US', {
            timeZone: tz,
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (_) {
        return formatTime12h(isoStr.split('T')[1]?.split('.')[0]);
    }
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
                        <span class="variations-badge">
                            <svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                <path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>
                            </svg>
                            ${varCount} var
                        </span>
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
                        <span class="one-time-time-tag">
                            <svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            ${ot.date || 'Today'} at ${formatTime12h(ot.time || '00:00')}
                        </span>
                        <span class="variations-badge">
                            <svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                <path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>
                            </svg>
                            ${varCount} variation(s)
                        </span>
                        <span class="slot-status-badge ${isDelivered ? 'status-badge-delivered' : 'status-badge-pending'}">
                            ${isDelivered 
                                ? `<svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Delivered`
                                : `<svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Scheduled`}
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
                        ${isContinuous 
                            ? `<svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg> Daily Routine`
                            : `<svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> One-Time`}
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
                        <svg class="icon-svg btn-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                        <span>Send Test</span>
                    </button>
                    <button class="btn btn-sm btn-secondary btn-edit-reminder" data-id="${rem.id}">
                        <svg class="icon-svg btn-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        </svg>
                        <span>Edit</span>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-delete-reminder" data-id="${rem.id}">
                        <svg class="icon-svg btn-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                        <span>Delete</span>
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
            statusBadge = `<span class="slot-status-badge status-badge-delivered"><svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Delivered at ${formatIsoToLocalTime(item.sentAt)}</span>`;
        } else if (isPending) {
            statusBadge = `<span class="slot-status-badge status-badge-pending"><svg class="icon-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Scheduled</span>`;
        } else {
            statusBadge = `<span class="slot-status-badge status-badge-disabled">Disabled</span>`;
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
                    <span class="variations-badge">
                        <svg class="icon-svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                            <path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/>
                        </svg>
                        ${varCount} var
                    </span>
                </div>
                <span class="slot-card-sub">To: +${item.phone} (${item.contactName}) • ${subLabel}</span>
            </div>

            <div class="slot-target-bubble">
                <span class="target-label">Target Time</span>
                <span class="target-time">${formatTime12h(item.targetTime)}</span>
            </div>

            <div class="flex items-center gap-2">
                ${statusBadge}
                <button class="btn btn-xs btn-outline btn-timeline-delete" data-id="${item.reminderId}" title="Delete Reminder">
                    <svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;

        slotsTimeline.appendChild(card);
    });

    document.querySelectorAll('.btn-timeline-delete').forEach(b => {
        b.addEventListener('click', () => handleDeleteReminder(b.dataset.id));
    });
}

// -------------------------------------------------------------
// Render History Logs Table
// -------------------------------------------------------------
let isHistoryExpanded = false;
const HISTORY_INITIAL_LIMIT = 5;

const CHEVRON_UP_SVG = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const CHEVRON_DOWN_SVG = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

function renderHistory() {
    const history = appState.scheduler?.history || [];
    historyCounter.textContent = `${history.length} Delivered`;

    if (history.length === 0) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">No reminders delivered yet.</td>
            </tr>
        `;
        if (historyFooter) historyFooter.style.display = 'none';
        return;
    }

    if (history.length <= HISTORY_INITIAL_LIMIT) {
        if (historyFooter) historyFooter.style.display = 'none';
    } else {
        if (historyFooter) {
            historyFooter.style.display = 'flex';
            if (isHistoryExpanded) {
                if (toggleHistoryText) toggleHistoryText.textContent = 'View Less';
                if (toggleHistoryIcon) toggleHistoryIcon.innerHTML = CHEVRON_UP_SVG;
            } else {
                const remaining = history.length - HISTORY_INITIAL_LIMIT;
                if (toggleHistoryText) toggleHistoryText.textContent = `View More (${remaining} more)`;
                if (toggleHistoryIcon) toggleHistoryIcon.innerHTML = CHEVRON_DOWN_SVG;
            }
        }
    }

    const itemsToDisplay = isHistoryExpanded ? history : history.slice(0, HISTORY_INITIAL_LIMIT);

    historyTableBody.innerHTML = '';
    itemsToDisplay.forEach(item => {
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
                <span style="color: #34d399; font-weight: 700; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px;">
                    <svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span>Delivered</span>
                </span>
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
        : (slotData?.message ? [slotData.message] : ['Friendly reminder']);

    const card = document.createElement('div');
    card.className = 'modal-slot-card';
    card.dataset.slotId = slotId;

    const REMOVE_X_SVG = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    let variationsHtml = '';
    messages.forEach((msg, idx) => {
        variationsHtml += `
            <div class="variation-row">
                <textarea class="slot-variation-msg" rows="2" placeholder="Reminder message variation...">${msg}</textarea>
                <button type="button" class="btn-remove-variation" title="Delete variation" ${messages.length === 1 ? 'style="display:none;"' : ''}>${REMOVE_X_SVG}</button>
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
                <svg class="icon-svg btn-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                <span>Remove Slot</span>
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
                <label class="mb-0 text-xs">Text Variations (Picks 1 at random each day)</label>
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
            <button type="button" class="btn-remove-variation" title="Delete variation">${REMOVE_X_SVG}</button>
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
    const REMOVE_X_SVG = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const list = Array.isArray(messages) && messages.length > 0 ? messages : ['Happy Birthday! Wishing you the most wonderful year ahead!'];
    modalOneTimeMessagesContainer.innerHTML = '';

    list.forEach(msg => {
        const row = document.createElement('div');
        row.className = 'variation-row';
        row.innerHTML = `
            <textarea class="ot-variation-msg" rows="2" placeholder="One-time message variation...">${msg}</textarea>
            <button type="button" class="btn-remove-variation" title="Delete variation" ${list.length === 1 ? 'style="display:none;"' : ''}>${REMOVE_X_SVG}</button>
        `;
        row.querySelector('.btn-remove-variation').addEventListener('click', () => {
            row.remove();
            updateRemoveButtonsVisibility(modalOneTimeMessagesContainer);
        });
        modalOneTimeMessagesContainer.appendChild(row);
    });
}

btnAddOneTimeVariation.addEventListener('click', () => {
    const REMOVE_X_SVG = `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const row = document.createElement('div');
    row.className = 'variation-row';
    row.innerHTML = `
        <textarea class="ot-variation-msg" rows="2" placeholder="Another message version..."></textarea>
        <button type="button" class="btn-remove-variation" title="Delete variation">${REMOVE_X_SVG}</button>
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
        { id: 1, name: 'Morning Medicine', startTime: '08:00', endTime: '09:00', messages: ['Good morning! Time for your morning medicines. Have a great day!', 'Morning! Quick reminder to take your meds and drink water.'] },
        { id: 2, name: 'Afternoon Medicine', startTime: '13:00', endTime: '14:00', messages: ['Afternoon reminder! Please remember your afternoon medicines. Stay hydrated!', 'Hey! Don\'t forget your afternoon pills.'] },
        { id: 3, name: 'Night Medicine', startTime: '20:00', endTime: '21:00', messages: ['Good evening! Don\'t forget your night medicines before bed. Sleep well!', 'Night reminder! Time for your evening meds. Sweet dreams!'] }
    ];

    defaults.forEach(d => modalSlotsContainer.appendChild(createSlotCardElement(d)));

    const today = new Date().toISOString().split('T')[0];
    inputOneTimeDate.value = today;
    inputOneTimeTime.value = '00:00';
    renderOneTimeMessagesUI(['Happy Birthday! Wishing you the most wonderful year ahead!']);

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
if (mobileFabAdd) mobileFabAdd.addEventListener('click', openCreateModal);
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
                messages: messages.length > 0 ? messages : ['Friendly reminder'],
                enabled
            };
        });
    } else {
        const otInputs = modalOneTimeMessagesContainer.querySelectorAll('.ot-variation-msg');
        const messages = Array.from(otInputs).map(i => i.value.trim()).filter(Boolean);

        payload.oneTime = {
            date: inputOneTimeDate.value,
            time: inputOneTimeTime.value,
            messages: messages.length > 0 ? messages : ['Happy Birthday! Wishing you the most wonderful year ahead!']
        };
    }

    try {
        const url = id ? `/api/reminders/${id}` : '/api/reminders';
        const method = id ? 'PUT' : 'POST';

        const res = await authFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            showToast(`Reminder "${payload.title}" saved!`, 'success');
            appState.config = data.config;
            renderRemindersList();
            if (remindersListCard) remindersListCard.classList.remove('is-collapsed');
            closeModal();
            fetchStatus();
        } else {
            showToast(data.error || 'Failed to save reminder', 'error');
        }
    } catch (err) {
        if (err.message !== 'Authentication required') {
            showToast(err.message, 'error');
        }
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
        const res = await authFetch(`/api/reminders/${reminderId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Reminder deleted successfully!', 'info');
            appState.config = data.config;
            renderRemindersList();
            fetchStatus();
        } else {
            showToast(data.error || 'Failed deleting reminder', 'error');
        }
    } catch (err) {
        if (err.message !== 'Authentication required') {
            showToast(err.message, 'error');
        }
    }
}

// Test Reminder Handler
async function handleTestReminder(reminderId) {
    showToast('Simulating typing & sending test to WhatsApp...', 'info');
    try {
        const res = await authFetch(`/api/reminders/${reminderId}/test`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Test reminder delivered to recipient WhatsApp!', 'success');
            fetchStatus();
        } else {
            showToast(data.error || 'Failed sending test reminder', 'error');
        }
    } catch (err) {
        if (err.message !== 'Authentication required') {
            showToast(err.message, 'error');
        }
    }
}

// Filter Pills
document.querySelectorAll('.filter-pills .pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeFilter = e.currentTarget.dataset.filter;
        renderRemindersList();
        if (remindersListCard) remindersListCard.classList.remove('is-collapsed');
    });
});

// Global Settings Form
globalSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('btnSaveGlobalSettings');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const payload = {
        timezone: selTimezone.value,
        catchUpIfMissed: chkCatchUp.checked,
        simulateTyping: chkTyping.checked
    };

    try {
        const res = await authFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            showToast('System settings updated!', 'success');
            appState.config = data.config;
            startClock();
        } else {
            showToast(data.error || 'Failed saving settings', 'error');
        }
    } catch (err) {
        if (err.message !== 'Authentication required') {
            showToast(err.message, 'error');
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save System Settings';
    }
});

// Re-roll Plan
btnRerollPlan.addEventListener('click', async () => {
    btnRerollPlan.disabled = true;
    try {
        const res = await authFetch('/api/regenerate-plan', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Re-rolled today\'s random minutes!', 'success');
            if (appState.scheduler) appState.scheduler.dailyPlan = data.dailyPlan;
            renderScheduleTimeline();
        } else {
            showToast(data.error || 'Failed to re-roll schedule', 'error');
        }
    } catch (err) {
        if (err.message !== 'Authentication required') {
            showToast(err.message, 'error');
        }
    } finally {
        btnRerollPlan.disabled = false;
    }
});

// Unpair WhatsApp Device
async function handleUnpair() {
    const confirmLogout = confirm('Are you sure you want to unpair this WhatsApp account?');
    if (!confirmLogout) return;

    if (btnUnpair) {
        btnUnpair.disabled = true;
        btnUnpair.textContent = 'Unpairing...';
    }
    if (btnModalUnpair) {
        btnModalUnpair.disabled = true;
        btnModalUnpair.textContent = 'Unpairing...';
    }

    try {
        const res = await authFetch('/api/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Device unpaired. Loading fresh QR...', 'info');
            closeDeviceModal();
        } else {
            showToast(data.error || 'Failed to unpair device', 'error');
        }
    } catch (err) {
        if (err.message !== 'Authentication required') {
            showToast(err.message, 'error');
        }
    } finally {
        if (btnUnpair) {
            btnUnpair.disabled = false;
            btnUnpair.textContent = 'Unpair';
        }
        if (btnModalUnpair) {
            btnModalUnpair.disabled = false;
            btnModalUnpair.textContent = 'Unpair WhatsApp Account';
        }
    }
}

function openDeviceModal() {
    if (deviceModal) deviceModal.classList.remove('hidden');
}

function closeDeviceModal() {
    if (deviceModal) deviceModal.classList.add('hidden');
}

btnDeviceMenu?.addEventListener('click', openDeviceModal);
waStatusPill?.addEventListener('click', openDeviceModal);
btnCloseDeviceModal?.addEventListener('click', closeDeviceModal);
btnCloseDeviceModalFooter?.addEventListener('click', closeDeviceModal);
deviceModal?.addEventListener('click', (e) => {
    if (e.target === deviceModal) closeDeviceModal();
});
btnModalGoToQr?.addEventListener('click', () => {
    closeDeviceModal();
    if (deviceCard) {
        deviceCard.classList.remove('hidden');
        deviceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

btnUnpair?.addEventListener('click', handleUnpair);
btnModalUnpair?.addEventListener('click', handleUnpair);

// Toggle Delivery History View More / View Less
btnToggleHistory?.addEventListener('click', () => {
    isHistoryExpanded = !isHistoryExpanded;
    renderHistory();
    if (!isHistoryExpanded) {
        document.getElementById('historyCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
});

// -------------------------------------------------------------
// Authentication & Lock Screen Controls
// -------------------------------------------------------------
const loginForm = document.getElementById('loginForm');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginErrorMsg = document.getElementById('loginErrorMsg');
const loginErrorText = document.getElementById('loginErrorText');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const btnTogglePasswordVis = document.getElementById('btnTogglePasswordVis');

async function checkAuthStatus() {
    try {
        const token = getAuthToken();
        const headers = token ? { 'x-access-token': token } : {};
        const res = await fetch('/api/auth/status', { headers });
        const data = await res.json();

        if (data.authRequired) {
            appState.hasPasswordSet = true;
            if (!data.isAuthenticated) {
                showLockScreen();
                return false;
            } else {
                hideLockScreen();
                btnLockDashboard?.classList.remove('hidden');
                return true;
            }
        } else {
            appState.hasPasswordSet = false;
            hideLockScreen();
            btnLockDashboard?.classList.add('hidden');
            return true;
        }
    } catch (_) {
        return true;
    }
}

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = loginPasswordInput?.value?.trim();
    if (!password) return;

    btnLoginSubmit.disabled = true;
    btnLoginSubmit.innerHTML = '<span>Verifying...</span>';
    loginErrorMsg.classList.add('hidden');

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (data.success) {
            if (data.token) {
                setAuthToken(data.token);
            }
            appState.hasPasswordSet = true;
            hideLockScreen();
            showToast('Dashboard unlocked!', 'success');
            connectSSE();
            fetchStatus();
        } else {
            loginErrorText.textContent = data.error || 'Incorrect password. Please try again.';
            loginErrorMsg.classList.remove('hidden');
            const card = document.querySelector('.login-card');
            card?.classList.add('shake');
            setTimeout(() => card?.classList.remove('shake'), 450);
            loginPasswordInput?.focus();
            loginPasswordInput?.select();
        }
    } catch (err) {
        loginErrorText.textContent = err.message || 'Connection failed. Please try again.';
        loginErrorMsg.classList.remove('hidden');
    } finally {
        btnLoginSubmit.disabled = false;
        btnLoginSubmit.innerHTML = '<span>Continue</span>';
    }
});

const EYE_SVG_ICON = `<svg class="icon-svg eye-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_SVG_ICON = `<svg class="icon-svg eye-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

btnTogglePasswordVis?.addEventListener('click', () => {
    if (!loginPasswordInput) return;
    if (loginPasswordInput.type === 'password') {
        loginPasswordInput.type = 'text';
        btnTogglePasswordVis.innerHTML = EYE_OFF_SVG_ICON;
    } else {
        loginPasswordInput.type = 'password';
        btnTogglePasswordVis.innerHTML = EYE_SVG_ICON;
    }
});

btnLockDashboard?.addEventListener('click', async () => {
    try {
        await authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
        setAuthToken('');
        showLockScreen();
        showToast('Dashboard locked', 'info');
    }
});

// Mobile Accordion Dropdowns for Reminders and History (Mobile Only)
const remindersListCard = document.getElementById('remindersListCard');
const remindersListCardHeader = document.getElementById('remindersListCardHeader');
const btnToggleRemindersCollapse = document.getElementById('btnToggleRemindersCollapse');

const historyCard = document.getElementById('historyCard');
const historyCardHeader = document.getElementById('historyCardHeader');
const btnToggleHistoryCollapse = document.getElementById('btnToggleHistoryCollapse');

function toggleRemindersCollapse(e) {
    if (window.innerWidth > 768) return; // Desktop remains full view
    if (e && e.target && e.target.closest('.filter-pills')) return;
    if (remindersListCard) {
        remindersListCard.classList.toggle('is-collapsed');
    }
}

function toggleHistoryCollapse(e) {
    if (window.innerWidth > 768) return; // Desktop remains full view
    if (historyCard) {
        historyCard.classList.toggle('is-collapsed');
    }
}

remindersListCardHeader?.addEventListener('click', toggleRemindersCollapse);
btnToggleRemindersCollapse?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRemindersCollapse();
});

historyCardHeader?.addEventListener('click', toggleHistoryCollapse);
btnToggleHistoryCollapse?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHistoryCollapse();
});

// SSE Stream
function connectSSE() {
    if (eventSource) eventSource.close();
    const token = getAuthToken();
    const sseUrl = token ? `/api/events?token=${encodeURIComponent(token)}` : '/api/events';
    eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (e) => {
        try {
            const { type, data } = JSON.parse(e.data);

            if (type === 'INIT') {
                appState = { ...appState, ...data };
                if (data.hasPasswordSet) {
                    btnLockDashboard?.classList.remove('hidden');
                }
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
                if (data.hasPasswordSet !== undefined) {
                    appState.hasPasswordSet = data.hasPasswordSet;
                    if (data.hasPasswordSet) btnLockDashboard?.classList.remove('hidden');
                }
                renderSystemSettings();
                renderRemindersList();
                startClock();
            } else if (type === 'SCHEDULE_UPDATE') {
                if (appState.scheduler) {
                    appState.scheduler.dailyPlan = data.dailyPlan;
                }
                renderScheduleTimeline();
            } else if (type === 'REMINDER_SENT') {
                showToast(`Reminder delivered to +${data.phone} (${data.reminderTitle})!`, 'success');
                fetchStatus();
            }
        } catch (err) {
            console.error('[SSE ERROR]', err);
        }
    };

    eventSource.onerror = () => {
        setTimeout(async () => {
            const authed = await checkAuthStatus();
            if (authed) fetchStatus();
        }, 3000);
    };
}

async function fetchStatus() {
    try {
        const res = await authFetch('/api/status');
        const data = await res.json();
        appState = { ...appState, ...data };
        if (data.hasPasswordSet) {
            btnLockDashboard?.classList.remove('hidden');
        }
        renderDeviceState();
        renderSystemSettings();
        renderRemindersList();
        renderScheduleTimeline();
        renderHistory();
        startClock();
    } catch (_) {}
}

window.addEventListener('DOMContentLoaded', async () => {
    startClock();
    const isAuthenticated = await checkAuthStatus();
    if (isAuthenticated) {
        connectSSE();
        fetchStatus();
        const currentHash = window.location.hash;
        if (currentHash === '#reminders') {
            switchView('reminders');
        } else if (currentHash === '#construction') {
            switchView('construction');
        } else {
            switchView('portal');
        }
    }
});
