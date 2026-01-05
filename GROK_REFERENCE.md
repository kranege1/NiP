# 🎯 GROK INTEGRATION - QUICK REFERENCE CARD

## 5-Minuten Setup

```bash
# 1. Install
pip install -r requirements.txt

# 2. Configure
$env:GROK_API_KEY = "your-key"

# 3. Run
python server.py

# 4. Test
curl -X POST http://localhost:3000/api/grok/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Was ist AI?"}'
```

---

## API Endpoints

| Endpoint | Method | Purpose | 
|----------|--------|---------|
| `/api/grok/set-key` | POST | Set API Key |
| `/api/grok/prompt` | POST | Send Prompt & Get Response |
| `/api/grok/stats` | GET | Get Token Statistics |

---

## Payload Examples

### Set API Key
```json
POST /api/grok/set-key
{
  "api_key": "your-grok-api-key"
}
```

### Send Prompt
```json
POST /api/grok/prompt
{
  "prompt": "Was ist Einstein bekannt?"
}
```

### Response
```json
{
  "success": true,
  "response": "Albert Einstein war ein Physiker...",
  "tokensUsed": 156,
  "promptTokens": 12,
  "completionTokens": 144,
  "error": null
}
```

### Get Stats
```json
GET /api/grok/stats

{
  "totalTokens": 5432,
  "totalPromptTokens": 1200,
  "totalCompletionTokens": 4232,
  "requestsMade": 23,
  "avgTokensPerRequest": 236.2
}
```

---

## Log Format

```
[2025-12-23 14:30:45] [GROK] Prompt erfolgreich → 
Tokens: 156 (Prompt: 12, Completion: 144) | 
Gesamt: 5432 Tokens | Anfragen: 23
```

---

## Code Snippets

### Python
```python
from grok_api import grok

grok.set_api_key("key")
result = grok.generate_response("Frage")
if result['success']:
    print(result['response'])
    print(f"Tokens: {result['tokens_used']}")
```

### Node.js
```javascript
const grok = require('./grok_api');

grok.setApiKey("key");
const result = await grok.generateResponse("Frage");
if (result.success) {
    console.log(result.response);
    console.log(`Tokens: ${result.tokensUsed}`);
}
```

### JavaScript Fetch
```javascript
const response = await fetch('/api/grok/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Frage' })
});
const data = await response.json();
console.log(data.response);
```

---

## Files Created

| File | Size | Purpose |
|------|------|---------|
| `grok_api.py` | 173 | Python Client |
| `grok_api.js` | 180 | Node.js Client |
| `test_grok.py` | 100 | Test Script |
| `README_GROK.md` | - | Full Docs |
| `GROK_QUICKSTART.md` | - | Quick Start |

---

## Features

✅ Grok AI Prompts  
✅ Token Tracking  
✅ Server Logging  
✅ REST API  
✅ Statistics  
✅ Error Handling  
✅ Secure (Env Vars)  

---

## Environment Variables

```bash
GROK_API_KEY=your-key
PORT=3000
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| Key not configured | Set `GROK_API_KEY` or call `/api/grok/set-key` |
| Invalid credentials | Check API key is correct |
| Timeout | Try again or use shorter prompt |
| Network error | Check internet connection |

---

## Statistics API

Get stats anytime:
```bash
curl http://localhost:3000/api/grok/stats | jq
```

Monitor token usage in real-time!

---

**Version:** 1.0 | **Status:** ✅ Ready | **Date:** 2025-12-23
