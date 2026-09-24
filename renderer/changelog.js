// "Neu in dieser Version": erscheint einmal nach einem Update. Neue Einträge oben in CHANGELOG ergänzen.
const CHANGELOG = {
  "2.0.0": {
    title: "Neu in Version 2.0.0 – komplett neu gebaut",
    items: [
      ["Aufbau und Aussehen wie die X32-Fernsteuerung", "Schlichtes Design, Touch-Modus, Vollbild, „Neu in dieser Version“."],
      ["Moving Heads, Strobo, Dimmer, an/aus-Lampen", "Stairville MH-X25 im 6- und 12-Kanal-Modus (nach der Anleitung), dazu Bühnenlicht dimmbar oder nur an/aus, RGB-Scheinwerfer, Strobos und eigene Geräte."],
      ["Bühnenansicht", "Draufsicht und Seitenansicht zeigen live Strahlen, Farben, Gobos, Blitze und die Kopfbewegung. Köpfe lassen sich auf einen Punkt der Bühne „zielen“."],
      ["Looks und Effekte im Takt", "Looks speichern und überblenden. Lauflicht, Pulsieren, Farbwechsel, Kreis- und Acht-Bewegungen, Blitz-Schläge und Gobo-Wechsel laufen im eingestellten Tempo (Tap-Tempo)."],
      ["Sicherer Start", "Simulationsmodus ohne Hardware. Die Enttec DMX USB PRO wird automatisch erkannt. Master und Blackout sind immer sichtbar."],
      ["Update im Hintergrund", "Neue Versionen werden erkannt und geladen, solange die App läuft. Ein Klick auf „Jetzt neu starten“ installiert sie."],
    ],
  },
};

function showChangelog(version) {
  const entry = CHANGELOG[version];
  if (!entry || document.getElementById("changelog-overlay")) return;
  const list = el('<div class="changelog-list"></div>');
  entry.items.forEach(([head, text]) => list.appendChild(el('<div class="changelog-item"><b>' + esc(head) + "</b><span>" + esc(text) + "</span></div>")));
  const d = dialog({ title: entry.title, body: list, actions: [{ label: "Verstanden" }] });
  d.overlay.id = "changelog-overlay";
}
function maybeShowChangelog(version) {
  if (!CHANGELOG[version]) return;
  let seen = null;
  try { seen = localStorage.getItem("dmx.seenVersion"); } catch (e) {}
  if (seen === version) return;
  try { localStorage.setItem("dmx.seenVersion", version); } catch (e) {}
  showChangelog(version);
}
