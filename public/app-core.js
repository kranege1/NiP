// Disable LAN discovery when running over HTTPS (avoid mixed-content)
const IS_SECURE_PAGE = window.location.protocol === 'https:';
const IS_LOCALHOST = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const DISCOVERY_ENABLED = !IS_SECURE_PAGE && !IS_LOCALHOST;

/* Server auto-discovery for resilient local network connections */
async function discoverServerIP() {
    if (!DISCOVERY_ENABLED) {
        // On HTTPS production we stay on same origin to avoid mixed-content
        try { localStorage.removeItem('np_server_ip'); } catch (_) {}
        return null;
    }
    // Try cached IP first
    const cachedIP = localStorage.getItem('np_server_ip');
    if (cachedIP) {
        try {
            const res = await fetch(`http://${cachedIP}:3000/socket.io/socket.io.js`, { timeout: 500 });
            if (res.ok) {
                console.log('[Discovery] Using cached IP:', cachedIP);
                return cachedIP;
            }
        } catch (e) {
            console.log('[Discovery] Cached IP failed, scanning...');
        }
    }

    // Determine local network prefix (e.g., 192.168.1 from 192.168.1.50)
    const clientIP = new URLSearchParams(window.location.search).get('serverIP') || window.location.hostname;
    let prefix = '';
    if (clientIP.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        const parts = clientIP.split('.');
        prefix = parts.slice(0, 3).join('.');
    } else {
        // Fallback: assume 192.168.1
        prefix = '192.168.1';
    }

    // Scan last octet (1-254) in parallel, with early exit
    const port = 3000;
    const timeout = 500;
    const candidates = [];
    
    for (let i = 1; i <= 254; i++) {
        candidates.push(
            new Promise(resolve => {
                const ip = `${prefix}.${i}`;
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeout);
                
                fetch(`http://${ip}:${port}/socket.io/socket.io.js`, { 
                    signal: controller.signal,
                    mode: 'no-cors'
                })
                    .then(() => {
                        clearTimeout(timer);
                        console.log('[Discovery] Found server at:', ip);
                        resolve(ip);
                    })
                    .catch(() => {
                        clearTimeout(timer);
                        resolve(null);
                    });
            })
        );
    }

    // Find first responding IP
    const results = await Promise.all(candidates);
    const foundIP = results.find(ip => ip !== null);
    
    if (foundIP) {
        localStorage.setItem('np_server_ip', foundIP);
        console.log('[Discovery] Stored server IP:', foundIP);
        return foundIP;
    }

    // Fallback to localhost
    console.warn('[Discovery] No server found, using localhost');
    return 'localhost';
}

// Socket will be initialized synchronously with fallback to localhost
// Discovery happens in background and updates socket URL on next reconnect
let socket = io(undefined, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
});

// Attempt IP discovery in background for future reconnects (only on HTTP/local)
if (DISCOVERY_ENABLED) {
    (async () => {
        const discoveredIP = await discoverServerIP();
        if (discoveredIP && discoveredIP !== 'localhost') {
            console.log('[Discovery] Will use IP on next reconnect:', discoveredIP);
            // Store for next reconnect
            localStorage.setItem('np_server_ip', discoveredIP);
        }
    })();
}

// Auto-refresh when coming back online after a disconnect
let _wasOffline = false;
socket.on('disconnect', () => {
    console.warn('[APP] Socket disconnected – will refresh on reconnect');
    _wasOffline = true;
});
socket.on('connect', () => {
    if (_wasOffline) {
        console.log('[APP] Reconnected – refreshing page');
        _wasOffline = false;
        try { location.reload(); } catch (e) { /* ignore */ }
    }
});

/* Global state variables */
let APP_VERSION = 'NiP - V?';

let isHost = false;
let joined = false;
let myPlayerName = '';
let currentAnswers = [];
let currentQuestionText = '';
let connectionTimeout;
let voices = [];
let lastAutoAttempt = 0;
let latestVotes = {};
let answeredSoundPlayed = false;
let votedSoundPlayed = false;
let lastPlayers = [];
let lastSubmitted = [];
let playerPoints = {};
let adminSoundsEnabled = true;
let audioCtx = null;
let lastAdminPlayers = [];
let lastRealIndex = null;
let myGrokEnabled = false;
// Cache colors by normalized player name to avoid losing server-assigned colors
const colorCache = new Map();

