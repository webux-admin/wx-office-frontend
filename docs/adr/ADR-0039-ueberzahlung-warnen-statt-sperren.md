# ADR-0039 — Überzahlung: warnen statt sperren, und drei Ausgänge nach dem Erfassen

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** setzt Backend-ADR-0105 um. Ändert **nichts** an der Trennung von Erfassen und
  Ausbuchen aus [ADR-0024](ADR-0024-zahlungen-als-register-der-rechnung.md) — es bleiben zwei
  Vorgänge, zwei Rechte, zwei Dialoge.

## Kontext

Der Erfassungsdialog trug zur Überzahlung genau einen statischen Satz, der nie eine Zahl
nannte:

> «Mehr als offen ist erlaubt: die Überzahlung wird als Guthaben ausgewiesen.»

Wer statt 1'000.00 versehentlich 100'000.00 tippt, las diesen Satz und bekam ein Guthaben von
99'000.00. Der Ausbuchungsdialog liess für den Grund «Überzahlung einbehalten» **jede** Höhe zu
— die Regel sagte es ausdrücklich: «An overpayment kept is the one reason that moves the other
way, so it has no ceiling here».

Randbedingungen:

- **[ADR-0091](../../../wx-office/docs/adr/ADR-0091-offener-posten-und-zahlungserfassung.md)
  bleibt:** «Die Maske warnt, sperrt aber nicht.» Ein Kunde, der zwanzig Rappen zu viel
  überweist, darf kein Fehlerdialog sein.
- **Die Zone rechnet der Server.** Dieselbe Regel muss gelten, wenn der Kontoauszug-Import sie
  fragt.
- **OR Art. 62**: bis jemand ihn einbehält, gehört der Überschuss dem Kunden.

## Entscheidung

**Drei Dinge, und keine Sperre unter ihnen.**

### 1. Die Hinweiszeile wird gerechnet

Statt des statischen Satzes eine Zeile, die die Differenz nennt und sagt, was passieren wird:

| Zone | Was sie sagt |
|---|---|
| Rundung | «0.05 CHF zu viel. Das ist eine Rundung.» |
| Einbehalt vorgeschlagen | «0.40 CHF zu viel. Vorschlag: einbehalten — das ist zusätzliches Entgelt.» |
| Nur Guthaben, Einbehalt noch möglich | «2.00 CHF zu viel. Der Betrag bleibt ein Guthaben des Kunden; einbehalten geht nur mit Bemerkung.» |
| Über dem Deckel | «98'702.80 CHF zu viel. Über 5.00 CHF lässt sich nichts einbehalten — der Betrag bleibt ein Guthaben des Kunden.» |

Abgefragt über `useDebouncedValue`, damit nicht jede getippte Ziffer eine Anfrage auslöst.

**Die Schaltfläche bleibt aktiv.** `amountInvalid` ist unverändert.

### 2. Drei Ausgänge nach dem Erfassen

Steht am Beleg ein Überschuss, zeigt das Panel eine Meldung mit der Differenz und:

- **Als Guthaben stehen lassen** — die Vorauswahl, und sie **braucht keinen Klick**. Wer nichts
  tut, hat sie gewählt.
- **Einbehalten** — öffnet den Ausbuchungsdialog mit vorbelegtem Grund und Betrag. Nur mit
  `INVOICE_WRITE_OFF`.
- **Zurückzahlen** — führt zum Guthabenbildschirm aus [ADR-0038](ADR-0038-guthaben-als-register-mit-eigenen-summen.md).

Dazu ein Satz, der die häufigste Verwechslung ausräumt: **ein einbehaltener Überschuss ist
zusätzliches Entgelt (MWSTG Art. 24 Abs. 1) — kein steuerfreies Trinkgeld.**

### 3. Der Ausbuchungsdialog bekommt eine Obergrenze

`writeOffComplaint` kannte für `UEBERZAHLUNG` keine Grenze. Jetzt: über `keepMaximum` abgewiesen,
über `keepLimit` ohne Bemerkung abgewiesen. `proposedWriteOff` lernt einen zweiten Fall — bei
vorgewähltem Grund `UEBERZAHLUNG` wird der **Überschuss** vorbelegt, also der negative offene
Betrag mit umgekehrtem Vorzeichen.

