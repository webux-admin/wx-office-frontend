# ADR-0027 — Mahnungen ausstellen: Auswahl von Briefen, ein Sammel-PDF, Rückzug als Register

- **Status:** Angenommen
- **Datum:** 2026-08-29

## Kontext

Das Backend stellt jetzt Mahnungen aus: nummeriert, archiviert, mit QR-Zahlteil je gemahnter
Rechnung
([Backend-ADR-0094](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0094-die-mahnung-als-nummerierter-archivierter-beleg.md)).

Randbedingungen:

- **Ein Brief ist die Einheit.** Auch die Sammelmahnung über drei Rechnungen ist **eine**
  Mahnung mit einer Nummer.
- **Der Server bestimmt beim Ausstellen neu, was hinausgeht.** Ein Aufruf kann nur einschränken,
  nicht bestimmen — und nur auf **ganze** Briefe.
- **Der Stichtag ist nicht das Ausstellungsdatum.** Das kommt aus der Uhr des Servers.
- **Eine Mahnung ist nicht löschbar**, nur zurückziehbar, und das mit eigenem Recht
  `DUNNING_WITHDRAW`.
- **Das Ergebnis eines Laufs ist ein Stapel Briefe**, der in Umschläge geht.
- [ADR-0026](ADR-0026-mahnvorschlag-eine-zeile-ist-ein-brief.md) hat den Mahnvorschlag
  ausdrücklich **ohne** Auswahlspalte gebaut, weil es noch nichts auszustellen gab.

## Entscheidung

**Die Auswahlspalte kommt jetzt in den Mahnvorschlag** — als Kästchen je Zeile, also je
**Brief**, und nur für Benutzer mit `DUNNING_RUN`. `DataTable` bleibt weiterhin unverändert; die
Liste zeichnet ihre Tabelle ohnehin selbst.

**Nichts angekreuzt heisst «alles, was die Regel zulässt».** Der Knopf im Seitenkopf heisst dann
*Alle mahnen*, sonst *n Briefe mahnen*.

**Ein Bestätigungsdialog vor dem Ausstellen**, der beide Zahlen nennt — Briefe **und**
Rechnungen — und drei Sätze dazu: dass jede Mahnung eine lückenlose Nummer bekommt und nicht
zurückgeholt werden kann, dass das Ausstellungsdatum der heutige Tag ist, und dass der Server im
Moment des Ausstellens neu entscheidet.

**Beim Einschränken werden nur die Belegnummern der angekreuzten Briefe gesendet, sonst gar
nichts.** Eine leere Liste bedeutet «alles» — die Ids **aller** Zeilen zu senden wäre etwas
anderes.

**Das Ergebnis erscheint als Panel über der Liste**, mit einem Knopf *Sammel-PDF* und der
Aufzählung der ausgestellten Nummern. Fehlgeschlagene Briefe stehen darunter, mit dem Satz, dass
jeder Fehler bei seinem Brief geblieben ist.

**Die Mahnungen einer Rechnung stehen als Register «Mahnungen» am Beleg**, neben «Zahlungen» —
nach dem Muster von [ADR-0024](ADR-0024-zahlungen-als-register-der-rechnung.md). Dort: PDF
öffnen, *Jetzt mahnen* (mit `DUNNING_RUN`), *Zurückziehen* (mit `DUNNING_WITHDRAW`).

**Eine zurückgezogene Mahnung bleibt in der Liste**, durchgestrichen, mit Zeitpunkt und Grund.

**Das Register trägt keinen Modulschalter.** Es erscheint bei `DUNNING_READ` und bei
ausgestellter Rechnung, auch wenn der Mandant das Mahnwesen abgeschaltet hat.

**Eine eigene Seite «Mahnungen» unter *Verkauf*** listet alles Ausgestellte, ebenfalls **ohne**
Modulschalter.

**Der Rückzugsdialog verlangt einen Grund** und schaltet den Knopf frei, sobald etwas darin
steht.

## Begründung

**Die Auswahl je Brief**, weil das die Einheit ist, die hinausgeht. Eine Liste, in der man
Rechnungen ankreuzt und Briefe bekommt, nennt im Bestätigungsdialog zwangsläufig zwei
verschiedene Zahlen — und «zwei der drei Rechnungen desselben Briefs» hat keine Bedeutung. Der
Server weist eine solche Einschränkung ohnehin zurück.

**Nichts angekreuzt heisst alles**, weil das der Alltag ist: einmal in der Woche hinschauen und
freigeben. Ein Ablauf, der erst zwanzig Kästchen verlangt, wird umgangen.

**Beide Zahlen im Dialog**, weil «12 Mahnungen» und «31 Rechnungen» dieselbe Freigabe
beschreiben und der Benutzer wissen muss, welche der beiden gleich Porto kostet.

