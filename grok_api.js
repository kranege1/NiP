/**
 * Grok API Integration Module for Node.js
 * Handles requests to Grok AI with token tracking and logging
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class GrokAPI {
    constructor(apiKey = null) {
        this.apiKey = apiKey || process.env.GROK_API_KEY || '';
        this.statsFile = path.join(__dirname, 'grok_stats.json');
        
        // Load persistent stats
        this._loadStats();
    }

    _loadStats() {
        try {
            if (fs.existsSync(this.statsFile)) {
                const data = JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
                this.totalTokens = data.total_tokens || 0;
                this.totalPromptTokens = data.total_prompt_tokens || 0;
                this.totalCompletionTokens = data.total_completion_tokens || 0;
                this.requestsMade = data.requests_made || 0;
                console.log(`[GROK] Stats geladen: ${this.totalTokens} Tokens, ${this.requestsMade} Anfragen`);
            } else {
                this.totalTokens = 0;
                this.totalPromptTokens = 0;
                this.totalCompletionTokens = 0;
                this.requestsMade = 0;
                console.log('[GROK] Keine Stats-Datei gefunden, starte bei 0');
            }
        } catch (e) {
            console.error('Fehler beim Laden von grok_stats.json:', e);
            this.totalTokens = 0;
            this.totalPromptTokens = 0;
            this.totalCompletionTokens = 0;
            this.requestsMade = 0;
        }
    }

    _saveStats() {
        try {
            const data = {
                total_tokens: this.totalTokens,
                total_prompt_tokens: this.totalPromptTokens,
                total_completion_tokens: this.totalCompletionTokens,
                requests_made: this.requestsMade
            };
            fs.writeFileSync(this.statsFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error('Fehler beim Schreiben von grok_stats.json:', e);
        }
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }

    isConfigured() {
        return Boolean(this.apiKey.trim());
    }

    // async generateResponse(prompt, model = 'grok-2-latest', temperature = 0.7, maxTokens = 500) {
    async generateResponse(prompt, model = 'grok-4-1-fast-non-reasoning', temperature = 0.7, maxTokens = 500) {
        if (!this.isConfigured()) {
            return {
                success: false,
                response: '',
                tokensUsed: 0,
                promptTokens: 0,
                completionTokens: 0,
                error: 'Grok API Key nicht konfiguriert'
            };
        }

        try {
            const payload = JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: temperature,
                max_tokens: maxTokens
            });

            const options = {
                hostname: 'api.x.ai',
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 30000
            };

            return new Promise((resolve) => {
                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const response = JSON.parse(data);
                                if (response.choices && response.choices.length > 0) {
                                    const generatedText = response.choices[0].message.content;
                                    const usage = response.usage || {};
                                    const promptTokens = usage.prompt_tokens || 0;
                                    const completionTokens = usage.completion_tokens || 0;
                                    const totalTokens = promptTokens + completionTokens;

                                    // Update statistics
                                    this.totalTokens += totalTokens;
                                    this.totalPromptTokens += promptTokens;
                                    this.totalCompletionTokens += completionTokens;
                                    this.requestsMade += 1;
                                    this._saveStats(); // Persist to disk

                                    resolve({
                                        success: true,
                                        response: generatedText,
                                        tokensUsed: totalTokens,
                                        promptTokens: promptTokens,
                                        completionTokens: completionTokens,
                                        error: null
                                    });
                                } else {
                                    resolve({
                                        success: false,
                                        response: '',
                                        tokensUsed: 0,
                                        promptTokens: 0,
                                        completionTokens: 0,
                                        error: 'Keine Antwort von Grok erhalten'
                                    });
                                }
                            } catch (e) {
                                resolve({
                                    success: false,
                                    response: '',
                                    tokensUsed: 0,
                                    promptTokens: 0,
                                    completionTokens: 0,
                                    error: `JSON Parse Fehler: ${e.message}`
                                });
                            }
                        } else {
                            let errorMsg = `HTTP ${res.statusCode}`;
                            try {
                                const errorData = JSON.parse(data);
                                errorMsg = errorData.error?.message || errorMsg;
                            } catch (e) {
                                // Use default error message
                            }
                            resolve({
                                success: false,
                                response: '',
                                tokensUsed: 0,
                                promptTokens: 0,
                                completionTokens: 0,
                                error: `Grok API Fehler: ${errorMsg}`
                            });
                        }
                    });
                });

                req.on('error', (e) => {
                    resolve({
                        success: false,
                        response: '',
                        tokensUsed: 0,
                        promptTokens: 0,
                        completionTokens: 0,
                        error: `Fehler: ${e.message}`
                    });
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({
                        success: false,
                        response: '',
                        tokensUsed: 0,
                        promptTokens: 0,
                        completionTokens: 0,
                        error: 'Grok API Timeout (30s)'
                    });
                });

                req.write(payload);
                req.end();
            });
        } catch (e) {
            return {
                success: false,
                response: '',
                tokensUsed: 0,
                promptTokens: 0,
                completionTokens: 0,
                error: `Fehler: ${e.message}`
            };
        }
    }

    getStats() {
        // Allow configurable pricing via env vars (currency and per-1M token prices)
        // Defaults per screenshot: prompt $0.20, completion $0.50 per 1M tokens
        const promptPerM = Number(process.env.GROK_PROMPT_PER_M) || 0.20;
        const completionPerM = Number(process.env.GROK_COMPLETION_PER_M) || 0.50;
        const currency = String(process.env.GROK_CURRENCY || '$');

        const promptCost = (this.totalPromptTokens / 1_000_000) * promptPerM;
        const completionCost = (this.totalCompletionTokens / 1_000_000) * completionPerM;
        const totalCost = promptCost + completionCost;

        return {
            totalTokens: this.totalTokens,
            totalPromptTokens: this.totalPromptTokens,
            totalCompletionTokens: this.totalCompletionTokens,
            requestsMade: this.requestsMade,
            avgTokensPerRequest: this.requestsMade > 0 ? Math.round(this.totalTokens / this.requestsMade * 10) / 10 : 0,
            cost: {
                promptPerM,
                completionPerM,
                currency,
                promptCost: Number(promptCost.toFixed(6)),
                completionCost: Number(completionCost.toFixed(6)),
                totalCost: Number(totalCost.toFixed(6))
            }
        };
    }

    resetStats() {
        this.totalTokens = 0;
        this.totalPromptTokens = 0;
        this.totalCompletionTokens = 0;
        this._saveStats(); // Persist reset to disk
        this.requestsMade = 0;
    }
}

// Global instance
const grok = new GrokAPI();

module.exports = grok;
