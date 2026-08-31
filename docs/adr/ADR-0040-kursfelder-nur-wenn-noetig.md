# ADR-0040 — Kursfelder nur, wenn sie gebraucht werden

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** setzt Backend-ADR-0106 um. Ändert nichts an
  [ADR-0024](ADR-0024-zahlungen-als-register-der-rechnung.md) und nichts an
  [ADR-0039](ADR-0039-ueberzahlung-warnen-statt-sperren.md) — der Dialog bekommt Felder dazu,
  keine neue Aufgabe.

## Kontext

Der Erfassungsdialog beschriftete Betrag und Beschreibung fest mit der Belegwährung: «Betrag in
CHF», «Beträge in CHF, wie die Rechnung». Eine andere Währung war nicht vorgesehen, weil das
Backend sie abwies.

Seit Backend-ADR-0106 darf eine Zahlung auf eine andere Währung lauten, wenn Kurs und Kursdatum
dabei sind. Damit braucht der Dialog vier Felder mehr — und die meisten Benutzer werden sie nie
sehen.

## Entscheidung

**Die drei Kursfelder erscheinen nur, wenn die gewählte Währung von der Belegwährung
abweicht.** Solange sie gleich sind, ist der Dialog exakt der von gestern.

| Zustand | Was zu sehen ist |
|---|---|
| Währung = Belegwährung | Betrag, Währung, Valutadatum, Notiz — wie bisher, plus die Überzahlungszeile aus ADR-0039 |
| Währung ≠ Belegwährung | dazu **Kurs**, **Kurs je** (1 / 100) und **Kursdatum**, in einem eigenen Block, mit Vorschau |

Dazu:

- **Das Währungsfeld ist mit der Belegwährung vorbelegt.** Wer nichts ändert, merkt nichts.
- **Eine Vorschauzeile** rechnet mit: «940.00 CHF × 1.060900 = 997.25 EUR». **Reine Anzeige** —
  gerechnet wird auf dem Server.
- **Speichern ist gesperrt**, solange Kurs oder Kursdatum fehlen. Nicht als eigene Meinung: der
  Server weist genau das ab, und ein Aufruf, dessen Antwort feststeht, muss nicht hinausgehen.
- **Die Historienzeile zeigt den Originalbetrag klein darunter**, wo er abweicht.
- **`BANK_CHARGE` und `EXCHANGE_DIFFERENCE` werden wählbar.** Beide waren beschriftet, aber
  nicht in der Auswahl.

## Begründung

**Warum die Felder verschwinden, statt leer dazustehen.** Ein Mandant mit einem reinen
CHF-Konto sieht sie nie. Drei Felder, die in 99 % der Fälle leer bleiben, erziehen dazu, den
Dialog zu überfliegen — und dann wird auch die Überzahlungszeile überflogen, die daneben steht.

**Warum die Vorschau nichts sendet.** Der ausgleichende Betrag entsteht auf dem Server aus dem,
was eingegangen ist, und dem Kurs. Schickte der Client beide Zahlen, könnten sie einander
widersprechen — und die Zeile ist danach unveränderlich. Die Vorschau ist eine Kontrolle für den
Menschen, keine Eingabe.

**Warum die Sperre trotzdem sein darf**, obwohl ADR-0039 gerade festhält, dass die Maske warnt
und nicht sperrt. Der Unterschied: dort ist der Betrag **gültig** und nur ungewöhnlich — eine
Überzahlung wird gebucht. Hier fehlt eine **Pflichtangabe**; ohne sie gibt es keinen Betrag, der
gebucht werden könnte.

**Warum `EXCHANGE_DIFFERENCE` jetzt wählbar ist.** Nach einer Umrechnung bleibt fast immer ein
Rest. Er muss schliessbar sein, und die Art dafür existiert seit Langem — sie war nur nie
erreichbar. `BANK_CHARGE` kommt aus demselben Grund dazu: bei einer Fremdwährungsgutschrift
zieht die Bank ihre Gebühr unterwegs ab.

Beide mindern das Entgelt **nicht** (MWSTV Art. 45 und Art. 46) und stehen deshalb weiterhin
nicht in `REDUCES_CONSIDERATION`.

## Verworfene Alternativen

**Die Kursfelder immer zeigen.** Drei leere Felder im häufigsten Dialog der Anwendung.

**Einen eigenen Dialog «Fremdwährungszahlung».** Es ist dieselbe Handlung an derselben
Rechnung, mit demselben Recht. Zwei Dialoge für einen Vorgang wären zwei Stellen, an denen die
Überzahlungszeile gepflegt werden müsste.

**Den umgerechneten Betrag eingeben lassen** und den Kurs daraus rechnen. Dann steht im
Nachweis ein Kurs, den niemand abgelesen hat — und das Papier der Bank zeigt eine andere Zahl.

**Die Kurseinheit als Textfeld.** Zwei Werte, kein Freitext; ein Auswahlfeld kann nicht falsch
getippt werden.

**Einen Kursvorschlag aus dem Beleg.** Das ist genau der Kurs, den Backend-ADR-0106 verwirft:
zwischen Rechnung und Zahlung bewegt er sich, und diese Bewegung ist der Kursgewinn.

## Konsequenzen

- `PaymentForm` trägt vier Felder mehr; `proposedForm` nimmt die Belegwährung entgegen und
  belegt sie vor.
- `RecordPaymentBody` sendet die drei Kursfelder **nur**, wenn tatsächlich umgerechnet wird —
  ein Kurs auf einer Zahlung in der Belegwährung wird vom Server abgewiesen.
- `DocumentReceivablePanel.test.tsx` wächst um vier Fälle: die Felder bleiben weg, sie
  erscheinen, die Sperre greift und löst sich, die Historie zeigt den Nachweis.
- Die drei bestehenden Fälle suchten das Feld «Betrag in CHF» und wurden auf «Betrag»
  nachgezogen — die Währung steht jetzt daneben statt im Label.

## Offen

- **Ein Vorschlag für die Kursdifferenz-Zeile** fehlt. Der Rest bleibt offen stehen und wird von
  Hand geschlossen; ein Vorschlag mit Freigabe wäre der nächste Schritt.
- **Eine Währungsauswahl statt eines Textfelds.** Drei Buchstaben tippen genügt heute; eine
  Liste bräuchte die Währungen des Mandanten, und die stehen in den Stammdaten.
