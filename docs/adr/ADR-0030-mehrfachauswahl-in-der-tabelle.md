# ADR-0030 — Mehrfachauswahl in der Tabelle, und wo sie etwas auslöst

- **Status:** Angenommen
- **Datum:** 2026-08-29
- **Löst ab:** [ADR-0026](ADR-0026-mahnvorschlag-eine-zeile-ist-ein-brief.md) in **genau einem
  Punkt** — «Es gibt keine Auswahlspalte. `DataTable` bleibt unverändert.» Alles Übrige aus
  ADR-0026 bleibt in Kraft: eine Zeile ist ein Brief, das Übersprungene steht mit Grund in
  einem eigenen Abschnitt, das Banner nur für behebbare Gründe, der Stichtag im Kopf.

## Kontext

Das Backend hat die drei Teile des Ausbuchens gebaut: die Abrechnungsart am Mandanten, den
Vorgang «Ausbuchen» mit Grund, Buchungsdatum, Nachweis und festgehaltener MWST-Folge
([Backend-ADR-0101](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0101-ausbuchen-als-eigener-vorgang.md))
und den Sammellauf mit Zahlungstoleranz
([Backend-ADR-0102](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0102-zahlungstoleranz-und-sammellauf.md)).
Sichtbar ist davon nichts.

Randbedingungen:

- **Es gibt keine Maske für offene Posten.** `GET …/open-items` steht seit ADR-0024 und wurde
  von keiner Zeile gerufen; der offene Posten war bisher eine Eigenschaft *einer* Rechnung.
- **Mehrfachauswahl gibt es in dieser Anwendung nicht.** ADR-0026 hat sie ausdrücklich
  zurückgestellt: *«Eine Auswahl ohne Knopf ist Dekoration: man kreuzt an und nichts
  geschieht»* — und *«Sie ist nicht vergessen, sie ist verschoben, und zwar an die Stelle, an
  der sie etwas auslöst.»*
- **Der Sammellauf ist diese Stelle.** Er ist der Knopf, der damals fehlte.
- `DataTable` hält immer nur eine Seite und weiss nicht, was auf den anderen steht; eine Seite
  fasst 50 Zeilen.
- `Column<T>` trägt `header: string`, und der Tabellenkopf wird von `DataTable` gebaut.

## Entscheidung

**Die Auswahl ist ein Prop-Paar an `DataTable`**, nicht eine Spalte mit `render`:
`selected` / `onSelectedChange`, dazu `selectableRow?` und `selectionLabel?`. Die Tabelle
zeichnet die Spalte selbst als erste, mit einem Häkchen im Kopf.

**Die Auswahl überlebt Blättern und Sortieren, aber nicht eine Änderung der Einstellungen des
Laufs** — Toleranzart, Toleranzwert, Währung, Buchungsdatum, Grund, Mindestalter oder Kunde.
Eine solche Änderung wird nach Rückfrage verworfen.

**«Alle markieren» heisst «alle auf dieser Seite»**, steht so im vorgelesenen Namen des
Kopf-Häkchens, und der Server bekommt Ids — nie ein «alles».

**`CheckboxField` bekommt zwei optionale Props**: `labelHidden` legt den Text mit `sr-only`,
`indeterminate` setzt die DOM-Eigenschaft und zeichnet einen Strich statt eines Hakens.

**Ein Klick auf die Zeile schaltet die Auswahl nicht um, ein Klick auf das Häkchen navigiert
nicht.**

## Begründung

**Ein Prop-Paar, weil ein Häkchen im Tabellenkopf über die Spalten-API nicht erreichbar ist.**
`Column.header` ist ein `string`, und den Kopf baut `DataTable`. Eine Auswahl als Spalte mit
`render` käme ohne Kopf-Häkchen aus, jede Maske müsste dieselben zwanzig Zeilen wiederholen,
und `keyOf` wäre zweimal definiert — einmal für die Tabelle und einmal für die Auswahl.

**Die Auswahl überlebt das Blättern, weil `PriceEntryPage` es vormacht** und aus demselben
Grund: jemand kreuzt die eine Seite an, blättert, kreuzt weiter und bucht einmal. Sie überlebt
eine Änderung der Einstellungen **nicht**, weil danach ein anderer Vorschlag auf dem Bildschirm
steht — dieselbe Unterscheidung, die die Preiserfassung zwischen «Suche» und «Ziel und
Zeitraum» zieht. Gefragt wird vorher, nicht hinterher.

**«Alle auf dieser Seite» ist die einzig ehrliche Beschriftung.** Der Client hält eine Seite.
Ein «alles» wäre eine zweite, serverseitige Auswahlsemantik neben der Filterung — und niemand
könnte dem Bestätigungsdialog sagen, wie viele Belege er nennt.

