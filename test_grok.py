#!/usr/bin/env python3
"""
Test script for Grok API integration
"""

import requests
import json
import sys

BASE_URL = 'http://localhost:3000'

def set_api_key(api_key):
    """Set Grok API key"""
    print(f"🔑 Setze Grok API Key...")
    response = requests.post(f'{BASE_URL}/api/grok/set-key', 
        json={'api_key': api_key},
        timeout=10)
    result = response.json()
    if result['success']:
        print(f"✅ API Key gesetzt!")
    else:
        print(f"❌ Fehler: {result.get('error')}")
    return result['success']

def ask_grok(prompt):
    """Send a prompt to Grok"""
    print(f"\n🤖 Sende Prompt an Grok...")
    print(f"   Prompt: {prompt[:50]}..." if len(prompt) > 50 else f"   Prompt: {prompt}")
    
    response = requests.post(f'{BASE_URL}/api/grok/prompt', 
        json={'prompt': prompt},
        timeout=60)
    result = response.json()
    
    if result['success']:
        print(f"✅ Antwort erhalten!")
        print(f"\n📝 Antwort:\n{result['response']}\n")
        print(f"📊 Token-Verbrauch:")
        print(f"   - Prompt Tokens: {result['promptTokens']}")
        print(f"   - Completion Tokens: {result['completionTokens']}")
        print(f"   - Gesamt: {result['tokensUsed']}")
    else:
        print(f"❌ Fehler: {result.get('error')}")
    
    return result

def get_stats():
    """Get Grok usage statistics"""
    print(f"\n📈 Token-Statistiken:")
    response = requests.get(f'{BASE_URL}/api/grok/stats', timeout=10)
    stats = response.json()
    
    print(f"   - Gesamt Tokens: {stats['totalTokens']}")
    print(f"   - Prompt Tokens: {stats['totalPromptTokens']}")
    print(f"   - Completion Tokens: {stats['totalCompletionTokens']}")
    print(f"   - Anfragen gemacht: {stats['requestsMade']}")
    print(f"   - Ø Tokens pro Anfrage: {stats['avgTokensPerRequest']}")
    
    return stats

def main():
    """Run tests"""
    print("=" * 60)
    print("🚀 Grok API Integration Test")
    print("=" * 60)
    
    # Check if API key is provided
    if len(sys.argv) < 2:
        print("\n❌ Fehler: Bitte Grok API Key als Argument angeben!")
        print("\n📖 Verwendung:")
        print("   python test_grok.py 'your-grok-api-key'")
        print("\n💡 Tipp: Setze die Umgebungsvariable GROK_API_KEY")
        sys.exit(1)
    
    api_key = sys.argv[1]
    
    # Set API key
    if not set_api_key(api_key):
        sys.exit(1)
    
    # Test 1: Simple prompt
    print("\n" + "=" * 60)
    print("Test 1: Einfache Frage")
    print("=" * 60)
    ask_grok("Wer war Albert Einstein?")
    
    # Test 2: Complex prompt
    print("\n" + "=" * 60)
    print("Test 2: Komplexere Frage")
    print("=" * 60)
    ask_grok("Erkläre mir das Konzept von 'Nobody is Perfect' Spiels in 2-3 Sätzen")
    
    # Get final statistics
    print("\n" + "=" * 60)
    print("Finale Statistiken")
    print("=" * 60)
    get_stats()
    
    print("\n" + "=" * 60)
    print("✅ Test abgeschlossen!")
    print("=" * 60)

if __name__ == '__main__':
    main()
