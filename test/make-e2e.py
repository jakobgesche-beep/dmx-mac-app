#!/usr/bin/env python3
# erzeugt test/e2e.html aus renderer/index.html (Skripte auf ../renderer/ umbiegen, simuliertes Hauptprogramm davor, Szenario dahinter)
import re, os
here = os.path.dirname(os.path.abspath(__file__))
h = open(os.path.join(here, '..', 'renderer', 'index.html'), encoding='utf-8').read()
h = re.sub(r'(src|href)="(?!\.\./|http)([^"]+)"', lambda m: m.group(1) + '="../renderer/' + m.group(2) + '"', h)
h = h.replace('<script src="../shared/dmx.js"></script>', '<script src="stub-api.js"></script>\n  <script src="../shared/dmx.js"></script>', 1)
h = h.replace('</body>', '  <script src="e2e-scenario.js"></script>\n</body>')
open(os.path.join(here, 'e2e.html'), 'w', encoding='utf-8').write(h)
