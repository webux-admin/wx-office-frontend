# ADR-0043 — Der Klärungskorb: ein Grid statt einer Tabelle, und ein Zähler in der Navigation

- **Status:** Angenommen
- **Datum:** 2026-08-31
- **Verhältnis:** setzt Backend-ADR-0109 um. Benutzt `MatchReason` aus
  [ADR-0042](ADR-0042-konfidenz-als-wort-nicht-als-zahl.md), für das es gebaut wurde. Lässt
  [ADR-0030](ADR-0030-mehrfachauswahl-in-der-tabelle.md) und `DataTable` **unverändert**.

## Kontext

Der Klärungskorb ist die Maske, in der jemand zweihundert Bankbewegungen an einem Vormittag
erledigt. Der Auftraggeber wörtlich: *«Da soll gutes UX gelten. … der Benutzer soll auf
jedenfall informiert werden.»*

Drei Dinge brauchten eine Entscheidung: **womit die Liste gezeichnet wird**, **ob eine neue
Abhängigkeit dazukommt** und **wie die Seitenleiste eine Zahl anzeigt, die sie bisher gar nicht
holen konnte**.

## Entscheidung

### 1. Eine eigene Komponente `MatchGrid`; `DataTable` bleibt unangetastet

`DataTable` kann seit ADR-0030 Mehrfachauswahl, serverseitiges Sortieren, Blättern und
`aria-sort`. Was fehlt, ist keine Erweiterung, sondern eine andere Komponente:

| Was `MatchGrid` braucht | Warum `DataTable` es nicht hat |
| --- | --- |
| `role="grid"` statt `<table>` | eine Tabelle ist keine Gitterbedienung |
| Roving Tabindex | `DataTable` hat einen Tabstopp je Zeile |
| Pfeiltastennavigation über Zeilen **und** Zellen | gibt es nicht |
| `aria-rowcount` über die Gesamtzahl | `DataTable` hält eine Seite und weiss nichts von den anderen |
| Shift+Pfeil-Bereichsauswahl, Ctrl+A | gibt es nicht |

**Verworfen: `DataTable` um einen Grid-Modus erweitern.** Jede Tabellenmaske der Anwendung hängt
daran; ein Umbau der Tastaturbedienung wäre eine Regression über den gesamten Bestand für den
Nutzen einer einzigen Maske.

**Verworfen: ein drittes handgeschriebenes `<table>`** wie in `DunningWorklistPage`. ADR-0030
hat das bereits verworfen — «ein weiteres Gerüst wäre ein drittes Muster für dasselbe».
`MatchGrid` ist deshalb eine **benannte, wiederverwendbare Komponente mit eigenem Test**, kein
Stück Seitencode.

**Genau ein Tabstopp.** Ein Grid mit einem Tabstopp je Zeile ist ein Grid, dessen Ende niemand
per Tabulator erreicht.

### 2. Keine neue Abhängigkeit — die Rückfrage bleibt offen

**`@tanstack/react-virtual` wurde nicht hinzugefügt.** CLAUDE.md verlangt für eine neue
Laufzeit-Abhängigkeit eine Rückfrage, und das Issue stellt sie ausdrücklich — sie ist nicht
beantwortet.

Das Issue nennt den Rückfallweg selbst, und der ist gebaut: **keine Virtualisierung**, die Seite
ist, was der Server schickt (200 Zeilen). Für den beschriebenen Alltag — 200 Bewegungen je
Import — trägt das.

**Verworfen: von Hand virtualisieren.** Machbar, aber die Kanten (variable Zeilenhöhe,
Scroll-Wiederherstellung nach dem Buchen, `scrollToIndex` für die Taste N) sind genau das, was
die Bibliothek löst. Handarbeit wäre die schlechtere der beiden Antworten, nicht die
vorsichtigere.

`aria-rowcount` nimmt trotzdem die **Gesamtzahl**, nicht die Zahl der gezeichneten Zeilen: ein
Screenreader, der auf Seite eins von vier «3 von 3» hört, ist falsch informiert — und die Zeile
ist schon richtig, wenn die Virtualisierung später kommt.

### 3. Der Zähler in der Seitenleiste — und was er kostet

`NavEntry` bekommt ein siebtes Feld `counter?: NavCounterKey`, und `AppShell` liest die Zahl
über `useNavCounters()`.

**Das ist die erste Anfrage, die die Seitenleiste je stellt.** Bisher stellte sie keine — der
Modulschalter reist mit der Sitzung, und das kostet nichts. Der Bruch wird offen genannt und ist
bezahlbar:

- **nur wenn der Eintrag ohnehin sichtbar ist** — Recht und Modulschalter sind vorher geprüft;
- `staleTime` 60 Sekunden, dazu `refetchOnWindowFocus`;
- vier Zahlen in der Antwort;
- **kein `retry`**.

**Schlägt sie fehl, zeigt die Leiste keinen Zähler und keine Fehlermeldung.** Eine Navigation,
die einen roten Kasten zeigt, ist kaputter als eine ohne Zahl.

Eingeklappt hat die Zahl keinen Platz: dort steht ein Punkt, und die Zahl steckt im
`sr-only`-Text. Ein Abzeichen, das niemand lesen kann, ist Dekoration.

