# ADR-0038 — «Guthaben» als Register mit eigenen Summen, und warum es nie in der Postenliste steht

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** wendet [ADR-0031](ADR-0031-ordner-ist-registerleiste.md) an und erweitert den
  Ordner aus [ADR-0037](ADR-0037-zahlungen-als-eigener-menuepunkt.md) um sein zweites Register.
  [ADR-0030](ADR-0030-mehrfachauswahl-in-der-tabelle.md) bleibt gültig: die Liste der offenen
  Posten bekommt **keine** Summenzeile. Setzt Backend-ADR-0104 um.

## Kontext

Ein Zahlungseingang, der nicht oder nur teilweise verbraucht ist, **ist** das Kundenguthaben
(Backend-ADR-0104). Es fehlt der Ort, an dem man es sieht — und die Frage «was schulden wir
unseren Kunden» hat heute keine Antwort in der Anwendung.

Randbedingungen:

- **OR Art. 958c Abs. 1 Ziff. 7** verbietet die Verrechnung von Aktiven und Passiven. Ein
  Guthaben ist ein kreditorischer Debitor, Konto 2030 «Erhaltene Anzahlungen».
- **OR Art. 120 ff.**: eine Verrechnung setzt eine **Erklärung** voraus.
- **OR Art. 142**: die Verjährung ist eine **Einrede**, die ein Richter nicht von Amtes wegen
  berücksichtigt.
- ADR-0030 hat eine Summenzeile unter den offenen Posten schon einmal verworfen: «der Filter
  kennt keine Währung, und eine Spalte mit CHF- und EUR-Zeilen lässt sich nicht addieren».

## Entscheidung

**Ein zweites Register «Guthaben» im Ordner «Zahlungen», mit zwei Sichten und eigenen Summen.**

```
Verkauf
├── …
├── Zahlungen
│   ├── Zahlungseingänge
│   └── Guthaben          ← neu
├── Offene Posten
└── Mahnungen
```

Der Bildschirm zeigt in `Tabs`:

- **Bestand** — eine Zeile je Kunde **und** Währung, mit einer Summe **je Währung**.
- **Eingänge** — jeder Eingang mit Rest, Art, Valutadatum und **Alter**.

Dazu:

- **Kein `module`**, wie der Nachbar: es gibt nichts abzuschalten.
- **`INVOICE_READ` zum Lesen**, `CUSTOMER_CREDIT_RECORD` zum Erfassen und Verrechnen,
  `CUSTOMER_CREDIT_REFUND` zum Zurückzahlen und Auflösen.
- **Die Liste der offenen Posten bleibt unverändert** — keine Guthabenspalte, keine Summenzeile.
- Ein **Hinweis an der Kundenmaske**, sichtbar nur solange etwas liegt.
- Eine **Warnung im Mahn-Arbeitsvorrat**, die nicht sperrt.

## Begründung

### Eigene Summen hier, keine dort — und das ist kein Widerspruch zu ADR-0030

Der Einwand von ADR-0030 steht: über verschiedene Währungen lässt sich nicht addieren. Er
trifft den Guthabenbildschirm aber nicht, weil dort die **Währung Teil des Gruppenschlüssels
ist**: eine Zeile je Kunde **und** Währung, und die Fusszeile zeigt **eine Summe je Währung**,
nie eine über alle.

Umgekehrt bleibt die Postenliste ohne Summe — dieses ADR holt sie nicht zurück.

### Warum das Guthaben nicht in die Postenliste gehört

Der Fehler, den ein Fakturierungssystem hier macht, ist nicht «falsch gebucht» — es bucht ja
nicht — sondern **stumm**: taucht das Guthaben nur als negativer offener Posten auf, sieht der
Treuhänder eine Debitorenliste, deren Summe kleiner ist als die Summe der offenen Rechnungen,
und weiss nicht warum.

Eine Guthabenspalte in derselben Tabelle wie die Forderung lädt genau zu der Saldierung ein, die
Ziff. 7 verbietet.

### Das Alter steht in der Liste, und es verfällt nichts

Jeder Eingang trägt sein Alter in Tagen und seine Altersgruppe; die Liste lässt sich nach
«mindestens so alt» filtern. Was die Maske **nicht** tut: irgendetwas als verfallen bezeichnen
oder von selbst auflösen. Die Verjährung ist eine Einrede — eine Software, die Guthaben nach
zehn Jahren ausbucht, trifft für den Mandanten eine Rechtsentscheidung.

Der Satz steht sichtbar unter der Liste, nicht nur im ADR.

### Die Verrechnung ist ein Dialog, kein Automat

Der Dialog bietet die offenen Posten **desselben Kunden** und **derselben Währung**, älteste
zuerst, mit `min(Rest, offener Posten)` vorbelegt. Ein Mensch bestätigt — das ist die Erklärung
nach OR Art. 120 ff.

