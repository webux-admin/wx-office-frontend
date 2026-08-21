# ADR-0007 — Der Währungswechsel fragt nach dem Kurs, und «kein Recht» ist ein eigener Zustand

- **Status:** Angenommen
- **Datum:** 2026-08-22
- **Verhältnis:** revidiert drei Punkte von
  [ADR-0006](ADR-0006-kopfdaten-am-entwurf.md); im Übrigen bleibt ADR-0006 gültig.
- **Backend:** setzt das Verhalten aus `webux-office/docs/adr/ADR-0037` voraus — ein
  Währungswechsel rechnet die Beträge um, und `PUT /{belege}/{id}/payment` ersetzt die ganze
  Zahlungsvereinbarung.

## Kontext

Drei Stellen der Auftragsmaske versprachen etwas, das nicht eintrat.

**Der Wechseldialog konnte den Regelfall nicht abschliessen.** Das Ankreuzfeld «Beleg in EUR
führen» ist vorgegeben angekreuzt, der Dialog schickte also `currencyCode`, hatte aber kein
Feld für den Umrechnungskurs. Das Backend verlangt ihn bei jeder Fremdwährung. Genau der Fall,
für den die Partnerwährung eingeführt wurde — Entwurf in CHF, Kunde in EUR — endete damit
zuverlässig in einer roten Fehlerbox, und der Benutzer musste das Häkchen abwählen, wechseln
und die Währung danach in den Kopfdaten nachziehen.

**Das Währungsfeld in den Kopfdaten war rot.** `invalid` zeichnet im Designsystem einen
Eingabefehler: roter Rahmen, roter Hinweistext, `aria-invalid="true"`. Der Wert war aber
gültig und speicherbar; rot war nur die Folge, die er hat.

**«Kein Recht» war nicht gestaltet.** `editable = status === 'DRAFT' && can('ORDER_WRITE')`
fasst zwei verschiedene Gründe zusammen. Fehlte einem Benutzer auf einem Entwurf nur
`ORDER_WRITE`, schrieb die Kopfdaten-Sektion «Ausgestellte Belege ändern sich nicht mehr.» —
über einem Entwurf schlicht falsch —, und die Zahlungs-Sektion verschwand ersatzlos, wenn der
Beleg keine Kondition trug. Die Positionen machten es in derselben Maske richtig
(`readOnlyNote`).

Dazu Kleineres derselben Art: der Dialog behielt eine für Kunde A getroffene Wahl beim Wechsel
auf Kunde C, die Neuanlage behielt einen für einen EUR-Kunden getippten Kurs beim Wechsel auf
einen USD-Kunden, die Live-Region wurde zusammen mit ihrem Text eingehängt (und deshalb von
Screenreadern meist gar nicht gemeldet), und die angebotene Auswahl «Ohne Kondition» liess
sich nicht speichern.

## Entscheidung

**1. Der Wechseldialog fragt nach dem Kurs**, sobald der neue Kunde in einer Fremdwährung
fakturiert wird und das Häkchen steht: ein Feld «Umrechnungskurs» und eines «Kursdatum»,
beide direkt unter dem Ankreuzfeld. Ohne Kurs ist «Wechseln» gesperrt — die Maske schickt
nichts los, was sie schon vorher als unvollständig erkennt.

**2. «Beträge behalten» ist auch bei einem Währungswechsel wählbar.** Das Backend rechnet die
Beträge in beiden Modi um; `priceMode` entscheidet nur, ob zusätzlich die Preisliste des neuen
Kunden gelesen wird. Die deaktivierte Option und ihre Begründung entfallen.

**3. Die Kopfdaten-Sektion schickt immer `COPY`.** Sie ändert den Kunden nicht, hat also
keinen Grund, eine Preisliste zu befragen. Ein Währungswechsel wird als das angezeigt, was er
ist: ein neutraler Hinweis, dass alle Beträge — auch die von Hand geschriebenen — mit dem
Kurs umgerechnet werden. Kein `invalid`, kein `aria-invalid`.

**4. Beide neuen Sektionen nehmen `readOnlyNote`**, so wie die Positionen. Fehlt das Recht,
steht der Grund als Beschreibung der Sektion, und die Zahlungs-Sektion bleibt sichtbar, statt
kommentarlos zu verschwinden.

**5. Die Kopfdaten zeigen die Belegart**, schreibgeschützt. Ein Entwurf hat keine Nummer; ohne
sie sagte bisher nichts auf der Seite, welche Auftragsart er ist — obwohl sie Adresse,
Nummernkreis und Druckvorlage bestimmt.

**6. Live-Regionen stehen immer im Dokument** und wechseln nur ihren Text.

