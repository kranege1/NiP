# Grok Integration - Schnellstart

## 📋 Was wurde hinzugefügt?

✅ **Grok API Client** - Python Module (`grok_api.py`) und Node.js Module (`grok_api.js`)
✅ **REST API Endpoints** - Für Prompt-Verarbeitung und Token-Tracking
✅ **Token-Logging** - Automatisches Logging im Server-Log
✅ **Token-Statistiken** - Übersicht des Tokenverbrauchs

## 🚀 Schnellstart

### 1. Abhängigkeiten installieren

```bash
pip install -r requirements.txt
```

### 2. API Key setzen

Wähle eine Methode:

**Option A: Umgebungsvariable (empfohlen)**
```bash
# Windows PowerShell
$env:GROK_API_KEY = "dein_api_key"

# Windows CMD
set GROK_API_KEY=dein_api_key

# Linux/Mac
export GROK_API_KEY=dein_api_key
```

**Option B: Bei Server-Start über HTTP**
```bash
curl -X POST http://localhost:3000/api/grok/set-key \
  -H "Content-Type: application/json" \
  -d '{"api_key": "dein_api_key"}'
```

### 3. Server starten

```bash
# Python
python server.py

# oder Node.js
node server.js
```

### 4. Testen

**Mit dem Test-Script:**
```bash
python test_grok.py "dein_api_key"
```

**Mit curl:**
```bash
curl -X POST http://localhost:3000/api/grok/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Wer war Einstein?"}'
```

## 📊 Server-Log Ausgabe

Nach jeder erfolgreichen Anfrage siehst du:

```
[2025-12-23 14:30:45] [GROK] Prompt erfolgreich → Tokens: 156 (Prompt: 12, Completion: 144) | Gesamt: 5432 Tokens | Anfragen: 23
```

Das bedeutet:
- ✅ Anfrage war erfolgreich
- 156 Tokens in dieser Anfrage verwendet
- 5432 Tokens insgesamt bis jetzt
- 23 Anfragen gemacht

## 📡 API Endpoints

### POST `/api/grok/set-key`
Setzt den API Key zur Laufzeit

**Request:**
```json
{"api_key": "dein_grok_api_key"}
```

**Response:**
```json
{"success": true, "message": "Grok API key gesetzt"}
```

---

### POST `/api/grok/prompt`
Sendet einen Prompt an Grok und erhält eine Antwort

**Request:**
```json
{"prompt": "Deine Frage hier"}
```

**Response:**
```json
{
  "success": true,
  "response": "Groks Antwort...",
  "tokensUsed": 156,
  "promptTokens": 12,
  "completionTokens": 144,
  "error": null
}
```

---

### GET `/api/grok/stats`
Gibt Token-Statistiken zurück

**Response:**
```json
{
  "totalTokens": 5432,
  "totalPromptTokens": 1200,
  "totalCompletionTokens": 4232,
  "requestsMade": 23,
  "avgTokensPerRequest": 236.2
}
```

## 💻 Verwendungsbeispiel (JavaScript)

```javascript
// API Key setzen
await fetch('/api/grok/set-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: 'dein_key' })
});

// Prompt senden
const response = await fetch('/api/grok/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Frage hier' })
});

const data = await response.json();
if (data.success) {
    console.log('Antwort:', data.response);
    console.log('Tokens:', data.tokensUsed);
}
```

## 📚 Weitere Dokumentation

Detaillierte Dokumentation findest du in [`README_GROK.md`](README_GROK.md)

## ❓ Häufige Probleme

### Problem: "Grok API key nicht konfiguriert"
**Lösung:** Setze die Umgebungsvariable oder rufe `/api/grok/set-key` auf

### Problem: "Invalid authentication credentials"
**Lösung:** Überprüfe, dass dein API Key korrekt ist

### Problem: "Grok API Timeout"
**Lösung:** Versuche es später erneut oder mit einem kürzeren Prompt

---

**Viel Erfolg! 🎉**
