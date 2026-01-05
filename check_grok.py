#!/usr/bin/env python3
"""Quick test script to check if Grok API key works"""

import sys
import requests

# Check if server is running
SERVER_URL = "http://localhost:3000"

def test_grok():
    print("🔍 Testing Grok API Key...")
    print("=" * 50)
    
    # Test with a simple prompt
    test_prompt = "Hallo Grok, antworte kurz mit 'Ich funktioniere!'"
    
    try:
        response = requests.post(
            f"{SERVER_URL}/api/grok/prompt",
            json={"prompt": test_prompt},
            timeout=30
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            print("\n❌ FEHLER: API Key nicht konfiguriert oder ungültig")
            print("\nSetze den Key mit:")
            print("  $env:GROK_API_KEY = 'dein-key'")
            print("Dann Server neu starten!")
            return False
            
        data = response.json()
        
        if data.get('success'):
            print("\n✅ ERFOLG! Grok API Key funktioniert!")
            print(f"\nAntwort: {data['response'][:100]}...")
            print(f"\nToken-Verbrauch:")
            print(f"  - Gesamt: {data['tokensUsed']}")
            print(f"  - Prompt: {data['promptTokens']}")
            print(f"  - Antwort: {data['completionTokens']}")
            
            # Get stats
            stats_response = requests.get(f"{SERVER_URL}/api/grok/stats")
            if stats_response.ok:
                stats = stats_response.json()
                print(f"\nGesamtstatistik:")
                print(f"  - Total Tokens: {stats['totalTokens']}")
                print(f"  - Anfragen: {stats['requestsMade']}")
            
            return True
        else:
            print(f"\n❌ FEHLER: {data.get('error')}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("\n❌ FEHLER: Server läuft nicht auf localhost:3000")
        print("Starte den Server zuerst mit: python server.py")
        return False
    except Exception as e:
        print(f"\n❌ FEHLER: {e}")
        return False

if __name__ == '__main__':
    success = test_grok()
    sys.exit(0 if success else 1)
