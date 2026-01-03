/* Admin-specific functionality: bots, player management, grok stats */

/* Toggle real answer visibility */
function toggleRealAnswer() {
    const realWrap = document.getElementById('realAnswerWrapper');
    const toggleBtn = document.getElementById('toggleRealAnswerBtn');
    
    if (!realWrap || !toggleBtn) return;
    
    const isVisible = realWrap.style.display === 'block';
    
    if (isVisible) {
        realWrap.style.display = 'none';
        toggleBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="/icons.svg#eye"></use></svg> Antwort einblenden';
    } else {
        realWrap.style.display = 'block';
        toggleBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="/icons.svg#eye-off"></use></svg> Antwort ausblenden';
        // Focus the textarea
        const realAnswerInput = document.getElementById('realAnswerInput');
        if (realAnswerInput) {
            setTimeout(() => {
                realAnswerInput.focus();
                realAnswerInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }
}

/* Bot management */
function ensureBotsUI() {
    const botInput = document.getElementById('botCountInput');
    const botLabel = document.querySelector('label[for="botCountInput"]');
    const setBotsBtn = document.getElementById('setBotsBtn');
    
    function updateBotDisplay() {
        const currentBots = (lastAdminPlayers || []).filter(p => p && String(p.name || '').startsWith('#')).length;
        const maxBots = 8; // Max 8 bots independent of real players
        if (botInput) {
            botInput.value = currentBots;
            botInput.setAttribute('min', '0');
            botInput.setAttribute('max', String(maxBots));
        }
        if (botLabel) {
            botLabel.textContent = `Bots: ${currentBots}/8`;
        }
    }

    if (setBotsBtn && botInput) {
        setBotsBtn.addEventListener('click', () => {
            const maxBots = 8;
            const n = Math.max(0, Math.min(maxBots, Number(botInput.value) || 0));
            socket.emit('setBots', n);
            setBotsBtn.textContent = '✔ Gesendet';
            setTimeout(() => setBotsBtn.textContent = 'Setze Bots', 900);
            // Update display immediately
            setTimeout(updateBotDisplay, 100);
        });
        updateBotDisplay();
    }

    // Listen for player list updates to refresh bot count
    try {
        socket.on('updatePlayersAdmin', updateBotDisplay);
    } catch (_) {}
}

/* Grok stats polling */
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
        
        const total = data.total_tokens || data.totalTokens || 0;
        const promptTokens = data.total_prompt_tokens || data.totalPromptTokens || 0;
        const completionTokens = data.total_completion_tokens || data.totalCompletionTokens || 0;
        const requests = data.requests_made || data.requestsMade || 0;

        const INPUT_EUR_PER_M = 5.0;
        const OUTPUT_EUR_PER_M = 15.0;

        const costPromptEur = (promptTokens / 1_000_000) * INPUT_EUR_PER_M;
        const costCompletionEur = (completionTokens / 1_000_000) * OUTPUT_EUR_PER_M;
        const totalEur = costPromptEur + costCompletionEur;

        if (requests === 0) {
            textEl.textContent = '🤖 Grok: Noch nicht genutzt';
        } else {
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
    fetchGrokStats();
    if (grokStatsInterval) clearInterval(grokStatsInterval);
    grokStatsInterval = setInterval(fetchGrokStats, 10000);
}

/* Grok usage notifications with slide-in animation */
function showGrokUsageNotification(playerName) {
    const container = document.getElementById('grokNotificationContainer');
    if (!container) return;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'grok-notification';
    notification.textContent = `🤖 ${playerName}`;
    
    // Play SMS sound
    playNotificationSound();
    
    // Add to container (stacks vertically)
    container.appendChild(notification);
    
    // Remove after 2 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        }, 300); // fade-out duration
    }, 2000);
}

function playNotificationSound() {
    // Create a short notification beep using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // SMS-like tone
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {
        console.warn('Could not play notification sound:', e);
    }
}

// Listen for Grok usage notifications
if (typeof socket !== 'undefined') {
    socket.on('grokUsageNotification', (data) => {
        if (data && data.playerName) {
            showGrokUsageNotification(data.playerName);
        }
    });
}

/* Area filter */
function populateAreaFilter() {
    const areaFilter = document.getElementById('areaFilter');
    if (!areaFilter || typeof nobodyIsPerfectTerms === 'undefined') return;
    
    const areas = new Set();
    nobodyIsPerfectTerms.forEach(term => {
        if (term.area) {
            areas.add(term.area);
        }
    });
    
    const sortedAreas = Array.from(areas).sort();
    
    areaFilter.innerHTML = '<option value="ALLE">ALLE</option>';
    
    sortedAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        areaFilter.appendChild(option);
    });
}

