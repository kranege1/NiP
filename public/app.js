/* Minimal bootstrap orchestrator (no redefinitions) */
document.addEventListener('DOMContentLoaded', () => {
    // Confirm terms presence
    try {
        if (typeof nobodyIsPerfectTerms === 'undefined' || nobodyIsPerfectTerms.length === 0) {
            console.warn('terms.js nicht gefunden oder leer');
        }
    } catch(_) {}

    // Inputs: show clear buttons
    try {
        document.querySelectorAll('input[type="text"], textarea').forEach(input => {
            input.addEventListener('input', toggleClearButtons);
            input.addEventListener('focus', toggleClearButtons);
        });
    } catch(_) {}

function readAloudWithBrowserTTS() {
    speechSynthesis.cancel();
    let voice;
    try {
        const usePref = localStorage.getItem('usePreferredVoice') === '1' || document.getElementById('useSelectedVoice')?.checked;
        if (usePref) {
            const prefURI = localStorage.getItem('preferredVoiceURI');
            const prefName = localStorage.getItem('preferredVoiceName');
            const voicesNow = speechSynthesis.getVoices();
            if (prefURI) {
                voice = voicesNow.find(v => v.voiceURI === prefURI) || voicesNow.find(v => v.name === prefName) || getBestGermanVoice();
            } else if (prefName) {
                voice = voicesNow.find(v => v.name === prefName) || getBestGermanVoice();
            } else {
                voice = getBestGermanVoice();
            }
        } else {
            voice = getBestGermanVoice();
        }
    } catch (e) {
        voice = getBestGermanVoice();
    }

    function speakAnswers() {
        currentAnswers.forEach((a, index) => {
            const text = `${a.letter}: ${a.text}`;
            const utter = new SpeechSynthesisUtterance(text);
            if (voice) utter.voice = voice;
            utter.lang = 'de-DE';
            utter.rate = 0.85;
            if (index < currentAnswers.length - 1) {
                utter.onend = () => {
                    const pause = new SpeechSynthesisUtterance('');
                    speechSynthesis.speak(pause);
                };
            }
            speechSynthesis.speak(utter);
        });
    }

    if (currentQuestionText && currentQuestionText.trim()) {
        // Hole den Bereich aus dem Label
        const areaLabel = document.getElementById('questionAreaLabel');
        const areaText = (areaLabel && areaLabel.textContent && areaLabel.textContent.trim()) ? areaLabel.textContent.trim() : '';
        
        const questionWithArea = areaText ? `Begriff: ${currentQuestionText}, ${areaText}` : `Begriff: ${currentQuestionText}`;
        const qUtter = new SpeechSynthesisUtterance(questionWithArea);
        if (voice) qUtter.voice = voice;
        qUtter.lang = 'de-DE';
        qUtter.rate = 0.95;
        qUtter.onend = () => {
            const pause = new SpeechSynthesisUtterance('');
            pause.onend = () => speakAnswers();
            speechSynthesis.speak(pause);
        };
        speechSynthesis.speak(qUtter);
    } else {
        speakAnswers();
    }
}

/* ============= UI HEADER & ANSWERED TRACKING ============= */

function updateAnsweredHeaderNames() {
    const playerSpan = document.getElementById('playerNameInHeader');
    const adminSpan = document.getElementById('playerNameInHeaderAdmin');
    const display = myPlayerName ? `(${myPlayerName})` : '';
    if (playerSpan) playerSpan.textContent = display;
    if (adminSpan) {
        if (myPlayerName) {
            const color = getColorForName(myPlayerName);
            adminSpan.innerHTML = `<span style="color:${color}">(${myPlayerName})</span>`;
        } else {
            adminSpan.textContent = '';
        }
    }
}

/* ============= SOCKET EVENTS ============= */

// Initialize term usage data
window.termUsageData = {};

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

socket.on('termUsageUpdate', (data) => {
    window.termUsageData = data || {};
    console.log('[TERMS] Usage-Daten empfangen:', Object.keys(window.termUsageData).length, 'Begriffe');
});

socket.on('adminJoined', () => { 
    isHost = true; 
    populateAreaFilter();
    const areaFilter = document.getElementById('areaFilter');
    if (areaFilter) syncActivityMask(areaFilter.value);
    startGrokStatsPolling();
});

async function fetchGrokStats() {
    try {
        const res = await fetch('/api/grok/stats');
        if (!res.ok) {
            console.warn('Grok stats fetch failed:', res.status);
            return;
        }
        const data = await res.json();
        console.log('Grok stats received:', data);
        
        const statusEl = document.getElementById('grokStatus');
        const textEl = document.getElementById('grokStatusText');
        if (!statusEl || !textEl) return;
        
        statusEl.style.display = 'block';
        
        // Handle both snake_case and camelCase
        const total = data.total_tokens || data.totalTokens || 0;
        const promptTokens = data.total_prompt_tokens || data.totalPromptTokens || 0;
        const completionTokens = data.total_completion_tokens || data.totalCompletionTokens || 0;
        const requests = data.requests_made || data.requestsMade || 0;

        // Pricing for grok-4-1-fast-non-reasoning (update if xAI pricing changes):
        // approx. €5 per 1M prompt tokens and €15 per 1M completion tokens
        const INPUT_EUR_PER_M = 5.0;   // € per 1M prompt tokens
        const OUTPUT_EUR_PER_M = 15.0; // € per 1M completion tokens

        const costPromptEur = (promptTokens / 1_000_000) * INPUT_EUR_PER_M;
        const costCompletionEur = (completionTokens / 1_000_000) * OUTPUT_EUR_PER_M;
        const totalEur = costPromptEur + costCompletionEur;

        if (requests === 0) {
            textEl.textContent = '🤖 Grok: Noch nicht genutzt';
        } else {
            // If server provides cost breakdown, prefer that (more authoritative)
            try {
                if (data && data.cost && typeof data.cost.totalCost === 'number') {
                    const totalServer = data.cost.totalCost;
                    const currency = data.cost.currency || '$';
                    const serverStr = totalServer >= 1 ? `${currency}${totalServer.toFixed(2)}` : `${Math.round(totalServer * 100)} Cent`;
                    textEl.textContent = `🤖 Grok: ${total.toLocaleString()} Tokens (${requests}× genutzt) ≈ ${serverStr}`;
                } else {
                    const euroStr = totalEur >= 1 ? `€${totalEur.toFixed(2)}` : `${Math.round(totalEur * 100)} Cent`;
                    textEl.textContent = `🤖 Grok: ${total.toLocaleString()} Tokens (${requests}× genutzt) ≈ ${euroStr}`;
                }
            } catch (e) {
                const euroStr = totalEur >= 1 ? `€${totalEur.toFixed(2)}` : `${Math.round(totalEur * 100)} Cent`;
                textEl.textContent = `🤖 Grok: ${total.toLocaleString()} Tokens (${requests}× genutzt) ≈ ${euroStr}`;
            }
        }
    } catch (e) {
        console.error('Grok stats error:', e);
    }
}

let grokStatsInterval = null;
function startGrokStatsPolling() {
    fetchGrokStats(); // immediate
    if (grokStatsInterval) clearInterval(grokStatsInterval);
    grokStatsInterval = setInterval(fetchGrokStats, 10000); // every 10s
}

// Funktion zum Befüllen des Area-Filters
function populateAreaFilter() {
    const areaFilter = document.getElementById('areaFilter');
    if (!areaFilter || typeof nobodyIsPerfectTerms === 'undefined') return;
    
    // Sammle alle Areas
    const areas = new Set();
    nobodyIsPerfectTerms.forEach(term => {
        if (term.area) {
            areas.add(term.area);
        }
    });
    
    // Sortiere Areas alphabetisch
    const sortedAreas = Array.from(areas).sort();
    
    // Leere Dropdown (außer "ALLE")
    areaFilter.innerHTML = '<option value="ALLE">ALLE</option>';
    
    // Füge alle Areas hinzu
    sortedAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        areaFilter.appendChild(option);
    });
}