function normalizeName(name) {
    const raw = String(name || '').trim();
    // Strip surrounding parentheses often used in answer reveal "(#Name)"
    const unwrapped = raw.replace(/^\((.*)\)$/,'$1');
    return unwrapped
        .replace(/^#/,'')
        .replace(/\s*\(offline\)\s*$/i,'')
        .trim();
}

// Client-side color palette + deterministic picker (aligned with server palette order)
const CLIENT_COLOR_PALETTE = ['#f44336','#e91e63','#9c27b0','#3f51b5','#03a9f4','#009688','#8bc34a','#ff9800','#607d8b','#9e847bff'];

function clientPickColorForName(name) {
    // Deterministic fallback hash so missing server colors don't all become pink
    const s = String(name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    const idx = Math.abs(h) % CLIENT_COLOR_PALETTE.length;
    return CLIENT_COLOR_PALETTE[idx];
}

function getColorForName(name) {
    const target = normalizeName(name);

    // 1) cache hit
    if (colorCache.has(target)) return colorCache.get(target);

    // 2) search known player lists and cache
    const lists = [lastPlayers || [], lastAdminPlayers || []];
    for (const list of lists) {
        for (const p of list) {
            if (!p) continue;
            const raw = (typeof p === 'string') ? p : (p.name || '');
            const cand = normalizeName(raw);
            if (cand === target && p && p.color) {
                colorCache.set(target, p.color);
                return p.color;
            }
        }
    }

    // 3) deterministic fallback
    const fallback = clientPickColorForName(name);
    colorCache.set(target, fallback);
    return fallback;
}

// Helper to merge color info into cache from server payloads
function cacheColorsFromList(list) {
    if (!Array.isArray(list)) return;
    list.forEach(p => {
        if (!p) return;
        const raw = (typeof p === 'string') ? p : (p.name || '');
        const cand = normalizeName(raw);
        if (p && p.color) colorCache.set(cand, p.color);
    });
}

function sortPlayersForDisplay(list) {
    if (!Array.isArray(list)) return [];
    const norm = entry => {
        const raw = (typeof entry === 'string') ? entry : (entry && entry.name) || '';
        return raw.replace(/\s*\(offline\)\s*$/i, '');
    };
    const isBot = entry => {
        if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'isBot')) return !!entry.isBot;
        return norm(entry).trim().startsWith('#');
    };
    const clean = entry => norm(entry).replace(/^#/, '').trim().toLowerCase();
    return [...list].sort((a, b) => {
        const botA = isBot(a);
        const botB = isBot(b);
        if (botA !== botB) return botA ? 1 : -1;
        const ca = clean(a);
        const cb = clean(b);
        if (ca < cb) return -1;
        if (ca > cb) return 1;
        return 0;
    });
}

// Sequencing + offline outbox (1h retention)
const LAST_SEQ_KEY = 'np_last_seq';
const OUTBOX_KEY = 'np_outbox_v1';
const OUTBOX_TTL = 60 * 60 * 1000;
let lastSeq = Number(localStorage.getItem(LAST_SEQ_KEY) || '0') || 0;
let outbox = [];
try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    outbox = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(outbox)) outbox = [];
} catch (e) {
    outbox = [];
}

/* Utility functions */
function debounce(fn, delay = 300) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
    };
}

function persistSeq(seq) {
    lastSeq = Math.max(lastSeq, Number(seq) || 0);
    localStorage.setItem(LAST_SEQ_KEY, String(lastSeq));
}

function saveOutbox() {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); } catch (e) { }
}

function cleanOutbox() {
    const cutoff = Date.now() - OUTBOX_TTL;
    outbox = (outbox || []).filter(item => item && item.ts && item.ts >= cutoff);
    if (outbox.length > 50) outbox = outbox.slice(-50);
    saveOutbox();
}

function emitBuffered(eventName, payload) {
    cleanOutbox();
    const entry = { eventName, payload, ts: Date.now() };
    if (socket.connected) {
        socket.emit(eventName, payload);
    } else {
        outbox.push(entry);
        saveOutbox();
    }
}

function flushOutbox() {
    cleanOutbox();
    if (!socket.connected || !outbox.length) return;
    const pending = [...outbox];
    outbox = [];
    pending.forEach(item => {
        try { socket.emit(item.eventName, item.payload); } catch (e) { }
    });
    saveOutbox();
}

