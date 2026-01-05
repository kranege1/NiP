# Nobody is Perfect - Spiel

Ein unterhaltsames Multiplayer-Spiel für Gruppen. Die Spieler müssen knifflige Fragen beantworten und erraten, welche Antworten von wem stammen.

## 🚀 Schnellstart

### Voraussetzungen
- **Node.js** (v14+) installiert
- **npm** (kommt mit Node.js)

### Installation & Start

1. **In diesen Ordner gehen:**
   ```powershell
   cd c:\MyServer\nobody-perfect-game
   ```

2. **Abhängigkeiten installieren (einmalig):**
   ```powershell
   npm install
   ```

3. **Server starten:**
   ```powershell
   node server.js
   ```

4. **Im Browser öffnen:**
   - Hauptseite: http://localhost:3000
   - Anzeigeseite (für Beamer): http://localhost:3000/screen.html
   - QR-Code Generator: http://localhost:3000/QR.html

---

## 📁 Dateistruktur

```
nobody-perfect-game/
├── server.js                    # Node.js Server (Kernlogik)
├── package.json                 # Abhängigkeiten
├── player_colors.json           # Spielerfarben (persistent)
├── states.json                  # Spielzustände (persistent)
├── version_counter.json         # Versionsinfo
└── public/
    ├── index.html              # Spieler-UI
    ├── screen.html             # Anzeigeseite (Beamer/Monitor)
    ├── QR.html                 # QR-Code Generator (URL + WLAN)
    ├── styles.css              # Design
    ├── NiP_back.jpg            # Hintergrundbild
    ├── app.js                  # Hauptlogik
    ├── app-game.js             # Spielablauf
    ├── app-ui.js               # UI-Komponenten
    ├── app-core.js             # Kern-Funktionen
    ├── terms.js                # Fragen/Begriffe
    ├── screen.js               # Anzeigelogik
    ├── answers.js              # Antwort-Verwaltung
    └── socket.io/              # WebSocket-Bibliothek (automatisch)
```

---

## 🎮 Spielablauf

1. **Spieler verbinden sich** unter http://localhost:3000
2. **Admin startet das Spiel** und wählt Begriffe
3. **Spieler beantworten** die Fragen
4. **Auf dem Beamer** (screen.html) wird es angezeigt
5. **Voting & Punkte** vergeben

---

## 🔧 Konfiguration

### Port ändern (Standard: 3000)
Öffne `server.js` und ändere:
```javascript
const PORT = 3000;  // Hier anpassen
```

### Hintergrundbild ändern
Ersetze `public/NiP_back.jpg` mit deinem Bild und aktualisiere `public/styles.css`:
```css
background: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('/dein-bild.jpg') center/cover fixed;
```

---

## 📱 QR-Code Generator

Unter http://localhost:3000/QR.html kannst du QR-Codes generieren für:
- **URL-Links** (öffnet Browser)
- **WLAN-Verbindungen** (Auto-Connect)

**Mit Parametern (automatisch ausfüllen):**
- URL: `http://localhost:3000/QR.html?mode=url&url=example.com`
- WLAN: `http://localhost:3000/QR.html?mode=wifi&ssid=MeinWLAN&password=secret&encryption=WPA`

---

## 🛠️ Troubleshooting

### Server startet nicht
```powershell
# npm Module installieren
npm install

# Node-Version prüfen
node --version
```

### Port wird bereits verwendet
```powershell
# Ändere den Port in server.js oder:
# Beende den Prozess, der Port 3000 nutzt
```

### Hintergrundbild wird nicht angezeigt
- Stelle sicher, dass `NiP_back.jpg` im `public/` Ordner liegt
- Prüfe den Pfad in `styles.css`

---

## 📋 Systemanforderungen

- **Betriebssystem:** Windows, macOS, Linux
- **RAM:** mindestens 512 MB
- **Netzwerk:** LAN/WLAN für Spieler-Verbindungen
- **Browser:** Moderne Browser (Chrome, Firefox, Edge, Safari)

---

## 📞 Support

Bei Fragen oder Problemen:
1. Server-Konsole auf Fehler prüfen
2. Browser-Konsole öffnen (F12)
3. Netzwerk-Verbindung prüfen

---

**Viel Spaß beim Spielen! 🎉**