socket.on('joinedRoom', ({ isHost: host }) => {
    isHost = host;
    joined = true;
    const nameEl = document.getElementById('playerName');
    if (nameEl) myPlayerName = nameEl.value.trim();
    updateAnsweredHeaderNames();
    if (!isHost) {
        document.getElementById('playerSetup').style.display = 'none';
        document.getElementById('playerGame').style.display = 'block';
        document.getElementById('waitingMessage').style.display = 'block';
        document.getElementById('answerSection').style.display = 'none';
    }
});

socket.on('playerRemoved', (data) => {
    alert(data.message || 'Du wurdest aus dem Spiel entfernt.');
    setTimeout(() => location.reload(), 1000);
});

let myGrokEnabled = false;

socket.on('grokPermissionUpdate', (data) => {
    myGrokEnabled = !!data.grokEnabled;
    updateGrokButtonVisibility();
});

socket.on('updatePlayers', (players) => {
    const listEl = document.getElementById('playersList');
    if (players.length === 0) {
        listEl.innerHTML = 'Keine verbunden';
    } else {
        listEl.innerHTML = '';
        players.forEach(p => {
            const div = document.createElement('div');
            div.innerHTML = '• ';
            const span = document.createElement('span');
            const name = (typeof p === 'string') ? p : (p.name || '');
            // Farbe immer aus p.color, Fallback getColorForName
            span.textContent = name;
            span.style.color = (p && p.color) ? p.color : getColorForName(name);
            div.appendChild(span);
            listEl.appendChild(div);
        });
    }
    // Keep lastPlayers in sync so voting updates can re-render for players
    if (Array.isArray(players)) {
        lastPlayers = players;
        cacheColorsFromList(players);
        // Synchronize own color for header display
        const myNorm = normalizeName(myPlayerName);
        const mine = players.find(p => normalizeName((typeof p === 'string') ? p : (p && p.name) || '') === myNorm);
        if (mine && mine.color) {
            colorCache.set(myNorm, mine.color);
        }
        updateAnsweredHeaderNames();
    }
});

