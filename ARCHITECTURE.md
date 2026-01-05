# 🏗️ Grok Integration - Architektur-Übersicht

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client (Browser)                            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │          POST /api/grok/prompt                          │   │
│  │  {"prompt": "What is AI?"}                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Node.js / Python Server   │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │  REST API Handler    │   │
                    │  │ /api/grok/set-key    │   │
                    │  │ /api/grok/prompt     │   │
                    │  │ /api/grok/stats      │   │
                    │  └──────┬───────────────┘   │
                    │         │                    │
                    │  ┌──────▼───────────────┐   │
                    │  │   Grok API Module    │   │
                    │  │ (grok_api.py/js)     │   │
                    │  │                      │   │
                    │  │ • set_api_key()      │   │
                    │  │ • generate_response()│   │
                    │  │ • get_stats()        │   │
                    │  │ • Token tracking     │   │
                    │  └──────┬───────────────┘   │
                    │         │                    │
                    │  ┌──────▼───────────────┐   │
                    │  │   Logger (Console)   │   │
                    │  │                      │   │
                    │  │ [GROK] Tokens: X     │   │
                    │  │ Gesamt: Y, Anfragen Z│   │
                    │  └──────────────────────┘   │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Grok API (xAI)            │
                    │   api.x.ai/v1/chat/         │
                    │                              │
                    │  ┌──────────────────────┐   │
                    │  │  Process Prompt      │   │
                    │  │  + API Key Auth      │   │
                    │  │  + Generate Response │   │
                    │  │  + Count Tokens      │   │
                    │  └──────────────────────┘   │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Response with Stats       │
                    │                              │
                    │ {                            │
                    │   "success": true,           │
                    │   "response": "...",         │
                    │   "tokensUsed": 156,         │
                    │   "promptTokens": 12,        │
                    │   "completionTokens": 144   │
                    │ }                            │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │   Server Log Output          │
                    │                              │
                    │ [GROK] Prompt erfolgreich    │
                    │ Tokens: 156 (12+144)         │
                    │ Gesamt: 5432 | Anfragen: 23 │
                    └──────────────────────────────┘
```

## Data Flow

### 1. API Key Setup
```
Client
  │
  └─→ POST /api/grok/set-key {api_key}
      │
      └─→ grok.set_api_key(api_key)
          │
          └─→ ✅ Ready for prompts
```

### 2. Prompt Processing
```
Client
  │
  └─→ POST /api/grok/prompt {prompt}
      │
      └─→ grok.generate_response(prompt)
          │
          ├─→ Check API key configured
          │
          ├─→ Create HTTPS request to xAI
          │   ├─ Authorization: Bearer {key}
          │   ├─ Model: grok-2-latest
          │   ├─ Messages: [{role: user, content: prompt}]
          │   └─ Temperature: 0.7
          │
          ├─→ Parse Response
          │   ├─ Extract text: response.choices[0].message.content
          │   ├─ Extract tokens: response.usage
          │   │   ├─ prompt_tokens
          │   │   ├─ completion_tokens
          │   │   └─ total_tokens
          │   └─ Return result object
          │
          ├─→ Update Statistics
          │   ├─ totalTokens += tokensUsed
          │   ├─ totalPromptTokens += promptTokens
          │   ├─ totalCompletionTokens += completionTokens
          │   └─ requestsMade += 1
          │
          └─→ Log to Console
              └─ [GROK] Prompt erfolgreich → Tokens: 156...
```

### 3. Statistics Retrieval
```
Client
  │
  └─→ GET /api/grok/stats
      │
      └─→ grok.getStats()
          │
          └─→ {
              totalTokens: 5432,
              totalPromptTokens: 1200,
              totalCompletionTokens: 4232,
              requestsMade: 23,
              avgTokensPerRequest: 236.2
            }