**Ein teilweise gefülltes Kopf-Häkchen braucht `indeterminate`.** Ohne diese Eigenschaft
müsste der Kopf «alle» oder «keine» behaupten, wo weder das eine noch das andere stimmt.
`indeterminate` ist nur eine DOM-Eigenschaft und kein Attribut, deshalb wird sie über die
`ref`-Funktion des Inputs gesetzt.

**Der Zeilenklick brauchte keine Sonderbehandlung.** `openRow` steigt schon aus, sobald das
Klickziel in `a, button, input, select, textarea, label` liegt. Umgekehrt gilt: die Zeile
führt weiter zur Rechnung, und zwei Bedeutungen für denselben Klick wären eine zu viel.

## Alternativen

**Die Auswahl als Spalte mit `render`-Funktion.** Verworfen: kein Kopf-Häkchen, zwanzig Zeilen
je Maske, `keyOf` doppelt.

**Ein drittes handgeschriebenes `<table>`, wie `DunningWorklistPage` es hat.** Verworfen. Jene
Tabelle ist handgeschrieben, weil `DataTable` weder Aufklappen noch Auswahl konnte; die Auswahl
kann sie jetzt, und ein weiteres Gerüst wäre ein drittes Muster für dasselbe.

**Betrag und Prozentsatz gleichzeitig, mit dem kleineren der beiden Werte (MIN).** SAP und
Business Central machen es so, und bei sehr verschieden grossen Rechnungen ist es die genauere
Regel. Verworfen: zwei Felder, von denen eines stillschweigend gewinnt, sind im
Bestätigungsdialog nicht erklärbar, und die Maske müsste die Minimumsbildung nachrechnen, die
das Backend ohnehin macht. **Steht hier, damit es in einem Jahr nicht erneut vorgeschlagen
wird.**

**Den Sammellauf als Knopf auf der Liste der offenen Posten statt als eigenen Menüeintrag.**
Verworfen: ein Lauf über eine ganze Seite ist ein Stück Arbeit mit eigenen Einstellungen und
eigenem Nachweis, kein Detail einer Liste. Der Knopf steht trotzdem im Kopf der Liste, weil man
von dort hinkommt.

**Eine Summenzeile unter der Liste der offenen Posten.** Verworfen: der Filter kennt keine
Währung, und eine Spalte mit CHF- und EUR-Zeilen lässt sich nicht addieren. Der Vorschlag des
Sammellaufs hat eine Kopfzeile mit Summen — dort trägt der Lauf genau eine Währung.

**Das Ausbuchen als weitere Art im Zahlungsdialog.** Verworfen, und das ist die wichtigste
Trennung dieser Arbeit: eine Zahlung trägt ein **Valutadatum** und darf höher sein als der
offene Betrag; eine Ausbuchung trägt ein **Buchungsdatum**, das die Periode der MWST-Korrektur
bestimmt, und mehr als offen auszubuchen ergibt keinen Sinn. Zwei Vorgänge, zwei Rechte, zwei
Dialoge.

## Konsequenzen

- `DataTable` zeichnet die Auswahlspalte nur, wenn beide Props gesetzt sind. Jede bestehende
  Maske bleibt unverändert; die 27 Fälle von `navigation.test.ts` und alle Tabellenmasken sind
  unberührt grün.
- **Die Mahnreihe findet die Spalte vor.** ADR-0026 hatte sie «an die Stelle verschoben, an der
  sie etwas auslöst», und meinte das Ausstellen der Mahnung. Was das Mahnwesen mit der Spalte
  tut, entscheidet dessen eigene Reihe — hier steht dazu nichts weiter.
- Zwei neue Einträge unter *Verkauf*, beide ohne `module`: das Ausbuchen hängt an `document`
  und ist kein schaltbarer Baustein, anders als der Mahnvorschlag daneben.
- **Der Prozentsatz bezieht sich auf das, was tatsächlich eingegangen ist** — nicht auf das
  Belegtotal und nicht auf den offenen Restbetrag. Der Hinweis unter dem Feld sagt es, weil
  genau diese Bezugsgrösse der häufigste Irrtum in diesem Thema ist; entschieden hat das
  Backend-ADR-0102.
- Der Zähler im Seitenkopf und die Ergebniszeile sind `aria-live`, wie in der Preiserfassung.
- **Hier wird nichts nachgerechnet.** Welcher Posten im Vorschlag steht, was der offene Betrag
  ist und was ein Lauf gebucht hat, sind Antworten des Backends. Was `writeOffRun.ts` prüft,
  ist dieselbe Regel in derselben Sprache und nie eine zweite.