socket.on('updatePlayersAdmin', (players) => {
    lastAdminPlayers = players || [];
    cacheColorsFromList(players);
    
    function renderPlayers(targetEl) {
        if (!targetEl) return;
        if (!players || players.length === 0) {
            targetEl.innerHTML = 'Keine verbunden';
            return;
        }
        targetEl.innerHTML = '';
        players.forEach(p => {
            const id = p.id || '';
            const div = document.createElement('div');
            div.innerHTML = '• ';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;
            nameSpan.style.color = (p && p.color) ? p.color : getColorForName(p.name);
            nameSpan.style.cursor = 'pointer';
            nameSpan.style.textDecoration = 'underline';
            nameSpan.addEventListener('click', () => {
                if (!confirm(`Möchtest du "${p.name}" auffordern, seinen Namen neu einzugeben?`)) return;
                socket.emit('requestRename', id);
            });
            div.appendChild(nameSpan);
            targetEl.appendChild(div);
        });
    }
    
    function renderPlayersTable(targetEl) {
        if (!targetEl) return;
        if (!players || players.length === 0) {
            targetEl.innerHTML = 'Keine verbunden';
            return;
        }
        
        // Filter out admin from players list
        const playerList = players.filter(p => !p.isAdmin);
        
        if (playerList.length === 0) {
            targetEl.innerHTML = 'Keine Spieler';
            return;
        }
        
        targetEl.innerHTML = '';
        
        // Create table
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;';
        
        // Table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.cssText = 'background: rgba(76,175,80,0.15); border-bottom: 1px solid rgba(76,175,80,0.3);';
        const headers = ['Farbe', 'Spieler', 'Punkte', 'Namen ändern', 'Entfernen', 'Grok erlauben'];
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.cssText = 'padding: 10px 8px; text-align: left; font-weight: bold; color: #4CAF50;';
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Table body
        const tbody = document.createElement('tbody');
        playerList.forEach((p, idx) => {
            const row = document.createElement('tr');
            row.style.cssText = `border-bottom: 1px solid rgba(76,175,80,0.1); ${idx % 2 === 0 ? 'background: rgba(255,255,255,0.02);' : ''}`;
            
            // Color cell
            const colorCell = document.createElement('td');
            colorCell.style.cssText = 'padding: 10px 8px;';
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = (p && p.color) ? p.color : getColorForName(p.name) || '#ffffff';
            colorInput.title = 'Farbe zuweisen';
            colorInput.style.cssText = 'width:28px; height:22px; border:none; background:transparent; cursor:pointer;';
            colorInput.addEventListener('change', () => {
                try { socket.emit('setPlayerColor', { playerId: p.id, color: colorInput.value }); } catch (e) { console.warn('color emit failed', e); }
            });
            colorCell.appendChild(colorInput);
            row.appendChild(colorCell);

            // Player name cell
            const nameCell = document.createElement('td');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;
            nameSpan.style.color = (p && p.color) ? p.color : getColorForName(p.name);
            nameCell.appendChild(nameSpan);
            nameCell.style.cssText = 'padding: 10px 8px;';
            row.appendChild(nameCell);
            
            // Points edit cell
            const pointsCell = document.createElement('td');
            pointsCell.style.cssText = 'padding: 10px 8px;';
            const pointsInput = document.createElement('input');
            pointsInput.type = 'number';
            pointsInput.min = '0';
            pointsInput.step = '1';
            pointsInput.value = String((playerPoints && playerPoints[p.name]) ? playerPoints[p.name] : 0);
            pointsInput.title = 'Punkte ändern';
            pointsInput.style.cssText = 'width:70px; height:24px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:#fff; border-radius:6px; padding:2px 6px;';
            pointsInput.addEventListener('change', () => {
                const val = Math.max(0, Math.round(Number(pointsInput.value) || 0));
                try { socket.emit('setPlayerPoints', { playerId: p.id, points: val }); } catch (e) { console.warn('setPlayerPoints failed', e); }
            });
            pointsCell.appendChild(pointsInput);
            row.appendChild(pointsCell);
            
            // Rename button cell
            const renameCell = document.createElement('td');
            const renameBtn = document.createElement('button');
            renameBtn.textContent = '✎ Ändern';
            renameBtn.className = 'reset tiny-btn';
            renameBtn.style.cssText = 'padding: 6px 10px; font-size: 12px; cursor: pointer;';
            renameBtn.addEventListener('click', () => {
                if (!confirm(`Möchtest du "${p.name}" auffordern, seinen Namen neu einzugeben?`)) return;
                socket.emit('requestRename', p.id);
            });
            renameCell.appendChild(renameBtn);
            renameCell.style.cssText = 'padding: 10px 8px; text-align: center;';
            row.appendChild(renameCell);
            
            // Remove button cell
            const removeCell = document.createElement('td');
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '✕ Entfernen';
            removeBtn.className = 'reset tiny-btn';
            removeBtn.style.cssText = 'padding: 6px 10px; font-size: 12px; cursor: pointer; color: #ff6b6b;';
            removeBtn.addEventListener('click', () => {
                if (!confirm(`Spieler "${p.name}" entfernen?`)) return;
                socket.emit('removePlayer', p.id);
                // Optimistisch: direkt aus lokalen Listen entfernen (Name ohne "(offline)" vergleichen) und Boxen neu rendern
                try {
                    const removedName = p.name;
                    const base = (n) => String(n || '').replace(/\s*\(offline\)\s*$/i, '');
                    lastAdminPlayers = (lastAdminPlayers || []).filter(x => x && x.id !== p.id);
                    lastPlayers = (lastPlayers || []).filter(x => {
                        const n = (typeof x === 'string') ? x : ((x && x.name) || '');
                        return base(n) !== removedName;
                    });
                    lastSubmitted = (lastSubmitted || []).filter(n => base(n) !== removedName);
                    try { delete playerPoints[removedName]; } catch (e) {}
                    try { if (latestVotes && Object.prototype.hasOwnProperty.call(latestVotes, removedName)) { delete latestVotes[removedName]; } } catch (e) {}
                    renderPlayersActions(lastPlayers, lastSubmitted, latestVotes);
                } catch (e) { /* ignore */ }
            });
            removeCell.appendChild(removeBtn);
            removeCell.style.cssText = 'padding: 10px 8px; text-align: center;';
            row.appendChild(removeCell);
            
            // Grok enabled checkbox cell
            const grokCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = p.grokEnabled || false;
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            checkbox.addEventListener('change', () => {
                socket.emit('togglePlayerGrok', { playerId: p.id, enabled: checkbox.checked });
            });
            grokCell.appendChild(checkbox);
            grokCell.style.cssText = 'padding: 10px 8px; text-align: center;';
            row.appendChild(grokCell);
            
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        targetEl.appendChild(table);
    }
    
    // Render in both locations
    const listEl = document.getElementById('playersList');
    const playersSlot = document.getElementById('adminPlayersSlot');
    
    if (listEl) renderPlayers(listEl);
    if (playersSlot) renderPlayersTable(playersSlot);

    // Update bot count input (if present) so admin sees current server-side bot count
    try {
        const botCount = (players || []).filter(p => p && p.name && String(p.name || '').startsWith('#Bot')).length;
        const botInput = document.getElementById('botCountInput');
        if (botInput) botInput.value = String(botCount || 0);
    } catch (e) { /* ignore */ }
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

socket.on('questionSent', (data) => {
    const question = typeof data === 'string' ? data : (data.question || '');
    const area = typeof data === 'object' ? (data.area || '') : '';
    const activityPlayer = typeof data === 'object' ? (data.activityPlayer || null) : null;
    const areaLower = String(area).toLowerCase();
    const isActivityArea = (areaLower.includes('activity') || !!activityPlayer) && !!activityPlayer;
    const activitySelectedUI = isActivitySelectedInUI();
    
    console.log('questionSent:', { question, area, activityPlayer, mySocketId: socket.id });

    // Admins should not hear/see the real Activity term; keep generic text for TTS
    const isActivityNow = isHost && (isActivityArea || activitySelectedUI);
    const effectiveQuestion = isActivityNow ? 'Der zu erratende Begriff.' : (question || '');
    currentQuestionText = effectiveQuestion;
    const activityMask = document.getElementById('activityMask');
    if (activityMask) {
        activityMask.classList.remove('visible');
        activityMask.style.display = 'none';
    }
    const adminQuestionWrapper = document.getElementById('currentQuestionAdminWrapper');
    if (adminQuestionWrapper) adminQuestionWrapper.classList.remove('activity-mode');
    // Reset admin sound flags so notifications trigger for this round
    answeredSoundPlayed = false;
    votedSoundPlayed = false;
    latestVotes = {};
    
    if (!isHost) {
        // Check if this is Activity area
        console.log('questionSent:', { question, area, isActivityArea, activityPlayer, mySocketId: socket.id });
        
        if (isActivityArea) {
            const isActivityPlayer = activityPlayer.socketId === socket.id;
            console.log('Activity round detected:', { isActivityPlayer, mySocketId: socket.id, activityPlayerSocketId: activityPlayer.socketId });
            
            if (isActivityPlayer) {
                // This player performs the action - show real question
                document.getElementById('currentQuestion').style.display = 'block';
                document.getElementById('currentQuestion').textContent = `Begriff: ${question}`;
            } else {
                // Other players see the instruction
                document.getElementById('currentQuestion').style.display = 'block';
                document.getElementById('currentQuestion').textContent = `Wir befinden uns in der ACTIVITY Runde - "${activityPlayer.name}" - deutet, zeichnet oder erklärt den gesuchten Begriff. Versuche dann aufzuschreiben welchen Begriff du gesehen hast.`;
            }
        } else {
            // Normal question display
            console.log('Normal question (not Activity):', { area, hasActivityPlayer: !!activityPlayer });
            document.getElementById('currentQuestion').style.display = 'block';
            document.getElementById('currentQuestion').textContent = `Begriff: ${question}`;
        }
        
        const areaElement = document.getElementById('currentQuestionArea');
        if (areaElement) {
            if (area) {
                areaElement.textContent = area;
                areaElement.style.display = 'block';
            } else {
                areaElement.style.display = 'none';
            }
        }
        
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('answerSection').style.display = 'block';
        document.getElementById('answerInput').focus();
        updateGrokButtonVisibility(); // Update Grok button visibility when question arrives
    } else {
        document.getElementById('currentQuestionAdmin').innerHTML = `<span style="color:yellow; font-size:32px"><br>${effectiveQuestion}</span>`;
        
        // Zeige Area auch bei "Aktuelle Frage" an
        const currentQuestionAreaAdmin = document.getElementById('currentQuestionAreaAdmin');
        if (currentQuestionAreaAdmin) {
            if (area) {
                currentQuestionAreaAdmin.textContent = area;
                currentQuestionAreaAdmin.style.display = 'block';
            } else {
                currentQuestionAreaAdmin.style.display = 'none';
            }
        }
    }

    // If this is an ACTIVITY round, show the selection animation overlay on all clients
    if (isActivityArea) {
        try {
            const fromPayload = (data && Array.isArray(data.activityCandidates)) ? data.activityCandidates : null;
            const playersList = fromPayload && fromPayload.length
                ? fromPayload
                : (lastPlayers && lastPlayers.length) ? lastPlayers.map(p => (typeof p === 'string') ? p : (p && p.name) || '') : [];
            const winner = activityPlayer && activityPlayer.name ? activityPlayer.name : null;
            showActivitySelection(playersList, winner);
        } catch (e) { console.warn('Activity overlay failed', e); }
    }
});

// Activity selection overlay logic
function showActivitySelection(players, winnerName) {
    const overlay = document.getElementById('activitySelectOverlay');
    const ticker = document.getElementById('activitySelectTicker');
    const closeBtn = document.getElementById('activitySelectClose');
    if (!overlay || !ticker) return;

    // normalize player names
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

    // spin parameters
    let interval = 80; // ms initial
    let spins = 40 + Math.floor(Math.random() * 20); // total steps
    let step = 0;
    const timer = setInterval(() => {
        idx = (idx + 1) % items.length;
        ticker.textContent = items[idx];
        ticker.style.color = getColorForName(items[idx]);
        step += 1;
        // gradually slow down near the end
        if (step > spins * 0.6) interval += Math.floor((step - spins * 0.6) / 2);
        if (step >= spins) {
            clearInterval(timer);
            // ensure winnerName if provided
            const final = winnerName && items.includes(winnerName) ? winnerName : items[Math.floor(Math.random() * items.length)];
            ticker.textContent = final;
            ticker.style.color = getColorForName(final);
            ticker.classList.remove('fast');
            ticker.classList.add('winner');
        }
    }, interval);

    // allow manual close once winner displayed
    const onClose = () => {
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        ticker.classList.remove('winner');
        if (closeBtn) closeBtn.removeEventListener('click', onClose);
    };

    // when winner appears enable close
    const observer = new MutationObserver(() => {
        if (ticker.classList.contains('winner')) {
            if (closeBtn) closeBtn.style.display = 'inline-block';
            observer.disconnect();
            // Auto-close after 5 seconds
            setTimeout(() => {
                onClose();
            }, 5000);
        }
    });
    observer.observe(ticker, { attributes: true, attributeFilter: ['class'] });

    if (closeBtn) {
        closeBtn.style.display = 'none';
        closeBtn.addEventListener('click', onClose);
    }
}

socket.on('updateSubmitted', (payload) => {
    // Prefer structured payload from server; avoid parsing DOM which can collapse lines
    const players = payload && typeof payload === 'object' && Array.isArray(payload.players) ? payload.players : [];
    const submitted = payload && typeof payload === 'object' && Array.isArray(payload.submitted) ? payload.submitted
        : Array.isArray(payload) ? payload : [];

    // keep last known for re-renders on votingUpdate
    lastPlayers = players;
    lastSubmitted = submitted;
    cacheColorsFromList(players);

    renderPlayersActions(players, submitted, latestVotes, payload && payload.adminHasRealAnswer);
});

function renderPlayersActions(players, submitted, votes = {}, adminHasReal = false) {
    const list = document.getElementById('submittedList');
    const adminList = document.getElementById('submittedListAdmin');
    if (!players || players.length === 0) {
        if (list) list.textContent = 'Warte auf Spieler...';
        if (adminList) adminList.textContent = 'Warte auf Spieler...';
        return;
    }

    // Normalize players to objects so we can mark offline status in the table and include color
    const playerItems = players.map(p => {
        const raw = typeof p === 'string' ? p : (p && p.name) || '';
        const baseName = raw.replace(/\s*\(offline\)\s*$/i, '');
        const hasOfflineTag = /\(offline\)/i.test(raw);
        const offline = typeof p === 'object' ? !!p.offline : hasOfflineTag;
        const display = offline && !hasOfflineTag ? `${baseName} (offline)` : raw || baseName;
        const color = (typeof p === 'object' && p.color) ? p.color : getColorForName(baseName);
        return { name: baseName, display, offline, color };
    });

    const tableHead = `<table class="actions-table"><thead><tr>
        <th>Spieler</th>
        <th class="vertical"><span class="rotated-label">Punkte</span></th>
        <th class="vertical"><span class="rotated-label">Gesendet</span></th>
        <th class="vertical"><span class="rotated-label">Abgestimmt</span></th>
    </tr></thead><tbody>`;
    
    // Admin-Zeile für die Admin-Ansicht hinzufügen
    let adminRow = '';
    if (isHost && adminList) {
        const adminSentHtml = `<span class="${adminHasReal ? 'status-yes' : 'status-no'}">${adminHasReal ? '✔' : '✖'}</span>`;
        adminRow = `<tr style="background:#333;"><td class="name-cell"><strong>Admin (Du)</strong></td><td class="points-cell">-</td><td class="status-cell">${adminSentHtml}</td><td class="status-cell">-</td></tr>`;
    }
    
    const rows = playerItems.map(p => {
        const sent = submitted.includes(p.name);
        const voted = !!votes && Object.prototype.hasOwnProperty.call(votes, p.name);
        const points = playerPoints[p.name] || 0;
        const sentHtml = `<span class="${sent ? 'status-yes' : 'status-no'}">${sent ? '✔' : '✖'}</span>`;
        const voteHtml = `<span class="${voted ? 'status-yes' : 'status-no'}">${voted ? '✔' : '✖'}</span>`;
        return `<tr><td class="name-cell"><span style="color:${p.color}">${p.display}</span></td><td class="points-cell">${points}</td><td class="status-cell">${sentHtml}</td><td class="status-cell">${voteHtml}</td></tr>`;
    }).join('');
    const tableFoot = `</tbody></table>`;
    const html = tableHead + adminRow + rows + tableFoot;
    // Compose status badges
    const allSent = playerItems.length > 0 && playerItems.every(p => submitted.includes(p.name));
    const allVoted = playerItems.length > 0 && playerItems.every(p => votes && Object.prototype.hasOwnProperty.call(votes, p.name));
    const statusParts = [];
    if (allSent) statusParts.push('<span class="badge success">✔ Alle gesendet</span>');
    if (allVoted) statusParts.push('<span class="badge info">🗳 Alle abgestimmt</span>');
    const statusHtml = statusParts.length ? `<div class="actions-status">${statusParts.join(' ')}</div>` : '';

    if (list) list.innerHTML = html + statusHtml;
    if (adminList) adminList.innerHTML = html + statusHtml;

    // Admin overlay to hide answers until alle gesendet
    const answersMask = document.getElementById('answersMask');
    if (answersMask) {
        const showMask = isHost && !allSent;
        answersMask.classList.toggle('visible', showMask);
        // Ensure answers wrapper has relative context
        const answersWrapper = document.getElementById('answersListWrapper');
        if (answersWrapper) answersWrapper.style.position = 'relative';
    }

    // Admin sounds when all done (players list already excludes admin from server)
    if (isHost) {
        if (allSent && !answeredSoundPlayed) {
            playAdminSound('allSent');
            answeredSoundPlayed = true;
        }
        if (allVoted && !votedSoundPlayed) {
            playAdminSound('allVoted');
            votedSoundPlayed = true;
        }
    }
}

function playAdminSound(type) {
    try {
        if (!adminSoundsEnabled) return;
        const ctx = getAudioCtx();
        const now = ctx.currentTime + 0.05;

        // Helper to play a single soft note
        function softNote(freq, startTime, duration = 0.35, volume = 0.18) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            // Gentle ADSR
            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.03);
            gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.02);
        }

        if (type === 'allSent') {
            // Pleasant two-note up interval: C5 → E5
            softNote(523.25, now, 0.32, 0.10);
            softNote(659.25, now + 0.18, 0.34, 0.10);
        } else {
            // Gentle three-note arpeggio: G5 → B5 → D6
            softNote(783.99, now, 0.28, 0.11);
            softNote(987.77, now + 0.18, 0.28, 0.11);
            softNote(1174.66, now + 0.36, 0.30, 0.11);
        }
    } catch (e) {
        console.warn('playAdminSound failed', e);
    }
}

socket.on('showAllAnswers', (answers) => {
    console.log('[ADMIN] showAllAnswers received:', Array.isArray(answers) ? answers.length : 'invalid');
    currentAnswers = answers;
    const list = document.getElementById('answersList');
    if (!list) {
        console.warn('[ADMIN] answersList element not found');
        return;
    }
    list.style.display = 'block';
    list.innerHTML = '';
    answers.forEach(a => {
        const div = document.createElement('div');
        div.className = 'answer';
        const textSpan = document.createElement('span');
        const letterNode = document.createElement('strong');
        letterNode.textContent = `${a.letter} `;
        textSpan.appendChild(letterNode);
        if (a.name && a.name !== 'Echte Definition') {
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `(${a.name}) `;
            if (a.color) nameSpan.style.color = a.color;
            textSpan.appendChild(nameSpan);
        }
        const txt = document.createTextNode(a.text);
        textSpan.appendChild(txt);
        div.appendChild(textSpan);
        list.appendChild(div);
    });
    const readBtn = document.getElementById('readBtn');
    const presentBtn = document.getElementById('presentBtn');
    const startVotingBtn = document.getElementById('startVotingBtn');
    if (readBtn) readBtn.style.display = 'inline-block';
    if (presentBtn) presentBtn.style.display = 'inline-block';
    if (startVotingBtn) startVotingBtn.style.display = 'inline-block';
    console.log('[ADMIN] showAllAnswers rendered');
});

socket.on('votingCheckRequired', ({ hasVotes, message }) => {
    // Admin will Ergebnisse präsentieren, aber noch nicht abgestimmt
    console.log('[DEBUG] votingCheckRequired received:', { hasVotes, message });
    const choice = confirm(`${message}\n\n[OK] Ergebnisse zeigen | [Abbrechen] Zurück zum Abstimmen`);
    console.log('[DEBUG] User choice:', choice);
    if (choice) {
        // Admin bestätigt: Fortfahren mit Ergebnissen
        emitBuffered('proceedPresentResults', {});
    }
    // Sonst: Zurück zum Spiel (kein Emit)
});

socket.on('revealAnswers', ({ lettered, realIndex }) => {
    currentAnswers = lettered;
    lastRealIndex = (typeof realIndex === 'number') ? realIndex : null;
    const list = document.getElementById('answersList');
    if (list) list.innerHTML = '';
    lettered.forEach((a, i) => {
        const container = document.createElement('div');
        container.className = 'answer-container';

        // Single answer box with inline author after the letter
        const div = document.createElement('div');
        div.className = 'answer' + (i === realIndex ? ' correct' : '');
        const letterNode = document.createElement('span');
        letterNode.style.fontWeight = 'bold';
        letterNode.textContent = `${a.letter}: `;
        const nameNode = document.createElement('span');
        if (a.name && a.name !== 'Echte Definition') {
            nameNode.textContent = `(${a.name}) `;
            if (a.color) nameNode.style.color = a.color;
        }
        const textNode = document.createTextNode(a.text);
        div.appendChild(letterNode);
        if (a.name && a.name !== 'Echte Definition') div.appendChild(nameNode);
        div.appendChild(textNode);
        container.appendChild(div);

        // Voters on the right: render compact colored stickers (one per voter)
        const votersDiv = document.createElement('div');
        votersDiv.className = 'answer-voters';
        votersDiv.style.display = 'flex';
        votersDiv.style.flexWrap = 'wrap';
        votersDiv.style.gap = '6px';
        votersDiv.style.alignItems = 'center';
        const votesForThis = Object.entries(latestVotes || {})
            .filter(([, letter]) => letter === a.letter)
            .map(([voterName]) => voterName);
        if (votesForThis.length > 0) {
            // Try to resolve colors from known players before falling back
            const norm = (s) => String(s || '').replace(/^#/, '').replace(/\s*\(offline\)\s*$/i, '').replace(/^\((.*)\)$/,'$1').trim();
            votesForThis.forEach((voter) => {
                const badge = document.createElement('span');
                badge.className = 'vote-badge';
                badge.title = voter;
                badge.style.display = 'inline-block';
                badge.style.width = '18px';
                badge.style.height = '18px';
                badge.style.borderRadius = '50%';
                badge.style.boxSizing = 'border-box';
                badge.style.border = '2px solid rgba(0,0,0,0.25)';
                badge.style.boxShadow = '0 1px 1px rgba(0,0,0,0.15)';
                let color = null;
                try {
                    const match = (lastPlayers || []).find(p => {
                        if (!p) return false;
                        const raw = (typeof p === 'string') ? p : (p.name || '');
                        return norm(raw) === norm(voter) && p.color;
                    });
                    if (match && match.color) color = match.color;
                } catch (_) {}
                badge.style.background = color || getColorForName(voter);
                badge.style.cursor = 'default';
                votersDiv.appendChild(badge);
            });
        }
        container.appendChild(votersDiv);

        list.appendChild(container);
    });
    const readBtn = document.getElementById('readBtn');
    const presentBtn = document.getElementById('presentBtn');
    if (readBtn) readBtn.style.display = 'inline-block';
    if (presentBtn) presentBtn.style.display = 'inline-block';

    showResultOverlay(lettered, realIndex);
});

function showResultOverlay(lettered, realIndex) {
    const resultOverlay = document.getElementById('resultOverlay');
    const resultList = document.getElementById('resultList');
    if (!resultOverlay || !resultList) return;
    resultList.innerHTML = '';
    (lettered || []).forEach((a, i) => {
        const item = document.createElement('div');
        item.className = 'result-item' + (i === realIndex ? ' correct' : '');
        const letter = document.createElement('div');
        letter.className = 'letter';
        if (a.name && a.name !== 'Echte Definition') {
            letter.textContent = `${a.letter} `;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = `(${a.name})`;
            if (a.color) nameSpan.style.color = a.color;
            letter.appendChild(nameSpan);
        } else {
            letter.textContent = `${a.letter}`;
        }
        const text = document.createElement('div');
        text.className = 'text';
        text.textContent = a.text;
        item.appendChild(letter);
        item.appendChild(text);
        // Right-side voter stickers for the result overlay
        const votersDiv = document.createElement('div');
        votersDiv.className = 'result-voters';
        votersDiv.style.display = 'flex';
        votersDiv.style.flexWrap = 'wrap';
        votersDiv.style.gap = '6px';
        votersDiv.style.alignItems = 'center';
        const votesForThis = Object.entries(latestVotes || {})
            .filter(([, letter]) => letter === a.letter)
            .map(([voterName]) => voterName);
        if (votesForThis.length > 0) {
            votesForThis.forEach((voter) => {
                const badge = document.createElement('span');
                badge.className = 'vote-badge';
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
        item.appendChild(votersDiv);
        resultList.appendChild(item);
    });
    resultOverlay.classList.add('show');
    resultOverlay.setAttribute('aria-hidden', 'false');
    const closeBtn = document.getElementById('resultClose');
    const onClose = () => {
        resultOverlay.classList.remove('show');
        resultOverlay.setAttribute('aria-hidden', 'true');
        if (closeBtn) closeBtn.removeEventListener('click', onClose);
    };
    if (closeBtn) {
        closeBtn.addEventListener('click', onClose);
        closeBtn.style.display = 'inline-block';
    }
}

socket.on('roundEnded', () => {
    // Close result overlay for all users (players and admin)
    const resultOverlay = document.getElementById('resultOverlay');
    if (resultOverlay) {
        resultOverlay.classList.remove('show');
        resultOverlay.setAttribute('aria-hidden', 'true');
    }
    
    if (!isHost) {
        document.getElementById('currentQuestion').style.display = 'none';
        document.getElementById('waitingMessage').style.display = 'block';
        document.getElementById('answerSection').style.display = 'none';
        const answerInput = document.getElementById('answerInput');
        if (answerInput) answerInput.value = '';
        saveStateSync();
        toggleClearButtons();
    } else {
        // Reset voting buttons for admin
        const startVotingBtn = document.getElementById('startVotingBtn');
        const endVotingBtn = document.getElementById('endVotingBtn');
        if (startVotingBtn) startVotingBtn.style.display = 'none';
        if (endVotingBtn) endVotingBtn.style.display = 'none';
    }
    // reset voting and sound flags
    latestVotes = {};
    answeredSoundPlayed = false;
    votedSoundPlayed = false;
});

socket.on('adminReset', () => {
    clearAllTextInputs();
    const answers = document.getElementById('answersList'); 
    if (answers) answers.innerHTML = '';
    const currentQ = document.getElementById('currentQuestionAdmin'); 
    if (currentQ) currentQ.innerHTML = 'Noch keine Frage gesendet';
    if (!isHost) {
        setTimeout(() => location.reload(), 300);
    } else {
        alert('Reset gesendet und lokale Felder geleert.');
    }
});

socket.on('pointsUpdate', (points) => {
    playerPoints = points || {};
    renderPlayersActions(lastPlayers, lastSubmitted, latestVotes);
});

socket.on('error', (msg) => alert(msg));

/* ============= VOTING SYSTEM ============= */

socket.on('votingStarted', ({ lettered, playerNames }) => {
    // Capture player list so vote flags stay in sync even if updateSubmitted was missed
    const names = Array.isArray(playerNames) ? playerNames.filter(Boolean) : [];
    // Nur initial befüllen, vorhandene Farbzuordnung nicht überschreiben
    if ((!lastPlayers || lastPlayers.length === 0) && names.length) {
        lastPlayers = names.map(n => ({ name: n }));
    }
    cacheColorsFromList(lastPlayers);
    if (names.length) {
        renderPlayersActions(lastPlayers || names.map(n => ({ name: n })), lastSubmitted, latestVotes);
    }

    if (isHost) {
        // Admin sieht, dass Voting gestartet ist
        const startBtn = document.getElementById('startVotingBtn');
        const endBtn = document.getElementById('endVotingBtn');
        if (startBtn) startBtn.style.display = 'none';
        if (endBtn) endBtn.style.display = 'inline-block';
        votedSoundPlayed = false;
        return;
    }
    
    // Nur Spieler sehen das Voting-UI
    const votingSection = document.getElementById('votingSection');
    const votingOptions = document.getElementById('votingOptions');
    if (!votingSection || !votingOptions) return;

    votingOptions.innerHTML = '';
    lettered.forEach(option => {
        // Blende eigene Antwort komplett aus, behalte aber die Buchstaben-Reihenfolge
        if (option.submitterName === myPlayerName) {
            return;
        }
        
        const button = document.createElement('button');
        button.className = 'voting-option';
        button.style.width = '85%';
        button.style.maxWidth = '600px';
            // Verwende den ORIGINAL-Buchstaben aus dem Server, nicht neu berechnet
        button.textContent = `${option.letter}: ${option.text}`;
        
        button.addEventListener('click', () => {
                        // Sende den Original-Buchstaben an den Server
            emitBuffered('submitVote', option.letter);
            votingSection.style.display = 'none';
            document.getElementById('waitingMessage').style.display = 'block';
            document.getElementById('waitingMessage').textContent = 'Deine Stimme wurde abgegeben. Warte auf die Ergebnisse...';
        });
        
        votingOptions.appendChild(button);
    });

    document.getElementById('waitingMessage').style.display = 'none';
    votingSection.style.display = 'block';

    // Scroll Spieler zum Voting-Bereich, damit die Frage sichtbar ist
    try {
        const target = votingSection.querySelector('h3') || votingSection;
        target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    } catch (e) {
        // Fallback ohne smooth falls nicht unterstützt
        window.scrollTo({ top: votingSection.offsetTop || 0, behavior: 'auto' });
    }
});

socket.on('votingUpdate', (payload) => {
    const voteMap = payload && typeof payload === 'object' && payload.votes ? payload.votes : (payload || {});
    const playerNames = payload && Array.isArray(payload.playerNames) ? payload.playerNames.filter(Boolean) : [];
    const playerObjs = payload && Array.isArray(payload.players) ? payload.players : [];
    latestVotes = voteMap || {};

    // Nutze mitgesendete Player-Objekte mit Farben, sonst Names fallback
    if (playerObjs.length) {
        lastPlayers = playerObjs;
        cacheColorsFromList(playerObjs);
    } else if ((!lastPlayers || lastPlayers.length === 0) && playerNames.length) {
        lastPlayers = playerNames.map(n => ({ name: n }));
    }
    cacheColorsFromList(lastPlayers);

    if (isHost) {
        // Admin sieht die Votes neben den Antworten
        updateAnswersListWithVotes(latestVotes);
    }

    const tablePlayers = (lastPlayers && lastPlayers.length)
        ? lastPlayers
        : (playerObjs.length ? playerObjs : (playerNames.length ? playerNames.map(n => ({ name: n })) : Object.keys(latestVotes || {}).map(name => ({ name }))));

    renderPlayersActions(tablePlayers, lastSubmitted, latestVotes);
});

socket.on('votingEnded', () => {
    const votingSection = document.getElementById('votingSection');
    if (votingSection) votingSection.style.display = 'none';
    
    if (isHost) {
        const startBtn = document.getElementById('startVotingBtn');
        const endBtn = document.getElementById('endVotingBtn');
        if (startBtn) startBtn.style.display = 'inline-block';
        if (endBtn) endBtn.style.display = 'none';
    }
});

function updateAnswersListWithVotes(votes) {
    const list = document.getElementById('answersList');
    if (!list || !currentAnswers || currentAnswers.length === 0) return;

    list.innerHTML = '';
    currentAnswers.forEach((a, i) => {
        const div = document.createElement('div');
        div.className = 'answer';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        const textSpan = document.createElement('span');
        textSpan.innerHTML = `<span style="font-weight:bold">${a.letter}:</span> ${a.text}`;
        div.appendChild(textSpan);

        // Anzeige der Votes für diese Antwort
        const votesForThis = Object.entries(votes)
            .filter(([, letter]) => letter === a.letter)
            .map(([name]) => name);

        if (votesForThis.length > 0) {
            const votesSpan = document.createElement('span');
            votesSpan.style.color = '#4CAF50';
            votesSpan.style.fontWeight = 'bold';
            votesSpan.style.marginLeft = '20px';
            // Render voter names with colors
            votesForThis.forEach((voter, idx) => {
                const vspan = document.createElement('span');
                vspan.textContent = voter;
                vspan.style.color = getColorForName(voter);
                votesSpan.appendChild(vspan);
                if (idx < votesForThis.length - 1) votesSpan.appendChild(document.createTextNode(', '));
            });
            div.appendChild(votesSpan);
        }

        list.appendChild(div);
    });
}

/* ============= DOM INITIALIZATION ============= */

document.addEventListener('DOMContentLoaded', () => {
    // Check for terms.js
    if (typeof nobodyIsPerfectTerms === 'undefined' || nobodyIsPerfectTerms.length === 0) {
        console.error('terms.js fehlt!');
        alert('Begriffsliste fehlt – bitte terms.js anlegen');
    }

    // Validate connection
    if (new URLSearchParams(window.location.search).get('admin') === null) {
        loadState();
    }

    // Setup input listeners
    document.querySelectorAll('input[type="text"], textarea').forEach(input => {
        input.addEventListener('input', toggleClearButtons);
        input.addEventListener('focus', toggleClearButtons);
    });

    // Admin view setup
    if (new URLSearchParams(window.location.search).get('admin') !== null) {
        document.getElementById('adminView').style.display = 'block';
        document.getElementById('playerSetup').style.display = 'none';
        document.getElementById('playerGame').style.display = 'none';
        socket.emit('adminConnect', { lastSeenSeq: lastSeq });
        
        // Initialize admin UI from modular app-admin.js
        setTimeout(() => {
            if (typeof setupAdminUI === 'function') {
                setupAdminUI();
            }
        }, 100);

        const adminToggle = document.getElementById('adminPanelToggle');
        if (adminToggle) adminToggle.style.display = 'inline-block';
        
        // All admin UI setup is now handled by setupAdminUI() from app-admin.js
        // This includes: areaFilter, botControls, textbox auto-send, etc.

    }

    // Keep connection status fixed at top-left (with reset button) and players panel fixed right
    (function placeStatusAndPlayersFixed() {
        const topLeft = document.getElementById('topLeftControls');
        const playersPanel = document.getElementById('playersPanel');
        if (topLeft) {
            document.body.prepend(topLeft);
            topLeft.classList.remove('inline');
        }
        if (playersPanel) {
            document.body.appendChild(playersPanel);
            playersPanel.classList.remove('inline');
        }
    })();

    // Place admin toggle and hard reload button on the right, scrolling with page
    (function placeTopActions() {
        const topLeft = document.getElementById('topLeftControls');
        const adminToggle = document.getElementById('adminPanelToggle');
        const hardReload = document.getElementById('hardReloadBtn');
        if (!topLeft) return;
        let actions = document.getElementById('topActions');
        if (!actions) {
            actions = document.createElement('div');
            actions.id = 'topActions';
            actions.className = 'top-actions';
            topLeft.appendChild(actions);
        }
        if (adminToggle) {
            actions.appendChild(adminToggle);
        }
        if (hardReload) {
            hardReload.style.display = 'inline-block';
            actions.appendChild(hardReload);
        }
    })();

    // Admin overlay setup has been moved to app-admin.js setupAdminUI() -> setupAdminOverlay()
    // The setup code that was here is no longer needed as it's now handled by the modular app-admin.js

    // Update player name in header
    setTimeout(() => {
        const nameEl = document.getElementById('playerName');
        if (nameEl) {
            nameEl.addEventListener('input', debounce(() => {
                myPlayerName = nameEl.value.trim();
                updateAnsweredHeaderNames();
            }, 200));
        }
    }, 300);

    // Hide-on-table (Sichtschutz) feature
    (function setupObscureFeature(){
        const nameEl = document.getElementById('playerName');
        const ansEl = document.getElementById('answerInput');
        const toggleBtn = document.getElementById('toggleObscureBtn');
        if (!toggleBtn) return;

        [nameEl, ansEl].forEach(el => {
            if (!el) return;
            const wrap = el.parentElement;
            if (!wrap) return;
            let ov = wrap.querySelector('.obscure-overlay');
            if (!ov) {
                ov = document.createElement('div');
                ov.className = 'obscure-overlay';
                wrap.style.position = wrap.style.position || 'relative';
                wrap.appendChild(ov);
            }
        });

        let obscured = false;
        function setObscured(v) {
            obscured = !!v;
            [nameEl, ansEl].forEach(el => {
                if (!el) return;
                const ov = el.parentElement.querySelector('.obscure-overlay');
                if (ov) ov.style.display = obscured ? 'block' : 'none';
            });
            toggleBtn.textContent = obscured ? 'Sichtschutz aus' : 'Sichtschutz an';
        }

        toggleBtn.addEventListener('click', () => {
            setObscured(!obscured);
        });

        setObscured(false);
    })();

    // Present results handler for admin
    (function setupPresentBtn(){
        const presentBtn = document.getElementById('presentBtn');
        if (!presentBtn) return;
        presentBtn.addEventListener('click', () => emitBuffered('presentResults', {}));
    })();

    // Admin real-answer toggle
    (function setupRealAnswerToggle(){
        const toggleBtn = document.getElementById('toggleRealAnswerBtn');
        const realWrap = document.getElementById('realAnswerWrapper');
        if (!toggleBtn || !realWrap) return;
        toggleBtn.addEventListener('click', () => {
            const isHidden = realWrap.style.display === 'none' || realWrap.style.display === '';
            realWrap.style.display = isHidden ? 'block' : 'none';
            toggleBtn.textContent = isHidden ? 'Antwort ausblenden' : 'Antwort einblenden';
        });
        realWrap.style.display = 'none';
        toggleBtn.textContent = 'Antwort einblenden';
    })();

    // Initialize voice controls
    try { initVoiceControls(); } catch(e) { console.warn('initVoiceControls failed', e); }

    // Set initial clear button states
    toggleClearButtons();

    // Setup all button event listeners
    const randomLoadBtn = document.getElementById('randomLoadBtn');
    if (randomLoadBtn) randomLoadBtn.addEventListener('click', loadRandomTerm);

    const clearQuestionBtn = document.getElementById('clearQuestionBtn');
    if (clearQuestionBtn) clearQuestionBtn.addEventListener('click', () => clearInput('questionInput'));

    const clearRealAnswerBtn = document.getElementById('clearRealAnswerBtn');
    if (clearRealAnswerBtn) clearRealAnswerBtn.addEventListener('click', () => clearInput('realAnswerInput'));

    const sendQuestionBtn = document.getElementById('sendQuestionBtn');
    if (sendQuestionBtn) sendQuestionBtn.addEventListener('click', sendQuestion);

    const playerGrokBtn = document.getElementById('playerGrokBtn');
    if (playerGrokBtn) playerGrokBtn.addEventListener('click', playerGrokPrompt);

    const submitRealBtn = document.getElementById('submitRealBtn');
    if (submitRealBtn) submitRealBtn.addEventListener('click', submitReal);

    const newRoundBtn = document.getElementById('newRoundBtn');
    if (newRoundBtn) newRoundBtn.addEventListener('click', newRound);

    const readBtn = document.getElementById('readBtn');
    if (readBtn) readBtn.addEventListener('click', readAloud);

    const clearPlayerNameBtn = document.getElementById('clearPlayerNameBtn');
    if (clearPlayerNameBtn) clearPlayerNameBtn.addEventListener('click', () => clearInput('playerName'));

    const joinGameBtn = document.getElementById('joinGameBtn');
    if (joinGameBtn) joinGameBtn.addEventListener('click', joinGame);

    const clearAnswerBtn = document.getElementById('clearAnswerBtn');
    if (clearAnswerBtn) clearAnswerBtn.addEventListener('click', () => clearInput('answerInput'));

    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    if (submitAnswerBtn) submitAnswerBtn.addEventListener('click', submitAnswer);

    // Voting buttons (admin only)
    const startVotingBtn = document.getElementById('startVotingBtn');
    if (startVotingBtn) startVotingBtn.addEventListener('click', () => emitBuffered('startVoting', {}));

    const endVotingBtn = document.getElementById('endVotingBtn');
    if (endVotingBtn) endVotingBtn.addEventListener('click', () => emitBuffered('endVoting', {}));

    const hardReloadBtn = document.getElementById('hardReloadBtn');
    if (hardReloadBtn) hardReloadBtn.addEventListener('click', () => {
        const href = window.location.href.split('#')[0];
        const cleaned = href.replace(/([&?])ts=\d+/, '').replace(/\?&/, '?');
        const delim = cleaned.includes('?') ? '&' : '?';
        window.location.href = `${cleaned}${delim}ts=${Date.now()}`;
    });

    const resetPointsBtn = document.getElementById('resetPointsBtn');
    if (resetPointsBtn) resetPointsBtn.addEventListener('click', () => {
        if (confirm('Alle Punkte auf null setzen?')) {
            emitBuffered('resetPoints', {});
        }
    });
});

});