function syncActivityMask(areaValue) {
    const areaLower = String(areaValue || '').toLowerCase();
    const isActivity = areaLower.includes('activity');
    const isSprachen = areaLower.includes('sprachen');
    const activityMask = document.getElementById('activityMask');
    if (activityMask) {
        activityMask.classList.remove('visible');
        activityMask.style.display = 'none';
        if (isActivity || isSprachen) {
            activityMask.textContent = isActivity ? 'ACTIVITY-Runde – Begriff verborgen' : 'SPRACHEN-Runde – Satz verborgen';
        }
    }
    const adminQuestionWrapper = document.getElementById('currentQuestionAdminWrapper');
    if (adminQuestionWrapper) adminQuestionWrapper.classList.remove('activity-mode');

    const questionInputMask = document.getElementById('questionInputMask');
    if (questionInputMask) {
        questionInputMask.classList.toggle('visible', isActivity || isSprachen);
        questionInputMask.textContent = isActivity ? 'ACTIVITY-Runde – Frage verborgen' : (isSprachen ? 'SPRACHEN-Runde – Frage verborgen' : questionInputMask.textContent);
    }
}

/* Area distribution overlay */
const chartPalette = ['#5dd39e', '#348aa7', '#525174', '#513b56', '#e3c567', '#ef6f6c', '#7ae7c7', '#58a4b0', '#a775d8', '#f4a259', '#8e9aaf', '#ff7f50', '#5f0f40', '#1c7c54', '#ffa630', '#4a6fa5', '#d36135', '#6c91bf', '#7cc6fe', '#c4d6b0'];
let areaOverlayRefs = null;

function computeAreaDistribution() {
    const counts = {};
    const source = Array.isArray(nobodyIsPerfectTerms) ? nobodyIsPerfectTerms : [];
    source.forEach(term => {
        const area = term && term.area ? String(term.area).trim() : '';
        if (!area) return;
        counts[area] = (counts[area] || 0) + 1;
    });
    return counts;
}

function buildAreaOverlay() {
    if (areaOverlayRefs) return areaOverlayRefs;

    const overlay = document.createElement('div');
    overlay.id = 'areaDistributionOverlay';
    overlay.className = 'chart-overlay';

    const backdrop = document.createElement('div');
    backdrop.className = 'chart-overlay-backdrop';
    overlay.appendChild(backdrop);

    const box = document.createElement('div');
    box.className = 'chart-overlay-box';

    const header = document.createElement('div');
    header.className = 'chart-overlay-header';
    const title = document.createElement('span');
    title.textContent = 'Bereichs-Verteilung';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'overlay-close';
    closeBtn.textContent = '×';
    header.appendChild(title);
    header.appendChild(closeBtn);
    box.appendChild(header);

    const body = document.createElement('div');
    body.className = 'chart-overlay-body';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'chart-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.id = 'areaChartCanvas';
    canvas.width = 420;
    canvas.height = 420;
    canvasWrap.appendChild(canvas);

    const legendWrap = document.createElement('div');
    legendWrap.className = 'chart-legend';
    const legendTitle = document.createElement('h4');
    legendTitle.textContent = 'Legende';
    const totalLabel = document.createElement('div');
    totalLabel.className = 'chart-total';
    const legendList = document.createElement('div');
    legendList.className = 'chart-legend-list';
    const emptyState = document.createElement('div');
    emptyState.className = 'chart-empty';
    emptyState.textContent = 'Keine Bereiche geladen.';

    legendWrap.appendChild(legendTitle);
    legendWrap.appendChild(totalLabel);
    legendWrap.appendChild(legendList);
    legendWrap.appendChild(emptyState);

    body.appendChild(canvasWrap);
    body.appendChild(legendWrap);

    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function closeOverlay() {
        overlay.classList.remove('show');
    }

    closeBtn.addEventListener('click', closeOverlay);
    backdrop.addEventListener('click', closeOverlay);

    areaOverlayRefs = { overlay, canvas, legendList, totalLabel, emptyState };
    return areaOverlayRefs;
}

