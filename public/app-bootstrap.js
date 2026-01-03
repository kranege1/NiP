/* Minimal bootstrap orchestrator (no redefinitions) */

document.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof nobodyIsPerfectTerms === 'undefined' || nobodyIsPerfectTerms.length === 0) {
      console.warn('terms.js nicht gefunden oder leer');
    }
  } catch (_) {}

  try {
    document.querySelectorAll('input[type="text"], textarea').forEach((input) => {
      input.addEventListener('input', toggleClearButtons);
      input.addEventListener('focus', toggleClearButtons);
    });
  } catch (_) {}

  const isAdmin = new URLSearchParams(window.location.search).get('admin') !== null;
  if (isAdmin) {
    const adminView = document.getElementById('adminView');
    const playerSetup = document.getElementById('playerSetup');
    const playerGame = document.getElementById('playerGame');
    if (adminView) adminView.style.display = 'block';
    if (playerSetup) playerSetup.style.display = 'none';
    if (playerGame) playerGame.style.display = 'none';

    try {
      const lastSeenSeq = Number(localStorage.getItem('np_last_seq') || '0') || 0;
      socket.emit('adminConnect', { lastSeenSeq });
    } catch (_) {}

    // Reconnect automatically when server restarts or connection drops
    socket.on('connect', () => {
      try {
        const lastSeenSeq = Number(localStorage.getItem('np_last_seq') || '0') || 0;
        socket.emit('adminConnect', { lastSeenSeq });
      } catch (_) {}
    });

    setTimeout(() => { try { if (typeof setupAdminUI === 'function') setupAdminUI(); } catch (_) {} }, 100);

    const adminToggle = document.getElementById('adminPanelToggle');
    if (adminToggle) adminToggle.style.display = 'inline-block';
  } else {
    // Hide admin controls for players
    const adminToggle = document.getElementById('adminPanelToggle');
    if (adminToggle) adminToggle.style.display = 'none';
    try { if (typeof loadState === 'function') loadState(); } catch (_) {}
  }

  try {
    const topLeft = document.getElementById('topLeftControls');
    const playersPanel = document.getElementById('playersPanel');
    if (topLeft) { document.body.prepend(topLeft); topLeft.classList.remove('inline'); }
    if (playersPanel) { document.body.appendChild(playersPanel); playersPanel.classList.remove('inline'); }
  } catch (_) {}

  try {
    const topLeft = document.getElementById('topLeftControls');
    if (topLeft) {
      const adminToggle = document.getElementById('adminPanelToggle');
      const hardReload = document.getElementById('hardReloadBtn');
      let actions = document.getElementById('topActions');
      if (!actions) { actions = document.createElement('div'); actions.id = 'topActions'; actions.className = 'top-actions'; topLeft.appendChild(actions); }
      if (adminToggle && isAdmin) actions.appendChild(adminToggle);
      if (hardReload) { hardReload.style.display = 'inline-block'; actions.appendChild(hardReload); }
    }
  } catch (_) {}

  try {
    const nameEl = document.getElementById('playerName');
    const ansEl = document.getElementById('answerInput');
    const toggleBtn = document.getElementById('toggleObscureBtn');
    if (toggleBtn) {
      [nameEl, ansEl].forEach(el => {
        if (!el) return;
        const wrap = el.parentElement; if (!wrap) return;
        let ov = wrap.querySelector('.obscure-overlay');
        if (!ov) { ov = document.createElement('div'); ov.className = 'obscure-overlay'; wrap.style.position = wrap.style.position || 'relative'; wrap.appendChild(ov); }
      });
      let obscured = false;
      const setObscured = (v) => {
        obscured = !!v;
        [nameEl, ansEl].forEach(el => { if (!el) return; const ov = el.parentElement.querySelector('.obscure-overlay'); if (ov) ov.style.display = obscured ? 'block' : 'none'; });
        toggleBtn.textContent = obscured ? 'Sichtschutz aus' : 'Sichtschutz an';
      };
      toggleBtn.addEventListener('click', () => setObscured(!obscured));
      setObscured(false);
    }
  } catch (_) {}

  // Initialize voice controls early so onvoiceschanged is hooked
  try { if (typeof initVoiceControls === 'function') initVoiceControls(); } catch (_) {}

  // Admin: random term load wiring
  try {
    const randomLoadBtn = document.getElementById('randomLoadBtn');
    if (randomLoadBtn && typeof loadRandomTerm === 'function') {
      randomLoadBtn.addEventListener('click', loadRandomTerm);
    }
  } catch (_) {}

  // Admin: send question to all
  try {
    const sendQuestionBtn = document.getElementById('sendQuestionBtn');
    if (sendQuestionBtn && typeof sendQuestion === 'function') {
      sendQuestionBtn.addEventListener('click', sendQuestion);
    }
    // Multi-language question read buttons
    const map = [
      ['readQuestionDeBtn', 'de-DE'],
      ['readQuestionEnBtn', 'en-US'],
      ['readQuestionLtBtn', 'lt-LT'],
      ['readQuestionElBtn', 'el-GR'],
      ['readQuestionHuBtn', 'hu-HU'],
      ['readQuestionJaBtn', 'ja-JP'],
    ];
    map.forEach(([id, lang]) => {
      const btn = document.getElementById(id);
      if (btn && typeof readQuestionInLang === 'function') {
        btn.addEventListener('click', () => readQuestionInLang(lang));
      }
    });
  } catch (_) {}

  // Admin: submit real answer & shuffle
  try {
    const submitRealBtn = document.getElementById('submitRealBtn');
    if (submitRealBtn && typeof submitReal === 'function') {
      submitRealBtn.addEventListener('click', submitReal);
    }
  } catch (_) {}

  // Player: join game
  try {
    const joinGameBtn = document.getElementById('joinGameBtn');
    if (joinGameBtn && typeof joinGame === 'function') {
      joinGameBtn.addEventListener('click', joinGame);
      console.log('[BOOTSTRAP] joinGameBtn listener attached');
    } else {
      console.warn('[BOOTSTRAP] joinGameBtn not found or joinGame not defined', { btn: !!joinGameBtn, fn: typeof joinGame });
    }
  } catch (e) {
    console.error('[BOOTSTRAP] Error attaching joinGameBtn:', e);
  }

  // Player: submit invented answer
  try {
    const submitAnswerBtn = document.getElementById('submitAnswerBtn');
    if (submitAnswerBtn && typeof submitAnswer === 'function') {
      submitAnswerBtn.addEventListener('click', submitAnswer);
    }
  } catch (_) {}

  // Admin: new round
  try {
    const newRoundBtn = document.getElementById('newRoundBtn');
    if (newRoundBtn && typeof newRound === 'function') {
      newRoundBtn.addEventListener('click', newRound);
    }
  } catch (_) {}

  // Admin: read aloud (TTS)
  try {
    const readBtn = document.getElementById('readBtn');
    if (readBtn && typeof readAloud === 'function') {
      readBtn.addEventListener('click', readAloud);
    }
  } catch (_) {}

  // Voting (admin only)
  try {
    const startVotingBtn = document.getElementById('startVotingBtn');
    const endVotingBtn = document.getElementById('endVotingBtn');
    if (startVotingBtn) startVotingBtn.addEventListener('click', () => emitBuffered('startVoting', {}));
    if (endVotingBtn) endVotingBtn.addEventListener('click', () => emitBuffered('endVoting', {}));
  } catch (_) {}

  // Admin: present results
  try {
    const presentBtn = document.getElementById('presentBtn');
    if (presentBtn) presentBtn.addEventListener('click', () => emitBuffered('presentResults', {}));
  } catch (_) {}

  // Clear buttons for inputs
  try {
    const clearPlayerNameBtn = document.getElementById('clearPlayerNameBtn');
    const clearAnswerBtn = document.getElementById('clearAnswerBtn');
    const clearQuestionBtn = document.getElementById('clearQuestionBtn');
    const clearRealAnswerBtn = document.getElementById('clearRealAnswerBtn');
    if (clearPlayerNameBtn) clearPlayerNameBtn.addEventListener('click', () => clearInput('playerName'));
    if (clearAnswerBtn) clearAnswerBtn.addEventListener('click', () => clearInput('answerInput'));
    if (clearQuestionBtn) clearQuestionBtn.addEventListener('click', () => clearInput('questionInput'));
    if (clearRealAnswerBtn) clearRealAnswerBtn.addEventListener('click', () => clearInput('realAnswerInput'));
  } catch (_) {}

  // Player Grok button
  try {
    const playerGrokBtn = document.getElementById('playerGrokBtn');
    if (playerGrokBtn && typeof playerGrokPrompt === 'function') {
      playerGrokBtn.addEventListener('click', playerGrokPrompt);
    }
  } catch (_) {}

  // Hard reload
  try {
    const hardReloadBtn = document.getElementById('hardReloadBtn');
    if (hardReloadBtn) {
      hardReloadBtn.addEventListener('click', () => {
        const href = window.location.href.split('#')[0];
        const cleaned = href.replace(/([&?])ts=\d+/, '').replace(/\?&/, '?');
        const delim = cleaned.includes('?') ? '&' : '?';
        window.location.href = `${cleaned}${delim}ts=${Date.now()}`;
      });
    }
  } catch (_) {}
});