# ADR-0080 — Die Gutschrift nach der Gegenlese: Vorschlag vom Server, Guthaben zurückzahlen, Belege statt Rechnungen

- **Status:** Angenommen
- **Datum:** 2026-11-23
- **Verhältnis:** Präzisiert [ADR-0079](ADR-0079-gutschrift-aus-der-rechnung.md) (Entscheidung 2:
  was der Dialog vorbelegt). Löst den Punkt «Rückzahlung aus der Rechnungsmaske» aus Backend
  ADR-0155, Abschnitt «Offen», ein. Setzt Backend ADR-0156 um (Gegenlese von Issue
  webux-admin/wx-office#112).

## Kontext

Die Gegenlese der Gutschrift hat im Frontend drei Stellen gefunden:

1. **Der Dialog belegte mit `fullCreditUnitPrice` vor** — dem Preis, der die Rechnungsposition
   ganz gutschreibt. Mit Belegrabatt, Rabattzeile, schon Gutgeschriebenem oder einer Ausbuchung
   war das mehr, als die Rechnung noch hergab, und «alles ankreuzen» wurde abgewiesen. Das
   Backend liefert jetzt `proposedQuantity` und `proposedUnitPrice`, die angekreuzt die Rechnung
   exakt schliessen, und `writtenOff` je Satz und im Ganzen.
2. **Eine bezahlte, danach gutgeschriebene Rechnung** zeigte «zu viel bezahlt» mit «Einbehalten»
   und «Zurückzahlen» über das Kundenguthaben. Beides ist für ein Guthaben aus einer Gutschrift
   falsch: Einbehalten wäre zusätzliches Entgelt und höbe die Gutschrift auf, und hinter dem
   Kundenguthaben auf 2030 steht ein Zahlungseingang, den es hier nicht gibt (Backend ADR-0155,
   Entscheidung 6).
3. **Das Register «Nicht gebucht»** nannte alles «Rechnungen» und summierte eine Gutschrift mit
   Plus. Das Backend liefert den Betrag jetzt mit dem Vorzeichen seiner Wirkung auf 1100 und die
   Art in Worten (`label`).

Dazu zeigte die Gutschriftmaske «Positionen bearbeiten…» auch ohne das Leserecht der Rechnung,
obwohl der Dialog `creditable` liest und dieser Endpunkt `INVOICE_READ` verlangt.

## Entscheidung

### 1. Der Dialog belegt mit dem Vorschlag des Servers vor

`creditNoteRowsOf` nimmt Menge und Preis aus `proposedQuantity` und `proposedUnitPrice`. Wo
nichts mehr übrig ist, steht 0 im Preis, und das Häkchen führt zur Meldung «Der Preis muss
grösser als null sein». Der Satz über den Zeilen nennt, was ausgebucht oder abgezogen wurde,
damit «nichts mehr übrig» nach einem Debitorenverlust nicht als «vollständig gutgeschrieben»
gelesen wird.

### 2. Ein Guthaben aus einer Gutschrift wird zurückgezahlt

Steht auf der Rechnung ein Überschuss und eine Ausgleichszeile einer Gutschrift, die noch zählt
(`hasStandingCreditNote`), zeigt das Register «Zahlungen» die Meldung «Guthaben aus
Gutschrift»: ohne «Einbehalten», ohne «Zurückzahlen», mit «Zahlung erfassen», vorbefüllt mit dem
negativen Überschuss. Das Abzeichen sagt «Guthaben aus Gutschrift» statt «überzahlt». Steht ein
Teil des Überschusses aus einer Überzahlung daneben, gilt die Meldung der Gutschrift: der ganze
Überschuss wird zurückgezahlt oder bleibt stehen.

### 3. «Nicht gebucht» spricht von Belegen

Das Register zeigt eine Spalte «Art» aus `label`, sagt «Belege» statt «Rechnungen», und die
Summe im Dialog heisst «zusammen … auf dem Sammelkonto». `invoiceCountText` heisst
`documentCountText` und zählt «Beleg» und «Belege». Gerechnet wird nichts neu; `chosenTotal`
addiert die Beträge, wie sie kommen.

### 4. «Positionen bearbeiten…» nur mit dem Leserecht der Rechnung

Die Gutschriftmaske zeigt den Knopf nur, wenn auch `INVOICE_READ` vorhanden ist.

## Begründung

**Der Vorschlag vom Server, weil die Grenze dort steht.** Was ADR-0079 für die Grenze begründet
hat, gilt für den Vorschlag erst recht: Belegrabatt, Rabattzeilen, Ausbuchungen und die Rundung
einer Zeile im Browser nachzubauen gäbe eine zweite Rechnung derselben Grenze.

**Zurückzahlen statt Einbehalten, weil kein Geld zu viel kam.** Der Kunde hat genau bezahlt, was
die Rechnung verlangte; erst die Gutschrift hat den Betrag gesenkt. Die Überzahlungsmeldung ist
für Geld gemacht, das zu viel ankam (Backend ADR-0105) — hier kam keines.

**«Belege», weil die Liste mehr als Rechnungen enthält** und eine Summe mit falschem Vorzeichen
einen Lauf grösser aussehen lässt, als er auf 1100 ist.

## Verworfene Alternativen

- **Den Vorschlag im Browser aus `remaining` je Satz ausrechnen.** Verworfen, siehe Begründung.
- **Bei gemischtem Überschuss (Überzahlung und Gutschrift) beide Meldungen zeigen.** Verworfen:
  zwei Meldungen über denselben Betrag mit verschiedenen Wegen verwirren mehr, als sie klären;
  der seltene Fall wird über «Zahlung erfassen» mit einem angepassten Betrag gelöst.
- **«Zurückzahlen» über das Kundenguthaben auch hier anbieten.** Verworfen: das Kundenguthaben
  ist ein Zahlungseingang, der nicht verbraucht ist (Backend ADR-0104); hinter einer Gutschrift
  steht keiner.
- **Den Knopf «Positionen bearbeiten…» stehen lassen und die 403 im Dialog zeigen.** Verworfen:
  ein Knopf, der sicher scheitert, ist schlechter als keiner.

## Konsequenzen

- `CreditableLine` trägt `proposedQuantity` und `proposedUnitPrice` statt `fullCreditUnitPrice`,
  `CreditableInvoice` und `CreditableGroup` tragen `writtenOff`; `UnpostedSource` trägt `label`.
- Eine Gutschrift ohne `INVOICE_READ` lässt sich nur noch als Entwurf löschen, ausstellen oder
  drucken, nicht umschreiben.

## Abweichungen vom Issue

Keine.

## Offen

- Versand der Gutschrift per E-Mail aus ihrer Maske (aus ADR-0079).