function drawAreaPie(canvas, entries, total) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!total || !entries.length) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 - 12;
    let startAngle = -Math.PI / 2;

    entries.forEach(([_, count], idx) => {
        const sliceAngle = (count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = chartPalette[idx % chartPalette.length];
        ctx.fill();
        startAngle += sliceAngle;
    });

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fill();

    ctx.fillStyle = '#ddd';
    ctx.font = '600 16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${total} Begriffe`, centerX, centerY);
}

function showQRCodeOverlay() {
    // Check if overlay already exists
    let overlay = document.getElementById('qrCodeOverlay');
    
    if (!overlay) {
        // Create overlay
        overlay = document.createElement('div');
        overlay.id = 'qrCodeOverlay';
        overlay.className = 'chart-overlay';
        
        const backdrop = document.createElement('div');
        backdrop.className = 'chart-overlay-backdrop';
        overlay.appendChild(backdrop);
        
        const box = document.createElement('div');
        box.className = 'chart-overlay-box';
        box.style.maxWidth = '600px';
        
        const header = document.createElement('div');
        header.className = 'chart-overlay-header';
        const title = document.createElement('span');
        title.textContent = 'QR-Code zum Beitreten';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'overlay-close';
        closeBtn.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeBtn);
        box.appendChild(header);
        
        const body = document.createElement('div');
        body.className = 'chart-overlay-body';
        body.style.textAlign = 'center';
        body.style.padding = '40px';
        
        const qrImage = document.createElement('img');
        qrImage.src = 'qr-code.png';
        qrImage.alt = 'QR-Code zum Beitreten';
        qrImage.style.maxWidth = '100%';
        qrImage.style.height = 'auto';
        qrImage.style.borderRadius = '12px';
        qrImage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        
        const instruction = document.createElement('p');
        instruction.textContent = 'Scanne diesen Code mit deinem Handy, um dem Spiel beizutreten';
        instruction.style.marginTop = '24px';
        instruction.style.color = '#aaa';
        instruction.style.fontSize = '15px';
        instruction.style.lineHeight = '1.5';
        
        body.appendChild(qrImage);
        body.appendChild(instruction);
        
        box.appendChild(body);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        function closeOverlay() {
            overlay.classList.remove('show');
        }
        
        closeBtn.addEventListener('click', closeOverlay);
        backdrop.addEventListener('click', closeOverlay);
    }
    
    overlay.classList.add('show');
}

function openAreaDistributionOverlay() {
    const refs = buildAreaOverlay();
    const counts = computeAreaDistribution();
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, val]) => sum + val, 0);

    refs.legendList.innerHTML = '';
    refs.totalLabel.textContent = total ? `Summe: ${total}` : '';
    refs.emptyState.style.display = entries.length ? 'none' : 'block';

    if (!entries.length) {
        drawAreaPie(refs.canvas, [], 0);
        refs.overlay.classList.add('show');
        return;
    }

    entries.forEach(([area, count], idx) => {
        const percent = total ? ((count / total) * 100).toFixed(1) : '0.0';
        const item = document.createElement('div');
        item.className = 'chart-legend-item';

        const swatch = document.createElement('span');
        swatch.className = 'chart-swatch';
        swatch.style.background = chartPalette[idx % chartPalette.length];

        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = area;

        const value = document.createElement('span');
        value.className = 'chart-value';
        value.textContent = `${count} (${percent}%)`;

        item.appendChild(swatch);
        item.appendChild(label);
        item.appendChild(value);
        refs.legendList.appendChild(item);
    });

    drawAreaPie(refs.canvas, entries, total);
    refs.overlay.classList.add('show');
}

