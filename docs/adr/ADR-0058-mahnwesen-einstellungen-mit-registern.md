# ADR-0058 — Die Mahnwesen-Einstellungen sind eine Maske mit Registern

- **Status:** Angenommen
- **Datum:** 2026-11-20
- **Verhältnis:** Wendet [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md) (Hinweise
  als Tooltip, Fehler am Feld) und [ADR-0056](ADR-0056-partnerregister-einheitlich.md) auf das
  Mahnwesen an.
- **Backend:** keins.

## Kontext

Die Einstellungen des Mahnwesens waren eine lange Seite mit drei Panels und einem
Hinweis-Absatz. Die Felder trugen ihre Erklärungen als Zeile unter dem Feld. Die Maske hatte
keine Faktenzeile, keinen Rücksprung mit Abfrage bei ungespeicherten Änderungen und keine
Tastatur wie die übrigen Masken. Der Partner ist seit ADR-0053 und ADR-0056 anders aufgebaut.

## Entscheidung

1. **Die Maske ist eine `FormMask`** wie die Partnermaske. Speichern bindet an Strg+S, Esc
   fragt bei ungespeicherten Änderungen.
2. **Drei Register:** «Mahnlauf» (Nummernkreis, Bagatellgrenze, Gruppierung, Zahlteil),
   «Gebühr» (Verbuchung, MwSt-Behandlung, Ertragskonto) und «Versand» (Rechnungskopien,
   Blindkopie).
3. **Faktenzeile über den Registern:** Mahnstufen aktiv, Nummernkreis, Gruppierung und ob der
   Versand bereit ist.
4. **Hinweise zu einem Feld sind ein Tooltip.** Der Absatz unter dem Ertragskonto fällt weg.
   Die Hinweise der Mahnstufen und Mahntexte folgen derselben Regel. Ausgenommen ist das
   mehrzeilige Feld der Mahntexte, weil dessen Bauteil noch keinen Tooltip kennt.
5. **Fehler stehen am Feld.** Eine falsche Kontonummer steht unter dem Feld und sperrt Speichern.
6. **Die Mahngebühr bleibt an der Stufe.** Der Register «Gebühr» regelt nur die Verbuchung.
   Die Höhe steht auf jeder Mahnstufe.

## Begründung

Eine Maske, die sich wie die Partnermaske verhält, lässt sich ohne Nachlesen bedienen. Die
Faktenzeile beantwortet die häufigste Frage, ohne ein Register zu öffnen. Ein Tooltip nimmt
keinen Platz weg, und die Fehlermeldung steht dort, wo man sie korrigiert.

## Verworfene Alternativen

**Alle Felder auf einer Seite, wie bei der Erfassung des Partners (ADR-0053).** Verworfen: die
Einstellungen sind selten geändert und haben drei klar getrennte Themen. Register passen besser.

**Die Höhe der Gebühr in den Register «Gebühr» verschieben.** Verworfen: die Höhe gehört zur
Stufe mit ihren Fristen, und die Regel «eine spätere Stufe darf nicht milder sein» prüft sie dort.

## Konsequenzen

- Die Tests klicken das Register «Gebühr» an, bevor sie das Ertragskonto suchen.
- Die Maske braucht einen Router, wie alle Masken, die `FormMask` nutzen.

## Abweichungen vom Issue

Keine.

## Offen

- Das mehrzeilige Feld der Mahntexte bekommt einen Tooltip, sobald sein Bauteil ihn trägt.
