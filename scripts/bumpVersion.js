const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '..', 'version_counter.json');

function load() {
  if (!fs.existsSync(versionFile)) {
    return { counter: 1, lastVersionTime: Date.now() };
  }
  try {
    const raw = fs.readFileSync(versionFile, 'utf8');
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      counter: Number(parsed.counter) || 1,
      lastVersionTime: Number(parsed.lastVersionTime) || 0,
    };
  } catch (e) {
    console.error('Could not read version_counter.json, resetting to 1', e);
    return { counter: 1, lastVersionTime: Date.now() };
  }
}

function save(data) {
  fs.writeFileSync(versionFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

(function main() {
  const current = load();
  const next = {
    counter: current.counter + 1,
    lastVersionTime: Date.now(),
  };
  save(next);
  console.log(`Version bumped: NiP - V${next.counter}`);
})();