/* Admin setup in DOM initialization */
function setupAdminUI() {
    // Setup area filter
    const areaFilter = document.getElementById('areaFilter');
    if (areaFilter) {
        areaFilter.addEventListener('change', () => {
            console.log('areaFilter change', { value: areaFilter.value });
            syncActivityMask(areaFilter.value);
        });
        syncActivityMask(areaFilter.value);

        setInterval(() => {
            const current = areaFilter.value;
            syncActivityMask(current);
        }, 1000);
    }

    // Setup bot controls
    ensureBotsUI();

    // Show points reset button for admin
    const rpBtn = document.getElementById('resetPointsBtn');
    if (rpBtn) rpBtn.style.display = 'inline-block';

    // Auto-send edits from admin textboxes
    const qEl = document.getElementById('questionInput');
    const rEl = document.getElementById('realAnswerInput');
    if (qEl) {
        const sendQ = debounce(() => {
            const q = qEl.value.trim();
            if (!q) return;
            emitBuffered('sendQuestion', q);
        }, 400);
        qEl.addEventListener('input', sendQ);
    }
    if (rEl) {
        const sendR = debounce(() => {
            const r = rEl.value.trim();
            socket.emit('previewRealAnswer', r);
        }, 500);
        rEl.addEventListener('input', sendR);
    }

    // Prime AudioContext on first admin click
    document.addEventListener('click', () => {
        try { getAudioCtx(); } catch(_) {}
    }, { once: true });

    // Setup admin overlay UI
    setupAdminOverlay();
}