**Nur die angekreuzten Ids senden**, weil eine mitgeschickte Vollliste eine im Browser getroffene
Entscheidung wäre. Zwischen Anzeige und Klick können Minuten liegen; in dieser Zeit kann eine
Rechnung bezahlt worden sein. Wer alles will, sagt «alles» und lässt den Server entscheiden.

**Das Ergebnis über der Liste statt in einem zweiten Dialog**, weil der nächste Schritt das
Drucken ist und nicht das Wegklicken. Es bleibt stehen, bis der Benutzer es schliesst.

**Ein Sammel-PDF**, weil der Stapel in Umschläge geht. Neun Einzeldownloads wären für den
Papierweg kein fertiger Ablauf.

**Fehlgeschlagene Briefe genannt**, samt der Zusicherung, dass die davor ausgestellt bleiben.
Sonst ist die naheliegende Annahme, der ganze Lauf sei fehlgeschlagen — und jemand startet ihn
noch einmal.

**Das Register am Beleg**, weil «wurde diese Rechnung schon gemahnt» beim Beleg gefragt wird,
nicht in einer Liste über alles. Die zweite Frage — «was ist insgesamt hinausgegangen» — ist die
Seite.

**Zurückgezogene bleiben stehen, durchgestrichen**, weil sie beim Kunden liegen. Sie
verschwinden zu lassen wäre eine Fälschung der Geschäftskorrespondenz. Der Durchstrich ist die
schnellste Art zu zeigen, dass sie nicht mehr zählt.

**Kein Modulschalter auf dem Register und der Liste**, weil eine ausgestellte Mahnung
Geschäftskorrespondenz mit zehnjähriger Aufbewahrungspflicht ist. Ein Schalter, der sie
unsichtbar macht, verspricht mehr, als er darf. Das Ausstellen ist gesperrt — das reicht.

**Ein Grund beim Rückzug ist Pflicht**, und der Knopf ist bis dahin ausgeschaltet. Der Server
verlangt ihn ohnehin; ein Knopf, der erst nach der Fehlermeldung aufhört zu leuchten, lehrt
niemanden etwas.

## Alternativen

**Die Auswahl über `DataTable` mit einer eingebauten Auswahlspalte.** Verworfen, wie schon in
ADR-0026: die Liste zeichnet ihre Tabelle selbst, weil sie aufklappbare Zeilen hat, und eine
Auswahlspalte in `DataTable` würde von einer einzigen Maske getrieben.

**Ohne Auswahl: nur «alles mahnen».** Verworfen — ein einzelner Kunde, der heute nicht gemahnt
werden soll, ist der häufigste Sonderfall, und ihn nur über einen Mahnstopp lösen zu können wäre
ein grosser Hebel für eine kleine Ausnahme.

**Auswahl je Rechnung statt je Brief.** Verworfen: siehe Begründung, und der Server nimmt sie
nicht an.

**Die Ids aller Zeilen mitschicken, wenn nichts angekreuzt ist.** Verworfen: das wäre eine im
Browser eingefrorene Entscheidung.

**Das Ergebnis in einem Dialog.** Verworfen: der Benutzer soll drucken, nicht wegklicken.

**Je Brief ein eigener Download.** Verworfen: neun Dateien sind kein Stapel.

**Den Rückzug ohne Dialog, direkt am Knopf.** Verworfen: er nimmt einem Kunden eine Mahnstufe
weg, und der Grund ist Pflicht.

**Eine eigene Seite je Mahnung.** Verworfen: es gibt nichts zu bearbeiten. Was es zu sehen gibt,
ist das PDF — und das ist einen Klick entfernt.

**Das Register nur bei eingeschaltetem Modul.** Verworfen: siehe Begründung.

**Den Mahnstand als Spalte in der Rechnungsliste.** Verworfen, wie in ADR-0026: dafür gibt es
`fetchDunningStates`, und die Liste müsste für jede Seite nachfragen. Kommt, wenn jemand es
verlangt — nicht auf Vorrat.

## Konsequenzen

- **Ab hier gehen aus dem Frontend Mahnungen hinaus.** Der Weg ist: Mahnvorschlag → Auswahl →
  Bestätigung → Sammel-PDF.
- **Der Mahnvorschlag zeichnet seine Tabelle weiterhin selbst.** Die Auswahlspalte ist elf
  Zeilen JSX, und `DataTable` bleibt frei von einer Anforderung, die nur diese Maske hat.
- **`DUNNING_RIGHTS` hat jetzt fünf Einträge.** `withdraw` ist bewusst nicht `run`.
- **Der Kanal ist immer `PRINT`.** Das Feld steht im Typ; sobald der Mailversand kommt, zeigt
  die Liste ihn an.
- **Ein Mahnstopp lässt sich noch nicht setzen.** Er wirkt bereits im Backend; die Maske kommt.
