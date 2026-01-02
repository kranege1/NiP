// Maximale Spielerzahl (inkl. Bots)
const MAX_PLAYERS = 10;

// Standard-Botnamen (mit # Präfix)
const BOT_NAMES = ['#Lilo', '#Mimi', '#Rosi', '#Tine', '#Fritz', '#Hanno', '#Kurt', '#Sepp'];
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const grok = require('./grok_api');

// Version counter stored on disk to auto-increment on each server start
const VERSION_FILE = path.join(__dirname, 'version_counter.json');
const VERSION_LOG_FILE = path.join(__dirname, 'VERSION_LOG.txt');
const VERSION_PREFIX = 'NiP - V';
function readOneLineNotesFile() {
    const noteFile = path.join(__dirname, 'version_notes.txt');
    try {
        if (fs.existsSync(noteFile)) {
            const content = fs.readFileSync(noteFile, 'utf8').trim();
            if (content) {
                return content.split(/\r?\n/)[0];
            }
        }
    } catch (e) {
        console.warn('Konnte version_notes.txt nicht lesen', e);
    }
    return '';
}

function resolveChangeSummary() {
    const envSummary = (process.env.VERSION_CHANGE_SUMMARY || process.env.VERSION_SUMMARY || '').trim();
    if (envSummary) return envSummary.replace(/\r?\n/g, ' ');
    // Default: rely on automatic summary builder
    return '';
}

function appendVersionLog(version, summary) {
    const line = `${new Date().toISOString()} | ${version} | ${summary}\n`;
    try {
        fs.appendFileSync(VERSION_LOG_FILE, line, 'utf8');
    } catch (e) {
        console.error('Konnte VERSION_LOG.txt nicht schreiben', e);
    }
}

// Persistent Grok usage logging (NDJSON)
const GROK_USAGE_FILE = path.join(__dirname, 'grok_usage.jsonl');
function appendGrokUsageLog(playerName, tokens, prompt, promptTokens, completionTokens) {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            playerName: String(playerName || 'unknown'),
            tokens: Number(tokens) || 0,
            promptTokens: Number(promptTokens) || 0,
            completionTokens: Number(completionTokens) || 0,
            prompt: String(prompt || '')
        };
        fs.appendFileSync(GROK_USAGE_FILE, JSON.stringify(entry) + os.EOL, 'utf8');
    } catch (e) {
        console.error('[GROK] Fehler beim Schreiben grok_usage.jsonl', e);
    }
}

function buildAutoChangeSummary(prevTs = 0, nowTs = Date.now()) {
    // Map important files to concise change descriptions
    const files = [
        { p: path.join(__dirname, 'server.js'), msg: 'Server-Logik aktualisiert' },
        { p: path.join(__dirname, 'public', 'app-bootstrap.js'), msg: 'Bootstrap-Wiring verbessert' },
        { p: path.join(__dirname, 'public', 'app-admin.js'), msg: 'Admin-UI & Bot-Management' },
        { p: path.join(__dirname, 'public', 'app-ui.js'), msg: 'UI & Spielerlisten sortiert' },
        { p: path.join(__dirname, 'public', 'app-core.js'), msg: 'Client-Core & Versioning' },
        { p: path.join(__dirname, 'public', 'app-game.js'), msg: 'Spiellogik & Präsentation' },
        { p: path.join(__dirname, 'public', 'screen.js'), msg: 'Screen-View & Farben' },
        { p: path.join(__dirname, 'public', 'index.html'), msg: 'HTML-Template' },
        { p: path.join(__dirname, 'public', 'screen.html'), msg: 'Screen-Template' }
    ];

    const changedMsgs = [];
    for (const f of files) {
        try {
            if (!fs.existsSync(f.p)) continue;
            const st = fs.statSync(f.p);
            const mt = st.mtimeMs || st.mtime.getTime();
            // Treat mtime > prevTs as changed (including on first run where prevTs=0)
            if (prevTs > 0 && mt <= prevTs) continue;
            changedMsgs.push(f.msg);
        } catch (_) { /* ignore */ }
    }

    if (!changedMsgs.length) {
        // Fallback: generic but non-empty message
        return 'Code-Updates angewendet';
    }
    // Collapse to a readable single line
    return changedMsgs.join(' · ');
}

function loadAndIncrementVersion() {
    let last = 146; // fallback to current known version
    let lastVersionTime = 0;
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const raw = fs.readFileSync(VERSION_FILE, 'utf8');
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed.counter === 'number' && parsed.counter > 0) {
                last = parsed.counter;
            }
            if (parsed && typeof parsed.lastVersionTime === 'number') {
                lastVersionTime = parsed.lastVersionTime;
            }
        }
    } catch (e) {
        console.warn('Konnte version_counter.json nicht lesen, nutze Fallback 146', e);
    }

    const next = last + 1;
    const nowTs = Date.now();
    try {
        fs.writeFileSync(VERSION_FILE, JSON.stringify({ counter: next, lastVersionTime: nowTs }, null, 2), 'utf8');
    } catch (e) {
        console.error('Konnte version_counter.json nicht schreiben', e);
    }

    const resolved = resolveChangeSummary();
    const autoSummary = buildAutoChangeSummary(lastVersionTime, nowTs);
    const summary = (resolved && resolved.trim()) ? resolved : autoSummary;
    console.log(`[VERSION] Incrementing to ${VERSION_PREFIX}${next}; summary="${summary}"`);
    appendVersionLog(`${VERSION_PREFIX}${next}`, summary);

    return `${VERSION_PREFIX}${next}`;
}

const APP_VERSION = loadAndIncrementVersion();

const app = express();
app.use(express.json());
const server = http.createServer(app);
const io = socketIo(server);

// --- Event log for replay (1h retention) ---
const EVENT_LOG_FILE = path.join(__dirname, 'event_log.json');
const EVENT_RETENTION_MS = 60 * 60 * 1000; // 1 hour
const EVENT_MAX_ITEMS = 500; // hard cap to avoid unbounded growth

let eventLogs = {};
try {
    if (fs.existsSync(EVENT_LOG_FILE)) {
        const raw = fs.readFileSync(EVENT_LOG_FILE, 'utf8');
        eventLogs = raw ? JSON.parse(raw) : {};
    }
} catch (e) {
    console.error('Fehler beim Laden von event_log.json', e);
    eventLogs = {};
}

function persistEventLogs() {
    try {
        fs.writeFileSync(EVENT_LOG_FILE, JSON.stringify(eventLogs, null, 2), 'utf8');
    } catch (e) {
        console.error('Fehler beim Schreiben von event_log.json', e);
    }
}

function getRoomLog(roomCode) {
    if (!eventLogs[roomCode]) {
        eventLogs[roomCode] = { seq: 0, events: [] };
    }
    return eventLogs[roomCode];
}

function pruneRoomLog(roomCode) {
    const roomLog = getRoomLog(roomCode);
    const cutoff = Date.now() - EVENT_RETENTION_MS;
    roomLog.events = (roomLog.events || []).filter(e => typeof e.ts === 'number' && e.ts >= cutoff);
    if (roomLog.events.length > EVENT_MAX_ITEMS) {
        roomLog.events = roomLog.events.slice(-EVENT_MAX_ITEMS);
    }
}

function recordEvent(roomCode, type, payload) {
    const roomLog = getRoomLog(roomCode);
    roomLog.seq += 1;
    const evt = { seq: roomLog.seq, ts: Date.now(), type, payload };
    roomLog.events.push(evt);
    pruneRoomLog(roomCode);
    persistEventLogs();
    log(`[EVENT] room=${roomCode} seq=${evt.seq} type=${type}`);
    // If there are offline players in this room, note that this event is buffered for them
    try {
        const room = rooms && rooms[roomCode];
        if (room && room.players) {
            const offlineNames = Object.values(room.players)
                .filter(p => p && p.offline && p.name)
                .map(p => p.name);
            if (offlineNames.length) {
                log(`[BUFFER] room=${roomCode} seq=${evt.seq} type=${type} buffered_for=${offlineNames.join(',')}`);
            }
        }
    } catch (e) {
        // ignore logging errors
    }
    return evt.seq;
}

function emitWithSeqToRoom(roomCode, eventName, payload) {
    const seq = recordEvent(roomCode, eventName, payload);
    io.to(roomCode).emit(eventName, payload);
    io.to(roomCode).emit('_seq', seq);
    log(`[EMIT] room=${roomCode} seq=${seq} event=${eventName}`);
    return seq;
}

function emitWithSeqToSocket(socket, roomCode, eventName, payload) {
    const seq = recordEvent(roomCode, eventName, payload);
    socket.emit(eventName, payload);
    socket.emit('_seq', seq);
    log(`[EMIT->SOCKET] room=${roomCode} to=${socket.id} seq=${seq} event=${eventName}`);
    return seq;
}

function replayEvents(socket, roomCode, lastSeenSeq) {
    const roomLog = getRoomLog(roomCode);
    const since = Number(lastSeenSeq) || 0;
    const events = (roomLog.events || []).filter(e => e.seq > since);
    log(`[REPLAY] room=${roomCode} to=${socket.id} fromSeq=${since} count=${events.length}`);
    if (events.length) {
        log(`[REPLAY_DETAIL] room=${roomCode} to=${socket.id} seqs=${events.map(e => e.seq).join(',')}`);
    }
    events.forEach(evt => {
        socket.emit(evt.type, evt.payload);
        socket.emit('_seq', evt.seq);
    });
    // Summarize when buffered messages have been sent to a user after reconnect
    try {
        const name = socket && socket.playerName ? socket.playerName : 'unknown';
        log(`[REPLAY_DONE] room=${roomCode} to=${socket.id} name=${name} delivered=${events.length}`);
    } catch (e) { /* ignore */ }
}

