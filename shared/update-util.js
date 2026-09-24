// Update-Hilfen ohne Netzwerk und ohne Dateizugriff (damit sie getestet werden können):
// Versionsvergleich, das richtige GitHub-Release finden und das Austausch-Skript für die Mac-App.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UpdateUtil = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const versionParts = (v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  function isNewer(latest, current) {
    const a = versionParts(latest), b = versionParts(current);
    for (let i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
  }
  // Das höchste veröffentlichte Release, das die gesuchte Datei enthält (GitHub legt beim Bauen manchmal ein zweites,
  // unvollständiges Release an, das übersprungen wird).
  function pickRelease(releases, assetName) {
    let best = null;
    (releases || []).forEach((rel) => {
      if (rel.draft || rel.prerelease) return;
      const asset = (rel.assets || []).find((a) => a.name === assetName);
      if (!asset) return;
      const version = String(rel.tag_name).replace(/^v/, "");
      if (!best || isNewer(version, best.version)) best = { version, zipUrl: asset.browser_download_url, pageUrl: rel.html_url, size: asset.size || 0 };
    });
    return best;
  }
  // Skript, das nach dem Beenden der App die neue Version an ihre Stelle kopiert (mit Rückweg bei Fehlern).
  // reopen = true: danach die App wieder öffnen (Klick auf "Jetzt neu starten"); false: nur austauschen (Update beim Beenden).
  function swapScript() {
    return [
      "#!/bin/bash",
      'PID="$1"; NEW="$2"; TARGET="$3"; LOG="$4"; REOPEN="$5"',
      'exec >>"$LOG" 2>&1',
      'echo "=== Update $(date) ==="',
      "WAITED=0",
      'while kill -0 "$PID" 2>/dev/null && [ "$WAITED" -lt 120 ]; do sleep 0.5; WAITED=$((WAITED+1)); done',
      'OLD="${TARGET}.old"',
      'rm -rf "$OLD"',
      'if mv "$TARGET" "$OLD"; then',
      '  if ditto "$NEW" "$TARGET"; then',
      '    xattr -cr "$TARGET" 2>/dev/null',
      '    rm -rf "$OLD"',
      '    echo "Update ok"',
      "  else",
      '    echo "Kopieren fehlgeschlagen, Rollback"',
      '    rm -rf "$TARGET"',
      '    mv "$OLD" "$TARGET"',
      "  fi",
      "else",
      '  echo "Verschieben der alten App fehlgeschlagen"',
      "fi",
      '[ "$REOPEN" = "1" ] && open "$TARGET"',
      "",
    ].join("\n");
  }
  return { versionParts, isNewer, pickRelease, swapScript };
});
