const socket = io();
let screenVersion = 'NiP - V?';
const screenVersionEl = document.getElementById('screenVersion');

async function loadScreenVersion() {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.version) screenVersion = data.version;
    }
  } catch (e) {
    console.warn('[SCREEN] Version konnte nicht geladen werden', e);
  }
  if (screenVersionEl) screenVersionEl.textContent = screenVersion;
}

loadScreenVersion();

// Auto-refresh when coming back online after a disconnect (screen view)
let _screenWasOffline = false;
socket.on('disconnect', () => {
  console.warn('[SCREEN] Socket disconnected – will refresh on reconnect');
  _screenWasOffline = true;
});
socket.on('connect', () => {
  if (_screenWasOffline) {
    console.log('[SCREEN] Reconnected – refreshing page');
    _screenWasOffline = false;
    try { location.reload(); } catch (e) { /* ignore */ }
    return; // stop further handler work on this tick
  }
});

// Client-side color palette + deterministic picker (matches server & main app)
const SCREEN_COLOR_PALETTE = ['#e91e63','#9c27b0','#3f51b5','#03a9f4','#009688','#8bc34a','#ff9800','#795548','#607d8b','#f44336'];
function getColorForName(name) {
    if (!name) return SCREEN_COLOR_PALETTE[0];
    // check lastPlayers for color field first
    if (Array.isArray(lastPlayers)) {
      const found = lastPlayers.find(p => p && p.name === name);
      if (found && found.color) return found.color;
    }
    // fallback: first palette color only; server is authoritative
    return SCREEN_COLOR_PALETTE[0];
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

const SCREEN_SEQ_KEY = 'np_last_seq_screen';
let screenLastSeq = Number(localStorage.getItem(SCREEN_SEQ_KEY) || '0') || 0;
function persistScreenSeq(seq) {
  screenLastSeq = Math.max(screenLastSeq, Number(seq) || 0);
  localStorage.setItem(SCREEN_SEQ_KEY, String(screenLastSeq));
}

function safeText(t){ return (t===undefined || t===null) ? '' : String(t); }

// Log and request to be a screen view when connected
socket.on('connect', () => {
  console.log('[SCREEN] socket connected', socket.id);
  socket.emit('screenConnect', { lastSeenSeq: screenLastSeq });
  console.log('[SCREEN] emitted screenConnect');
});

socket.on('_seq', (seq) => {
  persistScreenSeq(seq);
});

const currentQuestionEl = document.getElementById('currentQuestion');
const currentAreaEl = document.getElementById('currentArea');
const playersList = document.getElementById('playersList');
const answersContainer = document.getElementById('answersContainer');
const votesBox = document.getElementById('votesBox');
const votesPre = document.getElementById('votesPre');
const pointsBox = document.getElementById('pointsBox');
const pointsPre = document.getElementById('pointsPre');

let lastLettered = null; // store last shown answers [{letter,text}]
let lastVotes = {};
let playerPoints = {};
let lastPlayers = [];
let lastSubmitted = [];
let lastAdminHasReal = false;

socket.on('noGame', () => {
  console.log('[SCREEN] event noGame');
  currentQuestionEl.textContent = 'Kein laufendes Spiel';
});

socket.on('updateSubmitted', ({ players, submitted, adminHasRealAnswer }) => {
  console.log('[SCREEN] event updateSubmitted', { players, submitted, adminHasRealAnswer });
  // players: [{name, offline, color?}] or list of names
  const normalizedRaw = (players && players.length && typeof players[0] === 'object') ? players : (players || []).map(n => ({ name: n }));
  const normalized = sortPlayersForDisplay(normalizedRaw);
  lastPlayers = normalized;
  lastSubmitted = submitted || [];
  lastAdminHasReal = !!adminHasRealAnswer;
  renderPlayersActions(normalized, lastSubmitted, lastVotes, lastAdminHasReal);
  
  // Zeige Antworten nur, wenn ALLE Spieler eingegeben haben
  const allSubmitted = normalized.length > 0 && normalized.every(p => lastSubmitted.includes(p.name));
  if (allSubmitted && lastLettered && lastLettered.length > 0) {
    renderAnswersWithVotes();
  } else if (!allSubmitted) {
    answersContainer.innerHTML = '— warte auf Antworten —';
  }
});

// When voting starts, capture player names to keep vote flags in sync even if updateSubmitted was missed
socket.on('votingStarted', (data = {}) => {
  console.log('[SCREEN] event votingStarted', data);
  const playerNames = Array.isArray(data.playerNames) ? data.playerNames.filter(Boolean) : [];
  if (playerNames.length) {
    // Keep existing lastPlayers if available (they have colors); only update names
    if (!lastPlayers || lastPlayers.length === 0) {
      lastPlayers = sortPlayersForDisplay(playerNames.map(n => ({ name: n })));
    }
    renderPlayersActions(lastPlayers, lastSubmitted, lastVotes, lastAdminHasReal);
  }
});

function renderPlayersActions(players, submitted, votes = {}, adminHasReal = false) {
  const sortedPlayers = sortPlayersForDisplay(players || []);
  if (!sortedPlayers || sortedPlayers.length === 0) {
    playersList.innerHTML = 'Warte auf Spieler...';
    return;
  }

  const playerItems = sortedPlayers.map(p => {
    const raw = typeof p === 'string' ? p : (p && p.name) || '';
    const baseName = raw.replace(/\s*\(offline\)\s*$/i, '');
    const hasOfflineTag = /\(offline\)/i.test(raw);
    const offline = typeof p === 'object' ? !!p.offline : hasOfflineTag;
    const display = offline && !hasOfflineTag ? `${baseName} (offline)` : raw || baseName;
    const color = (typeof p === 'object' && p.color) ? p.color : undefined;
    return { name: baseName, display, offline, color };
  });

  const tableHead = `<table class="actions-table"><thead><tr>
      <th>Spieler</th>
      <th class="vertical"><span class="rotated-label">Punkte</span></th>
      <th class="vertical"><span class="rotated-label">Gesendet</span></th>
      <th class="vertical"><span class="rotated-label">Abgestimmt</span></th>
  </tr></thead><tbody>`;

  // Admin row (show admin sent flag) — screen is read-only but we display status
  let adminRow = '';
  if (typeof adminHasReal !== 'undefined') {
    const adminSentHtml = `<span class="${adminHasReal ? 'status-yes' : 'status-no'}">${adminHasReal ? '✔' : '✖'}</span>`;
    adminRow = `<tr style="background:#222;"><td class="name-cell"><strong>Admin</strong></td><td class="points-cell">-</td><td class="status-cell">${adminSentHtml}</td><td class="status-cell">-</td></tr>`;
  }

  const rows = playerItems.map(p => {
    const sent = submitted.includes(p.name);
    const voted = !!votes && Object.prototype.hasOwnProperty.call(votes, p.name);
    const points = playerPoints[p.name] || 0;
    const sentHtml = `<span class="${sent ? 'status-yes' : 'status-no'}">${sent ? '✔' : '✖'}</span>`;
    const voteHtml = `<span class="${voted ? 'status-yes' : 'status-no'}">${voted ? '✔' : '✖'}</span>`;
    const color = (p && p.color) ? p.color : getColorForName(p.name);
    return `<tr><td class="name-cell"><span style="color:${color}">${p.display}</span></td><td class="points-cell">${points}</td><td class="status-cell">${sentHtml}</td><td class="status-cell">${voteHtml}</td></tr>`;
  }).join('');

  const tableFoot = `</tbody></table>`;
  const html = tableHead + adminRow + rows + tableFoot;

  const allSent = playerItems.length > 0 && playerItems.every(p => submitted.includes(p.name));
  const allVoted = playerItems.length > 0 && playerItems.every(p => votes && Object.prototype.hasOwnProperty.call(votes, p.name));
  const statusParts = [];
  if (allSent) statusParts.push('<span class="badge success">✔ Alle gesendet</span>');
  if (allVoted) statusParts.push('<span class="badge info">🗳 Alle abgestimmt</span>');
  const statusHtml = statusParts.length ? `<div class="actions-status">${statusParts.join(' ')}</div>` : '';

  playersList.innerHTML = html + statusHtml;

  // If screen should play sounds? keep screen silent — admin sounds remain in admin UI
}

socket.on('updatePlayers', (list) => {
  // Store player data including colors for rendering
  lastPlayers = sortPlayersForDisplay(list || []);
  if (lastSubmitted.length > 0 || Object.keys(lastVotes).length > 0) {
    renderPlayersActions(lastPlayers, lastSubmitted, lastVotes, lastAdminHasReal);
  }
});

socket.on('questionSent', (data) => {
  console.log('[SCREEN] event questionSent', data);
  const q = (typeof data === 'string') ? data : (data.question || '');
  const area = (typeof data === 'object') ? (data.area || '') : '';
  const activityPlayer = (typeof data === 'object') ? (data.activityPlayer || null) : null;
  const areaLower = String(area || '').toLowerCase();
  const isActivityArea = areaLower.includes('activity');
  const isSprachenArea = areaLower.includes('sprachen');

  // In ACTIVITY/SPRACHEN rounds, show generic label instead of the term
  const questionLabel = (isActivityArea || isSprachenArea) ? 'Der zu erratende Begriff' : (safeText(q) || '— keine Frage —');
  currentQuestionEl.textContent = questionLabel;
  currentAreaEl.textContent = area ? '' + area : '';
  answersContainer.innerHTML = '— warte auf Antworten —';
  if (votesBox) votesBox.style.display = 'none';
  if (pointsBox) pointsBox.style.display = 'none';

  // If ACTIVITY round, show selection overlay on screen as well
  const isActivityWithPlayer = (isActivityArea || !!activityPlayer) && !!activityPlayer;
  if (isActivityWithPlayer) {
    try {
      const fromPayload = (data && Array.isArray(data.activityCandidates)) ? data.activityCandidates : null;
      const playersArr = fromPayload && fromPayload.length
        ? fromPayload
        : (lastPlayers && lastPlayers.length) ? lastPlayers.map(p => (p && p.name) || (typeof p === 'string' ? p : '')) : [];
      const winner = activityPlayer && activityPlayer.name ? activityPlayer.name : null;
      showActivitySelection(playersArr, winner);
    } catch (e) { console.warn('[SCREEN] activity overlay failed', e); }
  }
});

// Activity selection overlay logic for screen
function showActivitySelection(players, winnerName) {
  const overlay = document.getElementById('activitySelectOverlay');
  const ticker = document.getElementById('activitySelectTicker');
  if (!overlay || !ticker) return;

  const items = (Array.isArray(players) && players.length) ? players.filter(Boolean) : [];
  if (!items.length && winnerName) items.push(winnerName);
  if (!items.length) return;

  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  ticker.classList.remove('winner');
  ticker.classList.add('fast');

  let idx = 0;
  ticker.textContent = items[0];
  ticker.style.color = getColorForName(items[0]);
  let interval = 80;
  let spins = 40 + Math.floor(Math.random() * 20);
  let step = 0;
  const timer = setInterval(() => {
    idx = (idx + 1) % items.length;
    ticker.textContent = items[idx];
    ticker.style.color = getColorForName(items[idx]);
    step += 1;
    if (step > spins * 0.6) interval += Math.floor((step - spins * 0.6) / 2);
    if (step >= spins) {
      clearInterval(timer);
      const final = winnerName && items.includes(winnerName) ? winnerName : items[Math.floor(Math.random() * items.length)];
      ticker.textContent = final;
      ticker.style.color = getColorForName(final);
      ticker.classList.remove('fast');
      ticker.classList.add('winner');
    }
  }, interval);

  const onClose = () => {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    ticker.classList.remove('winner');
  };

  const observer = new MutationObserver(() => {
    if (ticker.classList.contains('winner')) {
      observer.disconnect();
    }
  });
  observer.observe(ticker, { attributes: true, attributeFilter: ['class'] });
}

socket.on('showAllAnswers', (lettered) => {
  console.log('[SCREEN] event showAllAnswers', lettered);
  // lettered: [{letter, text}]
  lastLettered = lettered || [];
  
  // Zeige Antworten nur, wenn alle Spieler eingegeben haben
  const allSubmitted = lastPlayers.length > 0 && lastPlayers.every(p => lastSubmitted.includes(p.name));
  if (allSubmitted) {
    renderAnswersWithVotes();
  } else {
    console.log('[SCREEN] showAllAnswers empfangen, aber nicht alle haben gesendet - warte noch');
    answersContainer.innerHTML = '— warte auf alle Antworten —';
  }
});

socket.on('revealAnswers', ({ lettered, realIndex }) => {
  console.log('[SCREEN] event revealAnswers', { lettered, realIndex });
  // Show answers with indicator for real; display which players submitted which answer
  // preserve submitter names if present (some server emissions include `name`)
    lastLettered = (lettered || []).map(a => ({ letter: a.letter, text: a.text, name: (a.name && a.name !== 'Echte Definition') ? a.name : (a.submitterName && a.submitterName !== 'Echte Definition' ? a.submitterName : '') }));
  // hide vote-counts area (we'll show submitter names instead)
  if (votesBox) votesBox.style.display = 'none';
  renderAnswersWithVotes(realIndex, true);
});

socket.on('votingUpdate', (payload) => {
  console.log('[SCREEN] event votingUpdate', { payload, lastPlayersLength: lastPlayers.length });
  const voteMap = payload && typeof payload === 'object' && payload.votes ? payload.votes : (payload || {});
  const playerNames = payload && Array.isArray(payload.playerNames) ? payload.playerNames.filter(Boolean) : [];
  const playerObjs = payload && Array.isArray(payload.players) ? payload.players : [];
  console.log('[SCREEN] votingUpdate parsed', { votes: Object.keys(voteMap).length, playerNames });
  lastVotes = voteMap || {};
  if (votesBox) votesBox.style.display = 'block';
  renderAnswersWithVotes();
  // Use lastPlayers with colors if available, otherwise fall back to playerNames
  if (playerObjs.length) {
    lastPlayers = playerObjs;
  } else if ((!lastPlayers || lastPlayers.length === 0) && playerNames.length) {
    lastPlayers = playerNames.map(n => ({ name: n }));
  }
  const tablePlayers = (lastPlayers && lastPlayers.length)
    ? lastPlayers
    : (playerObjs.length ? playerObjs : (playerNames.length ? playerNames.map(n => ({ name: n })) : Object.keys(lastVotes || {}).map(name => ({ name }))));
  console.log('[SCREEN] rendering actions table with', { playerCount: tablePlayers.length, voteCount: Object.keys(lastVotes).length });
  renderPlayersActions(tablePlayers, lastSubmitted, lastVotes, lastAdminHasReal);
});

socket.on('pointsUpdate', (points) => {
  console.log('[SCREEN] event pointsUpdate', points);
  playerPoints = points || {};
  // update actions table to reflect points
  renderPlayersActions(lastPlayers, lastSubmitted, lastVotes, lastAdminHasReal);
});

function renderAnswersWithVotes(realIndex, reveal = false) {
  if (!lastLettered || lastLettered.length === 0) {
    answersContainer.innerHTML = '— noch keine Antworten —';
    return;
  }

  // count votes per letter (only used when not in reveal mode)
  const counts = {};
  if (!reveal) Object.values(lastVotes || {}).forEach(l => { counts[l] = (counts[l] || 0) + 1; });

  answersContainer.innerHTML = '';
  lastLettered.forEach((a, i) => {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'flex-start';
    container.style.gap = '12px';
    container.style.marginBottom = '8px';

    const pre = document.createElement('pre');
    pre.style.flex = '1';
    pre.style.margin = '0';
    const isRealAnswer = (typeof realIndex === 'number' && i === realIndex);
    const mark = isRealAnswer ? ' ★' : '';
    
    // Grüne Markierung für richtige Antwort
    if (isRealAnswer) {
      pre.classList.add('correct-answer');
    }

    if (reveal) {
      // color the letter with the submitter's color (no name text), but white for real answer
      const submitter = a.name ? (a.name) : '';
      const color = isRealAnswer ? '#fff' : (submitter ? getColorForName(submitter) : '#fff');
      pre.innerHTML = '<span class="letter" style="color:' + color + '">' + a.letter + '</span> ' + safeText(a.text) + mark;
      
      // Show voter stickers in reveal mode
      const votersDiv = document.createElement('div');
      votersDiv.style.display = 'flex';
      votersDiv.style.flexWrap = 'wrap';
      votersDiv.style.gap = '6px';
      votersDiv.style.alignItems = 'center';
      votersDiv.style.minWidth = '60px';
      
      const votesForThis = Object.entries(lastVotes || {})
        .filter(([, letter]) => letter === a.letter)
        .map(([voterName]) => voterName);
      
      if (votesForThis.length > 0) {
        votesForThis.forEach((voter) => {
          const badge = document.createElement('span');
          badge.title = voter;
          badge.style.display = 'inline-block';
          badge.style.width = '18px';
          badge.style.height = '18px';
          badge.style.borderRadius = '50%';
          badge.style.boxSizing = 'border-box';
          badge.style.border = '2px solid rgba(0,0,0,0.25)';
          badge.style.boxShadow = '0 1px 1px rgba(0,0,0,0.15)';
          badge.style.background = getColorForName(voter);
          badge.style.cursor = 'default';
          votersDiv.appendChild(badge);
        });
      }
      
      container.appendChild(pre);
      container.appendChild(votersDiv);
      answersContainer.appendChild(container);
    } else {
      // Before reveal: show all letters in white, no player colors yet
      const count = counts[a.letter] || 0;
      const submitter = a.name || a.submitterName || '';
      if (submitter) {
        pre.innerHTML = '<span class="letter">' + a.letter + '</span> ' + safeText(a.text) + mark;
      } else {
        pre.innerHTML = '<span class="letter">' + a.letter + '</span> ' + safeText(a.text) + mark + '<span class="vote-count">' + count + ' Stimmen</span>';
      }
      answersContainer.appendChild(pre);
    }
  });
}

socket.on('roundEnded', () => {
  console.log('[SCREEN] event roundEnded');
  currentQuestionEl.textContent = '— Runde beendet —';
  currentAreaEl.textContent = '';
  // clear answers and hide vote/points displays
  lastLettered = null;
  lastVotes = {};
  if (answersContainer) answersContainer.innerHTML = '';
  if (votesBox) votesBox.style.display = 'none';
  if (pointsBox) pointsBox.style.display = 'none';
});

// Fallback logging
socket.on('connect_error', (err) => console.error('[SCREEN] Socket connect error', err));

console.log('Screen client loaded (script evaluated)');

// Fullscreen button behavior (floating at bottom-right)
const fsBtn = document.getElementById('fullscreenBtn');
if (fsBtn) {
  fsBtn.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        fsBtn.textContent = 'Beenden';
      } else {
        await document.exitFullscreen();
        fsBtn.textContent = 'Vollbild';
      }
    } catch (e) {
      console.warn('Fullscreen failed', e);
    }
  });

  // reflect state
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) fsBtn.textContent = 'Vollbild';
  });
}

// Reload button in header (top-right)
const reloadBtn = document.getElementById('reloadBtn');
if (reloadBtn) {
  reloadBtn.addEventListener('click', () => {
    location.reload();
  });
}