// Simple per-IP state storage (playerName, lastAnswer)
const STATES_FILE = path.join(__dirname, 'states.json');
let states = {};
try {
    if (fs.existsSync(STATES_FILE)) {
        const raw = fs.readFileSync(STATES_FILE, 'utf8');
        states = raw ? JSON.parse(raw) : {};
    }
} catch (e) {
    console.error('Fehler beim Laden von states.json', e);
    states = {};
}

function saveStatesToDisk() {
    try {
        fs.writeFileSync(STATES_FILE, JSON.stringify(states, null, 2), 'utf8');
    } catch (e) {
        console.error('Fehler beim Schreiben von states.json', e);
    }
}

// Root route: serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// REST endpoints to persist and retrieve per-IP state
app.get('/state', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const s = states[ip] || {};
    res.json(s);
});

app.post('/save-state', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const { playerName, lastAnswer } = req.body || {};
    states[ip] = {
        playerName: playerName || '',
        lastAnswer: lastAnswer || '',
        lastSeen: new Date().toISOString()
    };
    saveStatesToDisk();
    res.json({ ok: true });
});

// Expose current auto-incremented version for badges
app.get('/api/version', (req, res) => {
    res.json({ version: APP_VERSION });
});

// Serve a dedicated read-only screen view when ?screen is present
app.use((req, res, next) => {
    if (typeof req.query === 'object' && req.query.screen !== undefined) {
        return res.sendFile(path.join(__dirname, 'public', 'screen.html'));
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback for admin paths: serve index.html for any GET starting with /admin
app.use((req, res, next) => {
    if (req.method === 'GET' && req.path && req.path.indexOf('/admin') === 0) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});

// Grok API endpoints
app.post('/api/grok/set-key', (req, res) => {
    const apiKey = (req.body.api_key || '').trim();
    
    if (!apiKey) {
        return res.status(400).json({ success: false, error: 'API key erforderlich' });
    }
    
    grok.setApiKey(apiKey);
    res.json({ success: true, message: 'Grok API key gesetzt' });
});

app.get('/api/grok/stats', (req, res) => {
    res.json(grok.getStats());
});

app.post('/api/grok/prompt', async (req, res) => {
    const prompt = (req.body.prompt || '').trim();
    const actorName = (req.body.playerName || req.body.name || 'Admin').toString();
    
    if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt erforderlich' });
    }
    
    if (!grok.isConfigured()) {
        return res.status(401).json({ success: false, error: 'Grok API key nicht konfiguriert' });
    }
    
    // Generate response
    const result = await grok.generateResponse(prompt);
    
    if (result.success) {
        // Log token usage
        log(`[GROK] Prompt erfolgreich → Tokens: ${result.tokensUsed} ` +
            `(Prompt: ${result.promptTokens}, Completion: ${result.completionTokens}) | ` +
            `Gesamt: ${grok.totalTokens} Tokens | Anfragen: ${grok.requestsMade}`);
        // Persist detailed usage
        try { appendGrokUsageLog(actorName, result.tokensUsed, prompt, result.promptTokens, result.completionTokens); } catch (e) { /* ignore */ }
        // Notify admin about Grok usage
        try {
            const room = rooms[ACTIVE_ROOM];
            if (room && room.host) {
                const hostSocket = io.sockets.sockets.get(room.host);
                if (hostSocket) hostSocket.emit('grokUsageNotification', { playerName: actorName });
            }
        } catch (e) { /* ignore */ }
    } else {
        log(`[GROK] Fehler: ${result.error}`);
    }
    
    res.json(result);
});

const ACTIVE_ROOM = 'Spiel 1'; // Fest fixiert
const rooms = {};



function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Simple deterministic color palette picker by name
// Fixed order palette for up to 10 players; first gets RED
const COLOR_PALETTE = ['#f44336','#e91e63','#9c27b0','#3f51b5','#03a9f4','#009688','#8bc34a','#ff9800','#607d8b','#9e847bff'];
const PLAYER_COLORS_FILE = path.join(__dirname, 'player_colors.json');
let playerColors = {};

// Term usage tracking - ensures all terms are used equally
const TERM_USAGE_FILE = path.join(__dirname, 'term_usage.json');
let termUsage = {};

function loadTermUsage() {
    try {
        if (fs.existsSync(TERM_USAGE_FILE)) {
            const data = fs.readFileSync(TERM_USAGE_FILE, 'utf8');
            termUsage = JSON.parse(data);
            log(`[TERMS] Geladen: ${Object.keys(termUsage).length} Begriffe mit Usage-Counts`);
        }
    } catch (e) {
        log(`[TERMS] Keine term_usage.json gefunden oder ungültig - starte neu`);
        termUsage = {};
    }
}

function saveTermUsage() {
    try {
        fs.writeFileSync(TERM_USAGE_FILE, JSON.stringify(termUsage, null, 2), 'utf8');
    } catch (e) {
        console.error('Konnte term_usage.json nicht schreiben:', e);
    }
}

function incrementTermUsage(termKey) {
    if (!termKey) return;
    termUsage[termKey] = (termUsage[termKey] || 0) + 1;
    saveTermUsage();
}

// Load canned answers for bots (when Grok is disabled)
let CANNED_ANSWERS = [];
let CANNED_ANSWERS_BY_AREA = {};
function _loadCannedAnswers() {
    if (CANNED_ANSWERS && CANNED_ANSWERS.length) return CANNED_ANSWERS;
    const candidates = [
        path.join(__dirname, 'public', 'answers.js'),
        path.join(__dirname, 'public', 'OLD', 'answers.js')
    ];
    for (const file of candidates) {
        try {
            if (!fs.existsSync(file)) continue;
            const raw = fs.readFileSync(file, 'utf8');
            const start = raw.indexOf('[');
            const end = raw.lastIndexOf(']');
            if (start !== -1 && end !== -1 && end > start) {
                const jsonText = raw.slice(start, end + 1);
                const arr = JSON.parse(jsonText);
                if (Array.isArray(arr) && arr.length) {
                    // Support legacy string arrays and new object format with { definition, area }
                    const strings = arr.filter(item => typeof item === 'string');
                    const objectDefs = arr.filter(item => item && typeof item.definition === 'string');

                    CANNED_ANSWERS_BY_AREA = {};
                    for (const obj of objectDefs) {
                        const areaKey = (obj.area || '').toString().toUpperCase();
                        if (!CANNED_ANSWERS_BY_AREA[areaKey]) CANNED_ANSWERS_BY_AREA[areaKey] = [];
                        CANNED_ANSWERS_BY_AREA[areaKey].push(obj.definition);
                    }
                    console.log('[DEBUG] CANNED_ANSWERS_BY_AREA keys:', Object.keys(CANNED_ANSWERS_BY_AREA));
                    console.log('[DEBUG] SPRACHEN pool size:', CANNED_ANSWERS_BY_AREA['SPRACHEN']?.length || 0);

                    const definitionsOnly = objectDefs.map(item => item.definition);
                    CANNED_ANSWERS = [...strings, ...definitionsOnly];
                    if (CANNED_ANSWERS.length) {
                        console.log(`[BOTS] Loaded ${CANNED_ANSWERS.length} canned answers from ${path.basename(file)}`);
                        return CANNED_ANSWERS;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to load canned answers from', file, e.message || e);
        }
    }
    // Fallback minimal set
    CANNED_ANSWERS = [
        'Kurze falsche Definition.',
        'Plausibler, aber falscher Begriff.',
        'Alltäglicher Gegenstand, falsch beschrieben.',
        'Irrführende Erklärung aus einem anderen Bereich.'
    ];
    return CANNED_ANSWERS;
}

function _loadPlayerColors() {
    try {
        if (fs.existsSync(PLAYER_COLORS_FILE)) {
            const raw = fs.readFileSync(PLAYER_COLORS_FILE, 'utf8');
            playerColors = raw ? JSON.parse(raw) : {};
            // ensure object
            if (typeof playerColors !== 'object' || Array.isArray(playerColors)) playerColors = {};
            console.log(`[COLORS] Loaded ${Object.keys(playerColors).length} saved player colors`);
            return;
        }
    } catch (e) {
        console.error('Failed to load player_colors.json', e);
    }
    playerColors = {};
}

function _savePlayerColors() {
    try {
        fs.writeFileSync(PLAYER_COLORS_FILE, JSON.stringify(playerColors, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save player_colors.json', e);
    }
}

function pickColorForName(name) {
    // Deprecated: color selection should be based on room availability.
    // Keep as fallback when room context is missing.
    return COLOR_PALETTE[0];
}

// Pick a color that is unique within the room (if possible). Falls back to desired or deterministic pick.
function pickUniqueColor(room, playerName, desiredColor) {
    if (!room) return desiredColor || pickColorForName(playerName);
    const used = new Set(Object.values(room.players || {})
        .filter(p => p && p.name !== playerName)
        .map(p => p.color)
        .filter(Boolean));

    if (desiredColor && !used.has(desiredColor)) return desiredColor;

    for (const c of COLOR_PALETTE) {
        if (!used.has(c)) return c;
    }

    // If all palette colors are taken, fall back to deterministic pick (may duplicate)
    return desiredColor || pickColorForName(playerName);
}

function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substr(0, 19);
}

function log(message) {
    console.log(`[${getTimestamp()}] ${message}`);
}

function normalizeNameForSort(entry) {
    const raw = (typeof entry === 'string') ? entry : (entry && entry.name) || '';
    return raw.replace(/\s*\(offline\)\s*$/i, '');
}

function isBotEntry(entry) {
    if (entry && typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'isBot')) {
        return !!entry.isBot;
    }
    const base = normalizeNameForSort(entry).trim();
    return base.startsWith('#');
}

function comparePlayers(entryA, entryB) {
    const botA = isBotEntry(entryA);
    const botB = isBotEntry(entryB);
    if (botA !== botB) return botA ? 1 : -1; // echte Spieler vor Bots

    const cleanA = normalizeNameForSort(entryA).replace(/^#/, '').trim().toLowerCase();
    const cleanB = normalizeNameForSort(entryB).replace(/^#/, '').trim().toLowerCase();
    if (cleanA < cleanB) return -1;
    if (cleanA > cleanB) return 1;
    return 0;
}

function sortPlayersList(list) {
    return [...(list || [])].sort(comparePlayers);
}

io.on('connection', (socket) => {
    log(`Neue Verbindung: ${socket.id}`);

    // Ensure player colors are loaded once when first connection occurs
    if (!playerColors || Object.keys(playerColors).length === 0) {
        try { _loadPlayerColors(); } catch (e) { /* ignore */ }
    }
    
    // Send term usage data to newly connected client
    socket.emit('termUsageUpdate', termUsage);

    function emitPlayerLists(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        // regular player list (names only) - markiere offline Spieler
        const playerList = sortPlayersList(Object.values(room.players).map(p => {
            const suffix = p.offline ? ' (offline)' : '';
            return { name: p.name + suffix, color: p.color || pickColorForName(p.name), offline: !!p.offline, isBot: !!p.isBot };
        }));
        io.to(roomCode).emit('updatePlayers', playerList);

        // send richer info to host (id, name, IP last octet, offline status)
        if (room.host) {
            const hostSocket = io.sockets.sockets.get(room.host);
            if (hostSocket) {
                const adminList = sortPlayersList(Object.keys(room.players)
                    .filter(id => id !== room.host)  // Exclude the host/admin
                    .map(id => {
                    const p = room.players[id];
                    const ipRaw = p.ip || 'unknown';
                    let ip = ipRaw;
                    if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.split('::ffff:').pop();
                    const m = ('' + ip).match(/(?:\d+\.\d+\.\d+\.)?(\d+)$/);
                    const last = m ? m[1] : ip;
                    const suffix = p.offline ? ' (offline)' : '';
                    return { id, name: p.name + suffix, ipLastOctet: last, grokEnabled: !!p.grokEnabled, color: p.color || pickColorForName(p.name), isBot: !!p.isBot };
                }));
                hostSocket.emit('updatePlayersAdmin', adminList);
            }
        }
    }

    function colorForName(room, name) {
        if (!room || !name) return pickColorForName(name);
        const found = Object.values(room.players).find(p => p && p.name === name);
        return (found && found.color) ? found.color : pickColorForName(name);
    }

        function emitVotingUpdate(roomCode) {
            const room = rooms[roomCode];
            if (!room) return;
            const votes = room.votes || {};
            const players = currentPlayersExcludingHost(roomCode);
            emitWithSeqToRoom(roomCode, 'votingUpdate', { votes, playerNames: players.map(p => p.name), players });
        }

        // helper: return array of current player names excluding the admin/host
        function currentPlayersExcludingHost(roomCode) {
            const room = rooms[roomCode];
            if (!room) return [];
            const list = Object.keys(room.players).filter(id => id !== room.host).map(id => {
                const p = room.players[id];
                return (p && p.name) ? { name: p.name, color: p.color || pickColorForName(p.name), isBot: !!p.isBot } : null;
            }).filter(Boolean);
            return sortPlayersList(list);
        }

        // helper: return array of player items { name, offline } excluding the admin/host
        function currentPlayerItemsExcludingHost(roomCode) {
            const room = rooms[roomCode];
            if (!room) return [];
            const list = Object.keys(room.players)
                .filter(id => id !== room.host)
                .map(id => {
                    const p = room.players[id];
                    return { name: p.name, offline: !!p.offline, color: p.color || pickColorForName(p.name), isBot: !!p.isBot };
                });
            return sortPlayersList(list);
        }

        function broadcastUpdateSubmitted(roomCode) {
            const playersNow = currentPlayersExcludingHost(roomCode);
            const playerItemsNow = currentPlayerItemsExcludingHost(roomCode);
            const adminHasReal = !!rooms[roomCode].realAnswer;
            emitWithSeqToRoom(roomCode, 'updateSubmitted', { players: playerItemsNow, submitted: rooms[roomCode].submitted || [], adminHasRealAnswer: adminHasReal });
        }

        // -------------------- Bot-Manager Helpers (inside connection so emitPlayerLists is available) --------------------
        function ensureBots(roomCode, desiredCount) {
            const room = rooms[roomCode];
            if (!room) return;
            // Maximal so viele Bots, dass Gesamtspielerzahl <= MAX_PLAYERS
            const roomPlayers = Object.values(room.players || {}).length;
            const realPlayers = Object.values(room.players || {}).filter(p => !p.isBot).length;
            const maxBotsAllowed = Math.max(0, MAX_PLAYERS - realPlayers);
            desiredCount = Math.max(0, Math.min(maxBotsAllowed, Number(desiredCount) || 0));

            // gather existing bot numbers
            const existingBots = Object.entries(room.players)
                .filter(([id, p]) => p && p.isBot)
                .map(([id, p]) => ({ id, name: p.name }));

            // Remove extra bots
            while (existingBots.length > desiredCount) {
                const rem = existingBots.pop();
                delete room.players[rem.id];
                // cleanup answers/submitted/votes
                room.answers = (room.answers || []).filter(a => a.name !== rem.name);
                room.submitted = (room.submitted || []).filter(n => n !== rem.name);
                if (room.votes) {
                    Object.keys(room.votes).forEach(k => { if (k === rem.name) delete room.votes[k]; });
                }
            }

            // Add missing bots, aber nie über MAX_PLAYERS hinaus
            for (let i = existingBots.length + 1; i <= desiredCount; i++) {
                if (Object.values(room.players).length >= MAX_PLAYERS) break;
                const botId = `bot:${i}`;
                const botName = BOT_NAMES[(i - 1) % BOT_NAMES.length] || `#Bot${i}`;
                if (Object.values(room.players).find(p => p && p.name === botName)) continue;
                const botColor = pickUniqueColor(room, botName, null);
                room.players[botId] = { name: botName, ip: '127.0.0.1', offline: false, isBot: true, grokEnabled: true, color: botColor };
            }

            // Refresh any derived structures
            emitPlayerLists(roomCode);
            broadcastUpdateSubmitted(roomCode);
        }

        async function serverBotSubmit(roomCode, botId, text) {
            const room = rooms[roomCode];
            if (!room) return;
            const bot = room.players[botId];
            if (!bot) return;
            const botName = bot.name;

            // Remove any previous answer by this bot
            room.answers = (room.answers || []).filter(a => a.name !== botName);
            room.answers.push({ name: botName, text: text });
            if (!room.submitted.includes(botName)) room.submitted.push(botName);

            // Update shuffledAnswers if not finalized
            const playersNow = Object.keys(room.players).filter(id => id !== room.host).map(id => room.players[id].name);
            const allAnswersIn = room.submitted.length === playersNow.length && !!room.realAnswer;

            if (!room.answersFinalized) {
                let allAnswers = [...(room.answers || [])];
                if (room.realAnswer) allAnswers.push({ name: 'Echte Definition', text: room.realAnswer });
                room.shuffledAnswers = shuffleArray(allAnswers);
                if (allAnswersIn) room.answersFinalized = true;
            } else if (room.shuffledAnswers) {
                const idx = room.shuffledAnswers.findIndex(a => a.name === botName);
                if (idx !== -1) room.shuffledAnswers[idx].text = text;
                else room.shuffledAnswers.push({ name: botName, text });
            }

            // Notify admin and screens similar to real submit
            if (room.host) {
                const hostSocket = io.sockets.sockets.get(room.host);
                if (hostSocket) {
                    let answersToShow = room.shuffledAnswers ? room.shuffledAnswers : [...room.answers];
                    if (room.realAnswer && !answersToShow.find(a => a.name === 'Echte Definition')) answersToShow.push({ name: 'Echte Definition', text: room.realAnswer });
                    const lettered = answersToShow.map((a, i) => ({ letter: String.fromCharCode(65 + i), text: a.text, name: a.name, color: colorForName(room, a.name) }));
                    hostSocket.emit('showAllAnswers', lettered);
                    try {
                        const playersNowArr = Object.keys(room.players).filter(id => id !== room.host);
                        if (room.submitted.length === playersNowArr.length) {
                            emitToScreens(roomCode, 'showAllAnswers', lettered);
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            emitPlayerLists(roomCode);
            broadcastUpdateSubmitted(roomCode);
        }

        function scheduleBotAnswers(roomCode) {
            const room = rooms[roomCode];
            if (!room) return;
            for (const [id, p] of Object.entries(room.players)) {
                if (!p || !p.isBot) continue;
                if ((room.submitted || []).includes(p.name)) continue;
                const delay = 800 + Math.floor(Math.random() * 6000);
                setTimeout(async () => {
                    const q = room.currentQuestion || '';
                    const area = (room.currentQuestionArea || '').toLowerCase();
                    const isActivity = area.includes('activity');
                    const isSprachen = area.includes('sprachen');
                    const isRateStadt = area.includes('rate die stadt');
                    const isRateLand = area.includes('rate das land');
                    const useCannedByArea = isActivity || isSprachen || isRateStadt || isRateLand;
                    let answerText = ``;
                    let fromCanned = false;

                    // Activity/SPRACHEN/RATE DIE STADT/RATE DAS LAND mode: bots pull from answers.js area-specific pool; fallback to one-word list
                    if (useCannedByArea) {
                        try {
                            let areaKey = 'ACTIVITY';
                            if (isSprachen) areaKey = 'SPRACHEN';
                            else if (isRateStadt) areaKey = 'RATE DIE STADT';
                            else if (isRateLand) areaKey = 'RATE DAS LAND';
                            
                            console.log(`[DEBUG] Bot answer - area: "${room.currentQuestionArea}", areaKey: "${areaKey}", pool size: ${CANNED_ANSWERS_BY_AREA[areaKey]?.length || 0}`);
                            const byArea = CANNED_ANSWERS_BY_AREA && CANNED_ANSWERS_BY_AREA[areaKey];
                            if (byArea && byArea.length) {
                                answerText = byArea[Math.floor(Math.random() * byArea.length)] || '';
                                fromCanned = true;
                            }
                        } catch (e) { /* ignore */ }
                        if (!answerText) {
                            const oneWordPool = ['Schwimmen','Kochlöffel','Laterne','Seil','Puzzle','Pinsel','Trommel','Segel','Kreide','Fahrrad','Kaktus','Kompass','Pfeffer','Rakete','Kiste','Mütze','Karotte','Lampe','Hobel','Ziegel'];
                            answerText = oneWordPool[Math.floor(Math.random() * oneWordPool.length)] || 'Schwimmen';
                        }
                    } else {
                    try {
                        const grokAllowed = !!p.grokEnabled && grok.isConfigured();
                        if (grokAllowed) {
                            // Vary prompt per bot to increase diversity: include bot name, question
                            const personas = [
                                'kreativ',
                                'sachlich',
                                'humorvoll',
                                'poetisch',
                                'technisch',
                                'kurz und prägnant'
                            ];
                            const persona = personas[Math.floor(Math.random() * personas.length)];

                            // pick an unrelated topic to force fachfremde (incorrect) answers
                            const unrelatedTopics = ['Küche', 'Sport', 'Mode', 'Musik', 'Garten', 'Reisen', 'Gaming', 'Haustiere', 'Filme', 'Kochen', 'Handwerk', 'Kosmetik'];
                            let topic = unrelatedTopics[Math.floor(Math.random() * unrelatedTopics.length)];
                            // Ensure topic string safe
                            topic = String(topic);

                            // Build prompt: instruct Grok to invent a FALSE definition from an unrelated topic
                                const prompt = `Du bist ${p.name}, ein ${persona}er Autor. Erfinde eine KURZ (3-10 Wörter), bewusst FALSCHE und thematisch FACHFREMDE Definition. Die Definition MUSS aus dem Themenbereich "${topic}" stammen und DARF NICHT aus dem Themenbereich der Frage kommen. Formuliere im Stil der vorhandenen Definitionen: eine knappe Nominalphrase oder sehr kurzer Satz, neutral, keine Hervorhebungen. Verwende den Begriff NICHT. Beginne nicht mit 'Begriff' oder 'der Begriff'. Antworte ohne Anmerkungen.`;

                            // randomize temperature a bit for sampling diversity
                            const temp = 0.75 + Math.random() * 0.6; // ~0.75 - 1.35
                            const res = await grok.generateResponse(prompt, undefined, temp, 140);
                            if (res && res.success && res.response) {
                                answerText = res.response.trim();
                                // Persist Grok usage for bot generation
                                try { appendGrokUsageLog(p.name, res.tokensUsed, prompt, res.promptTokens, res.completionTokens); } catch (e) { /* ignore */ }
                                // Notify admin about bot Grok usage
                                try {
                                    if (room.host) {
                                        const hostSocket = io.sockets.sockets.get(room.host);
                                        if (hostSocket) hostSocket.emit('grokUsageNotification', { playerName: p.name });
                                    }
                                } catch (e) { /* ignore */ }
                            }
                        } else {
                            // Use canned answers when Grok is disabled for this bot
                            const pool = _loadCannedAnswers();
                            if (pool && pool.length) {
                                answerText = pool[Math.floor(Math.random() * pool.length)] || '';
                                fromCanned = true;
                            }
                        }
                    } catch (e) {
                        console.error('Bot Grok error', e);
                    }
                    }
                    if (!answerText) {
                        // fallback templates with slight randomization
                        // fallback templates choose an unrelated topic to keep answers fachfremd
                        const fallbackTopics = ['Küche', 'Sport', 'Mode', 'Musik', 'Garten', 'Reisen', 'Gaming', 'Haustiere', 'Filme'];
                        const fbTopic = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
                        const fallbacksNoQ = [
                            `Eine plausible, aber irreführende Beschreibung aus dem Bereich ${fbTopic}.`,
                            `${p.name} beschreibt dies im Kontext ${fbTopic} als eine ungewöhnliche Idee.`,
                            `Eine knappe, irreführende Definition im Bereich ${fbTopic}.`,
                            `Kurz: eine scheinbar logische Erklärung aus ${fbTopic}.`
                        ];
                        const fallbacksWithQ = [
                            `Eine plausible, aber irreführende Beschreibung von ${q} aus dem Bereich ${fbTopic}.`,
                            `${p.name} beschreibt ${q} im Kontext ${fbTopic} als eine ungewöhnliche Idee.`,
                            `Eine knappe, irreführende Definition zu ${q} (aus ${fbTopic}).`,
                            `Kurz: eine scheinbar logische Erklärung für ${q} im Bereich ${fbTopic}.`
                        ];

                        answerText = (allowTerm ? fallbacksWithQ : fallbacksNoQ)[Math.floor(Math.random() * (allowTerm ? fallbacksWithQ.length : fallbacksNoQ.length))];
                        if (answerText.length > 200) answerText = answerText.substr(0,200);
                    }

                    // Ensure answer does not contain the exact question term unless activity/sprachen area allows it
                    if (!useCannedByArea && q && typeof answerText === 'string') {
                        try {
                            const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const re = new RegExp('\\b' + escapeRegExp(q) + '\\b', 'gi');
                            if (re.test(answerText)) {
                                // replace occurrences with a neutral phrase
                                answerText = answerText.replace(re, 'der Begriff');
                                // trim repeated spaces
                                answerText = answerText.replace(/\s+/g, ' ').trim();
                            }
                        } catch (e) {
                            // ignore sanitization errors
                        }

                        // Avoid answers beginning with "der Begriff" (or similar).
                        try {
                            const leadingRe = /^\s*(der|die|das)\s+begriff\b[\s,:-]*/i;
                            if (leadingRe.test(answerText)) {
                                const starters = ['Eine Beschreibung', 'Kurz gesagt', 'In kurzen Worten', 'Als Begriff beschrieben'];
                                const starter = starters[Math.floor(Math.random() * starters.length)];
                                answerText = answerText.replace(leadingRe, starter + ' ');
                                answerText = answerText.replace(/\s+/g, ' ').trim();
                            }
                        } catch (e) {
                            // ignore
                        }
                        // Enforce 3-10 words for Grok answers; allow canned answers fully
                        try {
                            const words = answerText.split(/\s+/).filter(Boolean);
                            if (!fromCanned && words.length > 10) {
                                answerText = words.slice(0, 10).join(' ').trim();
                            } else if (words.length < 3) {
                                // choose a fallback matching the allowTerm rule to guarantee length
                                const fallbackTopics = ['Küche','Sport','Musik','Garten','Reisen'];
                                const fb = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
                                const shortFallback = allowTerm ? `Kurze falsche Definition aus ${fb}.` : `Kurze falsche Definition.`;
                                answerText = shortFallback;
                            }
                            // ensure terminal punctuation
                            if (!/[.!?]$/.test(answerText)) answerText += '.';
                        } catch (e) {
                            // ignore
                        }
                    }
                    serverBotSubmit(roomCode, id, answerText);
                }, delay);
            }
        }

        function scheduleBotVotes(roomCode) {
            const room = rooms[roomCode];
            if (!room) return;
            const options = room.shuffledAnswers || [];
            for (const [id, p] of Object.entries(room.players)) {
                if (!p || !p.isBot) continue;
                const botName = p.name;
                const ownIdx = options.findIndex(o => o.name === botName);
                const possibleIdx = options.map((o,i)=>i).filter(i => i !== ownIdx);
                if (possibleIdx.length === 0) continue;
                const delay = 1200 + Math.floor(Math.random() * 6000);
                setTimeout(() => {
                    const pickIdx = possibleIdx[Math.floor(Math.random() * possibleIdx.length)];
                    const letter = String.fromCharCode(65 + pickIdx);
                    room.votes = room.votes || {};
                    room.votes[botName] = letter;
                    emitVotingUpdate(roomCode);
                }, delay);
            }
        }

        // -------------------- End Bot-Manager Helpers --------------------

    // Heartbeat alle 5 Sekunden
    setInterval(() => {
        if (socket.connected) socket.emit('ping');
    }, 5000);

    // Admin verbindet sich (automatisch Host)
    socket.on('adminConnect', (data = {}) => {
        const lastSeenSeq = Number(data.lastSeenSeq) || 0;
        if (!rooms[ACTIVE_ROOM]) {
            rooms[ACTIVE_ROOM] = {
                host: socket.id,
                players: {},
                answers: [],
                submitted: [],
                currentQuestion: '',
                realAnswer: '',
                roundActive: false,
                votes: {},
                points: {},
                pointsCommitted: false,
                shuffledAnswers: null,
                answersFinalized: false
            };
            log(`Admin hat Spiel 1 geöffnet`);
        } else {
            // Remove the old admin from players list if there was one
            const oldHostId = rooms[ACTIVE_ROOM].host;
            if (oldHostId && rooms[ACTIVE_ROOM].players[oldHostId]) {
                delete rooms[ACTIVE_ROOM].players[oldHostId];
                log(`Alter Admin ${oldHostId} aus Spielerliste entfernt`);
            }
            rooms[ACTIVE_ROOM].host = socket.id;
            rooms[ACTIVE_ROOM].votes = rooms[ACTIVE_ROOM].votes || {};
            rooms[ACTIVE_ROOM].points = rooms[ACTIVE_ROOM].points || {};
            if (typeof rooms[ACTIVE_ROOM].pointsCommitted !== 'boolean') rooms[ACTIVE_ROOM].pointsCommitted = false;
        }

        // Setup socket for admin (do NOT add to room.players)
        socket.join(ACTIVE_ROOM);
        socket.roomCode = ACTIVE_ROOM;
        socket.playerName = 'Admin';
        socket.isHost = true;
        socket.emit('adminJoined');

        // Always send a fresh snapshot so new admin tabs (even with high lastSeenSeq from shared localStorage) see current state
        try {
            const playerItemsNow = currentPlayerItemsExcludingHost(ACTIVE_ROOM);
            const submittedNow = rooms[ACTIVE_ROOM].submitted || [];
            const adminHasReal = !!rooms[ACTIVE_ROOM].realAnswer;
            socket.emit('updateSubmitted', { players: playerItemsNow, submitted: submittedNow, adminHasRealAnswer: adminHasReal });

            if (rooms[ACTIVE_ROOM].currentQuestion) {
                socket.emit('questionSent', { question: rooms[ACTIVE_ROOM].currentQuestion, area: rooms[ACTIVE_ROOM].currentQuestionArea || '' });
            }

            if (rooms[ACTIVE_ROOM].shuffledAnswers) {
                const lettered = rooms[ACTIVE_ROOM].shuffledAnswers.map((a, i) => ({ letter: String.fromCharCode(65 + i), text: a.text, name: a.name, color: colorForName(rooms[ACTIVE_ROOM], a.name) }));
                socket.emit('showAllAnswers', lettered.map(a => ({ letter: a.letter, text: a.text, name: a.name, color: a.color })));
            } else if (rooms[ACTIVE_ROOM].answers && rooms[ACTIVE_ROOM].answers.length > 0) {
                const lettered = rooms[ACTIVE_ROOM].answers.map((a, i) => ({ letter: String.fromCharCode(65 + i), text: a.text, name: a.name, color: colorForName(rooms[ACTIVE_ROOM], a.name) }));
                socket.emit('showAllAnswers', lettered.map(a => ({ letter: a.letter, text: a.text, name: a.name, color: a.color })));
            }

            socket.emit('votingUpdate', { votes: rooms[ACTIVE_ROOM].votes || {}, playerNames: playerItemsNow.map(p => p.name), players: playerItemsNow });
            socket.emit('pointsUpdate', rooms[ACTIVE_ROOM].points || {});
        } catch (e) {
            console.error('adminConnect snapshot failed', e);
        }

        // Send current player/admin lists immediately so overlay has data
        try { emitPlayerLists(ACTIVE_ROOM); } catch (_) {}

        replayEvents(socket, ACTIVE_ROOM, lastSeenSeq);
    });

    // Spieler verbindet sich
    socket.on('playerJoin', ({ playerName, lastSeenSeq }) => {
        if (!playerName.trim()) {
            socket.emit('error', 'Bitte einen Namen eingeben!');
            return;
        }
        if (!rooms[ACTIVE_ROOM]) {
            socket.emit('error', 'Der Admin hat das Spiel noch nicht geöffnet.');
            return;
        }
        
        // Prüfe ob dieser Spieler bereits existiert (Reconnect)
        const existingPlayer = Object.entries(rooms[ACTIVE_ROOM].players).find(([id, p]) => p.name === playerName.trim());
        let preservedGrokEnabled = false;
        let preservedColor = null;
        if (existingPlayer) {
            const [oldId, playerData] = existingPlayer;
            // Preserve grokEnabled flag before deleting
            preservedGrokEnabled = !!playerData.grokEnabled;
            preservedColor = playerData.color || null;
            // Lösche alten Eintrag
            delete rooms[ACTIVE_ROOM].players[oldId];
            // Cleare timeout falls vorhanden
            if (playerData.disconnectTimeout) {
                clearTimeout(playerData.disconnectTimeout);
            }
            log(`${playerName} hat sich wieder verbunden (war offline), grokEnabled=${preservedGrokEnabled}`);
        }

        joinRoom(socket, ACTIVE_ROOM, playerName.trim(), false, preservedGrokEnabled, preservedColor);
        log(`${playerName} beigetreten`);
        replayEvents(socket, ACTIVE_ROOM, Number(lastSeenSeq) || 0);
    });

    function joinRoom(socket, roomCode, playerName, isHost, preservedGrokEnabled = false, preservedColor = null) {
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerName = playerName;
        socket.isHost = isHost;

        // determine remote IP (handle IPv4-mapped IPv6)
        let ip = socket.handshake && (socket.handshake.address || socket.handshake.headers && socket.handshake.headers['x-forwarded-for']) || socket.request && socket.request.connection && socket.request.connection.remoteAddress || socket.conn && socket.conn.remoteAddress || 'unknown';
        if (typeof ip === 'string' && ip.startsWith('::ffff:')) ip = ip.split('::ffff:').pop();

        // Vor dem Hinzufügen prüfen, ob Platz ist. Falls nicht, Bots entfernen
        let allPlayers = Object.values(rooms[roomCode].players || {});
        let botIds = Object.entries(rooms[roomCode].players || {}).filter(([id, p]) => p && p.isBot).map(([id]) => id);
        while (allPlayers.length >= MAX_PLAYERS && botIds.length > 0) {
            // Entferne einen Bot, um Platz zu schaffen
            const removeId = botIds.pop();
            delete rooms[roomCode].players[removeId];
            allPlayers = Object.values(rooms[roomCode].players || {});
            botIds = Object.entries(rooms[roomCode].players || {}).filter(([id, p]) => p && p.isBot).map(([id]) => id);
        }
        // Wenn immer noch zu viele Spieler, Abbruch
        if (allPlayers.length >= MAX_PLAYERS) {
            socket.emit('roomFull', { max: MAX_PLAYERS });
            return;
        }
        // Assign first free color in palette order; preserve previous color if rejoining
        const assignedColor = pickUniqueColor(rooms[roomCode], playerName, preservedColor);
        rooms[roomCode].players[socket.id] = { name: playerName, ip, offline: false, disconnectTimeout: null, grokEnabled: preservedGrokEnabled, color: assignedColor };
        if (!rooms[roomCode].points) rooms[roomCode].points = {};
        if (!rooms[roomCode].votes) rooms[roomCode].votes = {};
        if (typeof rooms[roomCode].pointsCommitted !== 'boolean') rooms[roomCode].pointsCommitted = false;

        // emit updated player lists (normal list to all, detailed list to admin)
        emitPlayerLists(roomCode);
        broadcastUpdateSubmitted(roomCode);
        emitWithSeqToRoom(roomCode, 'pointsUpdate', rooms[roomCode].points || {});
        socket.emit('joinedRoom', { isHost });

        // Send Grok permission status to the player
        if (!isHost && rooms[roomCode].players[socket.id]) {
            socket.emit('grokPermissionUpdate', { grokEnabled: !!rooms[roomCode].players[socket.id].grokEnabled });
        }

        if (rooms[roomCode].currentQuestion) {
            socket.emit('questionSent', rooms[roomCode].currentQuestion);
        }
    }

    // helper: emit only to connected screen clients in a room
    function emitToScreens(roomCode, event, data) {
        try {
            let count = 0;
            const inspected = [];
            for (const [id, s] of io.sockets.sockets) {
                try {
                    const entry = {
                        id: id,
                        isScreen: !!(s && s.isScreen),
                        roomCode: s && s.roomCode ? s.roomCode : null,
                        connected: !!(s && s.connected)
                    };
                    let matched = false;
                    if (s && s.isScreen && s.roomCode === roomCode) {
                        try { s.emit(event, data); matched = true; count++; } catch (e) { /* ignore emit error per socket */ }
                    }
                    entry.matched = matched;
                    inspected.push(entry);
                } catch (inner) {
                    // continue on problematic socket
                    inspected.push({ id, error: String(inner) });
                }
            }
            log(`[SERVER] emitToScreens -> event=${event} sentTo=${count}`);
            if (count === 0) {
                // when nothing was sent, dump inspected sockets for diagnostics
                try {
                    log(`[SERVER] emitToScreens diagnostics -> inspectedSockets=${JSON.stringify(inspected)}`);
                } catch (e) {
                    console.error('Failed to stringify inspected sockets', e);
                }
            }
        } catch (e) {
            console.error('emitToScreens error', e);
        }
    }

    // Admin sendet die Frage an alle
    socket.on('sendQuestion', (data) => {
        if (socket.isHost && rooms[ACTIVE_ROOM]) {
            const question = typeof data === 'string' ? data : (data.question || '');
            const area = typeof data === 'object' ? (data.area || '') : '';
            rooms[ACTIVE_ROOM].currentQuestion = question.trim();
            rooms[ACTIVE_ROOM].currentQuestionArea = area;
            rooms[ACTIVE_ROOM].answers = [];
            rooms[ACTIVE_ROOM].submitted = [];
            rooms[ACTIVE_ROOM].realAnswer = '';
            rooms[ACTIVE_ROOM].roundActive = true;
            rooms[ACTIVE_ROOM].votes = {};
            rooms[ACTIVE_ROOM].pointsCommitted = false;
            rooms[ACTIVE_ROOM].shuffledAnswers = null;
            rooms[ACTIVE_ROOM].answersFinalized = false;

            // For Activity area: select a random player to perform the action
            let activityPlayer = null;
            const areaLower = String(area).toLowerCase().trim();
            const isActivityArea = areaLower.includes('activity');
            log(`[SERVER] sendQuestion area="${area}", isActivity=${isActivityArea}`);
            
            let activityCandidates = [];
            if (isActivityArea) {
                const candidates = Object.keys(rooms[ACTIVE_ROOM].players)
                    .filter(id => id !== rooms[ACTIVE_ROOM].host)
                    .filter(id => !rooms[ACTIVE_ROOM].players[id].isBot); // exclude bots
                activityCandidates = candidates.map(id => rooms[ACTIVE_ROOM].players[id].name);
                if (candidates.length > 0) {
                    const randomIdx = Math.floor(Math.random() * candidates.length);
                    activityPlayer = {
                        socketId: candidates[randomIdx],
                        name: rooms[ACTIVE_ROOM].players[candidates[randomIdx]].name
                    };
                    rooms[ACTIVE_ROOM].activityPlayer = activityPlayer;
                    log(`[SERVER] Activity player selected (no bots): ${activityPlayer.name} (${activityPlayer.socketId})`);
                } else {
                    log('[SERVER] Activity round requested but no eligible non-bot players');
                }
            }

            // Send to all sockets in the room
            emitWithSeqToRoom(ACTIVE_ROOM, 'questionSent', { 
                question: question.trim(), 
                area: area,
                activityPlayer: activityPlayer ? { socketId: activityPlayer.socketId, name: activityPlayer.name } : null,
                activityCandidates
            });
            // Let server-side bots generate answers
            try { scheduleBotAnswers(ACTIVE_ROOM); } catch (e) { console.error('scheduleBotAnswers failed', e); }
            
            log(`[SERVER] emit questionSent -> "${question.trim()}" (area: ${area}, activityPlayer: ${activityPlayer ? activityPlayer.name : 'none'})`);
            const playersNow = currentPlayersExcludingHost(ACTIVE_ROOM);
            const playerItemsNow = currentPlayerItemsExcludingHost(ACTIVE_ROOM);
            const adminHasReal = !!rooms[ACTIVE_ROOM].realAnswer;
            emitWithSeqToRoom(ACTIVE_ROOM, 'updateSubmitted', { players: playerItemsNow, submitted: [], adminHasRealAnswer: adminHasReal });
            log(`[SERVER] emit updateSubmitted -> submitted=0 players=${playersNow.length}`);
            log(`Frage gestellt: "${question.trim()}"`);
            
            // Track term usage
            if (question.trim()) {
                incrementTermUsage(question.trim());
                log(`[TERMS] Usage aktualisiert für: "${question.trim()}" (count: ${termUsage[question.trim()]})`);
            }
        }
    });

    // Client sendet Term Usage Tracking
    socket.on('termUsed', (data) => {
        if (data && data.term) {
            incrementTermUsage(data.term);
            log(`[TERMS] Frontend: Term verwendet "${data.term}" (count: ${termUsage[data.term]})`);
        }
    });

    // Broadcast term usage stats to all clients
    function broadcastTermUsage() {
        try {
            io.emit('termUsageUpdate', termUsage);
        } catch (e) {
            console.error('Fehler beim Broadcast von termUsage:', e);
        }
    }
    // Spieler sendet (oder aktualisiert) Antwort â€“ mehrfach erlaubt
    socket.on('submitAnswer', (answer) => {
        if (socket.isHost || !rooms[ACTIVE_ROOM]?.roundActive) return;

        const room = rooms[ACTIVE_ROOM];
        const trimmed = answer.trim();

        if (!trimmed) return;

        // Alte Antwort dieses Spielers entfernen
        room.answers = room.answers.filter(a => a.name !== socket.playerName);

        // Neue Antwort hinzufÃ¼gen
        room.answers.push({ name: socket.playerName, text: trimmed });
        
        // Als geantwortet markieren
        if (!room.submitted.includes(socket.playerName)) {
            room.submitted.push(socket.playerName);
        }
        log(`Antwort von ${socket.playerName}: "${trimmed}" - Total answers: ${room.answers.length}`);
        const playersNow = currentPlayersExcludingHost(ACTIVE_ROOM);
        broadcastUpdateSubmitted(ACTIVE_ROOM);
        log(`[SERVER] emit updateSubmitted -> submitted=${room.submitted.length} players=${playersNow.length}`);

        // If all players have submitted, also send the answers to screen views immediately
        if (room.submitted.length === playersNow.length) {
            // build answersToShow similar to admin view
            let answersToShow = room.shuffledAnswers ? room.shuffledAnswers : [...room.answers];
            if (room.realAnswer && !answersToShow.find(a => a.name === 'Echte Definition')) {
                answersToShow = [...answersToShow, { name: 'Echte Definition', text: room.realAnswer }];
            }
            const letteredForScreens = answersToShow.map((a, i) => ({ letter: String.fromCharCode(65 + i), text: a.text, name: a.name, color: colorForName(room, a.name) }));
            emitToScreens(ACTIVE_ROOM, 'showAllAnswers', letteredForScreens);
            log(`[SCREEN] showAllAnswers emitted to screens (all answers in): ${letteredForScreens.length} answers`);
        }

        // Mische Antworten bei jedem Eingang, wenn noch nicht finalisiert
        const allAnswersIn = room.submitted.length === playersNow.length && room.realAnswer;
        if (!room.answersFinalized) {
            let allAnswers = [...room.answers];
            if (room.realAnswer) {
                allAnswers.push({ name: 'Echte Definition', text: room.realAnswer });
            }
            room.shuffledAnswers = shuffleArray(allAnswers);
            
            // Wenn alle Antworten da sind, finalisiere die Reihenfolge
            if (allAnswersIn) {
                room.answersFinalized = true;
            }
        } else if (room.shuffledAnswers) {
            // Wenn finalisiert, aktualisiere die Antwort in den bereits gemischten Antworten
            const existingIndex = room.shuffledAnswers.findIndex(a => a.name === socket.playerName);
            if (existingIndex !== -1) {
                room.shuffledAnswers[existingIndex].text = trimmed;
            } else {
                // Neue Antwort hinzufügen (sollte nicht vorkommen, aber Absicherung)
                room.shuffledAnswers.push({ name: socket.playerName, text: trimmed });
            }
        }

        // LIVE-ANZEIGE: An Admin senden
        if (room.host) {
            const hostSocket = io.sockets.sockets.get(room.host);
            if (hostSocket) {
                // Verwende gemischte Antworten falls vorhanden (nach startVoting), sonst aktuelle Liste
                let answersToShow;
                if (room.shuffledAnswers) {
                    answersToShow = room.shuffledAnswers;
                } else {
                    answersToShow = [...room.answers];
                    if (room.realAnswer) {
                        answersToShow.push({ name: 'Echte Definition', text: room.realAnswer });
                    }
                }
                
                const lettered = answersToShow.map((a, i) => ({
                    letter: String.fromCharCode(65 + i),
                    text: a.text,
                    name: a.name || a.submitterName || null
                }));
                    log(`[ADMIN] showAllAnswers emit: ${lettered.length} answers`);
                    hostSocket.emit('showAllAnswers', lettered);
                    // only show answers on screen when all players have submitted
                    if (room.submitted.length === playersNow.length) {
                        emitToScreens(ACTIVE_ROOM, 'showAllAnswers', lettered);
                        log('[ADMIN] showAllAnswers emitted to host and screens (all answers in)');
                    } else {
                        log('[ADMIN] showAllAnswers emitted to host');
                    }
            }
        }

        log(`Antwort von ${socket.playerName} (aktualisiert): "${trimmed}"`);
    });

    // Admin requests a specific player to re-enter their name
    socket.on('requestRename', (targetSocketId) => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        const target = io.sockets.sockets.get(targetSocketId);
        if (target) {
            target.emit('forceRename');
            log(`Admin requested rename for socket ${targetSocketId}`);
        }
    });

        // Admin removes a player from the game (works for online, offline, and bots)
        socket.on('removePlayer', (targetSocketId) => {
            if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
            const room = rooms[ACTIVE_ROOM];
            const target = io.sockets.sockets.get(targetSocketId);
        
            if (target && room.players[targetSocketId]) {
                const playerName = room.players[targetSocketId].name;
            
                // Remove from players list
                delete room.players[targetSocketId];
            
                // Notify the removed player
                target.emit('playerRemoved', { message: `Du wurdest vom Admin aus dem Spiel entfernt.` });
                target.leave(ACTIVE_ROOM);
            
                // Update players list for everyone
                emitPlayerLists(ACTIVE_ROOM);
            
                log(`Admin removed player ${playerName} (${targetSocketId})`);
            } else if (room.players[targetSocketId]) {
                // Target socket not found (offline or bot) — remove entry and clean up state
                const playerInfo = room.players[targetSocketId];
                const playerName = playerInfo.name;
                const wasBot = !!playerInfo.isBot;
                const wasOffline = !!playerInfo.offline;
                delete room.players[targetSocketId];
                // cleanup submitted/answers/votes/points
                room.answers = (room.answers || []).filter(a => a.name !== playerName);
                room.submitted = (room.submitted || []).filter(n => n !== playerName);
                if (room.votes) Object.keys(room.votes).forEach(k => { if (k === playerName) delete room.votes[k]; });
                if (room.points && Object.prototype.hasOwnProperty.call(room.points, playerName)) delete room.points[playerName];
                emitPlayerLists(ACTIVE_ROOM);
                broadcastUpdateSubmitted(ACTIVE_ROOM);
                log(`Admin removed ${wasBot ? 'bot' : (wasOffline ? 'offline player' : 'player without socket')} ${playerName} (${targetSocketId})`);
            }
        });

    // Admin toggles Grok permission for a player
    socket.on('togglePlayerGrok', (data) => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        const room = rooms[ACTIVE_ROOM];
        const { playerId, enabled } = data;
        
        if (room.players[playerId]) {
            room.players[playerId].grokEnabled = !!enabled;
            log(`Admin ${enabled ? 'enabled' : 'disabled'} Grok for ${room.players[playerId].name}`);
            
            // Notify the specific player of their grokEnabled status
            const targetSocket = io.sockets.sockets.get(playerId);
            if (targetSocket) {
                targetSocket.emit('grokPermissionUpdate', { grokEnabled: !!enabled });
            }
            
            // Update admin list to reflect the change
            emitPlayerLists(ACTIVE_ROOM);
        }
    });

        // Admin sets points for a player
        socket.on('setPlayerPoints', (data) => {
            if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
            const room = rooms[ACTIVE_ROOM];
            const playerId = data && data.playerId;
            const playerNameInput = data && data.playerName;
            let points = Number(data && data.points);
            if (!isFinite(points)) return;
            points = Math.round(points);
            if (points < 0) points = 0;
            let playerName = '';
            if (playerId && room.players[playerId] && room.players[playerId].name) {
                playerName = room.players[playerId].name;
            } else if (typeof playerNameInput === 'string' && playerNameInput.trim()) {
                playerName = playerNameInput.trim();
            } else {
                return;
            }
            if (!room.points) room.points = {};
            room.points[playerName] = points;
            emitWithSeqToRoom(ACTIVE_ROOM, 'pointsUpdate', room.points || {});
            log(`Admin set points: ${playerName} = ${points}`);
        });

    // Admin sets number of server-side bots
    socket.on('setBots', (count) => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        try {
            ensureBots(ACTIVE_ROOM, count);
            emitPlayerLists(ACTIVE_ROOM);  // Refresh player lists so admin UI updates
            log(`Admin set bots -> count=${count}`);
        } catch (e) {
            console.error('setBots failed', e);
        }
    });

    // Admin sets a player's color (from admin UI)
    socket.on('setPlayerColor', (data) => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        try {
            const { playerId, color } = data || {};
            if (!playerId || !color) return;
            const room = rooms[ACTIVE_ROOM];
            if (!room.players[playerId]) return;
            const playerName = room.players[playerId].name;
            const uniqueColor = pickUniqueColor(room, playerName, color);
            room.players[playerId].color = uniqueColor;
            // persist mapping by name
            try {
                playerColors[playerName] = uniqueColor;
                _savePlayerColors();
            } catch (e) { /* ignore */ }
            // notify admin and clients
            emitPlayerLists(ACTIVE_ROOM);
            log(`Admin set color for ${playerName} -> ${uniqueColor}`);
        } catch (e) {
            console.error('setPlayerColor failed', e);
        }
    });
    // Screen connects (read-only view) - joins room but is not a player
    socket.on('screenConnect', (data = {}) => {
        const lastSeenSeq = Number(data.lastSeenSeq) || 0;
        // Always mark this socket as a screen and tag the intended roomCode so
        // emitToScreens can find it later even if the admin hasn't created the
        // room yet. Joining the socket.io room is harmless.
        try {
            socket.join(ACTIVE_ROOM);
            socket.isScreen = true;
            socket.roomCode = ACTIVE_ROOM;
        } catch (e) {
            console.error('screenConnect: failed to join room or set flags', e);
        }

        // log screen connection and current screen count for this room
        try {
            const screensNow = Array.from(io.sockets.sockets.values()).filter(s => s && s.isScreen && s.roomCode === ACTIVE_ROOM).length;
            log(`[SERVER] screenConnect from ${socket.id} -> screensNow=${screensNow}`);
        } catch (e) {
            console.error('screenConnect logging failed', e);
        }

        // If there is no game yet, inform the client but keep it registered as a screen
        if (!rooms[ACTIVE_ROOM]) {
            socket.emit('noGame');
            return;
        }

        // send current player list (excluding host)
        const playerItemsNow = currentPlayerItemsExcludingHost(ACTIVE_ROOM);
        const submittedNow = rooms[ACTIVE_ROOM].submitted || [];
        const adminHasReal = !!rooms[ACTIVE_ROOM].realAnswer;
        socket.emit('updateSubmitted', { players: playerItemsNow, submitted: submittedNow, adminHasRealAnswer: adminHasReal });

        // send current question if any
        if (rooms[ACTIVE_ROOM].currentQuestion) {
            socket.emit('questionSent', { question: rooms[ACTIVE_ROOM].currentQuestion, area: rooms[ACTIVE_ROOM].currentQuestionArea || '' });
        }

        // send current answers/shuffled if present
        if (rooms[ACTIVE_ROOM].shuffledAnswers) {
            const lettered = rooms[ACTIVE_ROOM].shuffledAnswers.map((a, i) => ({ letter: String.fromCharCode(65 + i), text: a.text, name: a.name, color: colorForName(rooms[ACTIVE_ROOM], a.name) }));
            socket.emit('showAllAnswers', lettered.map(a => ({ letter: a.letter, text: a.text, name: a.name, color: a.color })));
        } else if (rooms[ACTIVE_ROOM].answers && rooms[ACTIVE_ROOM].answers.length > 0) {
            const lettered = rooms[ACTIVE_ROOM].answers.map((a, i) => ({ letter: String.fromCharCode(65 + i), text: a.text, name: a.name, color: colorForName(rooms[ACTIVE_ROOM], a.name) }));
            socket.emit('showAllAnswers', lettered.map(a => ({ letter: a.letter, text: a.text, name: a.name, color: a.color })));
        }

        // send votes/points if any
        socket.emit('votingUpdate', { votes: rooms[ACTIVE_ROOM].votes || {}, playerNames: playerItemsNow.map(p => p.name), players: playerItemsNow });
        socket.emit('pointsUpdate', rooms[ACTIVE_ROOM].points || {});

        // replay missed events (after initial snapshot)
        replayEvents(socket, ACTIVE_ROOM, lastSeenSeq);
    });

    // Player sends changed name
    socket.on('changeName', (newName) => {
        if (!socket.roomCode || !rooms[socket.roomCode]) return;
        const room = rooms[socket.roomCode];
        const old = socket.playerName;
        const name = (newName || '').trim();
        if (!name) return;
        // update player record
        if (room.players && room.players[socket.id]) {
            // preserve color mapping: assign persisted color for new name (or compute+persist)
            // Keep current color slot; do not reshuffle on rename
            const currentColor = room.players[socket.id].color;
            room.players[socket.id].name = name;
            room.players[socket.id].color = currentColor;
        }
        // update answers / submitted lists
        room.answers = room.answers.map(a => a.name === old ? { ...a, name } : a);
        room.submitted = room.submitted.map(n => n === old ? name : n);
        socket.playerName = name;
        // emit updated lists
        emitPlayerLists(socket.roomCode);
        broadcastUpdateSubmitted(socket.roomCode);
        log(`Spieler ${old} hat Namen geändert zu ${name}`);
    });

    

    // Admin requests to reveal/present results to all players
    socket.on('presentResults', () => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;

        const room = rooms[ACTIVE_ROOM];

        // Use the shuffled answers if available, otherwise build from scratch
        let allAnswers;
        if (room.shuffledAnswers) {
            allAnswers = room.shuffledAnswers;
        } else {
            allAnswers = [...room.answers];
            if (room.realAnswer) {
                allAnswers = [...allAnswers, { name: 'Echte Definition', text: room.realAnswer }];
            }
        }

        const lettered = allAnswers.map((a, i) => ({
            letter: String.fromCharCode(65 + i),
            text: a.text,
            name: a.name,
            color: colorForName(room, a.name)
        }));

        // find index of real answer (if any)
        let realIndex = -1;
        if (room.realAnswer) {
            realIndex = lettered.findIndex(a => a.name === 'Echte Definition' || (a.text === room.realAnswer));
        }

        // Award points once per round (3 per vote received on fakes, 2 for correct vote)
        if (!room.pointsCommitted) {
            const pointsMap = room.points || {};
            const votes = room.votes || {};
            const correctLetter = realIndex >= 0 ? lettered[realIndex].letter : null;

            lettered.forEach(ans => {
                if (!ans.name || ans.name === 'Echte Definition') return;
                const votesFor = Object.values(votes || {}).filter(l => l === ans.letter).length;
                pointsMap[ans.name] = (pointsMap[ans.name] || 0) + votesFor * 3;
            });

            if (correctLetter) {
                Object.entries(votes || {}).forEach(([voterName, votedLetter]) => {
                    if (votedLetter === correctLetter) {
                        pointsMap[voterName] = (pointsMap[voterName] || 0) + 2;
                    }
                });
            }

            room.points = pointsMap;
            room.pointsCommitted = true;
            emitWithSeqToRoom(ACTIVE_ROOM, 'pointsUpdate', pointsMap);
            log(`[SERVER] emitted pointsUpdate -> entries=${Object.keys(pointsMap).length}`);
        }

        emitWithSeqToRoom(ACTIVE_ROOM, 'revealAnswers', { lettered, realIndex });
        log(`[SERVER] emitted revealAnswers -> count=${lettered.length} realIndex=${realIndex}`);
        log('Ergebnisse präsentiert');
    });

    // Admin sendet richtige Antwort â†’ endgÃ¼ltig mischen
    socket.on('submitRealAnswer', (realAnswer) => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]?.roundActive) return;

        rooms[ACTIVE_ROOM].realAnswer = realAnswer.trim();
        rooms[ACTIVE_ROOM].pointsCommitted = false;

        const room = rooms[ACTIVE_ROOM];
        const playersNow = currentPlayersExcludingHost(ACTIVE_ROOM);
        const allAnswersIn = room.submitted.length === playersNow.length;
        
        // Mische Antworten wenn noch nicht finalisiert
        if (!room.answersFinalized) {
            let allAnswers = [...room.answers, { name: 'Echte Definition', text: realAnswer.trim() }];
            room.shuffledAnswers = shuffleArray(allAnswers);
            
            // Wenn alle Antworten da sind, finalisiere die Reihenfolge
            if (allAnswersIn) {
                room.answersFinalized = true;
            }
        } else if (room.shuffledAnswers) {
            // Wenn finalisiert, aktualisiere die echte Antwort in den bereits gemischten Antworten
            const existingIndex = room.shuffledAnswers.findIndex(a => a.name === 'Echte Definition');
            if (existingIndex !== -1) {
                room.shuffledAnswers[existingIndex].text = realAnswer.trim();
            } else {
                // Neue echte Antwort hinzufügen (sollte nicht vorkommen, aber Absicherung)
                room.shuffledAnswers.push({ name: 'Echte Definition', text: realAnswer.trim() });
            }
        }
        
        // Sende gemischte Antworten an Admin
        const answersToShow = room.shuffledAnswers || [...room.answers, { name: 'Echte Definition', text: realAnswer.trim() }];
        const lettered = answersToShow.map((a, i) => ({
            letter: String.fromCharCode(65 + i),
            text: a.text,
            name: a.name || a.submitterName || null
        }));

        socket.emit('showAllAnswers', lettered);
        // also update screens so they see the answers when admin finishes real answer
        emitToScreens(ACTIVE_ROOM, 'showAllAnswers', lettered);
        // inform all clients that admin has submitted the real answer (so admin gets a check)
        broadcastUpdateSubmitted(ACTIVE_ROOM);
        log(`Richtige Antwort eingereicht`);
    });

    // Neue Runde
    socket.on('newRound', () => {
        if (socket.isHost && rooms[ACTIVE_ROOM]) {
            const room = rooms[ACTIVE_ROOM];
            room.currentQuestion = '';
            room.realAnswer = '';
            room.answers = [];
            room.submitted = [];
            room.votes = {};
            room.votingActive = false;
            room.roundActive = false;
            room.pointsCommitted = false;
            room.shuffledAnswers = null;
            room.answersFinalized = false;
            emitWithSeqToRoom(ACTIVE_ROOM, 'roundEnded', {});
            broadcastUpdateSubmitted(ACTIVE_ROOM);
            emitWithSeqToRoom(ACTIVE_ROOM, 'pointsUpdate', room.points || {});
            log(`Neue Runde gestartet`);
        }
    });

    // Admin-Reset: Alle Spieler entfernen
    socket.on('adminReset', () => {
        if (socket.isHost && rooms[ACTIVE_ROOM]) {
            const room = rooms[ACTIVE_ROOM];
            for (const id in room.players) {
                if (id !== socket.id) {
                    delete room.players[id];
                }
            }
            room.answers = [];
            room.submitted = [];
            room.votes = {};
            room.points = {};
            room.pointsCommitted = false;
            room.currentQuestion = '';
            room.realAnswer = '';
            room.roundActive = false;
            room.shuffledAnswers = null;
            room.answersFinalized = false;
            // emit updated lists (only Admin remains)
            emitPlayerLists(ACTIVE_ROOM);
            broadcastUpdateSubmitted(ACTIVE_ROOM);
            emitWithSeqToRoom(ACTIVE_ROOM, 'roundEnded', {});
            emitWithSeqToRoom(ACTIVE_ROOM, 'pointsUpdate', room.points);
            log(`Spiel komplett zurückgesetzt durch Admin`);
        }
    });

    socket.on('disconnect', () => {
        if (socket.roomCode && rooms[socket.roomCode]) {
            const room = rooms[socket.roomCode];
            const player = room.players[socket.id];
            
            if (player && !socket.isHost) {
                // Markiere Spieler als offline statt zu löschen
                player.offline = true;
                log(`[DISCONNECT] ${socket.playerName} (${socket.id}) offline in room=${socket.roomCode} - warte 5 Minuten auf Reconnect`);
                
                // Setze 5-Minuten Timeout für endgültige Entfernung
                player.disconnectTimeout = setTimeout(() => {
                    if (room.players[socket.id] && room.players[socket.id].offline) {
                        delete room.players[socket.id];
                        room.submitted = room.submitted.filter(n => n !== socket.playerName);
                        log(`[CLEANUP] ${socket.playerName} (${socket.id}) endgültig entfernt nach 5 Minuten Offline in room=${socket.roomCode}`);
                        
                        // emit updated lists
                        emitPlayerLists(socket.roomCode);
                        broadcastUpdateSubmitted(socket.roomCode);
                        emitWithSeqToRoom(socket.roomCode, 'pointsUpdate', room.points || {});
                    }
                }, 5 * 60 * 1000); // 5 Minuten
                
                // emit updated lists mit offline markierung
                emitPlayerLists(socket.roomCode);
                broadcastUpdateSubmitted(socket.roomCode);
            } else if (socket.isHost) {
                // Admin disconnect - sofort entfernen
                delete room.players[socket.id];
                log(`[DISCONNECT] Admin (${socket.id}) getrennt – Spiel pausiert`);
            }
            if (Object.keys(room.players).length === 0) {
                delete rooms[ACTIVE_ROOM];
                log(`Spiel 1 geleert und geschlossen`);
            }
        }
    });

    // Admin kann Punkte zurücksetzen, ohne Spieler zu löschen
    socket.on('resetPoints', () => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        rooms[ACTIVE_ROOM].points = {};
        rooms[ACTIVE_ROOM].pointsCommitted = false;
        emitWithSeqToRoom(ACTIVE_ROOM, 'pointsUpdate', rooms[ACTIVE_ROOM].points);
        log('Punkte wurden vom Admin zurückgesetzt');
    });

    // Admin startet Abstimmung: Antworten werden an Spieler gesendet
    socket.on('startVoting', () => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        const room = rooms[ACTIVE_ROOM];
        if (!room.answers || room.answers.length === 0) {
            socket.emit('error', 'Keine Antworten zum Abstimmen');
            return;
        }

        room.votes = {}; // Reset votes
        room.pointsCommitted = false; // Allow fresh scoring this round
        room.votingActive = true;

        // Verwende bereits gemischte Antworten (wurden bei jedem Eingang gemischt)
        if (!room.shuffledAnswers) {
            // Fallback falls noch keine Mischung stattgefunden hat
            let allAnswers = [...room.answers];
            if (room.realAnswer) {
                allAnswers.push({ name: 'Echte Definition', text: room.realAnswer });
            }
            room.shuffledAnswers = allAnswers;
        }

        const lettered = room.shuffledAnswers.map((a, i) => ({
            letter: String.fromCharCode(65 + i),
            text: a.text,
            submitterName: a.name, // um Spieler zu verhindern, ihre Antwort zu wählen
            name: a.name,
            color: colorForName(room, a.name)
        }));
        
        // Sende gemischte Antworten an Admin zur Anzeige
        if (room.host) {
            const hostSocket = io.sockets.sockets.get(room.host);
            if (hostSocket) {
                hostSocket.emit('showAllAnswers', lettered);
                log(`[SERVER] emitted showAllAnswers -> admin count=${lettered.length}`);
                // mirror to screens only if all players have submitted
                try {
                    const playersNow = currentPlayersExcludingHost(ACTIVE_ROOM);
                    if (room.submitted.length === playersNow.length) {
                        emitToScreens(ACTIVE_ROOM, 'showAllAnswers', lettered);
                        log('[SERVER] mirrored showAllAnswers to screens (all answers in)');
                    } else {
                        log('[SERVER] not mirroring showAllAnswers to screens (awaiting submissions)');
                    }
                } catch (e) {
                    console.error('mirroring check failed', e);
                }
            }
        }
        // Send voting options to all non-host players
        const playerNames = Object.values(room.players)
            .filter(p => p.id !== room.host)
            .map(p => p.name);

        emitWithSeqToRoom(ACTIVE_ROOM, 'votingStarted', { lettered, playerNames });
        log(`[SERVER] emitted votingStarted -> options=${lettered.length} players=${playerNames.length}`);
        log('Abstimmung gestartet');
        // Let server-side bots vote
        try { scheduleBotVotes(ACTIVE_ROOM); } catch (e) { console.error('scheduleBotVotes failed', e); }
    });

    // Spieler sendet seine Wahl
    socket.on('submitVote', (letter) => {
        if (socket.isHost || !rooms[ACTIVE_ROOM]) return;
        const room = rooms[ACTIVE_ROOM];
        if (!room.votingActive) return;

        const playerName = socket.playerName;
        const validLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const letterIdx = validLetters.indexOf((letter || '').toUpperCase());

        if (letterIdx === -1 || letterIdx >= room.answers.length + (room.realAnswer ? 1 : 0)) {
            socket.emit('error', 'Ungültige Wahl');
            return;
        }

        // Prüfe, dass Spieler nicht seine eigene Antwort wählt (verwende shuffledAnswers!)
        const votingOptions = room.shuffledAnswers || [...room.answers, { name: 'Echte Definition', text: room.realAnswer }];
        const chosenAnswer = votingOptions[letterIdx];
        if (chosenAnswer.name === playerName) {
            socket.emit('error', 'Du kannst nicht deine eigene Antwort wählen!');
            return;
        }

        // Speichere Wahl
        room.votes[playerName] = letter.toUpperCase();
        log(`${playerName} hat sich für Antwort ${letter.toUpperCase()} entschieden`);

        // Sende aktualisierte Votes an alle (inkl. Spielernamen für neue Admin/Screen-Tabs)
        emitVotingUpdate(ACTIVE_ROOM);
        log(`[SERVER] emitted votingUpdate -> votes=${Object.keys(room.votes).length}`);
    });

    // Admin beendet Abstimmung
    socket.on('endVoting', () => {
        if (!socket.isHost || !rooms[ACTIVE_ROOM]) return;
        const room = rooms[ACTIVE_ROOM];
        room.votingActive = false;
        emitWithSeqToRoom(ACTIVE_ROOM, 'votingEnded', {});
        log('Abstimmung beendet');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    log(`Server läuft – bereit auf Port ${PORT}`);
    if (addresses.length > 0) {
        addresses.forEach(addr => log(`  → http://${addr}:${PORT}`));
    }
    log(`  → http://localhost:${PORT}`);
    
    // Load term usage tracking and canned answers on startup
    loadTermUsage();
    _loadCannedAnswers();
});

