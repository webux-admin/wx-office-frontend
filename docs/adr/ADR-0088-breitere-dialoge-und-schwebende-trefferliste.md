# ADR-0088 — Breitere Dialoge der Zeiterfassung und eine Trefferliste, die über der Seite schwebt

- **Status:** Angenommen
- **Datum:** 2026-11-25
- **Verhältnis:** Neu. Ergänzt ADR-0083 (Stoppuhr) und ADR-0084 (Standardleistung).
  Issue webux-admin/wx-office#134, «Zeiterfassung verbessern (5/12)».

## Kontext

Aus dem Gebrauch: die Dialoge der Zeiterfassung sind zu klein, um Projekt, Kunde und Leistung
bequem zu wählen. Zwei Ursachen:

- **Breite.** «Stoppuhr starten» und «Standardleistung» hatten die Standardbreite von 27.5rem.
  Nach der Nummernspalte bleibt für «Website-Relaunch · Muster Treuhand AG» kaum Platz.
- **Höhe.** Die Trefferliste von `LookupField` stand absolut im Kasten des Feldes. Im Dialog
  scrollt der Körper (`overflow-y-auto`), und die Liste wurde nach fünf bis sechs Treffern am
  Fuss des Dialogs abgeschnitten. Wer weiter wollte, musste den Dialog rollen, nicht die Liste.

`LookupField` wird heute nur von der Zeiterfassung benutzt (Projekt oder Kunde, Leistung), soll
aber der Baustein für #115 werden, die Schnellsuche in allen Masken.

## Entscheidung

1. **Stoppuhr und Standardleistung sind `wide` (42.5rem).** Auf dem Telefon bleibt der Dialog so
   breit wie der Bildschirm. In der Stoppuhr stehen Leistung und «verrechenbar» nebeneinander,
   Projekt oder Kunde und der Text über die ganze Breite.
2. **Die Trefferliste schwebt über der Seite.** Sie wird per Portal in `document.body` gezeichnet,
   `position: fixed` über jeder Ebene (`z-[60]`, wie die Blase eines Tooltips), so breit wie der
   umrandete Kasten des Feldes und mindestens 16rem.
3. **Ihr Platz folgt dem Feld.** Unter dem Feld, wo Platz ist, sonst darüber, wenn dort mehr ist
   (`lib/dropdownPlacement.ts`). Die Lage wird einmal je Frame geprüft und nur bei einer Änderung
   geschrieben, dazu sofort bei jedem Scrollen. Das Feld bewegt sich auch ohne Ereignis: mit dem
   Einblenden des Dialogs und wenn die Chips «Zuletzt» darüber nachgeladen werden.
4. **Acht Treffer und ein halber neunter** sind sichtbar, bevor die Liste rollt (16.5rem). Der
   halbe Treffer zeigt, dass es weitergeht. Wo der Bildschirm früher endet, wird die Liste kürzer.
5. **Ein zu langer Name steht ganz im `title`** der Trefferzeile.

## Begründung

**Zu 2:** Ein Portal ist der einzige Weg, der in jedem Behälter gleich funktioniert — im Dialog,
im Panel der Schnellzeile, später in jeder Maske aus #115. Der Dialog selbst bleibt, wie er ist:
sein Körper muss bei langem Inhalt scrollen können.

**Zu 3:** Die Liste ist offen, während jemand tippt. Eine Prüfung je Frame kostet einen
`getBoundingClientRect` und schreibt nur, wenn sich etwas verschoben hat; das ist weniger als
jede Animation auf derselben Seite.

## Verworfene Alternativen

**Die Liste im Fluss statt absolut**, so dass der Dialog mitwächst. Verworfen: das Feld «Projekt
oder Kunde» hat beim Öffnen der Stoppuhr den Fokus, und seine Liste öffnet sich sofort. Der
Dialog würde beim Öffnen hoch und beim Wählen wieder kurz — er springt.

**Dem Dialog eine Mindesthöhe geben.** Verworfen: leerer Raum, der nur für die Liste da ist, und
eine Zahl, die bei jedem neuen Feld nachgerechnet werden müsste.

**Den Dialog ohne `overflow` lassen**, damit die Liste über seinen Rand hinausragt. Verworfen: auf
dem Telefon mit offener Tastatur liesse sich ein langer Dialog dann nicht mehr rollen.

**Das Popover-API des Browsers (`popover`) statt eines Portals.** Verworfen: jsdom kennt es nicht,
und der Platz müsste trotzdem selbst gerechnet werden, solange CSS Anchor Positioning nicht in
allen Browsern steht.

## Konsequenzen

- `components/LookupField.tsx` zeichnet seine Liste in den `body`. Tests suchen die Treffer im
  `document`, nicht im Container des Tests.
- `lib/dropdownPlacement.ts` rechnet den Platz, ohne React und mit eigenen Tests.
- #115 kann auf `LookupField` aufbauen, ohne dass die Liste in einem Dialog abgeschnitten wird.