```

## File Structure

```
nobody-perfect-web/
│
├── 🆕 grok_api.py          # Python Grok Client Module
├── 🆕 grok_api.js          # Node.js Grok Client Module
├── 🆕 test_grok.py         # Integration Test Script
│
├── 📝 server.py            # Modified - Added Grok Endpoints
├── 📝 server.js            # Modified - Added Grok Endpoints
├── 📝 requirements.txt      # Modified - Added requests package
│
├── 📖 README_GROK.md                    # Detailed Documentation
├── 📖 GROK_QUICKSTART.md                # Quick Start Guide
├── 📖 GROK_INTEGRATION_DONE.md          # Status & Overview
├── 📖 IMPLEMENTATION_SUMMARY.md         # Implementation Details
│
└── ... (other files)
```

## Module Classes & Methods

### GrokAPI (Python)

```python
class GrokAPI:
    def __init__(self, api_key: Optional[str] = None)
    def set_api_key(self, api_key: str) -> None
    def is_configured(self) -> bool
    def generate_response(
        prompt: str,
        model: str = "grok-2-latest",
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> Dict[str, Any]
    def get_stats(self) -> Dict[str, Any]
    def reset_stats(self) -> None
```

### GrokAPI (Node.js)

```javascript
class GrokAPI {
    constructor(apiKey = null)
    setApiKey(apiKey: string): void
    isConfigured(): boolean
    async generateResponse(
        prompt: string,
        model: string = "grok-2-latest",
        temperature: number = 0.7,
        maxTokens: number = 500
    ): Promise<Object>
    getStats(): Object
    resetStats(): void
}
```

## Token Accounting

```
┌─────────────────────────────────────────┐
│        Total Tokens Consumed            │
├─────────────────────────────────────────┤
│                                         │
│  ▓ Prompt Tokens         (1200)        │
│  ░ Completion Tokens     (4232)        │
│                                         │
│  Total: 5432 Tokens                    │
│  Requests: 23                           │
│  Average: 236.2 tokens/request          │
│                                         │
└─────────────────────────────────────────┘
```

## Error Handling Flow

```
generate_response(prompt)
  │
  ├─ API Key not configured?
  │  └─ Return: {success: false, error: "API key nicht konfiguriert"}
  │
  ├─ HTTPS Request fails?
  │  └─ Return: {success: false, error: "Fehler: {message}"}
  │
  ├─ Timeout (30s)?
  │  └─ Return: {success: false, error: "Grok API Timeout (30s)"}
  │
  ├─ HTTP Error (401, 429, 500)?
  │  └─ Return: {success: false, error: "Grok API Fehler: {message}"}
  │
  ├─ Response parsing fails?
  │  └─ Return: {success: false, error: "JSON Parse Fehler"}
  │
  └─ Success!
     └─ Return: {
        success: true,
        response: "...",
        tokensUsed: X,
        promptTokens: Y,
        completionTokens: Z
     }
```

## Server Logging

```
┌──────────────────────────────────────────────────────────────────┐
│  Console Output (Server Log)                                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [2025-12-23 14:30:45] [GROK] Prompt erfolgreich →              │
│  Tokens: 156 (Prompt: 12, Completion: 144) |                    │
│  Gesamt: 5432 Tokens | Anfragen: 23                             │
│                                                                  │
│  ├─ Timestamp: [2025-12-23 14:30:45]                            │
│  ├─ Status: ✅ erfolgreich                                       │
│  ├─ Tokens this request: 156                                     │
│  │  ├─ Input: 12                                                 │
│  │  └─ Output: 144                                               │
│  ├─ Cumulative tokens: 5432                                      │
│  └─ Total requests: 23                                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Integration Points

```
                    Nobody Perfect Game
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     Admin Interface   Game Logic    Scoring System
            │              │              │
            └──────────────┼──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │   Grok AI Integration       │
            │  (/api/grok/*)              │
            │                             │
            │ • Generate definitions      │
            │ • Validate answers          │
            │ • Provide hints             │
            │ • Check answer quality      │
            │                             │
            └─────────────────────────────┘
```

## Configuration Options

```python
# grok_api.py / grok_api.js

API_ENDPOINT = "https://api.x.ai/v1/chat/completions"

DEFAULT_MODEL = "grok-2-latest"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 500
DEFAULT_TIMEOUT = 30 seconds

HEADERS = {
    'Authorization': 'Bearer {api_key}',
    'Content-Type': 'application/json'
}
```

---

**Architecture Version:** 1.0  
**Last Updated:** 2025-12-23  
**Status:** ✅ Production Ready