**7. Was für einen Kunden entschieden wurde, gilt nicht für den nächsten.** Eine andere
Kundenauswahl im Dialog setzt Häkchen, Preismodus, Kurs und Kursdatum auf die Vorgaben
zurück; in der Neuanlage wird der Kurs zusammen mit Sprache, Währung und Kondition
zurückgesetzt.

**8. «Ohne Kondition» ist eine speicherbare Antwort.** Die Zahlungs-Sektion und die Neuanlage
schicken die geleerte Auswahl mit; das Backend liest den Payload als ganze Vereinbarung.

## Begründung

**Eine Vorauswahl, die im Regelfall scheitert, ist keine Führung.** ADR-0006 hat das Häkchen
bewusst auf «angekreuzt» gestellt, weil das die Auflösung des Backends spiegelt. Das bleibt
richtig — aber dann muss der Dialog auch alles fragen, was dieser Weg braucht. Ein Kursfeld
ist zwei Zeilen; ein Fehlschlag mit anschliessender Nacharbeit in einer anderen Sektion ist
genau die zweistufige Bedienung, die ADR-0006 unter «Alternativen» verworfen hat.

**Rot heisst Fehler, und ein Fehler ist etwas, das der Benutzer beheben soll.** Eine Folge,
die er ausdrücklich ausgelöst hat, ist keine. Wer «Achtung, das hat Folgen» als
Fehlerzustand malt, bringt jemanden dazu, nach einem Fehler zu suchen, den es nicht gibt —
und ein Screenreader meldet ein gültiges Feld als fehlerhaft.

**«Kein Recht» ist ein eigener Zustand** (CLAUDE.md Abschnitt 4: Laden, leer, Fehler, kein
Recht). Die falsche Aussage ist dabei schlimmer als gar keine: wer «Ausgestellte Belege ändern
sich nicht mehr.» über einem Entwurf liest, sucht im Statusverlauf nach einer Ausstellung, die
nie stattgefunden hat.

**Der Grund, warum die Umrechnung nicht mehr `RECALCULATE` verlangt**, liegt im Backend und ist
dort begründet (ADR-0037): 150 CHF und 150 EUR sind verschiedene Beträge, aber der Unterschied
ist Arithmetik und keine Preisfrage. Die Maske hört damit auf, eine Preisentscheidung zu
erzwingen, die sie gar nicht treffen will.

## Alternativen

**Den Kurs im Dialog weglassen und die Währungsfrage ganz aus ihm herausnehmen.** Verworfen:
Die Währung folgt dem Kunden, und der Kunde wird hier gewechselt. Sie woanders zu fragen,
hiesse den Benutzer an eine zweite Stelle zu schicken für etwas, das aus dieser einen
Entscheidung folgt.

**Den Kurs automatisch von einem Kursdienst holen.** Verworfen: es gibt keine Kursquelle im
System, und der Kurs eines Belegs ist eine buchhalterisch verbindliche Angabe (OR 957a). Wer
ihn setzt, verantwortet ihn.

**Ein `ForbiddenNotice` statt einer Sektionsbeschreibung.** Verworfen für diesen Fall: der
Baustein ersetzt eine ganze Seite. Hier fehlt nicht der Zugang zur Maske, sondern nur das
Schreibrecht auf einer Sektion, deren Werte weiterhin gelesen werden dürfen.

**Das Ankreuzfeld standardmässig abwählen, solange kein Kursfeld da ist.** Verworfen: das war
der billige Ausweg. Er hätte den Standardweg richtig gemacht und den gemeinten Fall trotzdem
nicht bedienbar.

## Konsequenzen

- `ChangePartnerDialog` schickt `exchangeRate` und `exchangeRateDate` mit, wenn die Zielwährung
  nicht die Buchführungswährung ist; beim Wechsel **in** die Buchführungswährung braucht es
  keinen Kurs, dort ist er 1.
- `OrderHeaderPanel` schickt `priceMode: 'COPY'`. Wer die Preise des Kunden neu holen will,
  wechselt den Kunden — das ist die einzige Stelle, an der sich die Preisliste ändert.
- `OrderHeaderPanel` und `OrderPaymentPanel` nehmen `readOnlyNote`; `OrderPage` bestimmt den
  Text einmal und gibt ihn an alle drei Sektionen.
- `SalesDocument` trägt neu `languageLabel`, damit das Sprachfeld einen Namen zeigen kann,
  solange die Auswahlliste unterwegs ist. Für die Währung gibt es kein eingefrorenes Label —
  dort steht bis zum Eintreffen der Liste weiterhin der Code.
- Die Tests, die die alte Sperre festhielten
  (`changePartnerRefusesToKeepAmountsInAnotherCurrencyTest`,
  `orderHeaderRepricesOnACurrencyChangeTest`), prüfen jetzt das neue Verhalten.
