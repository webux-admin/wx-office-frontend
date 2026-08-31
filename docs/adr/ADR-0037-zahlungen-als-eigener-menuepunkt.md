# ADR-0037 — «Zahlungen» als eigener Menüpunkt, und warum es zwei Wege zu denselben Endpunkten gibt

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** wendet [ADR-0031](ADR-0031-ordner-ist-registerleiste.md) an.
  [ADR-0024](ADR-0024-zahlungen-als-register-der-rechnung.md) bleibt gültig und wird **nicht**
  abgelöst — das Register an der Rechnung bleibt stehen. Setzt Backend-ADR-0103 um.

## Kontext

Das Backend führt den Zahlungseingang neu als eigenen Datensatz neben der Ausgleichszeile
(Backend-ADR-0103). Damit gibt es zum ersten Mal einen Zustand, den die bestehende Maske nicht
zeigen kann: **Geld ist da, gehört aber noch niemandem.** Eine Bankgutschrift, deren Referenz
niemand lesen konnte, hat an keiner Rechnung einen Platz — sie kennt ja keine.

Dazu kommt die Sammelgutschrift. Schweizer Banken liefern Eingänge auf eine QR-IBAN als
**eine** Gutschrift; sie wird einmal erfasst und danach auf beliebig viele Rechnungen verteilt.
ADR-0024 hält die Lücke selbst fest: «Eine Zahlungszeile gehört zu genau einer Rechnung.»

Randbedingungen der Seitenleiste:

- `NavFolder.children` ist `NavEntry[]` — **Ordner im Ordner ist ausgeschlossen.**
- Ein Ordner hat **kein eigenes `href`**; der Kopf führt auf sein erstes sichtbares Kind.
- Ein Ordner **ist** die Registerleiste seiner Bildschirme (ADR-0031).
- Der Gruppenkommentar von «Verkauf» sagt, wonach sortiert wird: «In the order a sale runs
  through them, not alphabetically».

## Entscheidung

**Ein Ordner «Zahlungen» in der Gruppe «Verkauf», direkt nach «Rechnungen» und vor «Offene
Posten», heute mit genau einem Kind.**

```
Verkauf
├── Offerten
├── Aufträge
├── Lieferscheine
├── Rechnungen
├── Zahlungen            ← neu
│   └── Zahlungseingänge
├── Offene Posten
│   ├── Offene Posten
│   └── Kleindifferenzen
└── Mahnungen
```

Dazu:

- **Kein `module`-Feld**, weder am Kopf noch am Kind. Der Zahlungseingang hängt an `document`,
  es gibt nichts abzuschalten — dieselbe Begründung, mit der «Offene Posten» keines trägt.
  `LicensedModule` kennt ohnehin nur `INVENTORY`, `OUTBOX` und `DUNNING`.
- **Kein `permission` am Kopf**, das Kind trägt `INVOICE_READ`. Ein Ordner, dessen Kinder alle
  unsichtbar sind, verschwindet von selbst.
- **Erfassen und Zuweisen in einer Maske**, mit `INVOICE_PAYMENT_RECORD` — kein neues Recht.
- **Das Register «Zahlungen» an der Rechnung bleibt** und ruft dieselben Endpunkte.

## Begründung

### Der Platz: nach der Rechnung, vor den beiden Dächern

Angeboten, bestellt, geliefert, fakturiert, **bezahlt.** Erst danach kommen die beiden Dächer,
die eine Frage über einen Zustand stellen: «was ist noch offen» und «wer wird gemahnt». Der
Kommentar über «Offene Posten» begründet dessen Platz genau so — «was ist noch offen» ist die
nächste Frage nach «was haben wir geschrieben» —, und diese Frage wird überhaupt erst
beantwortbar, **nachdem** das Geld erfasst ist.

### Ein Ordner sofort, nicht erst später

Der Kontoauszug-Import und der Klärungskorb der ungeklärten Eingänge gehören unter dasselbe
Dach und werden Register desselben Ordners. Ein flacher Eintrag heute hiesse, den Menüpunkt
zweimal umzubauen und ihn beim zweiten Mal an eine andere Stelle der Seitenleiste zu schieben,
nachdem die Benutzer ihn dort gelernt haben. Der Preis ist ein Aufklapp-Chevron, der vorerst
eine einzige Zeile öffnet.

### Zwei Wege zu denselben Endpunkten, und das ist Absicht

| Weg | Wofür |
| --- | --- |
| Register **Zahlungen** an der Rechnung | Der Einzelfall: eine Rechnung liegt offen, eine Zahlung kommt dafür an |
| *Verkauf → Zahlungen* | Der Kontoauszug: Geld kommt an, und wozu es gehört, stellt sich erst heraus |

Beide rufen dasselbe `ReceivableManagement`. **Die zentrale Maske ist Bedienoberfläche, keine
zweite Fachlogik.** Wer die eine abschaffte, machte die andere umständlicher, ohne dass irgendwo
weniger Code stünde: eine Zahlung auf die offene Rechnung, die man gerade anschaut, über eine
Liste aller Eingänge zu erfassen, ist ein Umweg.

Damit die beiden Sichten nicht widersprüchlich wirken, weist die Zahlungstabelle an der Rechnung
eine Zeile, die aus einem Eingang stammt, als «aus Zahlungseingang» aus. Dafür trägt `Payment`
neu `receiptId`.