**Die Grenzen kommen vom Server**, aus derselben Antwort wie die Zone. Fehlen sie, sagt die
Maske nichts über sie — und der Server weist trotzdem ab.

### 4. Die drei Grenzen stehen in der Mandantenmaske

Im Panel «Vorgaben für Belege», unmittelbar neben Rappenrundung und Rundungsschritt, weil es
dieselbe Familie ist. Mit dem Satz darunter, der die zwei Entscheidungen nennt: absolute
Beträge statt Prozentsatz, aufsteigende Kette, Vergleich ohne Umrechnung.

## Begründung

**Warum die Zeile gerechnet ist und nicht statisch.** Ein Satz, der nie eine Zahl nennt, wird
nach dem dritten Mal nicht mehr gelesen. Eine Zeile, die «98'702.80 CHF zu viel» sagt, wird
gelesen — und genau dieser Fall ist der, den das Issue verhindern soll.

**Warum sie trotzdem nicht sperrt.** Der Tippfehler ist selten, die knappe Überzahlung häufig.
Eine Sperre bestraft den häufigen Fall, um den seltenen zu verhindern, und sie verhindert ihn
nicht einmal: die Zahlung ist ja eingegangen. Was fehlt, ist nicht eine Sperre, sondern eine
Auskunft.

**Warum die Zone der Server rechnet.** Dieselbe Regel muss gelten, wenn ein Kontoauszug-Import
sie fragt. Zwei Implementierungen derselben Grenze driften auseinander, und diese entscheidet
über fremdes Geld.

**Warum «stehen lassen» keinen Klick braucht.** Bis jemand den Überschuss einbehält, gehört er
dem Kunden (OR Art. 62). Der Zustand ohne Entscheidung ist der richtige Zustand — eine
Vorauswahl, die man wegklicken muss, machte aus dem Nichtstun eine Handlung.

## Verworfene Alternativen

**Die Schaltfläche sperren.** Widerspricht ADR-0091 und bestraft den häufigen Fall.

**Die drei Ausgänge als Auswahl im Zahlungsdialog.** Erfassen und Ausbuchen sind zwei Vorgänge,
zwei Rechte und zwei Dialoge — der Dateikopf des Panels schreibt es aus. Ein Ausbuchungsgrund
im Zahlungsdialog wäre der Anfang davon, beide zu vermischen.

**Die Zone im Frontend rechnen**, aus drei Grenzen, die mit dem offenen Posten mitkommen. Spart
einen Endpunkt und kostet eine zweite Wahrheit.

**Die Hinweiszeile bei jedem Tastendruck abfragen.** Ohne Debounce sendet eine getippte Zahl
sieben Anfragen, von denen sechs veraltet sind, bevor die Antwort da ist.

**Eine Meldung, die den Überschuss automatisch als Guthaben markiert.** Es gibt nichts zu
markieren: ein negativer offener Posten **ist** das Guthaben.

## Konsequenzen

- `DocumentReceivablePanel` hat zum ersten Mal einen eigenen Test (`…test.tsx`). Er hält beides
  fest: dass die Zeile die Differenz nennt, **und** dass die Schaltfläche dabei aktiv bleibt.
- `writeOffComplaint` und `proposedWriteOff` bekommen je einen optionalen Parameter mehr. Ohne
  sie verhalten sie sich wie bisher, damit kein Aufrufer stillschweigend die Grenze verliert.
- Der Guthabenbildschirm aus ADR-0038 ist das Ziel von «Zurückzahlen» — die beiden Reihen
  hängen ab hier zusammen.
- **Der Rechtekatalog ist unverändert.** Die Auskunft läuft auf `INVOICE_READ`.

## Offen

- **Grenzen je Währung.** Verglichen wird unverändert in der Währung des Belegs; 1.00 heisst in
  CHF und in EUR nicht dasselbe. Eine Umrechnung bräuchte Kurs und Kursdatum.
- **Eine Mitteilung an den Kunden** nach OR Art. 64 gibt es nicht. Wer die Überzahlung anzeigt,
  nimmt dem Empfänger den Gutglaubensschutz — ab welchem Betrag das geschehen muss, ist offen.
