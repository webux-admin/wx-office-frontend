# ADR-0076 — Fester Vertragsbeginn und der Abo-Lauf nach der Gegenlese

- **Status:** Angenommen
- **Datum:** 2026-11-22
- **Verhältnis:** Ergänzt [ADR-0073](ADR-0073-vertragsstatus-schritte-und-versionen.md) und
  [ADR-0075](ADR-0075-abo-lauf-monat-vorschau-und-drei-listen.md). Setzt Backend ADR-0148 um
  (Gegenlese von Issue webux-admin/wx-office#109). Folgt den sichtbaren Zustandshinweisen aus
  [ADR-0065](ADR-0065-bank-einfach-mit-den-gemeinsamen-bausteinen.md) und den Tooltips aus
  [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md).

## Kontext

Das Backend hält den Beginn eines aktiven oder beendeten Vertrags fest (ADR-0148, Entscheidung 2)
und antwortet auf einen anderen Beginn mit 400 am Feld `startDate`. Die Vorschau des Abo-Laufs
trägt neu `vatLiable`, und Tage, die nach einem Intervallwechsel zu keiner Periode gehören,
kommen als Hinweis. Die Gegenlese fand in der Maske dazu: Kennzahlen des vorigen Monats unter dem
Titel des neuen, «zzgl. MWST» bei einem nicht MWST-pflichtigen Mandanten, den Fehler des Laufs
zweimal bei offenem Dialog und einen Leertext, der nur aktive Verträge nennt.

## Entscheidung

1. **«Beginn» ist ab der Aktivierung gesperrt.** In der Vertragsmaske ist das Feld bei `ACTIVE`
   und `ENDED` nicht eingebbar, trägt das Schloss (`locked`) mit dem Grund — die Perioden des
   Abo-Laufs zählen ab dem Beginn; für einen anderen Beginn beenden und neu anlegen — und zeigt
   **sichtbar** unter dem Feld «Steht fest seit der Aktivierung.» «Ende» bleibt offen; ein
   aktiver Vertrag lässt sich weiter verlängern. Im Entwurf bleibt «Beginn» frei.
2. **«zzgl.» und «inkl. MWST»** stehen bei den Positionen der Vorschau nur, wenn `vatLiable`
   gesetzt ist.
3. **Die Kennzahlen** (Entwürfe, Positionen, Übersprungene, Summe) erscheinen nur zu einem
   vollständigen Monat und nur, wenn die Antwort zu diesem Monat gehört — nicht, solange die
   Vorschau des vorigen Monats als Platzhalter stehen bleibt.
4. **Ein Fehler des Laufs steht einmal:** im Dialog, solange er offen ist; nach «Abbrechen» über
   der Seite. Ein neuer Start räumt den alten Fehler weg.
5. **Der Leertext** sagt «keine Periode eines laufenden Vertrags», weil ein beendeter Vertrag bis
   zu seinem letzten Tag verrechnet wird.
6. **Tage ohne Periode** brauchen keine eigene Anzeige: sie kommen als Satz des Backends und
   stehen in der bestehenden Liste «Hinweise», in Vorschau und Ergebnis.

## Begründung

**Sichtbar statt nur Tooltip** beim Beginn, weil es eine Sperre ist und kein Erklärsatz: wer ein
gesperrtes Feld nicht versteht, sucht den Fehler bei sich (ADR-0065, Entscheidung 5). Das Schloss
trägt den längeren Grund, die Zeile darunter den Zustand.

**Strenger als das Backend beim Schalter.** Backend ADR-0147, Entscheidung 10, lässt die Vorschau
ohne den Schalter `SUBSCRIPTION` zu, weil sie nichts schreibt. Die Maske tut das nicht und hängt
wie in ADR-0075, Entscheidung 1, ganz am Schalter: der Bildschirm ist der Ort, an dem der Lauf
gestartet wird, und eine Vorschau von Entwürfen, die bei ausgeschaltetem Lauf niemand erstellen
kann, beantwortet keine Frage, die jemand dort stellt. Die Verträge bleiben in ihrer eigenen
Maske lesbar, die geschriebenen Entwürfe in der Rechnungsliste.

## Verworfene Alternativen

**«Beginn» offen lassen und den 400 des Backends am Feld zeigen.** Verworfen: der Benutzer
tippt erst und erfährt dann, dass es nie ging. Die Regel hängt nur am Status, den die Maske kennt.

**Den Beginn im aktiven Vertrag ganz ausblenden.** Verworfen: er ist der Anker aller Perioden und
gehört sichtbar zum Vereinbarten.

**Die ganze Vorschau ausblenden, solange ein anderer Monat lädt.** Verworfen: die Tabelle hält den
Platz und verhindert ein Springen der Seite; falsch wären nur die Zahlen über ihr, die als Summe
des neuen Monats gelesen würden.

**Den Fehler des Laufs beim Abbrechen verwerfen.** Verworfen: wer den Dialog nach einem Fehler
schliesst, soll auf der Seite noch sehen, dass der Lauf nicht lief.

## Konsequenzen

- `ContractPage.tsx`: «Beginn» mit `locked` und `hint` ab der Aktivierung.
- `SubscriptionRunPage.tsx`: `vatLiable` aus der Vorschau, Kennzahlen nur ohne Platzhalter,
  Fehler einmal, Leertext; `lib/types.ts` kennt `vatLiable`.
- Tests: `ContractPage.test.tsx` (Beginn gesperrt, Verlängern offen, Entwurf frei),
  `SubscriptionRunPage.test.tsx` (Vorschau-Fehler, Lauf-Fehler 409 und 500, Abbrechen und Esc,
  MWST-Zusatz, Kennzahlen beim Monatswechsel und ohne Monat).
