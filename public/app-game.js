/* Game logic: questions, answers, voting, voice/TTS */

let joinRetryInterval = null; // re-emit join until acknowledged

function joinGame() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) return alert('Name eingeben!');
    myPlayerName = name;

    // helper to emit join with throttling reset
    const emitJoin = () => {
        if (typeof lastAutoAttempt !== 'undefined') lastAutoAttempt = 0; // allow immediate retry
        try {
            socket.emit('playerJoin', { playerName: name, lastSeenSeq: lastSeq });
        } catch (e) {
            console.warn('join emit failed', e);
        }
    };

    // Emit immediately and start a short retry loop until server confirms via joinedRoom
    emitJoin();
    if (joinRetryInterval) clearInterval(joinRetryInterval);
    joinRetryInterval = setInterval(() => {
        if (typeof joined !== 'undefined' && joined) {
            clearInterval(joinRetryInterval);
            joinRetryInterval = null;
            return;
        }
        emitJoin();
    }, 1500);

    // Optimistic UI: zeige sofort Warte-Bildschirm, falls Server-Response verzögert
    try {
        const setup = document.getElementById('playerSetup');
        const game = document.getElementById('playerGame');
        const waiting = document.getElementById('waitingMessage');
        if (setup) setup.style.display = 'none';
        if (game) game.style.display = 'block';
        if (waiting) waiting.style.display = 'block';
        const answerSection = document.getElementById('answerSection');
        if (answerSection) answerSection.style.display = 'none';
    } catch (_) {}
}

function isActivitySelectedInUI() {
    const areaFilter = document.getElementById('areaFilter');
    const selected = areaFilter ? areaFilter.value : '';
    return String(selected || '').toLowerCase().includes('activity');
}

function loadRandomTerm() {
    if (typeof nobodyIsPerfectTerms === 'undefined' || nobodyIsPerfectTerms.length === 0) {
        alert('Begriffsliste nicht geladen!');
        return;
    }
    
    const areaFilter = document.getElementById('areaFilter');
    const selectedArea = areaFilter ? areaFilter.value : 'ALLE';
    
    let filteredTerms = nobodyIsPerfectTerms;
    if (selectedArea && selectedArea !== 'ALLE') {
        filteredTerms = nobodyIsPerfectTerms.filter(term => term.area === selectedArea);
    }
    
    if (filteredTerms.length === 0) {
        alert('Keine Begriffe in diesem Bereich verfügbar.');
        return;
    }
    
    // Find the least-used terms (load-balanced selection)
    const minUsage = Math.min(...filteredTerms.map(t => window.termUsageData?.[t.term] || 0));
    const leastUsedTerms = filteredTerms.filter(t => (window.termUsageData?.[t.term] || 0) === minUsage);
    
    // Randomly pick from the least-used terms
    const randomIndex = Math.floor(Math.random() * leastUsedTerms.length);
    const entry = leastUsedTerms[randomIndex];
    
    document.getElementById('questionInput').value = entry.term;
    document.getElementById('realAnswerInput').value = entry.definition;
    toggleClearButtons();
    
    const areaLabel = document.getElementById('questionAreaLabel');
    if (areaLabel && entry.area) {
        areaLabel.textContent = `... aus dem Bereich "${entry.area}"`;
        areaLabel.style.display = 'block';
    }

    syncActivityMask(entry.area);
    
    // Notify server about term usage
    socket.emit('termUsed', { term: entry.term });
    
    const btn = document.getElementById('randomLoadBtn') || document.querySelector('button.random');
    if (btn) {
        const icon = btn.querySelector('svg.icon');
        if (icon) {
            const textNode = Array.from(btn.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
            if (textNode) {
                textNode.textContent = ' ✔ Geladen!';
                setTimeout(() => textNode.textContent = ' Zufälligen Begriff laden', 1500);
            }
        } else {
            btn.textContent = '✔ Geladen!';
            setTimeout(() => btn.textContent = '🎲 Zufälligen Begriff laden', 1500);
        }
    }
}

function resetGame() {
    if (confirm('Wirklich ALLE Spieler entfernen und komplett zurücksetzen?')) {
        emitBuffered('adminReset', {});
        clearAllTextInputs();
        const answers = document.getElementById('answersList'); if (answers) answers.innerHTML = '';
        const currentQ = document.getElementById('currentQuestionAdmin'); if (currentQ) currentQ.innerHTML = 'Noch keine Frage gesendet';
        const activityMask = document.getElementById('activityMask'); if (activityMask) activityMask.classList.remove('visible');
        const adminQuestionWrapper = document.getElementById('currentQuestionAdminWrapper'); if (adminQuestionWrapper) adminQuestionWrapper.classList.remove('activity-mode');
    }
}

function sendQuestion() {
    const qEl = document.getElementById('questionInput');
    const q = qEl.value.trim();
    if (q) {
        const areaLabel = document.getElementById('questionAreaLabel');
        let areaRaw = (areaLabel && areaLabel.textContent && areaLabel.textContent.trim()) ? areaLabel.textContent.trim() : '';
        const areaFilter = document.getElementById('areaFilter');
        // Fallback to selected value if label is empty
        if (!areaRaw && areaFilter && areaFilter.value) {
            areaRaw = areaFilter.value.trim();
        }
        // Extract clean area name if label contains sentence like: ... aus dem Bereich "SPRACHEN"
        let areaName = areaRaw;
        const m = areaRaw.match(/"([^"]+)"/);
        if (m && m[1]) areaName = m[1];
        // Normalize
        areaName = (areaName || '').trim();
        
        const currentQuestionAreaAdmin = document.getElementById('currentQuestionAreaAdmin');
        if (currentQuestionAreaAdmin) {
            if (areaName) {
                currentQuestionAreaAdmin.textContent = areaName;
                currentQuestionAreaAdmin.style.display = 'block';
            } else {
                currentQuestionAreaAdmin.style.display = 'none';
            }
        }
        
        emitBuffered('sendQuestion', { question: q, area: areaName });
    }
}