function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext not supported');
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.warn('AudioContext resume failed', e));
    }
    return audioCtx;
}

/* State management */
async function loadState() {
    try {
        const res = await fetch('/state');
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;
        const nameEl = document.getElementById('playerName');
        const ansEl = document.getElementById('answerInput');
        if (nameEl && data.playerName) {
            nameEl.value = data.playerName;
        }
        if (ansEl && data.lastAnswer) {
            ansEl.value = data.lastAnswer;
        }
        toggleClearButtons();
    } catch (e) {
        console.warn('loadState failed', e);
    }
}

function saveStateSync() {
    try {
        const nameEl = document.getElementById('playerName');
        const ansEl = document.getElementById('answerInput');
        const payload = {
            playerName: nameEl ? nameEl.value.trim() : '',
            lastAnswer: ansEl ? ansEl.value.trim() : ''
        };
        const url = '/save-state';
        const body = JSON.stringify(payload);
        if (navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
        } else {
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(()=>{});
        }
    } catch (e) {
        console.warn('saveState failed', e);
    }
}

const debouncedSaveState = debounce(() => saveStateSync(), 500);

window.addEventListener('beforeunload', () => saveStateSync());

setTimeout(() => {
    const nameEl = document.getElementById('playerName');
    const ansEl = document.getElementById('answerInput');
    if (nameEl) nameEl.addEventListener('input', debouncedSaveState);
    if (ansEl) ansEl.addEventListener('input', debouncedSaveState);
}, 200);

/* Socket core listeners */
socket.on('_seq', (seq) => {
    persistSeq(seq);
});

socket.on('ping', () => {
    socket.emit('pong');
    if (connectionTimeout) clearTimeout(connectionTimeout);
    const statusEl = document.getElementById('connectionStatusText');
    if (statusEl) {
        statusEl.innerHTML = '✅ Verbunden';
        statusEl.style.color = 'lime';
    }
    connectionTimeout = setTimeout(() => {
        if (statusEl) {
            statusEl.innerHTML = '❌ Getrennt';
            statusEl.style.color = 'red';
        }
    }, 12000);
});

socket.on('disconnect', () => {
    if (connectionTimeout) clearTimeout(connectionTimeout);
    joined = false;
    const statusEl = document.getElementById('connectionStatusText');
    if (statusEl) { statusEl.innerHTML = '❌ Getrennt'; statusEl.style.color = 'red'; }
    if (outbox && outbox.length) {
        console.log('[OUTBOX] pending events on disconnect:', outbox.map(o => o.eventName));
    }
});

socket.on('connect', () => {
    flushOutbox();
    attemptAutoJoin();
});

socket.on('grokPermissionUpdate', (data) => {
    myGrokEnabled = !!data.grokEnabled;
    updateGrokButtonVisibility();
});

// Handle errors gracefully; auto-retry when admin is not yet online
socket.on('error', (msg) => {
    const text = String(msg || '').trim();
    // Common case: admin not opened the game yet – retry automatically
    if (text.toLowerCase().includes('admin') && text.toLowerCase().includes('noch nicht geöffnet')) {
        const statusEl = document.getElementById('connectionStatusText');
        if (statusEl) {
            statusEl.innerHTML = '⏳ Warte auf Admin...';
            statusEl.style.color = '#ffb74d';
        }
        // Try again after a short delay without bothering the user
        setTimeout(() => {
            try { lastAutoAttempt = 0; attemptAutoJoin(true); } catch (_) {}
        }, 1500);
        return;
    }
    alert(text || 'Unbekannter Fehler');
});

/* Auto-join logic */
function attemptAutoJoin(force = false) {
    if (new URLSearchParams(window.location.search).get('admin') !== null) return;
    const now = Date.now();
    if (!force && now - lastAutoAttempt < 3000) return;
    lastAutoAttempt = now;

    if (joined) return;
    const nameEl = document.getElementById('playerName');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) return;
    try {
        socket.emit('playerJoin', { playerName: name, lastSeenSeq: lastSeq });
    } catch (e) {
        console.warn('auto join failed', e);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attemptAutoJoin(true);
});

window.addEventListener('online', () => attemptAutoJoin(true));

