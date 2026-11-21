# ADR-0074 — Verträge: SLA-Werte erfassen, in den Versionen lesen und in der Liste als Text

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Ergänzt [ADR-0072](ADR-0072-vertragsliste-und-vertragsmaske.md) und
  [ADR-0073](ADR-0073-vertragsstatus-schritte-und-versionen.md). Setzt Backend ADR-0146 (SLA-Werte
  am Vertrag, Issue webux-admin/wx-office#108) um und folgt den Dialogen (ADR-0069) und den Fehlern
  am Feld (ADR-0050).

## Kontext

Ein Vertrag hält jetzt SLA-Werte: Kennzahl aus einem festen Katalog von sechs, Zielwert, eine
Einheit, die die Kennzahl erlaubt, und ein Text. Sie gehören zum Vereinbarten: am aktiven Vertrag
nimmt eine Änderung eine neue Version. Das Backend misst nichts; das Issue verlangt die Anzeige
**nur als Text, nicht als Ampel**, in der Maske und in der Liste.

## Entscheidung

1. **Eigenes Panel «Service-Level»** unter den Positionen, nach demselben Muster: Knopf
   «Service-Level hinzufügen», ein Dialog zum Erfassen und Bearbeiten, Verschieben und Entfernen
   je Zeile. Gespeichert wird mit dem Vertrag, in einem Request.
2. **Jede Zeile ist ein Satz:** «Verfügbarkeit 99.5 % (pro Kalendermonat)», «Reaktionszeit 4
   Stunden (Priorität 1)». Keine Farbe, kein Symbol, kein Status. Unter der Liste steht, dass
   hier nichts gemessen wird und keine Gutschrift entsteht.
3. **Der Dialog bietet nur die Einheiten der gewählten Kennzahl an.** Wechselt die Kennzahl,
   bleibt die Einheit, wenn die neue sie erlaubt, sonst nimmt sie die erste (Stunden bei Reaktions-
   und Lösungszeit). Die Maske prüft Bereich und Nachkommastellen wie das Backend.
4. **«Änderung gilt ab»** erscheint auch, wenn nur SLA-Werte geändert sind; der Zielwert zählt nach
   Wert (99.5 = 99,50), wie im Backend.
5. **Fehler des Backends** zu einem SLA-Wert (`slaValues[1].targetValue`) stehen am Panel; der Satz
   nennt den Wert («Service-Level 2: …»). Kein zweiter Hinweis über der Maske.
6. **Register «Versionen»** zeigt die SLA-Werte der gewählten Version im selben Panel, nur lesend.
7. **Liste:** Spalte «Service-Level» mit den ersten zwei Werten als Text ohne Zusatztext und «n
   weitere», auf kleinen Bildschirmen ausgeblendet wie Laufzeit und Positionen.

## Begründung

**Zu 1:** Positionen und SLA-Werte sind beide Listen von Werten am Vertrag; dasselbe Muster heisst
nichts Neues zu lernen. Ein Dialog statt einer Zeile zum Tippen, weil die Einheitenauswahl von der
Kennzahl abhängt und ein Text dazugehört.

**Zu 2:** Eine Ampel neben einem Zielwert behauptet eine Messung, die es nicht gibt (Backend
ADR-0136, Entscheidung 6).

**Zu 3:** Eine Auswahl, die nur Erlaubtes anbietet, ist ehrlicher als eine Fehlermeldung danach.

**Zu 5:** Der Feldname mit Index sagt dem Benutzer nichts, der Satz des Backends nennt die Nummer
des Werts; am Panel steht er dort, wo korrigiert wird.

## Verworfene Alternativen

**SLA-Werte als Zeilen im Positionen-Panel.** Verworfen: Positionen verrechnen, SLA-Werte nicht;
gemischt würden Summen und Werte verwechselt.

**Eingabe direkt in einer Tabelle statt im Dialog.** Verworfen: die Einheit hängt an der Kennzahl,
und der Text braucht Platz; im Dialog bleibt die Prüfung an einer Stelle wie bei den Positionen.

**Alle SLA-Werte in der Liste ausgeschrieben.** Verworfen: ein SLA mit sechs Prioritätsstufen
sprengt die Zeile. Zwei Werte und die Anzahl der übrigen reichen zum Erkennen; die Maske zeigt
alle.

**Farbige Hervorhebung strenger Werte** (99.9 % und mehr). Verworfen: auch das wäre eine Wertung,
die das Issue ausschliesst.

## Konsequenzen

- `lib/contract.ts` kennt den Katalog (`SLA_METRIC_LABELS`, `SLA_METRIC_UNITS`, `SLA_UNIT_LABELS`,
  `SLA_UNIT_RANGES`), `slaValueText`, `slaValuesLine`, `slaValueComplaints`, `withSlaMetric`,
  `withSlaValue`; `movePosition` verschiebt jede Liste.
- Neue Bausteine `pages/contract/ContractSlaValues.tsx` und `pages/contract/SlaValueDialog.tsx`.
- Der Katalog steht doppelt (Backend-Enums samt `CHECK` und diese Konstanten); eine neue Kennzahl
  braucht beide Seiten.