function submitAnswer() {
    const ans = document.getElementById('answerInput').value.trim();
    if (ans) {
        emitBuffered('submitAnswer', ans);
        const input = document.getElementById('answerInput');
        input.style.borderColor = '#4CAF50';
        input.style.boxShadow = '0 0 20px rgba(76,175,80,0.8)';
        setTimeout(() => {
            input.style.borderColor = '';
            input.style.boxShadow = '';
        }, 1000);
        saveStateSync();
    }
}

function submitReal() {
    const real = document.getElementById('realAnswerInput').value.trim();
    if (real) {
        emitBuffered('submitRealAnswer', real);
        toggleClearButtons();
    }
}

async function grokPrompt() {
    const qEl = document.getElementById('questionInput');
    const q = qEl.value.trim();
    
    if (!q) {
        alert('Bitte gib zunächst eine Frage ein');
        return;
    }
    
    const statusEl = document.getElementById('grokStatus');
    const btn = document.getElementById('grokBtn');
    const realAnswerInput = document.getElementById('realAnswerInput');
    
    if (!statusEl || !btn) return;
    
    try {
        btn.disabled = true;
        btn.textContent = '⏳ Grok denkt...';
        statusEl.style.display = 'block';
        statusEl.textContent = '⏳ Sende Prompt an Grok...';
        
        const response = await fetch('/api/grok/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: q, playerName: myPlayerName || 'Admin' })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            statusEl.textContent = `❌ Fehler: ${data.error}`;
            statusEl.style.color = '#ff6b6b';
            console.error('Grok error:', data.error);
            return;
        }
        
        if (realAnswerInput) {
            realAnswerInput.value = data.response;
            toggleClearButtons();
            
            const realWrap = document.getElementById('realAnswerWrapper');
            const toggleBtn = document.getElementById('toggleRealAnswerBtn');
            if (realWrap) realWrap.style.display = 'block';
            if (toggleBtn) toggleBtn.textContent = 'Antwort ausblenden';
            
            realAnswerInput.focus();
            realAnswerInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        statusEl.style.color = '#4CAF50';
        statusEl.textContent = `✅ Erhalten! Tokens: ${data.tokensUsed} (Prompt: ${data.promptTokens}, Antwort: ${data.completionTokens})`;
        
        btn.textContent = '🤖 Mit Grok';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
        
    } catch (error) {
        console.error('Grok request failed:', error);
        statusEl.style.display = 'block';
        statusEl.style.color = '#ff6b6b';
        statusEl.textContent = `❌ Fehler: ${error.message}`;
    } finally {
        btn.disabled = false;
    }
}

async function playerGrokPrompt() {
    if (!myGrokEnabled) {
        alert('Grok ist für dich nicht aktiviert. Bitte kontaktiere den Admin.');
        return;
    }
    
    const ansEl = document.getElementById('answerInput');
    if (!ansEl) {
        console.error('answerInput element not found');
        return;
    }
    const current = (ansEl.value || '').trim();
    if (current.length < 4) {
        alert('Bitte gib mindestens 4 Zeichen ein, damit Grok einen Hinweis hat.');
        return;
    }

    const btn = document.getElementById('playerGrokBtn');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }

    const prompt = `Gib genau einen kurzen deutschen Satz (5–10 Wörter) aus, der zum Begriff "${currentQuestionText}" eine glaubwürdige, aber falsche Definition liefert. Beginne den Satz nicht mit dem Begriff selbst und wiederhole den Begriff nirgends wörtlich im Satz. Schreibe neutral wie in einem Lexikon, ohne Meta-Hinweise, Anführungszeichen oder Listen. Nutze folgende Hinweise, sie müssen in der Antwort direkt oder abgewandelt vorkommen: ${current}. Antworte direkt und verrate nicht, dass die Definition erfunden ist.`;
    try {
        const res = await fetch('/api/grok/prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, playerName: myPlayerName || 'Spieler' })
        });
        if (!res.ok) {
            console.error('Grok API error:', res.status, res.statusText);
            alert(`Grok Fehler: ${res.status} ${res.statusText}`);
            return;
        }
        const data = await res.json();
        if (data && data.success && typeof data.response === 'string') {
            ansEl.value = data.response;
            toggleClearButtons();
            ansEl.style.borderColor = '#667eea';
            ansEl.style.boxShadow = '0 0 14px rgba(102,126,234,0.7)';
            setTimeout(() => { ansEl.style.borderColor = ''; ansEl.style.boxShadow = ''; }, 800);
        } else {
            console.error('Grok failed:', data);
            alert(`Grok Fehler: ${data.error || 'Unbekannter Fehler'}`);
        }
    } catch (e) {
        console.error('Grok request exception:', e);
        alert(`Grok Fehler: ${e.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
}

function newRound() {
    emitBuffered('newRound', {});
    clearAllTextInputs();
    toggleClearButtons();
    document.getElementById('answersList').innerHTML = 'Neue Runde – gib eine neue Frage ein!';
    document.getElementById('readBtn').style.display = 'none';
    document.getElementById('currentQuestionAdmin').innerHTML = 'Noch keine Frage gesendet';
    const activityMask = document.getElementById('activityMask'); if (activityMask) activityMask.classList.remove('visible');
    const adminQuestionWrapper = document.getElementById('currentQuestionAdminWrapper'); if (adminQuestionWrapper) adminQuestionWrapper.classList.remove('activity-mode');
    document.getElementById('submittedListAdmin').innerHTML = 'Warte auf Antworten...';
    
    const realWrap = document.getElementById('realAnswerWrapper');
    const toggleBtn = document.getElementById('toggleRealAnswerBtn');
    if (realWrap) realWrap.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = 'Antwort einblenden';
    
    const presentBtn = document.getElementById('presentBtn');
    if (presentBtn) presentBtn.style.display = 'none';
}

/* Question sent event */
socket.on('questionSent', (data) => {
    const question = typeof data === 'string' ? data : (data.question || '');
    const area = typeof data === 'object' ? (data.area || '') : '';
    const activityPlayer = typeof data === 'object' ? (data.activityPlayer || null) : null;
    const areaLower = String(area).toLowerCase();
    const isActivityArea = (areaLower.includes('activity') || !!activityPlayer) && !!activityPlayer;
    const isSprachenArea = areaLower.includes('sprachen');
    window.currentIsSprachenArea = isSprachenArea; // Store globally for readAloudWithBrowserTTS

    const isActivityNow = isHost && (isActivityArea || isActivitySelectedInUI());
    const sprachenNow = isHost && isSprachenArea;
    const effectiveQuestion = isActivityNow ? 'Der zu erratende Begriff.' : (sprachenNow ? 'Gesuchter Satz' : (question || ''));
    currentQuestionText = effectiveQuestion;
    const activityMask = document.getElementById('activityMask');
    if (activityMask) {
        if (isActivityArea || isSprachenArea) {
            activityMask.textContent = isActivityArea ? 'ACTIVITY-Runde – Begriff verborgen' : 'SPRACHEN-Runde – Satz verborgen';
            activityMask.style.display = 'block';
            activityMask.classList.add('visible');
        } else {
            activityMask.classList.remove('visible');
            activityMask.style.display = 'none';
        }
    }
    const sprachenStatus = document.getElementById('sprachenStatus');
    if (sprachenStatus) {
        if (isSprachenArea) {
            sprachenStatus.style.display = 'block';
            sprachenStatus.textContent = 'SPRACHEN aktiv: Spieler hören nur zu.';
        } else {
            sprachenStatus.style.display = 'none';
        }
    }
    const adminQuestionWrapper = document.getElementById('currentQuestionAdminWrapper');
    if (adminQuestionWrapper) adminQuestionWrapper.classList.remove('activity-mode');
    answeredSoundPlayed = false;
    votedSoundPlayed = false;
    latestVotes = {};
    
    if (!isHost) {
        if (isActivityArea) {
            const isActivityPlayer = activityPlayer.socketId === socket.id;
            if (isActivityPlayer) {
                document.getElementById('currentQuestion').style.display = 'block';
                document.getElementById('currentQuestion').textContent = `Begriff: ${question}`;
            } else {
                document.getElementById('currentQuestion').style.display = 'block';
                document.getElementById('currentQuestion').textContent = `Wir befinden uns in der ACTIVITY Runde - "${activityPlayer.name}" - deutet, zeichnet oder erklärt den gesuchten Begriff. Versuche dann aufzuschreiben welchen Begriff du gesehen hast.`;
            }
        } else if (isSprachenArea) {
            document.getElementById('currentQuestion').style.display = 'block';
            document.getElementById('currentQuestion').textContent = 'Höre gut zu, was kann der Satz bedeuten?';
        } else {
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
        updateGrokButtonVisibility();
    } else {
        document.getElementById('currentQuestionAdmin').innerHTML = `<span style="color:yellow; font-size:32px"><br>${effectiveQuestion}</span>`;
        
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

function showActivitySelection(players, winnerName) {
    const overlay = document.getElementById('activitySelectOverlay');
    const ticker = document.getElementById('activitySelectTicker');
    const closeBtn = document.getElementById('activitySelectClose');
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
        if (closeBtn) closeBtn.removeEventListener('click', onClose);
    };

    const observer = new MutationObserver(() => {
        if (ticker.classList.contains('winner')) {
            if (closeBtn) closeBtn.style.display = 'inline-block';
            observer.disconnect();
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

/* Voice / TTS */
function getBestGermanVoice() {
    voices = speechSynthesis.getVoices();
    // Immer deutsche Stimme verwenden, Benutzereinstellung ignorieren
    return voices.find(v => v.lang === 'de-DE' && v.name.includes('Google')) ||
           voices.find(v => v.lang === 'de-DE' && v.name.includes('Microsoft')) ||
           voices.find(v => v.lang.startsWith('de')) ||
           voices[0];
}

// Pick a suitable voice for a given BCP-47 language code (strict matching)
function getBestVoiceForLang(langCode) {
    const voices = speechSynthesis.getVoices() || [];
    const target = String(langCode || '').toLowerCase().replace('_', '-');
    const short = target.substring(0, 2);

    // Normalize voice.lang and match strictly
    const normalized = voices.map(v => ({ v, lang: String(v.lang || '').toLowerCase().replace('_', '-') }));

    // Exact match, prefer Google/Microsoft
    let cand = normalized.find(o => o.lang === target && o.v.name.includes('Google'))
            || normalized.find(o => o.lang === target && o.v.name.includes('Microsoft'))
            || normalized.find(o => o.lang === target);
    if (cand) return cand.v;

    // Short match (e.g., it)
    cand = normalized.find(o => o.lang.startsWith(short) && o.v.name.includes('Google'))
        || normalized.find(o => o.lang.startsWith(short) && o.v.name.includes('Microsoft'))
        || normalized.find(o => o.lang.startsWith(short));
    if (cand) return cand.v;

    // No suitable voice
    return null;
}

// Read the current question text in a specific language
function readQuestionInLang(langCode) {
    try {
        speechSynthesis.cancel();
        // Always read from questionInput field (actual question), not currentQuestionText
        // currentQuestionText might be masked (e.g., "Gesuchter Satz" in SPRACHEN games)
        const q = (document.getElementById('questionInput')?.value || '').trim();
        if (!q) {
            console.warn('[TTS] Keine Frage vorhanden zum Vorlesen');
            return;
        }
        const voice = getBestVoiceForLang(langCode);
        if (!voice) {
            alert('Für diese Sprache ist keine passende Browser-Stimme verfügbar.');
            return;
        }
        const utter = new SpeechSynthesisUtterance(q);
        if (voice) utter.voice = voice;
        utter.lang = langCode;
        utter.rate = 0.95;
        speechSynthesis.speak(utter);
        console.log(`[TTS] Frage in ${langCode} mit Browser TTS abgespielt`);
    } catch (e) {
        console.warn('[TTS] Fehler beim Vorlesen in Sprache', langCode, e);
    }
}

function populateVoices() {
    const sel = document.getElementById('voiceSelect');
    const langSel = document.getElementById('languageSelect');
    if (!sel) return;
    let list = speechSynthesis.getVoices() || [];
    const prevURI = localStorage.getItem('preferredVoiceURI');
    const prevName = localStorage.getItem('preferredVoiceName');
    const selectedLang = langSel ? langSel.value : '';
    
    // Sortiere: German > English > Rest alphabetisch, innerhalb jeder Gruppe nach Name
    list = list.sort((a, b) => {
        const aLang = a.lang || '';
        const bLang = b.lang || '';
        const aName = (a.name || '').replace('Microsoft ', '');
        const bName = (b.name || '').replace('Microsoft ', '');
        
        // German first
        if (aLang.startsWith('de') && !bLang.startsWith('de')) return -1;
        if (!aLang.startsWith('de') && bLang.startsWith('de')) return 1;
        
        // English second
        if (aLang.startsWith('en') && !bLang.startsWith('en')) return -1;
        if (!aLang.startsWith('en') && bLang.startsWith('en')) return 1;
        
        // Innerhalb gleicher Sprachgruppen: nach Name sortieren
        if (aLang === bLang) {
            return aName.localeCompare(bName);
        }
        
        // Rest alphabetisch nach Sprache
        return aLang.localeCompare(bLang);
    });
    
    // Filtere nach ausgewählter Sprache
    let filteredList = list;
    if (selectedLang) {
        filteredList = list.filter(v => (v.lang || '').startsWith(selectedLang));
    }
    
    sel.innerHTML = '';
    filteredList.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.setAttribute('data-voiceuri', v.voiceURI || '');
        const cleanName = v.name.replace('Microsoft ', '');
        opt.textContent = `${cleanName} — ${v.lang}` + (v.localService ? ' (local)' : '');
        if ((prevURI && v.voiceURI === prevURI) || (!prevURI && prevName && v.name === prevName)) opt.selected = true;
        sel.appendChild(opt);
    });
    if (filteredList.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Keine Browser-Stimmen verfügbar (ggf. https oder Interaction nötig)';
        sel.appendChild(opt);
    }
    
        // Update availability state for compact language-specific question read buttons
        function updateLanguageButtonsAvailability() {
            try {
                const voices = (typeof speechSynthesis !== 'undefined') ? speechSynthesis.getVoices() : [];
                const map = [
                    ['readQuestionDeBtn', 'de-DE', 'DE'],
                    ['readQuestionEnBtn', 'en-US', 'EN'],
                    ['readQuestionLtBtn', 'lt-LT', 'LT'],
                    ['readQuestionElBtn', 'el-GR', 'EL'],
                    ['readQuestionHuBtn', 'hu-HU', 'HU'],
                    ['readQuestionJaBtn', 'ja-JP', 'JA'],
                ];
                const available = [];
                const unavailable = [];
                map.forEach(([id, lang, short]) => {
                    const btn = document.getElementById(id);
                    if (!btn) return;
                    const voice = getBestVoiceForLang(lang);
                    const has = !!voice;
                    btn.disabled = !has;
                    btn.style.opacity = has ? '1' : '0.6';
                    btn.title = has ? '' : 'Keine passende Browser-Stimme gefunden';
                    if (has) available.push(short); else unavailable.push(short);
                });
                const status = document.getElementById('readQuestionStatus');
                if (status) {
                    if (!voices || voices.length === 0) {
                        status.textContent = 'Keine Browser-Stimmen geladen – Interaktion oder https nötig.';
                    } else {
                        const av = available.length ? `Verfügbar: ${available.join(', ')}` : 'Verfügbar: –';
                        const un = unavailable.length ? `Nicht verfügbar: ${unavailable.join(', ')}` : '';
                        status.textContent = [av, un].filter(Boolean).join(' | ');
                    }
                }
            } catch (_) {}
        }
}

function populateLanguages() {
    const langSel = document.getElementById('languageSelect');
    if (!langSel) return;
    const list = speechSynthesis.getVoices() || [];
    
    // Extrahiere alle eindeutigen Sprachcodes (z.B. 'de', 'en', 'fr')
    const langSet = new Set();
    list.forEach(v => {
        const lang = (v.lang || '').substring(0, 2);
        if (lang) langSet.add(lang);
    });
    
    let languages = Array.from(langSet).sort();
    // Fallback, falls der Browser noch keine Voices liefert
    if (languages.length === 0) {
        languages = ['de', 'en', 'fr', 'es', 'it', 'pt'];
    }
    const langNames = {
        'de': 'Deutsch',
        'en': 'Englisch',
        'fr': 'Französisch',
        'es': 'Spanisch',
        'it': 'Italienisch',
        'pt': 'Portugiesisch',
        'ru': 'Russisch',
        'ja': 'Japanisch',
        'zh': 'Chinesisch',
        'ko': 'Koreanisch',
        'nl': 'Niederländisch',
        'sv': 'Schwedisch',
        'no': 'Norwegisch',
        'da': 'Dänisch',
        'fi': 'Finnisch',
        'pl': 'Polnisch',
        'tr': 'Türkisch',
        'cs': 'Tschechisch',
        'sk': 'Slowakisch',
        'hu': 'Ungarisch',
        'el': 'Griechisch',
        'bg': 'Bulgarisch',
        'ro': 'Rumänisch',
        'uk': 'Ukrainisch',
        'hi': 'Hindi',
        'ar': 'Arabisch',
    };

    function labelForLang(lang) {
        if (!lang) return '';
        if (langNames[lang]) return langNames[lang];
        try {
            // Best effort: use browser display names
            const dn = new Intl.DisplayNames(['de', 'en'], { type: 'language' });
            const disp = dn.of(lang);
            if (disp) return disp;
        } catch (_) {}
        return lang.toUpperCase();
    }
    
    // Behalte nur "Alle Sprachen" Option
    const selected = langSel.value;
    langSel.innerHTML = '<option value="">Alle Sprachen</option>';
    
    languages.forEach(lang => {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = labelForLang(lang);
        langSel.appendChild(opt);
    });
    
    langSel.value = selected;
}

function initVoiceControls() {
    const sel = document.getElementById('voiceSelect');
    const testBtn = document.getElementById('testVoiceBtn');
    const useChk = document.getElementById('useSelectedVoice');
    if (!sel || !testBtn || !useChk) return;

    function updatePreferredFromSelect() {
        const opt = sel.options[sel.selectedIndex];
        if (!opt) return;
        const name = opt.value;
        const uri = opt.getAttribute('data-voiceuri') || '';
        localStorage.setItem('preferredVoiceName', name);
        localStorage.setItem('preferredVoiceURI', uri);
    }

    populateLanguages();
    populateVoices();
        try { updateLanguageButtonsAvailability(); } catch (_) {}

    // Some browsers deliver voices asynchronously; retry until they arrive (up to ~12s)
    let voiceTries = 0;
    function retryPopulateVoices() {
        const voices = (typeof speechSynthesis !== 'undefined') ? speechSynthesis.getVoices() : [];
        if (voices && voices.length) {
            populateLanguages();
            populateVoices();
                try { updateLanguageButtonsAvailability(); } catch (_) {}
            return;
        }
        if (voiceTries < 40) { // 40 * 300ms ≈ 12s
            voiceTries += 1;
            setTimeout(retryPopulateVoices, 300);
        }
    }

    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.onvoiceschanged = () => {
            populateLanguages();
            populateVoices();
                try { updateLanguageButtonsAvailability(); } catch (_) {}
        };
        // Kick off retries in case onvoiceschanged never fires
        retryPopulateVoices();
    }

    const langSel = document.getElementById('languageSelect');
    if (langSel) {
        langSel.addEventListener('change', populateVoices);
    }

    sel.addEventListener('change', updatePreferredFromSelect);
    useChk.checked = localStorage.getItem('usePreferredVoice') === '1';
    useChk.addEventListener('change', () => {
        localStorage.setItem('usePreferredVoice', useChk.checked ? '1' : '0');
    });

    testBtn.addEventListener('click', () => {
        try {
            const opt = sel.options[sel.selectedIndex];
            const prefName = opt ? opt.value : '';
            const prefURI = opt ? opt.getAttribute('data-voiceuri') || '' : '';
            const voicesNow = speechSynthesis.getVoices();
            const voice = voicesNow.find(v => v.voiceURI === prefURI) || voicesNow.find(v => v.name === prefName) || getBestGermanVoice();
            const utter = new SpeechSynthesisUtterance('Dies ist ein Test. Hallo zusammen!');
            if (voice) utter.voice = voice;
            utter.lang = 'de-DE';
            speechSynthesis.cancel();
            speechSynthesis.speak(utter);
        } catch(e) {
            console.warn('test voice failed', e);
        }
    });
}

function updateReadButtonText(voiceName) {
    const readBtn = document.getElementById('readBtn');
    if (!readBtn) return;
    const icon = readBtn.querySelector('svg.icon');
    if (icon) {
        const textNode = Array.from(readBtn.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
        if (textNode) {
            textNode.textContent = ' Alle vorlesen lassen';
        }
    } else {
        readBtn.textContent = '🔊 Alle vorlesen lassen';
    }
}

function readAloud() {
    console.log('[TTS] readAloud called - using Browser TTS');
    readAloudWithBrowserTTS();
}

function readQuestion() {
    console.log('[TTS] readQuestion called - using Browser TTS');
    readQuestionWithBrowserTTS();
}

function readQuestionWithBrowserTTS() {
    speechSynthesis.cancel();
    let voice;
    try {
        // Immer deutsche Stimme verwenden
        voice = getBestGermanVoice();
    } catch (e) {
        voice = getBestGermanVoice();
    }

    if (currentQuestionText && currentQuestionText.trim()) {
        const plainQuestion = currentQuestionText.trim();
        const qUtter = new SpeechSynthesisUtterance(plainQuestion);
        if (voice) qUtter.voice = voice;
        qUtter.lang = 'de-DE';
        qUtter.rate = 0.95;
        speechSynthesis.speak(qUtter);
        console.log('[TTS] Frage mit Browser TTS erfolgreich abgespielt');
    } else {
        console.warn('[TTS] Keine Frage vorhanden zum Vorlesen');
    }
}

function readAloudWithBrowserTTS() {
    speechSynthesis.cancel();
    let voice;
    try {
        // Immer deutsche Stimme verwenden für "Alle vorlesen lassen"
        voice = getBestGermanVoice();
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

/* Voting */
socket.on('votingStarted', ({ lettered, playerNames }) => {
    const names = Array.isArray(playerNames) ? playerNames.filter(Boolean) : [];
    if (names.length) {
        lastPlayers = names.map(n => ({ name: n }));
        renderPlayersActions(lastPlayers, lastSubmitted, latestVotes);
    }

    if (isHost) {
        const startBtn = document.getElementById('startVotingBtn');
        const endBtn = document.getElementById('endVotingBtn');
        if (startBtn) startBtn.style.display = 'none';
        if (endBtn) endBtn.style.display = 'inline-block';
        votedSoundPlayed = false;
        return;
    }
    
    const votingSection = document.getElementById('votingSection');
    const votingOptions = document.getElementById('votingOptions');
    if (!votingSection || !votingOptions) return;

    votingOptions.innerHTML = '';
    lettered.forEach(option => {
        if (option.submitterName === myPlayerName) {
            return;
        }
        
        const button = document.createElement('button');
        button.className = 'voting-option';
        button.style.width = '85%';
        button.style.maxWidth = '600px';
        button.textContent = `${option.letter}: ${option.text}`;
        
        button.addEventListener('click', () => {
            emitBuffered('submitVote', option.letter);
            votingSection.style.display = 'none';
            document.getElementById('waitingMessage').style.display = 'block';
            document.getElementById('waitingMessage').textContent = 'Deine Stimme wurde abgegeben. Warte auf die Ergebnisse...';
        });
        
        votingOptions.appendChild(button);
    });

    document.getElementById('waitingMessage').style.display = 'none';
    votingSection.style.display = 'block';

    try {
        const target = votingSection.querySelector('h3') || votingSection;
        target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    } catch (e) {
        window.scrollTo({ top: votingSection.offsetTop || 0, behavior: 'auto' });
    }
});

socket.on('votingUpdate', (payload) => {
    const voteMap = payload && typeof payload === 'object' && payload.votes ? payload.votes : (payload || {});
    const playerNames = payload && Array.isArray(payload.playerNames) ? payload.playerNames.filter(Boolean) : [];
    const playerObjs = payload && Array.isArray(payload.players) ? payload.players : [];
    latestVotes = voteMap || {};

    // Prefer full player objects with colors; otherwise seed names only if empty
    if (playerObjs.length) {
        lastPlayers = playerObjs;
        cacheColorsFromList(playerObjs);
    } else if ((!lastPlayers || lastPlayers.length === 0) && playerNames.length) {
        lastPlayers = playerNames.map(n => ({ name: n }));
    }
    cacheColorsFromList(lastPlayers);

    if (isHost) {
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
        const presentBtn = document.getElementById('presentBtn');
        if (startBtn) startBtn.style.display = 'inline-block';
        if (endBtn) endBtn.style.display = 'none';
        if (presentBtn) presentBtn.style.display = 'inline-block';
    }
});