**Verworfen: der Bildschirm holt seine Zahl selbst.** Dann gibt es sie nur, wenn man schon da
ist — und das ist der Fall, in dem niemand sie braucht.

**Verworfen: der Zähler reist mit der Sitzung.** Die Sitzung wird bei der Anmeldung gelesen, die
Zahl ändert sich mit jeder Buchung. Ein Badge, der nach der ersten Zuordnung stehen bleibt, ist
schlimmer als keiner.

### 4. Der Mahnhinweis holt sich seine Zahl selbst

`DunningWorklistPage` fragt den Zähler-Endpunkt von `banking` direkt. **Damit entsteht keine
Modulkante `dunning → banking` für einen Hinweistext**, und bei abgeschaltetem `banking`
antwortet die Anfrage mit 403 oder 409 und die Maske schweigt — `retry: false`, kein
Fehlerkasten.

Ab **fünf Tagen**, und die Regel spiegelt die des Servers: verglichen werden **ganze Tage**,
nicht Zeitpunkte. Mit der Uhrzeit darin erschiene die Warnung je nach Öffnungsstunde oder nicht.

### 5. «Erst gleich, dann buchbar»

Der Buchen-Knopf ist gesperrt, solange die Restdifferenz ungleich null ist **und** keine
Restbehandlung gesetzt wurde. Die Restdifferenz steht stets sichtbar darüber, grün bei null,
rot sonst.

Das ist die wichtigste einzelne Übernahme dieser Maske. Kein «buchen und der Rest wird schon
irgendwie».

### 6. Der Verwendungszweck steht im Volltext

Nicht gekürzt, nicht in einem Tooltip, sondern in einem eigenen Kasten mit
`whitespace-pre-wrap`. Der Anwender entscheidet oft genau anhand des Textes, den keine Automatik
verstanden hat; ein abgeschnittenes Feld erzwingt den Wechsel ins E-Banking und kostet Auswahl,
Scrollposition und Tastaturfluss.

### 7. Barrierefreiheit

- **`aria-live="polite"`** für jede Zustandsänderung — «4 Zeilen ausgewählt», «168 gebucht».
  **Nicht `assertive`**: das unterbricht die laufende Ausgabe und bleibt echten Fehlern
  vorbehalten (WCAG 4.1.3).
- **WCAG 3.3.4** verlangt bei Finanztransaktionen eine von drei Sicherungen. Erfüllt sind zwei:
  die Sammelaktion mit vorgeschalteter Übersicht ist «Confirmed», die Gegenbuchung als einziger
  Korrekturweg ist «Reversible».
- Die vier fachlichen Kürzel stehen **sichtbar** über der Liste. Eine Tastenkombination, die man
  nicht sieht, benutzt niemand.
- **Ctrl+S wird nicht abgefangen.** «S» allein markiert «später klären»; Ctrl+S gehört dem
  Browser, und ein Grid, das es stiehlt, überrascht.

## Verworfene Alternativen

**Eine Tabelle mit Aufklappzeile als Hauptmuster.** Beim Aufklappen springt die Liste, der
Vergleich zwischen Zahlung und Kandidat verliert den Kontext, und bei mehreren offenen Posten
wird die Zeile unbrauchbar hoch.

**Ein modaler Dialog je Zahlung.** 200 Zeilen sind 200 Öffnen-Schliessen-Zyklen; der
Tastaturfluss ist danach zerstört und jede Bestätigung wird zum Klickreflex.

**Drag-and-Drop der Zahlung auf eine Rechnung.** Verletzt WCAG 2.5.7 ohne Einzeiger-Ersatz und
ist bei langen Listen langsamer als Tippen.

**Ein Ampelsymbol ohne Wort** für die Konfidenz — siehe ADR-0042.

## Konsequenzen

- `components/MatchGrid.tsx` ist neu, mit 21 Testfällen.
- `lib/clearing.ts` neben `banking.ts` und `matching.ts`: die Auszüge sind das eine, die
  Vorschläge das zweite, was jemand damit tut das dritte.
- `pages/ClearingPage.tsx`, ein Navigationseintrag mit Zähler, der Hinweis im Mahnvorschlag.
- `NavEntry` bekommt `counter?: NavCounterKey` — ein geschlossener Typ, damit ein Eintrag keine
  Quelle nennen kann, die es nicht gibt.
- `referenceLabel` und `referenceIsBroken` nehmen jetzt `ReferenceBearing` statt
  `BankTransaction`: der Klärungskorb zeigt denselben Satz über eine Zeile, die kein voller
  Auszugsposten ist.

## Offen

- **Die Virtualisierung.** Die Rückfrage nach `@tanstack/react-virtual` ist gestellt und nicht
  beantwortet.
- **Die Reiter «Offene Posten suchen» und «Sonstiges»** sind angelegt und beschriftet, aber
  nicht verdrahtet.
- **Ein kompakter Zweitmodus** (Tabelle mit Aufklappzeile) für die reine Bestätigung eindeutiger
  Fälle bleibt vertretbar und ist nicht gebaut.
- **Eine Maske für die gebuchten Läufe.**
