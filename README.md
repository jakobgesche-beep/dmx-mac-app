# DMX Lichtsteuerung (Mac-App)

Native macOS-App (Electron) zur Ausgabe von KI-geschriebenen Lichtsequenzen
über eine **Enttec DMX USB PRO** (oder Mk2). Anders als die Browser-Version
läuft das hier nicht über WebSerial (Chrome/Edge-Beschränkung), sondern
direkt über Node.js (`serialport`-Paket) — funktioniert dadurch unabhängig
vom Browser.

## ⚠️ Ungetestet an echter Hardware

Das Enttec-Protokoll (`dmx-protocol.js`: Baudrate 250000/8 Datenbits/2
Stopbits/keine Parität, Paket-Framing 0x7E...0xE7, Label 6 = DMX-Ausgabe) ist
nach der offiziellen „Enttec USB Pro API Specification" umgesetzt, konnte
aber nicht an echter Hardware getestet werden. Erster Test: App starten,
„Verbinden" klicken, das Enttec-Gerät aus der Liste wählen, dann unter
„Manuelle Kanäle" einen Regler hochziehen und schauen, ob ein angeschlossenes
Gerät reagiert. Reagiert nichts, zuerst Baudrate/Framing in `dmx-protocol.js`
gegen die offizielle Spec-PDF prüfen.

## Setup (einmalig, braucht Node.js)

Falls noch nicht installiert: Node.js von [nodejs.org](https://nodejs.org)
installieren (LTS-Version reicht).

```bash
cd dmx-mac-app
npm install
```

`serialport` hat native Bestandteile, die beim `npm install` automatisch für
Electron nachgebaut werden (kann beim ersten Mal etwas dauern).

## Starten (zum Testen, ohne Installation)

```bash
npm start
```

## Als echte Mac-App bauen (.dmg)

```bash
npm run build
```

Das Ergebnis liegt danach in `dist/` — eine `.dmg`-Datei zum Doppelklicken
und in den Programme-Ordner ziehen, sowie eine `.zip` als Alternative. Der
Dateiname ist bewusst fest (`DMX-Lichtsteuerung.dmg`, ohne Versionsnummer),
damit der Download-Link auf der Website immer funktioniert, auch nach einem
Update.

**Hinweis:** Da die App nicht mit einem Apple-Entwicklerzertifikat signiert
ist, wird macOS beim ersten Start wahrscheinlich warnen ("nicht verifizierter
Entwickler"). Das lässt sich umgehen über Rechtsklick auf die App →
„Öffnen" → im Dialog nochmal „Öffnen" bestätigen (nur beim allerersten Start
nötig). **Das kann bei jedem Auto-Update erneut passieren** (siehe unten) —
ohne Apple-Entwicklerzertifikat (99$/Jahr) lässt sich das nicht ganz
vermeiden, ist aber nur ein Klick.

## Update veröffentlichen (für Auto-Update & Download-Button)

Damit die App sich selbst updaten kann und der Download-Button auf der
Website immer die neueste Version bekommt, muss ein Release nicht nur
gebaut, sondern auf GitHub veröffentlicht werden:

1. Version in `package.json` hochzählen (z. B. `"version": "1.0.1"`).
2. Einen GitHub **Personal Access Token** erstellen (github.com → Settings
   → Developer settings → Personal access tokens → Tokens (classic) → Scope
   `repo`, da das Repo privat ist).
3. Im Terminal einmalig für die Sitzung setzen und veröffentlichen:
   ```bash
   export GH_TOKEN=dein_token_hier
   npm run publish
   ```
   Das baut die App **und** lädt `.dmg`/`.zip` als neues GitHub-Release
   in `jakobgesche-beep/dmx-mac-app` hoch.
4. Fertig — jede bereits installierte App-Version prüft beim Start
   automatisch auf GitHub nach einem neueren Release, lädt es im
   Hintergrund herunter und zeigt oben einen Balken „Update
   heruntergeladen — Jetzt neu starten & installieren" an. Der
   Download-Button auf der Website zeigt ebenfalls immer auf das
   neueste Release.

**Ohne `npm run publish` (nur `npm run build`) passiert kein Auto-Update** —
die Datei liegt dann nur lokal in `dist/`.

## Funktionen

- Serielle Geräte auflisten & verbinden (Enttec-Box)
- Sequenz-Editor: JSON-Code einfügen, abspielen, stoppen
- Sequenzen lokal speichern/laden (Datei im App-Datenverzeichnis, kein Server)
- Manuelle Kanalregler (1–16) zum Testen
- Reaktive Kamera-Steuerung (experimentell): Bewegungserkennung per Webcam in
  3 Zonen, steuert Kanalgruppen direkt an
- Aktivitäts-Log inkl. Simulationsmodus — funktioniert auch ganz ohne
  angeschlossene Hardware, um die Sequenz-Logik zu testen
- Auto-Update: prüft beim Start automatisch auf GitHub nach neuen Releases,
  lädt sie im Hintergrund herunter und installiert sie beim nächsten
  Neustart (siehe „Update veröffentlichen" unten)

## Sequenz-Format

Identisch zur Browser-Version:

```json
{
  "name": "Test-Chase (Kanal 1-3)",
  "loop": true,
  "steps": [
    { "fade": 400, "hold": 600, "channels": { "1": 255, "2": 0, "3": 0 } },
    { "fade": 400, "hold": 600, "channels": { "1": 0, "2": 255, "3": 0 } }
  ]
}
```

## Struktur

```
main.js             Electron-Hauptprozess: Fenster, serielle Verbindung
                     (serialport), Sequenzen-Datei-Speicherung
preload.js           Sichere Brücke (contextBridge) zwischen Hauptprozess
                     und der UI (window.dmxAPI)
dmx-protocol.js       Enttec-Paketbildung (von main.js genutzt)
renderer/
  index.html, style.css, app.js   Die UI (Sequenz-Player, Regler,
                                   Kamera-Reaktiv-Modus, Log)
```
