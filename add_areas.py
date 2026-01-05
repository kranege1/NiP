#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import re

# Kategorie-Zuordnungen basierend auf Schlüsselwörtern
CATEGORIES = {
    'Geschichte': [
        'antik', 'mittelalter', 'historisch', 'krieg', 'kaiser', 'könig', 'römisch', 
        'griechisch', 'ägyptisch', 'waffe', 'rüstung', 'schiff', 'segel', 'boot',
        'schlacht', 'tempel', 'festung', 'manuskript', 'heilig', 'jahrhundert',
        'renaissance', 'segelboot', 'kriegsschiff', 'anker', 'kran', 'pergament',
        'frühdruck', 'pferd', 'ritter', 'feudal', 'rettungsboot', 'ma', 'weltkrieg',
        'wm', 'europameister', 'weltmeister', 'kanzler', 'präsident', 'politiker',
        'entdecker', 'komponist', 'maler', 'reichskanzler'
    ],
    'Wissenschaft': [
        'physik', 'chemie', 'mathematik', 'energie', 'atom', 'molekül', 'astronomie',
        'stern', 'planet', 'messung', 'winkel', 'einheit', 'medizin', 'biologie',
        'zelle', 'algorithmus', 'technik', 'instrument zur messung', 'wissenschaft',
        'visiergerät', 'maßeinheit', 'mechanismus', 'balken', 'optisch', 'flugzeug',
        'durchsichtig', 'klar', 'bahn der sonne', 'höchste punkt', 'sternenpositionen',
        'wassertiefe', 'pigment', 'tonerde', 'bleisulfid', 'farbstoff', 'computer',
        'krypto', 'blockchain', 'nft', 'bitcoin', 'ki', 'künstlich'
    ],
    'Geographie': [
        'berg', 'tal', 'fluss', 'meer', 'ozean', 'insel', 'hügel', 'gebirge',
        'wüste', 'wald', 'land', 'kontinent', 'stadt', 'hafen', 'küste', 'bucht',
        'schlucht', 'gletscher', 'kai', 'anlegestelle', 'erhebung im gelände',
        'gelände', 'runder hügel', 'kleiner hügel', 'schmalz', 'damm'
    ],
    'Kultur': [
        'musik', 'instrument', 'kunst', 'malerei', 'skulptur', 'gedicht', 'literatur',
        'theater', 'tanz', 'religion', 'kirche', 'gott', 'heilige', 'feier', 'fest',
        'mode', 'kleidung', 'schmuck', 'mythologie', 'sage', 'saitensiel', 'blasinstrument',
        'rasseln', 'kunstwerk', 'altarbild', 'kopftuch', 'mantel', 'jacke', 'kelch',
        'zeremonielle', 'geistlich', 'vorraum', 'schrift', 'buchstaben', 'drucktechnik',
        'biografie', 'versmaß', 'gedankenwesen', 'mythisch', 'dämon', 'schutzschild',
        'weihrauch', 'heiligenschein', 'objekt', 'opfergabe', 'gelübde', 'stoff',
        'seidenstoff', 'holzverkleidung', 'wand', 'gebäude', 'turm', 'haus',
        'sarg', 'begräbnis', 'beerdigung', 'nachbildung', 'schmuckarbeit', 'gold',
        'silber', 'dekorativ', 'verziert', 'fenster', 'tür', 'make-up', 'segel',
        'flaggen', 'fensterrahmen', 'pfosten', 'schale', 'schutz', 'glück',
        'verbundenes zeichen', 'steg', 'fensterscheiben', 'kruzifix', 'altarraum',
        'wandhalter', 'kerzen', 'lampen', 'film', 'song', 'oscar', 'ballon',
        'rapper', 'album', 'hit', 'tiktok', 'viral', 'trend', 'social media',
        'instagram', 'youtube', 'streaming', 'serie', 'schauspieler', 'regisseur',
        'band', 'sänger', 'musiker', 'konzert', 'festival', 'ästhetik', 'mode-',
        'fashion', 'style', 'look', 'aesthetic', 'video', 'meme', 'podcast',
        'influencer', 'k-pop', 'pop', 'rock', 'jazz', 'klassisch'
    ],
    'Natur': [
        'tier', 'vogel', 'fisch', 'pflanze', 'baum', 'blume', 'alge', 'pilz',
        'organismus', 'natur', 'öko', 'umwelt', 'klima', 'wetter', 'wind', 'regen',
        'entenart', 'daunen', 'spinnenfaden', 'stamm', 'wurzeln', 'blütenstand',
        'stiele', 'angepasst', 'umgebungen', 'gewürz', 'blütennarben', 'perlmutt',
        'muschelschalen', 'krokus', 'sanft', 'mild', 'trockene', 'gedeiht',
        'wildnis', 'biodiversität', 'co₂', 'carbon', 'ökologie', 'bio'
    ],
    'Verschiedenes': [
        'tumult', 'aufruhr', 'moderne', 'digital', 'internet', 'app', 'smartphone',
        'technologie', 'software', 'hardware', 'code', 'programmier', 'online',
        'metaverse', 'nft', 'e-scooter', 'airfryer', 'bubble tea', 'quinoa',
        'tofu', 'matcha', 'vegan', 'vegetarisch', 'poke bowl', 'sushi',
        'lifestyle', 'wellness', 'fitness', 'yoga', 'meditation', 'mindfulness',
        'minimalism', 'nachhaltigkeit', 'zero waste', 'recycling', 'upcycling',
        'coworking', 'homeoffice', 'remote', 'freelance', 'startup', 'gründ',
        'unternehm', 'business', 'marketing', 'influencer', 'content', 'creator',
        'streamer', 'gamer', 'esport', 'cosplay', 'anime', 'manga', 'comic'
    ]
}