/* Admin overlay setup */
function setupAdminOverlay() {
    const toggleBtn = document.getElementById('adminPanelToggle');
    const overlay = document.getElementById('adminOverlay');
    const closeBtn = document.getElementById('adminOverlayClose');
    const backdrop = document.querySelector('.admin-overlay-backdrop');

    if (!toggleBtn || !overlay) return;

    function openOverlay() {
        const settingsSlot = document.getElementById('adminSettingsSlot');
        const voiceSlot = document.getElementById('adminVoiceSlot');
        const playersSlot = document.getElementById('adminPlayersSlot');
        const resetConnBtn = document.getElementById('resetTopBtn');
        const resetPointsBtn = document.getElementById('resetPointsBtn');
        const voiceControls = document.getElementById('voiceControls');
        
        console.log('Opening overlay');

        // Ensure any "hidden" class from initial render is removed
        overlay.classList.remove('hidden');
        
        if (settingsSlot) {
            settingsSlot.innerHTML = '';
            settingsSlot.style.display = 'flex';
            settingsSlot.style.flexDirection = 'column';
            settingsSlot.style.gap = '12px';
            
            if (resetConnBtn && typeof resetGame === 'function') {
                const connBtn = resetConnBtn.cloneNode(true);
                connBtn.className = 'primary';
                connBtn.style.cssText = 'width: 100%; padding: 12px 16px; font-size: 14px; font-weight: 500;';
                connBtn.textContent = '🔄 Verbindung zurücksetzen';
                connBtn.addEventListener('click', resetGame);
                settingsSlot.appendChild(connBtn);
            }
            
            if (resetPointsBtn) {
                const pointsBtn = resetPointsBtn.cloneNode(true);
                pointsBtn.className = 'primary';
                pointsBtn.style.cssText = 'width: 100%; padding: 12px 16px; font-size: 14px; font-weight: 500;';
                pointsBtn.textContent = '🔄 Punkte zurücksetzen';
                pointsBtn.addEventListener('click', () => {
                    if (confirm('Alle Punkte auf null setzen?')) {
                        emitBuffered('resetPoints', {});
                    }
                });
                settingsSlot.appendChild(pointsBtn);
            }

            const areaBtn = document.createElement('button');
            areaBtn.className = 'primary';
            areaBtn.style.cssText = 'width: 100%; padding: 12px 16px; font-size: 14px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center; justify-content: center;';
            areaBtn.textContent = '📊 Bereich-Verteilung';
            areaBtn.addEventListener('click', openAreaDistributionOverlay);
            settingsSlot.appendChild(areaBtn);
            
            const qrBtn = document.createElement('button');
            qrBtn.className = 'primary';
            qrBtn.style.cssText = 'width: 100%; padding: 12px 16px; font-size: 14px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center; justify-content: center;';
            qrBtn.textContent = '📱 QR-Code';
            qrBtn.addEventListener('click', showQRCodeOverlay);
            settingsSlot.appendChild(qrBtn);
        }
        
        if (voiceSlot && voiceControls) {
            voiceSlot.innerHTML = '';
            voiceControls.style.display = 'flex';
            voiceControls.style.gap = '8px';
            voiceControls.style.alignItems = 'center';
            voiceControls.style.justifyContent = 'center';
            voiceControls.style.flexWrap = 'wrap';
            voiceControls.style.marginTop = '0';
            voiceSlot.appendChild(voiceControls);

            // Initialize voice selection controls when overlay opens
            try {
                if (typeof initVoiceControls === 'function') initVoiceControls();
                if (typeof populateVoices === 'function') populateVoices();
                if (typeof populateLanguages === 'function') populateLanguages();
                // Retry once more after short delay in case voices arrive late
                setTimeout(() => {
                    try {
                        if (typeof populateLanguages === 'function') populateLanguages();
                        if (typeof populateVoices === 'function') populateVoices();
                    } catch (err) { console.warn('Voice populate retry failed', err); }
                }, 500);
            } catch (e) {
                console.warn('Voice controls init failed', e);
            }
        }
        
        if (playersSlot && lastAdminPlayers && lastAdminPlayers.length > 0) {
            playersSlot.innerHTML = '';
            
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
            lastAdminPlayers.forEach((p, idx) => {
                const row = document.createElement('tr');
                row.style.cssText = `border-bottom: 1px solid rgba(76,175,80,0.1); ${idx % 2 === 0 ? 'background: rgba(255,255,255,0.02);' : ''}`;
                
                const colorCell = document.createElement('td');
                colorCell.style.cssText = 'padding: 10px 8px;';
                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                colorInput.value = p.color || '#ffffff';
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
                if (p.color) nameSpan.style.color = p.color;
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
            playersSlot.appendChild(table);
        } else if (playersSlot) {
            playersSlot.innerHTML = 'Keine verbunden';
        }
        
        overlay.classList.add('show');
    }

    function closeOverlay() {
        overlay.classList.remove('show');
        overlay.classList.add('hidden');
    }

    toggleBtn.addEventListener('click', openOverlay);
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    if (backdrop) backdrop.addEventListener('click', closeOverlay);

    // Live-update player list while overlay is open
    try {
        socket.on('updatePlayersAdmin', () => {
            const overlayEl = document.getElementById('adminOverlay');
            const playersSlot = document.getElementById('adminPlayersSlot');
            if (!overlayEl || !playersSlot) return;
            if (!overlayEl.classList.contains('show')) return;
            // Re-render section using current lastAdminPlayers
            playersSlot.innerHTML = '';
            if (!lastAdminPlayers || lastAdminPlayers.length === 0) {
                playersSlot.textContent = 'Keine verbunden';
                return;
            }
            const table = document.createElement('table');
            table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;';
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            headerRow.style.cssText = 'background: rgba(76,175,80,0.15); border-bottom: 1px solid rgba(76,175,80,0.3);';
            const headers = ['Farbe', 'Spieler', 'Punkte', 'Namen ändern', 'Entfernen', 'Grok erlauben'];
            headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; th.style.cssText = 'padding: 10px 8px; text-align: left; font-weight: bold; color: #4CAF50;'; headerRow.appendChild(th); });
            thead.appendChild(headerRow);
            table.appendChild(thead);
            const tbody = document.createElement('tbody');
            lastAdminPlayers.forEach((p, idx) => {
                const row = document.createElement('tr');
                row.style.cssText = `border-bottom: 1px solid rgba(76,175,80,0.1); ${idx % 2 === 0 ? 'background: rgba(255,255,255,0.02);' : ''}`;
                const colorCell = document.createElement('td'); colorCell.style.cssText = 'padding: 10px 8px;';
                const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = p.color || '#ffffff'; colorInput.title = 'Farbe zuweisen'; colorInput.style.cssText = 'width:28px; height:22px; border:none; background:transparent; cursor:pointer;';
                colorInput.addEventListener('change', () => { try { socket.emit('setPlayerColor', { playerId: p.id, color: colorInput.value }); } catch (e) {} });
                colorCell.appendChild(colorInput); row.appendChild(colorCell);
                const nameCell = document.createElement('td'); const nameSpan = document.createElement('span'); nameSpan.textContent = p.name; if (p.color) nameSpan.style.color = p.color; nameCell.appendChild(nameSpan); nameCell.style.cssText = 'padding: 10px 8px;'; row.appendChild(nameCell);
                const pointsCell = document.createElement('td'); pointsCell.style.cssText = 'padding: 10px 8px;';
                const pointsInput = document.createElement('input'); pointsInput.type = 'number'; pointsInput.min = '0'; pointsInput.step = '1'; pointsInput.value = String((playerPoints && playerPoints[p.name]) ? playerPoints[p.name] : 0); pointsInput.title = 'Punkte ändern'; pointsInput.style.cssText = 'width:70px; height:24px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:#fff; border-radius:6px; padding:2px 6px;';
                pointsInput.addEventListener('change', () => { const val = Math.max(0, Math.round(Number(pointsInput.value) || 0)); try { socket.emit('setPlayerPoints', { playerId: p.id, points: val }); } catch (e) {} });
                pointsCell.appendChild(pointsInput); row.appendChild(pointsCell);
                const renameCell = document.createElement('td'); const renameBtn = document.createElement('button'); renameBtn.textContent = '✎ Ändern'; renameBtn.className = 'reset tiny-btn'; renameBtn.style.cssText = 'padding: 6px 10px; font-size: 12px; cursor: pointer;';
                renameBtn.addEventListener('click', () => { if (!confirm(`Möchtest du "${p.name}" auffordern, seinen Namen neu einzugeben?`)) return; socket.emit('requestRename', p.id); });
                renameCell.appendChild(renameBtn); renameCell.style.cssText = 'padding: 10px 8px; text-align: center;'; row.appendChild(renameCell);
                const removeCell = document.createElement('td'); const removeBtn = document.createElement('button'); removeBtn.textContent = '✕ Entfernen'; removeBtn.className = 'reset tiny-btn'; removeBtn.style.cssText = 'padding: 6px 10px; font-size: 12px; cursor: pointer; color: #ff6b6b;';
                removeBtn.addEventListener('click', () => { if (!confirm(`Spieler "${p.name}" entfernen?`)) return; socket.emit('removePlayer', p.id); });
                removeCell.appendChild(removeBtn); removeCell.style.cssText = 'padding: 10px 8px; text-align: center;'; row.appendChild(removeCell);
                const grokCell = document.createElement('td'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = p.grokEnabled || false; checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
                checkbox.addEventListener('change', () => { socket.emit('togglePlayerGrok', { playerId: p.id, enabled: checkbox.checked }); });
                grokCell.appendChild(checkbox); grokCell.style.cssText = 'padding: 10px 8px; text-align: center;'; row.appendChild(grokCell);
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            playersSlot.appendChild(table);
        });
    } catch (_) {}
}