### Erfassen und Zuweisen in einem Dialog

Fachlich sind es zwei Tatsachen — nichts ist weniger geschuldet, nur weil Geld auf dem Konto
liegt. Wer einen Kontoauszug liest, tut aber beides in einem Zug, und eine Maske, die zum
Zuweisen schliessen und neu öffnen liesse, beantwortete eine Frage über das Datenmodell statt
über die Arbeit.

Gespeichert wird trotzdem in **zwei** Aufrufen, nicht in einem pro Zeile: erst der Eingang, dann
alle Zuweisungen zusammen. Drei Ausgleichszeilen, von denen zwei geschrieben wurden, wären ein
Zustand, den niemand mehr lesen kann.

Die Fusszeile zeigt fortlaufend «noch nicht zugewiesen: x». Wird der Wert negativ, ist Speichern
gesperrt — mit derselben Aussage, die das Backend geben würde, nur eben bevor der Aufruf
hinausgeht.

### Die Form entscheidet, ob eine Eingabe Referenz oder Belegnummer ist

Ein Feld, zwei Parameter: `lookupBy` schickt eine Eingabe nur dann als `reference`, wenn sie
wie eine aussieht — 27 Ziffern oder `RF` am Anfang. Alles andere geht als `documentNumber`
hinaus.

**Nicht am ersten Zeichen entschieden**, obwohl das kürzer wäre: manche Mandanten nummerieren
ihre Rechnungen ohne Präfix, und eine reine Zahl als Referenz zu schicken brächte ein 400
(«keine gültige Referenz») für etwas, das gar keine ist.

**Die Prüfziffer wird hier nicht gerechnet.** Das ist die Antwort des Backends, und sie im
Browser zu wiederholen wäre eine zweite Stelle, an der sie falsch sein kann.

### Die Vorbelegung ist `min(Rest des Eingangs, offener Posten)`

Was zuerst ausgeht, ist der Betrag, der sich tatsächlich zuweisen lässt. Beide falschen
Vorschläge kosteten denselben Tastendruck zum Korrigieren — aber nur dieser wird vom Server nie
abgewiesen.

## Verworfene Alternativen

**Ein flacher `NavEntry` statt eines Ordners.** Aus dem oben genannten Grund: er müsste zweimal
umgebaut und einmal verschoben werden.

**Ein Register der Maske «Offene Posten».** Der Eingang ist kein offener Posten und steht oft
ohne einen da. Ein Register, dessen Inhalt sich auf die Frage der Maske nicht bezieht, ist ein
zweiter Menüpunkt mit schlechterem Namen.

**Das Register an der Rechnung abschaffen.** Es ist der kürzere Weg für den häufigeren Fall.
Zwei Masken auf einer Fachlogik sind kein Duplikat.

**Erfassen und Zuweisen in zwei Dialogen.** Fachlich sauber getrennt, in der Bedienung ein
Rückschritt: der Kontoauszug wird Zeile für Zeile gelesen, nicht in zwei Durchgängen.

**Den Eingang bearbeitbar machen.** Die Tabelle weist jedes `UPDATE` und jedes `DELETE` ab. Eine
Maske mit Eingabefeldern verspräche etwas, das die Datenbank nicht tut — ein bereits erfasster
Eingang öffnet deshalb nur lesend, mit dem Weg zur Gegenbuchung.

## Konsequenzen

- Der neue Bildschirm liegt unter `/zahlungen` und läuft auf `INVOICE_READ`; erfassen und
  zuweisen brauchen `INVOICE_PAYMENT_RECORD`.
- `src/lib/paymentReceipt.ts` hält Pfad, Rechte, Query-Keys und Aufrufe an einem Ort, damit
  Liste und Dialog denselben Cache-Schlüssel benutzen.
- `src/pages/payment/receiptForm.ts` hält die Formularregeln als reine Funktionen — Restbetrag,
  Vorbelegung, gesperrtes Speichern —, prüfbar ohne Rendering.
- Nach einer Zuweisung sind drei Listen gleichzeitig veraltet: die Zahlungseingänge, die offenen
  Posten und die Rechnungsliste mit ihrer Spalte «Offen». Alle drei werden ungültig gemacht.
- **Der Leerzustand sagt, wo die Liste beginnt:** am Tag der Einführung. Früher erfasste
  Zahlungen stehen an ihrer Rechnung und werden nicht rückwirkend zu Eingängen gemacht — das
  wäre eine Behauptung über die Vergangenheit (Backend-ADR-0103).
- Ein Eingang, dessen Zahler unbekannt ist, zeigt in der Spalte «Zahler» «nicht zugeordnet» und
  nicht etwa einen leeren Platz.
- `navigation.test.ts` prüft die Stellung des Ordners ausdrücklich: unmittelbar nach
  «Rechnungen» und vor «Offene Posten».

## Offen

- **Ein Arbeitsvorrat der ungeklärten Eingänge** fehlt. Der Zustand «offen» entsteht hier; die
  Liste, die niemand übersehen darf, kommt später.
- **Der Kontoauszug-Import** wird das zweite Register dieses Ordners.
- **Die Währung** des Erfassungsdialogs ist vorbelegt mit CHF und von Hand änderbar; eine
  Zuweisung auf eine Rechnung anderer Währung weist das Backend ab, und die Maske sagt es
  vorher.
