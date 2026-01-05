# Grok AI Integration

Diese Dokumentation erklärt, wie du Grok AI in deinen Nobody Perfect Web Server integrierst.

## Installation

### Python Abhängigkeiten

Installiere `requests` für die Python-Integration:

```bash
pip install requests
```

Füge `requests` zu `requirements.txt` hinzu:
```
requests==2.32.0
```

## Konfiguration

### API Key einrichten

Du kannst deinen Grok API Key auf zwei Wegen setzen:

#### 1. Umgebungsvariable (empfohlen)

Setze die Umgebungsvariable `GROK_API_KEY`:

```bash
# Linux/Mac
export GROK_API_KEY="dein_grok_api_key_hier"

# Windows PowerShell
$env:GROK_API_KEY = "dein_grok_api_key_hier"

# Windows CMD
set GROK_API_KEY=dein_grok_api_key_hier
```

#### 2. Über API Endpoint (zur Laufzeit)

```bash
curl -X POST http://localhost:3000/api/grok/set-key \
  -H "Content-Type: application/json" \
  -d '{"api_key": "dein_grok_api_key_hier"}'
```

## API Endpoints

### 1. API Key setzen

**POST** `/api/grok/set-key`

```bash
curl -X POST http://localhost:3000/api/grok/set-key \
  -H "Content-Type: application/json" \
  -d '{"api_key": "your_api_key"}'
```

Response:
```json
{
  "success": true,
  "message": "Grok API key gesetzt"
}
```

### 2. Prompt senden

**POST** `/api/grok/prompt`

```bash
curl -X POST http://localhost:3000/api/grok/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Erkläre mir quantum computing in einfachen Worten"
  }'
```

Response:
```json
{
  "success": true,
  "response": "Quantum Computing nutzt Quanten-Bits (Qubits)...",
  "tokensUsed": 156,
  "promptTokens": 12,
  "completionTokens": 144,
  "error": null
}
```

### 3. Token-Statistiken abrufen

**GET** `/api/grok/stats`

```bash
curl http://localhost:3000/api/grok/stats
```

Response:
```json
{
  "totalTokens": 5432,
  "totalPromptTokens": 1200,
  "totalCompletionTokens": 4232,
  "requestsMade": 23,
  "avgTokensPerRequest": 236.2
}
```

## Server Log Ausgabe

Nach jedem erfolgreichen Grok-Prompt siehst du im Server Log:

```
[2025-12-23 14:30:45] [GROK] Prompt erfolgreich → Tokens: 156 (Prompt: 12, Completion: 144) | Gesamt: 5432 Tokens | Anfragen: 23
```

Bei Fehlern:
```
[2025-12-23 14:31:10] [GROK] Fehler: Grok API key nicht konfiguriert
```

## Verwendungsbeispiel (JavaScript)

```javascript
// API Key setzen
async function setGrokKey(apiKey) {
    const response = await fetch('/api/grok/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
    });
    return response.json();
}

// Prompt senden
async function askGrok(prompt) {
    const response = await fetch('/api/grok/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
    });
    return response.json();
}

// Beispiel
const result = await askGrok("Was ist Nobody Perfect?");
if (result.success) {
    console.log("Antwort:", result.response);
    console.log("Tokens verwendet:", result.tokensUsed);
} else {
    console.error("Fehler:", result.error);
}
```

## Verwendungsbeispiel (Python)

```python
import requests

# API Key setzen
response = requests.post('http://localhost:3000/api/grok/set-key', 
    json={'api_key': 'your_api_key'})
print(response.json())

# Prompt senden
response = requests.post('http://localhost:3000/api/grok/prompt',
    json={'prompt': 'Was ist Nobody Perfect?'})

result = response.json()
if result['success']:
    print("Antwort:", result['response'])
    print("Tokens verwendet:", result['tokensUsed'])
else:
    print("Fehler:", result['error'])

# Statistiken abrufen
stats = requests.get('http://localhost:3000/api/grok/stats').json()
print("Gesamt Tokens:", stats['totalTokens'])
print("Anfragen gemacht:", stats['requestsMade'])
```

## Token-Kosten

Die Token-Nutzung wird im Log protokolliert:
- **promptTokens**: Tokens in deinem Prompt
- **completionTokens**: Tokens in Groks Antwort
- **tokensUsed**: Gesamte Tokens (Prompt + Completion)

## Fehlerbehebung

### "Grok API key nicht konfiguriert"
- Stelle sicher, dass du die Umgebungsvariable `GROK_API_KEY` gesetzt hast oder den Endpoint `/api/grok/set-key` aufgerufen hast

### "Grok API Fehler: Invalid authentication credentials"
- Überprüfe, dass dein API Key korrekt ist
- Der API Key sollte mit "xai-" beginnen

### "Grok API Timeout"
- Die Anfrage hat zu lange gedauert (30 Sekunden Timeout)
- Versuche es später erneut oder mit einem kürzeren Prompt

## Sicherheit

⚠️ **Wichtig**: Speichere deinen Grok API Key niemals direkt im Code!
- Nutze Umgebungsvariablen
- Nutze .env Dateien (nicht in Git committen!)
- Für die Produktionsumgebung: Nutze sicher konfigurierte Secrets

## Integration mit Nobody Perfect

Du kannst Grok nutzen, um:
- Fehlerhafte Antworten zu korrigieren
- Definitionen zu generieren
- Hinweise zu geben
- AI-basierte Validierung durchzuführen

Beispiel - Admin nutzt Grok für eine Definition:
```javascript
// In der Admin-Konsole
const result = await fetch('/api/grok/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        prompt: `Gib mir eine Definition für: ${term}`
    })
});
const data = await result.json();
if (data.success) {
    // Nutze data.response als Echte Definition
}
```
