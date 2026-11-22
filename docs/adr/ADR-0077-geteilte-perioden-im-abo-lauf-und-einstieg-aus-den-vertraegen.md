# ADR-0077 — Geteilte Perioden im Abo-Lauf und der Einstieg aus den Verträgen

- **Status:** Angenommen
- **Datum:** 2026-11-22
- **Verhältnis:** Ergänzt [ADR-0075](ADR-0075-abo-lauf-monat-vorschau-und-drei-listen.md) und
  [ADR-0076](ADR-0076-fester-vertragsbeginn-und-abo-lauf-nach-der-gegenlese.md). Setzt Backend
  ADR-0150 um (Issue webux-admin/wx-office#110).

## Kontext

Das Backend teilt eine Periode, in der der MWST-Satz nach dem ersten Tag wechselt: eine Position
des Vertrags wird zu mehreren Positionen desselben Entwurfs, je Satz eine, der Betrag nach
Kalendertagen (Backend ADR-0142, ADR-0150). Die Vorschau trägt dafür je Position die Liste
`parts` mit Tagen, Anteil, Satz und dem Anteilstext, dazu je Vertrag `invoiceText` — den Kopftext
«Vertrag V-00007, Version 2», den der Entwurf bekommt. Der Grund `VAT_RATE_CHANGES` entfällt, neu
ist `SPLIT_NOT_POSSIBLE`. Bisher erreichte man den Abo-Lauf nur über das Menü.

## Entscheidung

1. **Eine geteilte Position bleibt eine Zeile**, mit der ganzen Periode, Menge und Preis wie
   vereinbart und dem Kennzeichen «Geteilt nach Satz». Darunter, eingerückt, stehen die Teile als
   eigene Liste (`aria-label="Teilzeiträume"`): Zeitraum, Tage, Satz und Anteil — so, wie der
   Entwurf sie tragen wird.
2. **Eine ungeteilte Position nennt ihren Satz** neben «zzgl.» oder «inkl. MWST», nur für einen
   MWST-pflichtigen Mandanten.
3. **Der Kopftext** steht in der Aufklappung über den Positionen: «Kopftext der Rechnung: Vertrag
   V-00007, Version 2».
4. **«Positionen»** in der Tabelle zählt die Positionen des Entwurfs, eine geteilte Periode also je
   Satz — dieselbe Zahl wie `lineCount` der Kennzahlen und des Ergebnisses.
5. **Der Wechsel selbst** braucht keine eigene Anzeige über die Teile hinaus: der Satz des Backends
   steht in «Hinweise», in Vorschau und Ergebnis.
6. **Der Katalog der Gründe** verliert «Satzwechsel in der Periode» und bekommt «Teilung nicht
   möglich».
7. **Die Vertragsliste führt zum Abo-Lauf:** ein zweiter Knopf «Abo-Lauf» im Kopf, nur wenn der
   Mandant den Schalter `SUBSCRIPTION` hat und der Benutzer `SUBSCRIPTION_READ`.

## Begründung

**Eine Zeile je Position, die Teile darunter**, weil die Vorschau die Frage «was wird aus meinem
Vertrag» beantwortet. Wer die Teile als gleichrangige Zeilen sähe, hielte sie für drei
Vereinbarungen. Die Einrückung zeigt, dass sie zusammen die eine Position sind.

**Der Satz an der Position**, weil er bei einer geteilten Periode der Grund für die Teilung ist und
ohne den Vergleich mit einer ungeteilten nicht auffällt.

**Ein Knopf in der Vertragsliste**, weil die Liste der Ort ist, an dem man nach den Verträgen
fragt, die verrechnet werden sollen. Das Menü bleibt der zweite Weg.

## Verworfene Alternativen

**Die Teile als eigene Zeilen der Tabelle.** Verworfen: die Tabelle hat eine Zeile je Vertrag
(ADR-0075, verworfene Alternative «flache Tabelle»), und die Aufklappung hält die Zuordnung.

**Den Anteilstext des Backends statt Tage und Satz zeigen.** Verworfen für die Vorschau: der Text
ist für die Rechnung geschrieben und wiederholt die ganze Periode in jedem Teil. Tage, Satz und
Anteil lesen sich in einer Liste schneller. Der Text kommt trotzdem mit und steht im Entwurf.

**Einen Knopf «Abo-Lauf» je Vertrag in der Vertragsmaske.** Verworfen: der Lauf verrechnet alle
fälligen Verträge eines Monats, nicht einen (ADR-0075, Begründung «keine Auswahl einzelner
Verträge»). Ein Knopf an einem Vertrag weckte die Erwartung, nur diesen zu verrechnen.

**Den Knopf auch ohne den Schalter zeigen und auf die Sperrseite führen.** Verworfen: ein Weg, der
nur zu «ausgeschaltet» führt, ist keiner. Das Menü verhält sich gleich.

## Konsequenzen

- `lib/types.ts`: `SubscriptionPlannedPart`, `SubscriptionPlannedLine.parts`,
  `SubscriptionContractPlan.invoiceText`; `SubscriptionSkipReason` ohne `VAT_RATE_CHANGES`, mit
  `SPLIT_NOT_POSSIBLE`.
- `lib/subscription.ts`: `isSplitLine`, `draftLineCount`, Wort für den neuen Grund.
- `SubscriptionRunPage.tsx`: Teile, Satz und Kopftext in der Aufklappung; «Positionen» je Entwurf.
- `ContractListPage.tsx`: Knopf «Abo-Lauf».

## Abweichungen vom Issue

- Das Issue nennt «Vertragsliste mit Einstieg in den Abo-Lauf, Vorschau, Ergebnis mit den drei
  Listen». Vorschau und Ergebnis stehen seit #109 (ADR-0075); dieses ADR ergänzt die geteilten
  Perioden und den Einstieg.

## Offen

Nichts.
