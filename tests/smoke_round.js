// Simple end-to-end smoke test that simulates admin + players
// Usage: ensure the server is running (npm start or node server.js), then:
//   npm run test:smoke
// You can set URL via env: URL=http://localhost:3000 npm run test:smoke

const io = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
const PLAYER_COUNT = Number(process.env.PLAYERS || 3) || 3;
const QUESTION = 'Testfrage: Was bedeutet Foobar?';
const AREA = process.env.AREA || 'Allgemein';
const REAL_DEF = 'Echte Definition: Ein Platzhaltername in Programmierung.';

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function run() {
  console.log(`[TEST] Connecting to ${URL}`);
  const admin = io(URL, { reconnection: false });
  const players = [];

  const events = { pointsUpdate: null, revealAnswers: null };

  const once = (socket, evt) => new Promise(resolve => socket.once(evt, resolve));

  admin.on('connect', () => console.log('[ADMIN] connected', admin.id));
  admin.on('connect_error', (e) => console.error('[ADMIN] connect_error', e && e.message ? e.message : e));
  admin.on('disconnect', () => console.log('[ADMIN] disconnected'));
  admin.on('error', (e) => console.error('[ADMIN] error', e));

  admin.on('pointsUpdate', (p) => { events.pointsUpdate = p; console.log('[ADMIN] pointsUpdate', p); });
  admin.on('revealAnswers', (data) => { events.revealAnswers = data; console.log('[ADMIN] revealAnswers', { realIndex: data.realIndex, count: data.lettered.length }); });

  // Admin connects
  admin.emit('adminConnect', { lastSeenSeq: 0 });
  await once(admin, 'adminJoined');
  console.log('[ADMIN] joined');

  // Spawn players
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const name = `P${i+1}`;
    const s = io(URL, { reconnection: false });
    s.on('connect', () => console.log(`[${name}] connected`, s.id));
    s.on('connect_error', (e) => console.error(`[${name}] connect_error`, e && e.message ? e.message : e));
    s.on('disconnect', () => console.log(`[${name}] disconnected`));
    s.on('error', (e) => console.error(`[${name}] error`, e));

    // Each player joins
    s.emit('playerJoin', { playerName: name, lastSeenSeq: 0 });
    const joined = await once(s, 'joinedRoom');
    console.log(`[${name}] joined as host=${!!(joined && joined.isHost)}`);

    players.push({ name, socket: s });
  }

  // Send question
  admin.emit('sendQuestion', { question: QUESTION, area: AREA });
  console.log('[ADMIN] question sent');
  await delay(250);

  // Admin submits real answer
  admin.emit('submitRealAnswer', REAL_DEF);
  console.log('[ADMIN] real answer submitted');
  await delay(250);

  // Players submit fake answers
  for (const { name, socket } of players) {
    socket.emit('submitAnswer', `Falsche Definition von ${name}`);
  }
  console.log('[PLAYERS] submitted fakes');
  await delay(750);

  // Start voting
  let votingOptions = null;
  admin.emit('startVoting');
  console.log('[ADMIN] voting started');

  // Collect votingStarted from one player (options identical for all)
  const vs = await new Promise(resolve => {
    let done = false;
    players[0].socket.once('votingStarted', (data) => { if (!done) { done = true; resolve(data); } });
    // backup timeout
    setTimeout(() => { if (!done) resolve(null); }, 2000);
  });
  if (!vs || !Array.isArray(vs.lettered)) {
    console.error('[TEST] voting options not received');
    process.exit(1);
  }
  votingOptions = vs.lettered;
  console.log('[TEST] voting options letters:', votingOptions.map(o => o.letter).join(','));

  // Players vote (not their own)
  for (const { name, socket } of players) {
    const choices = votingOptions.filter(o => o.submitterName !== name).map(o => o.letter);
    const pick = choices[Math.floor(Math.random() * choices.length)] || votingOptions[0].letter;
    socket.emit('submitVote', pick);
    console.log(`[${name}] voted ${pick}`);
  }

  await delay(500);
  admin.emit('endVoting');
  console.log('[ADMIN] voting ended');

  await delay(250);
  admin.emit('presentResults');
  console.log('[ADMIN] present results');

  // Wait a bit for points/reveal
  await delay(1000);

  console.log('[TEST] Summary:');
  console.log(' - Players:', players.map(p => p.name).join(', '));
  console.log(' - Points:', events.pointsUpdate);
  console.log(' - Reveal real index:', events.revealAnswers ? events.revealAnswers.realIndex : null);

  // Cleanup
  for (const p of players) { try { p.socket.close(); } catch {} }
  try { admin.close(); } catch {}
  console.log('[TEST] Done');
}

run().catch(err => {
  console.error('[TEST] Failed', err);
  process.exit(1);
});