// Version badge with auto-refresh
let lastKnownVersion = '';
async function loadAppVersion() {
    try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && data.version) {
                APP_VERSION = data.version;
                // Detect version change and reload if needed
                if (lastKnownVersion && lastKnownVersion !== APP_VERSION) {
                    console.log('[APP] New version detected:', APP_VERSION, '- reloading page...');
                    location.reload();
                    return;
                }
                lastKnownVersion = APP_VERSION;
            }
        }
    } catch (e) {
        console.warn('[APP] Version konnte nicht geladen werden', e);
    }
    try {
        const badge = document.getElementById('appVersion');
        if (badge) badge.textContent = APP_VERSION;
    } catch (_) { /* ignore */ }
}

loadAppVersion();
// Check for new version every 30 seconds
setInterval(loadAppVersion, 30000);

/* UI helpers */
function toggleClearButtons() {
    document.querySelectorAll('.input-wrapper input, .input-wrapper textarea').forEach(input => {
        const btn = input.parentElement.querySelector('.clear-btn');
        if (!btn) return;
        btn.style.display = input.value.trim() !== '' ? 'flex' : 'none';
    });
}

function clearAllTextInputs() {
    document.querySelectorAll('input[type="text"], textarea').forEach(input => {
        input.value = '';
    });
    toggleClearButtons();
}

function clearInput(id) {
    document.getElementById(id).value = '';
    toggleClearButtons();
    document.getElementById(id).focus();
}

function updateAnsweredHeaderNames() {
    const adminSpan = document.getElementById('playerNameInHeaderAdmin');
    const playerSpans = document.querySelectorAll('#playerNameInHeader');
    const display = myPlayerName ? `(${myPlayerName})` : '';
    const color = myPlayerName ? getColorForName(myPlayerName) : null;

    // Update all player header instances (there are multiple in the DOM)
    playerSpans.forEach(el => {
        if (!el) return;
        if (!display) { el.textContent = ''; return; }
        if (color) {
            el.innerHTML = `<span style="color:${color}">${display}</span>`;
        } else {
            el.textContent = display;
        }
    });

    // Admin header colored
    if (adminSpan) {
        if (myPlayerName && color) {
            adminSpan.innerHTML = `<span style="color:${color}">(${myPlayerName})</span>`;
        } else {
            adminSpan.textContent = display || '';
        }
    }
}

function updateGrokButtonVisibility() {
    const grokBtn = document.getElementById('playerGrokBtn');
    if (grokBtn) {
        grokBtn.style.display = myGrokEnabled ? 'inline-block' : 'none';
    }
}
/* Admin joined event */
socket.on('adminJoined', () => { 
    isHost = true; 
    if (typeof populateAreaFilter === 'function') populateAreaFilter();
    const areaFilter = document.getElementById('areaFilter');
    if (areaFilter && typeof syncActivityMask === 'function') syncActivityMask(areaFilter.value);
    if (typeof startGrokStatsPolling === 'function') startGrokStatsPolling();
});

socket.on('joinedRoom', ({ isHost: host }) => {
    isHost = host;
    joined = true;
    if (typeof joinRetryInterval !== 'undefined' && joinRetryInterval) {
        clearInterval(joinRetryInterval);
        joinRetryInterval = null;
    }
    const nameEl = document.getElementById('playerName');
    if (nameEl) myPlayerName = nameEl.value.trim();
    updateAnsweredHeaderNames();
    if (!isHost) {
        document.getElementById('playerSetup').style.display = 'none';
        document.getElementById('playerGame').style.display = 'block';
        const waitMsg = document.getElementById('waitingMessage');
        if (waitMsg) {
            waitMsg.style.display = 'block';
            waitMsg.textContent = 'Warte auf die Frage vom Admin...';
        }
        document.getElementById('answerSection').style.display = 'none';
    }
});

socket.on('playerRemoved', (data) => {
    alert(data.message || 'Du wurdest aus dem Spiel entfernt.');
    setTimeout(() => location.reload(), 1000);
});

socket.on('forceRename', async () => {
    const current = document.getElementById('playerName') ? document.getElementById('playerName').value.trim() : '';
    let newName = prompt('Der Admin fordert dich auf, deinen Namen neu einzugeben. Neuer Name:', current || '');
    if (!newName) return;
    newName = newName.trim();
    if (!newName) return;
    const nameEl = document.getElementById('playerName');
    if (nameEl) nameEl.value = newName;
    myPlayerName = newName;
    toggleClearButtons();
    socket.emit('changeName', newName);
    saveStateSync();
    updateAnsweredHeaderNames();
});