def categorize_term(term, definition):
    """Kategorisiert einen Begriff basierend auf Schlüsselwörtern"""
    text = (term + ' ' + definition).lower()
    
    # Spezialfälle
    if any(w in text for w in ['film', 'movie', 'kino', 'oscar', 'regisseur', 'schauspieler']):
        return 'Kultur'
    if any(w in text for w in ['song', 'musik', 'band', 'album', 'sänger', 'hit', 'chart']):
        return 'Kultur'
    if any(w in text for w in ['fußball', 'fußballer', 'weltmeister', 'europameister', 'bundesliga']):
        return 'Geschichte'
    if any(w in text for w in ['krypto', 'bitcoin', 'blockchain', 'nft', 'ethereum']):
        return 'Wissenschaft'
    if any(w in text for w in ['tiktok', 'instagram', 'youtube', 'social media', 'influencer', 'viral', 'meme']):
        return 'Verschiedenes'
    if any(w in text for w in ['politiker', 'kanzler', 'präsident', 'kaiser', 'könig', 'regier']):
        return 'Geschichte'
    if any(w in text for w in ['warum', 'was passierte', 'welcher', 'welches land', 'wer']):
        return 'Geschichte'
    
    # Kategorien durchsuchen
    for category, keywords in CATEGORIES.items():
        for keyword in keywords:
            if keyword in text:
                return category
    
    return 'Verschiedenes'

def main():
    # Datei einlesen
    with open('public/terms.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extrahiere das Array
    match = re.search(r'const nobodyIsPerfectTerms = (\[[\s\S]*\]);', content)
    if not match:
        print("Fehler: Konnte terms Array nicht finden")
        return
    
    # Parse JSON (mit einigen Korrekturen für trailing commas)
    json_str = match.group(1)
    # Entferne trailing comma vor ]
    json_str = re.sub(r',(\s*\])', r'\1', json_str)
    
    try:
        terms = json.loads(json_str)
    except json.JSONDecodeError as e:
        print(f"JSON Parse Error: {e}")
        return
    
    # Füge area hinzu wo sie fehlt
    updated_count = 0
    for term in terms:
        if 'area' not in term or not term['area']:
            area = categorize_term(term['term'], term['definition'])
            term['area'] = area
            updated_count += 1
    
    # Schreibe zurück
    new_content = 'const nobodyIsPerfectTerms = ' + json.dumps(terms, ensure_ascii=False, indent=4) + ';\n'
    
    with open('public/terms.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"✓ {updated_count} Begriffe kategorisiert!")
    print(f"✓ Insgesamt {len(terms)} Begriffe in der Datei")

if __name__ == '__main__':
    main()
