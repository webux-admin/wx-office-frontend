# ADR-0014 — Lagerortauswahl erscheint erst ab zwei Lagerorten

- **Status:** Angenommen
- **Datum:** 2026-08-23

## Kontext

Jeder Mandant hat mindestens einen Lagerort: «HAUPT / Hauptlager» wird bei der Erstellung
angelegt ([ADR-0060](../../webux-office/docs/adr/ADR-0060-lager-modulschnitt-und-beleganschluss.md)
des Backends). Die meisten Mandanten werden nie einen zweiten anlegen.

Trotzdem bekommt fast jede Lagermaske ein Feld «Lagerort»: die Bestandsliste, die
Bewegungserfassung, die Zählliste, das Feld an der Belegart und später das Feld am einzelnen
Beleg. Bei einem einzigen Lagerort ist dieses Feld eine Auswahl ohne Alternative — es kostet
Platz, einen Tabulatorsprung und die Frage «muss ich hier etwas entscheiden?».

## Entscheidung

**Lagerortfeld und Lagerortspalte erscheinen erst, wenn der Mandant zwei oder mehr aktive
Lagerorte hat.** Bei einem einzigen bleiben sie unsichtbar, und der Vorgabe-Lagerort wird
stillschweigend verwendet.

Die Bedingung wird **aus den Daten abgeleitet** — `showsLocationChoice(locations)` in
`lib/inventory.ts` zählt die aktiven Lagerorte —, nicht aus einem Einstellungsschalter.

Die Regel gilt für alle Lagermasken und für das Lagerortfeld an der Belegart. Ausgenommen ist
naturgemäss die Lagerortmaske selbst: sie zeigt immer alle Lagerorte, auch wenn es nur einer
ist.

## Begründung

**Warum aus den Daten und nicht aus einem Schalter:** Ein Schalter «Mehrlagerbetrieb» kann von
der Wirklichkeit abweichen — eingeschaltet ohne zweiten Lagerort, oder ausgeschaltet mit drei.
Die Liste kann das nicht. Sie ist zugleich schon geladen, wo das Feld steht, also kostet die
Ableitung keine zusätzliche Anfrage.

**Warum «aktive» und nicht «alle»:** Ein deaktivierter Lagerort ist keine Wahl. Ein Mandant,
der sein Aussenlager geschlossen hat, soll das Feld wieder los sein.

**Warum die Schwelle bei zwei liegt:** Bei einem Lagerort gibt es nichts zu entscheiden, und
ein Feld, das nur eine Möglichkeit anbietet, wird als Pflichtangabe missverstanden.

Zu unterscheiden vom Mandantenschalter «Lager verwenden»: der entscheidet, ob es das Modul
für diesen Mandanten **überhaupt gibt**; diese Regel entscheidet, ob innerhalb des Moduls
**etwas zu wählen** ist. Beide sind unabhängig voneinander.

## Alternativen

- **Dauerhaft sichtbares Feld mit vorbelegtem Wert.** Verworfen: es füllt jede Maske mit einer
  Auswahl ohne Alternative und lenkt von den Feldern ab, in denen wirklich etwas zu entscheiden
  ist.
- **Ein Schalter «Mehrlagerbetrieb» in den Moduleinstellungen.** Verworfen: zweite Wahrheit
  neben den Daten, siehe oben.
- **Feld anzeigen, aber deaktivieren.** Verworfen: ein graues Feld wirft dieselbe Frage auf wie
  ein aktives und beantwortet sie nicht.

## Konsequenzen

- Wer den zweiten Lagerort anlegt, sieht die Felder ab dem nächsten Laden der Maske. Das ist
  gewollt: die Umstellung ist der Moment, in dem der Lagerort zur Entscheidung wird.
- Jede Maske, die ein Lagerortfeld bekommt, muss die Lagerortliste ohnehin laden. Das ist eine
  Anfrage mehr als ohne die Regel — sie wird über `stockLocationsKey(tenantId)` zwischen allen
  Masken geteilt, also fällt sie je Sitzung einmal an.
- Wo das Feld unsichtbar bleibt, muss der **Vorgabe-Lagerort** eingesetzt werden. Eine Maske,
  die stattdessen `null` schickt, verlässt sich darauf, dass der Server einsetzt — das ist eine
  zweite Stelle mit derselben Regel und deshalb zu vermeiden.
