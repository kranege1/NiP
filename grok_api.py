#!/usr/bin/env python3
"""
Grok API Integration Module
Handles requests to Grok AI with token tracking and logging
"""

import os
import json
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

class GrokAPI:
    """Grok API client with token tracking"""
    
    # Grok API endpoint (using xAI's API)
    API_ENDPOINT = "https://api.x.ai/v1/chat/completions"
    STATS_FILE = Path(__file__).parent / 'grok_stats.json'
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Grok API client
        
        Args:
            api_key: Grok API key (or reads from GROK_API_KEY env var)
        """
        self.api_key = api_key or os.getenv('GROK_API_KEY', '')
        
        # Load persistent stats
        self._load_stats()
        
    def _load_stats(self):
        """Load stats from disk"""
        try:
            if self.STATS_FILE.exists():
                with open(self.STATS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.total_tokens = data.get('total_tokens', 0)
                    self.total_prompt_tokens = data.get('total_prompt_tokens', 0)
                    self.total_completion_tokens = data.get('total_completion_tokens', 0)
                    self.requests_made = data.get('requests_made', 0)
                    print(f'[GROK] Stats geladen: {self.total_tokens} Tokens, {self.requests_made} Anfragen')
            else:
                self.total_tokens = 0
                self.total_prompt_tokens = 0
                self.total_completion_tokens = 0
                self.requests_made = 0
                print(f'[GROK] Keine Stats-Datei gefunden, starte bei 0')
        except Exception as e:
            print(f'Fehler beim Laden von grok_stats.json: {e}')
            self.total_tokens = 0
            self.total_prompt_tokens = 0
            self.total_completion_tokens = 0
            self.requests_made = 0
    
    def _save_stats(self):
        """Save stats to disk"""
        try:
            with open(self.STATS_FILE, 'w', encoding='utf-8') as f:
                json.dump({
                    'total_tokens': self.total_tokens,
                    'total_prompt_tokens': self.total_prompt_tokens,
                    'total_completion_tokens': self.total_completion_tokens,
                    'requests_made': self.requests_made
                }, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f'Fehler beim Schreiben von grok_stats.json: {e}')
        
    def set_api_key(self, api_key: str):
        """Set or update API key"""
        self.api_key = api_key
        
    def is_configured(self) -> bool:
        """Check if API key is configured"""
        return bool(self.api_key.strip())
    
    def generate_response(
        self,
        prompt: str,
        model: str = "grok-2-latest",
        temperature: float = 0.7,
        max_tokens: int = 500
    ) -> Dict[str, Any]:
        """
        Generate a response from Grok
        
        Args:
            prompt: The prompt to send to Grok
            model: Model name (default: grok-2-latest)
            temperature: Temperature for response (0.0 - 1.0)
            max_tokens: Maximum tokens in response
            
        Returns:
            Dictionary with:
            - success (bool): Whether request succeeded
            - response (str): Generated response text
            - tokens_used (int): Tokens used in this request
            - prompt_tokens (int): Tokens in prompt
            - completion_tokens (int): Tokens in completion
            - error (str): Error message if failed
        """
        
        if not self.is_configured():
            return {
                'success': False,
                'response': '',
                'tokens_used': 0,
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'error': 'Grok API Key nicht konfiguriert'
            }
        
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'model': model,
                'messages': [
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'temperature': temperature,
                'max_tokens': max_tokens
            }
            
            response = requests.post(
                self.API_ENDPOINT,
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            
            # Extract response and token usage
            if 'choices' in data and len(data['choices']) > 0:
                generated_text = data['choices'][0]['message']['content']
                
                # Extract token usage
                usage = data.get('usage', {})
                prompt_tokens = usage.get('prompt_tokens', 0)
                completion_tokens = usage.get('completion_tokens', 0)
                total_tokens = prompt_tokens + completion_tokens
                
                # Update statistics
                self.total_tokens += total_tokens
                self.total_prompt_tokens += prompt_tokens
                self.total_completion_tokens += completion_tokens
                self.requests_made += 1
                self._save_stats()  # Persist to disk
                
                return {
                    'success': True,
                    'response': generated_text,
                    'tokens_used': total_tokens,
                    'prompt_tokens': prompt_tokens,
                    'completion_tokens': completion_tokens,
                    'error': None
                }
            else:
                return {
                    'success': False,
                    'response': '',
                    'tokens_used': 0,
                    'prompt_tokens': 0,
                    'completion_tokens': 0,
                    'error': 'Keine Antwort von Grok erhalten'
                }
                
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'response': '',
                'tokens_used': 0,
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'error': 'Grok API Timeout (30s)'
            }
        except requests.exceptions.HTTPError as e:
            error_msg = str(e)
            if hasattr(e.response, 'text'):
                try:
                    error_data = json.loads(e.response.text)
                    error_msg = error_data.get('error', {}).get('message', error_msg)
                except:
                    error_msg = e.response.text
            
            return {
                'success': False,
                'response': '',
                'tokens_used': 0,
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'error': f'Grok API Fehler: {error_msg}'
            }
        except Exception as e:
            return {
                'success': False,
                'response': '',
                'tokens_used': 0,
                'prompt_tokens': 0,
                'completion_tokens': 0,
                'error': f'Fehler: {str(e)}'
            }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get token usage statistics"""
        return {
            'total_tokens': self.total_tokens,
            'total_prompt_tokens': self.total_prompt_tokens,
            'total_completion_tokens': self.total_completion_tokens,
            'requests_made': self.requests_made,
            'avg_tokens_per_request': round(self.total_tokens / self.requests_made, 1) if self.requests_made > 0 else 0
        }
    
    def reset_stats(self):
        """Reset usage statistics"""
        self.total_tokens = 0
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0
        self.requests_made = 0
        self._save_stats()  # Persist reset to disk


# Global instance
grok = GrokAPI()
