/* UI Rendering and player list updates */

// Player list rendering for regular players and admin list rendering
socket.on('updatePlayers', (players) => {
    const sorted = sortPlayersForDisplay(players || []);
    
    // Cache colors from server
    cacheColorsFromList(sorted);
    
    const listEl = document.getElementById('playersList');
    if (sorted.length === 0) {
        listEl.innerHTML = 'Keine verbunden';
    } else {
        listEl.innerHTML = '';
        sorted.forEach(p => {
            const div = document.createElement('div');
            div.innerHTML = '• ';
            const span = document.createElement('span');
            const name = (typeof p === 'string') ? p : (p.name || '');
            span.textContent = name;
            span.style.color = (p && p.color) ? p.color : getColorForName(name);
            div.appendChild(span);
            listEl.appendChild(div);
        });
    }
    if (Array.isArray(sorted)) {
        lastPlayers = sorted;
    }
    
    // Update header names with correct colors
    if (typeof updateAnsweredHeaderNames === 'function') {
        updateAnsweredHeaderNames();
    }
});

socket.on('updatePlayersAdmin', (players) => {
    const sortedPlayers = sortPlayersForDisplay(players || []);
    
    // Cache colors from server
    cacheColorsFromList(sortedPlayers);
    
    lastAdminPlayers = sortedPlayers;
    
    function renderPlayers(targetEl) {
        if (!targetEl) return;
        if (!sortedPlayers || sortedPlayers.length === 0) {
            targetEl.innerHTML = 'Keine verbunden';
            return;
        }
        targetEl.innerHTML = '';
        sortedPlayers.forEach(p => {
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
        if (!sortedPlayers || sortedPlayers.length === 0) {
            targetEl.innerHTML = 'Keine verbunden';
            return;
        }
        
        const playerList = sortPlayersForDisplay(sortedPlayers.filter(p => !p.isAdmin));
        
        if (playerList.length === 0) {
            targetEl.innerHTML = 'Keine Spieler';
            return;
        }
        
        targetEl.innerHTML = '';
        
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;';
        
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
        
        const tbody = document.createElement('tbody');
        playerList.forEach((p, idx) => {
            const row = document.createElement('tr');
            row.style.cssText = `border-bottom: 1px solid rgba(76,175,80,0.1); ${idx % 2 === 0 ? 'background: rgba(255,255,255,0.02);' : ''}`;
            
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

            const nameCell = document.createElement('td');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;
            nameSpan.style.color = (p && p.color) ? p.color : getColorForName(p.name);
            nameCell.appendChild(nameSpan);
            nameCell.style.cssText = 'padding: 10px 8px;';
            row.appendChild(nameCell);
            
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
            
            const removeCell = document.createElement('td');
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '✕ Entfernen';
            removeBtn.className = 'reset tiny-btn';
            removeBtn.style.cssText = 'padding: 6px 10px; font-size: 12px; cursor: pointer; color: #ff6b6b;';
            removeBtn.addEventListener('click', () => {
                if (!confirm(`Spieler "${p.name}" entfernen?`)) return;
                socket.emit('removePlayer', p.id);
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
                } catch (e) { }
            });
            removeCell.appendChild(removeBtn);
            removeCell.style.cssText = 'padding: 10px 8px; text-align: center;';
            row.appendChild(removeCell);
            
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
    
    const listEl = document.getElementById('playersList');
    const playersSlot = document.getElementById('adminPlayersSlot');
    
    if (listEl) renderPlayers(listEl);
    if (playersSlot) renderPlayersTable(playersSlot);

    try {
        const botCount = (players || []).filter(p => p && p.name && String(p.name || '').startsWith('#Bot')).length;
        const realPlayers = (players || []).filter(p => p && p.name && !String(p.name || '').startsWith('#Bot')).length;
        const botInput = document.getElementById('botCountInput');
        if (botInput) {
            botInput.value = String(botCount || 0);
            botInput.setAttribute('max', String(Math.max(0, 10 - realPlayers)));
        }
    } catch (e) { }
});

/* Players actions table (submitted status) */
socket.on('updateSubmitted', (payload) => {
    const players = payload && typeof payload === 'object' && Array.isArray(payload.players) ? payload.players : [];
    const submitted = payload && typeof payload === 'object' && Array.isArray(payload.submitted) ? payload.submitted
        : Array.isArray(payload) ? payload : [];

    lastPlayers = players;
    lastSubmitted = submitted;

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

    const allSent = playerItems.length > 0 && playerItems.every(p => submitted.includes(p.name));
    const allVoted = playerItems.length > 0 && playerItems.every(p => votes && Object.prototype.hasOwnProperty.call(votes, p.name));
    const statusParts = [];
    if (allSent) statusParts.push('<span class="badge success">✔ Alle gesendet</span>');
    if (allVoted) statusParts.push('<span class="badge info">🗳 Alle abgestimmt</span>');
    const statusHtml = statusParts.length ? `<div class="actions-status">${statusParts.join(' ')}</div>` : '';

    if (list) list.innerHTML = html + statusHtml;
    if (adminList) adminList.innerHTML = html + statusHtml;

    const answersMask = document.getElementById('answersMask');
    if (answersMask) {
        const showMask = isHost && !allSent;
        answersMask.classList.toggle('visible', showMask);
        const answersWrapper = document.getElementById('answersListWrapper');
        if (answersWrapper) answersWrapper.style.position = 'relative';
    }

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

        function softNote(freq, startTime, duration = 0.35, volume = 0.18) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.03);
            gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
            osc.start(startTime);
            osc.stop(startTime + duration + 0.02);
        }

        if (type === 'allSent') {
            softNote(523.25, now, 0.32, 0.10);
            softNote(659.25, now + 0.18, 0.34, 0.10);
        } else {
            softNote(783.99, now, 0.28, 0.11);
            softNote(987.77, now + 0.18, 0.28, 0.11);
            softNote(1174.66, now + 0.36, 0.30, 0.11);
        }
    } catch (e) {
        console.warn('playAdminSound failed', e);
    }
}

/* Show all answers */
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

/* Reveal answers with voting */
socket.on('revealAnswers', ({ lettered, realIndex }) => {
    currentAnswers = lettered;
    lastRealIndex = (typeof realIndex === 'number') ? realIndex : null;
    const list = document.getElementById('answersList');
    if (list) list.innerHTML = '';
    lettered.forEach((a, i) => {
        const container = document.createElement('div');
        container.className = 'answer-container';

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

socket.on('pointsUpdate', (points) => {
    playerPoints = points || {};
    renderPlayersActions(lastPlayers, lastSubmitted, latestVotes);
});

socket.on('roundEnded', () => {
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
        const startVotingBtn = document.getElementById('startVotingBtn');
        const endVotingBtn = document.getElementById('endVotingBtn');
        if (startVotingBtn) startVotingBtn.style.display = 'none';
        if (endVotingBtn) endVotingBtn.style.display = 'none';
    }
    latestVotes = {};
    answeredSoundPlayed = false;
    votedSoundPlayed = false;
});

socket.on('newRoundStarted', () => {
    if (!isHost) {
        const waitingMsg = document.getElementById('waitingMessage');
        if (waitingMsg) {
            waitingMsg.innerHTML = '<strong>🆕 Neue Runde gestartet!</strong><br>Der Admin bereitet die nächste Frage vor... bitte warten.';
            waitingMsg.style.display = 'block';
        }
    }
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

        const votesForThis = Object.entries(votes)
            .filter(([, letter]) => letter === a.letter)
            .map(([name]) => name);

        if (votesForThis.length > 0) {
            const votesSpan = document.createElement('span');
            votesSpan.style.color = '#4CAF50';
            votesSpan.style.fontWeight = 'bold';
            votesSpan.style.marginLeft = '20px';
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