### Ein Dialog für Rückerstattung und Auflösung

Beide verfügen über fremdes Geld ohne Gegenleistung, beide brauchen Grund und Buchungsdatum.
Nur die Rückerstattung zeigt das IBAN-Feld: eine Auflösung zahlt nichts aus, und ein Konto wäre
ein Nachweis für eine Zahlung, die nie stattfand. Das Formular schickt die IBAN bei einer
Auflösung gar nicht erst mit — die Datenbank weist sie ohnehin ab.

### Der Hinweis an der Kundenmaske, kein Register

Solange es eine Zahl je Währung ist, gehört sie neben den Kunden und nicht hinter ein Register,
das niemand öffnet: wer eine Rechnung an jemanden schreibt, der schon 800 CHF bezahlt hat,
sollte es sehen, ohne suchen zu gehen. Die Registerliste der Kundenmaske bleibt unverändert.

### Der Mahn-Arbeitsvorrat warnt und sperrt nicht

Eine Rechnung über 500 zu mahnen, während 800 Guthaben liegen, ist ein Kundenverlust. Die Zeile
zeigt deshalb den Saldo — und **bleibt in der Liste**. Das Guthaben kann zweckgebunden sein, und
ob es diese Rechnung ausgleicht, ist eine Erklärung, die einem Menschen gehört: ein Vorschlag,
kein Lauf ([ADR-0033](ADR-0033-mahnungen-als-hauptmenuepunkt.md), Backend-ADR-0096).

## Verworfene Alternativen

**Ein eigener Hauptmenüpunkt «Guthaben».** Es ist dieselbe Sache wie der Zahlungseingang, nur
aus der anderen Richtung gelesen — und der Ordner «Zahlungen» ist genau dafür da.

**Eine Guthabenspalte in der Liste der offenen Posten** — die verbotene Saldierung, nur
tabellarisch. **Ein Nettototal «Forderung minus Guthaben»** — dasselbe mit freundlichem Namen.

**Eine Summenzeile auch unter den offenen Posten.** Der Einwand von ADR-0030 steht unverändert:
dort ist die Währung eine Spalte, kein Gruppenschlüssel.

**Den Mahnkandidaten mit Guthaben ausblenden** — dann verschwindet die Rechnung, ohne dass
jemand entschieden hat.

**Ein Register «Guthaben» an der Kundenmaske.** Solange es eine Zahl ist, ist ein Register zu
viel; die Liste steht im Guthabenbildschirm, auf den Kunden gefiltert.

**Die Rückerstattung und die Auflösung in einem einzigen Formular ohne Umschaltung.** Dann
stünde das IBAN-Feld auch über einer Auflösung, und ein leeres Pflichtfeld erzieht dazu,
irgendetwas hineinzuschreiben.

**Rest und Saldo im Browser nachrechnen.** Sie sind Antworten des Servers; eine zweite Rechnung
im Frontend ist eine zweite Stelle, an der sie falsch sein kann.

## Konsequenzen

- Der Bildschirm liegt unter `/guthaben` und läuft auf `INVOICE_READ`.
- `src/lib/customerCredit.ts` hält Pfad, Rechte, Query-Keys, Aufrufe und die Altersgruppen an
  einem Ort.
- `src/pages/payment/creditForm.ts` hält die Formularregeln als reine Funktionen — testbar ohne
  Rendering.
- Nach jeder Bewegung sind drei Listen gleichzeitig veraltet: Guthaben, offene Posten und die
  Rechnungsliste mit ihrer Spalte «Offen».
- `ADVANCE_APPLIED` bekommt eine deutsche Bezeichnung («Vorauszahlung verrechnet»), steht aber
  **nicht** in `PAYMENT_KIND_ORDER`: die Art entsteht nur über den Verrechnungsweg und ist im
  Zahlungsdialog nicht wählbar. Und **nicht** in `REDUCES_CONSIDERATION`, aus demselben Grund
  wie im Backend — es ist keine Entgeltsminderung.
- `navigation.test.ts` hält fest, dass der Ordner «Zahlungen» beide Register trägt und beide auf
  `INVOICE_READ` laufen.

## Offen

- **Die Verrechnungsposition auf der Schlussrechnung** fehlt; sie ist im Backend durch eine
  offene Treuhänderfrage blockiert.
- **Der Klärungskorb** der ungeklärten Eingänge wird ein drittes Register desselben Ordners.
- **Die Währung** des Erfassungsdialogs ist mit CHF vorbelegt und von Hand änderbar; eine
  Verrechnung gegen eine Rechnung anderer Währung bietet die Maske gar nicht erst an.
