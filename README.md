# DMX Lichtsteuerung

Mac-App (Electron) für die Bühnenbeleuchtung der Technik-AG. Sie steuert über eine
**Enttec DMX USB PRO** Moving Heads, Strobos, RGB-Lampen und einfache An/Aus-Lampen.
Aussehen und Bedienung sind wie bei der X32-Fernsteuerung: schlicht, dunkel, mit Touch-Modus
und automatischem Update.

## Stand

**Version 2.0 (Meilenstein A):** Bühne, Geräte, Looks, Effekte im Takt, DMX-Ausgabe, Updates.
Noch nicht drin, aber geplant: Bühnenplan mit Foto (B), Musik-Erkennung und Songs (C),
Kamera-Kontrolle mit dem iPhone (D), Windows-Version.

> **Ungetestet an echter Hardware.** Das Enttec-Protokoll ist nach der Hersteller-Beschreibung
> umgesetzt und im Rechner-Test geprüft, aber noch nie an einer echten Enttec-Box gelaufen.
> Auch die Zuordnung von Pan/Tilt (links/rechts, oben/unten) kann bei deinen Köpfen
> vertauscht sein. Dafür gibt es pro Gerät die Schalter „Pan umkehren“ und „Tilt umkehren“.

## Erster Start mit Hardware

1. Enttec per USB an den Mac, DMX-Kabel an den ersten Kopf.
2. App öffnen. Oben rechts steht „Simulation“, bis die Box gefunden ist. Danach „Enttec verbunden“.
   Unter **Einstellungen** siehst du Seriennummer und Firmware der Box (das ist die Kontrolle,
   dass wirklich ein Enttec antwortet).
3. Unter **Geräte** die Lampen anlegen („+ Gerät hinzufügen“). Die Adressen werden fortlaufend vergeben.
   Am Kopf muss dieselbe Startadresse und die Betriebsart (12 oder 6 Kanäle) eingestellt sein.
4. Unter **Einstellungen → Kanal-Test** einen Kanal auf einen Wert stellen und schauen,
   ob die Lampe reagiert (z. B. Kanal 8 = Dimmer beim MH-X25 im 12-Kanal-Modus).
5. Auf der **Bühne** Lampen auswählen und bedienen.

## Geräte

| Gerät | Kanäle |
|---|---|
| Stairville MH-X25 LED Spot | 12 oder 6 Kanäle, Farbrad, Gobos, Shutter/Strobo |
| Bühnenlicht an/aus | 1 Kanal, schaltet ab 50 % |
| Bühnenlicht dimmbar | 1 Kanal |
| RGB-Scheinwerfer | 3 Kanäle, auch mit Dimmer (4) |
| Stroboskop | 2 Kanäle (Blitzrate, Helligkeit) oder 1 Kanal |
| Eigenes Gerät | Kanalliste selbst zusammenstellen |

Die Gobo-Symbole des MH-X25 sind Platzhalter (die Stellungen 1 bis 8 stimmen, die Bilder nicht).

## Bühne

* **Bühnenansicht** (Draufsicht und Seitenansicht): zeigt live Strahl, Farbe, Gobo, Blitz und Kopfbewegung,
  berechnet aus denselben Werten, die an die Lampen gehen. Die Köpfe fahren mit begrenzter Geschwindigkeit
  wie echte Lampen (abschaltbar).
* **Zielen:** auf die Bühne tippen, die gewählten Köpfe richten sich darauf aus. Dafür braucht die App
  die Position und Aufhängung der Lampen (Geräte → Bearbeiten: Position, Höhe, hängend/Boden, Drehung).
* **Looks:** Lichtstimmungen speichern und mit Überblenden abrufen.
* **Effekte im Takt:** Lauflicht, Pulsieren, Bewegung, Farbwechsel, Blitz-Schläge, Gobo-Wechsel.
  Tempo unten in der Leiste (BPM, Tap, Takt-Eins).
* **Blackout** und **Master** immer unten.

## Updates

Die App prüft im Hintergrund alle 10 Minuten auf eine neue Version, lädt sie sofort herunter und
zeigt oben „Update bereit“. Ein Klick auf „Jetzt neu starten“ tauscht die App aus und öffnet sie neu;
sonst wird das Update beim normalen Beenden eingespielt. Das Licht wird dabei kurz dunkel.

## Entwicklung

Kein Build nötig, um die Logik zu testen: die Testseiten in `test/` laufen in jedem Browser.

```
shared/   Licht-Logik ohne Oberfläche (DMX-Protokoll, Geräte, Bühnen-Geometrie, Effekte, Engine)
renderer/ Oberfläche
main.js   Fenster, Enttec-Anschluss, Speichern, Updates
test/     dmx-test, fixtures-test, stage-test, engine-test, update-test, core-ui-test, e2e (per make-e2e.py)
```

App bauen und veröffentlichen: einen Tag `vX.Y.Z` pushen, GitHub Actions baut die Mac-App
(`.dmg` und `.zip`) und legt sie als Release ab.

```bash
npm install
npm start          # App lokal starten
npm run build      # lokal bauen
```
