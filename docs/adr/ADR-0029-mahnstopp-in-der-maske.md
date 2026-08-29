# ADR-0029 — Der Mahnstopp: gesetzt wo der Kunde ist, aufgehoben wo der Verlauf steht

- **Status:** Angenommen
- **Datum:** 2026-08-29

## Kontext

Das Backend kennt den Mahnstopp seit dem Ausstellen und hat jetzt Verwaltung, Katalog und
Rechte dazu
([Backend-ADR-0099](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0099-mahnstopp-mit-grund-aus-dem-katalog.md)).

Randbedingungen:

- **Zwei Ebenen**: am Kunden oder am einzelnen Beleg.
- **Der Grund kommt aus einem Katalog** und ist Pflicht; die Bemerkung ist optional.
- **Aufgehoben, nicht gelöscht** — mit Pflichtgrund.
- **Eine gesperrte Rechnung fällt aus ihrem Brief**, der Brief geht über die übrigen hinaus.
- **Zahlt der Kunde alles, bleibt der Stopp**; das Backend meldet nur `nothingOpen`.
- Setzen und Aufheben brauchen `DUNNING_WRITE`.

## Entscheidung

**Gesetzt wird dort, wo der Kunde oder die Rechnung ist** — im Abschnitt *Mahnwesen* der
Kundenmaske und im Register *Mahnungen* der Rechnung. Ein gemeinsamer `DunningBlockDialog`
bedient beide; er weiss aus seinen Eigenschaften, welche der beiden Ebenen gemeint ist.

**Am Beleg stehen zwei Knöpfe**, *Diese Rechnung* und *Ganzer Kunde*. Die zweite Ebene ist von
dort aus genauso oft gemeint wie die erste.

**Die Übersicht *Verkauf → Mahnstopps* zeigt und hebt auf, setzt aber nicht.** Kein «neuer
Mahnstopp»-Knopf.

**Aufgehoben wird auf der Übersicht und am Beleg**, nicht in der Kundenmaske: dort steht nur,
dass ein Stopp gilt.

**Gesperrte Zeilen bekommen im Arbeitsvorrat einen eigenen Abschnitt** — *«Mahnstopp gesetzt»*,
zwischen *Zu mahnen* und *Übersprungen*, mit einem Link in die Übersicht.

**Der Hinweis auf ausgeglichene Kunden steht als eigenes Panel** über der Liste, nicht als
Spalte.

**Der Katalog steht unter *Systemeinstellungen → Mahnstopp-Gründe***, wie jede andere
Auswahlliste, und braucht keine eigene Maske.

**Die Bemerkung trägt einen Hinweis**, dass dort ein Sachverhalt gehört und kein Urteil.

## Begründung

**Setzen, wo der Kunde ist:** «diesen Kunden mahnen wir gerade nicht» fällt einem auf, während
man den Kunden oder die Rechnung anschaut — nicht, während man eine Liste von Stopps liest. Ein
Dialog, der zuerst nach dem Kunden fragt, wäre die Kundensuche ein zweites Mal.

**Zwei Knöpfe am Beleg**, weil die Reklamation an einer Rechnung genauso oft «und überhaupt
nicht mehr mahnen» bedeutet wie «nur diese eine».

**Ein Dialog für beide Ebenen**, weil er dieselben drei Felder hat. Zwei Dialoge wären zweimal
derselbe Hinweistext, der beim zweiten Mal veraltet.

**Die Übersicht setzt nicht:** ein «neuer Mahnstopp»-Knopf müsste mit einer Kundensuche
beginnen, und die gibt es schon — sie heisst Kundenliste.

**Aufheben nicht in der Kundenmaske:** dort steht der aktuelle Zustand, nicht die Geschichte.
Wer aufhebt, will sehen, was vorher galt, und das steht auf der Übersicht.

**Ein eigener Abschnitt im Arbeitsvorrat**, weil «hier hat ein Mensch entschieden» eine andere
Art von Antwort ist als «warte noch fünf Tage». Beide unter *Übersprungen* zu mischen hiesse,
die eine Zeile zu verstecken, die jemand gesetzt hat.

**Nicht ausgeblendet**, weil eine Liste, die stillschweigend Zeilen weglässt, sich nicht prüfen
lässt.

**Der Hinweis als Panel, nicht als Spalte:** er betrifft in der Regel keine oder eine Handvoll
Zeilen. Eine Spalte dafür wäre in 95 % der Fälle leer.

**Der Katalog ohne eigene Maske**, weil `BASIC_DATA_LISTS` genau dafür da ist: eine Zeile im
Katalog, und die Liste steht.

**Der Hinweis an der Bemerkung**, weil das Feld sonst genau das einlädt, was der Katalog
verhindern soll. Es kostet eine Zeile und ist der ganze Zweck der Konstruktion.

## Alternativen

**Ein Mahnstopp-Knopf im Kopf der Rechnung.** Verworfen: der Kopf trägt schon Status,
Nachfolger und Versandzeile; der Stopp gehört zum Mahnwesen und damit ins Register.

**Nur eine Ebene in der Maske anbieten (am Beleg nur den Beleg).** Verworfen: siehe Begründung.

**Setzen auf der Übersicht.** Verworfen: das wäre eine zweite Kundensuche.

**Aufheben auch in der Kundenmaske.** Verworfen: dort fehlt der Verlauf, und ein Aufheben ohne
Sicht auf das, was vorher galt, ist ein Klick ins Blaue.

**Gesperrte Zeilen unter «Übersprungen» belassen.** Verworfen: siehe Begründung.

**Gesperrte Zeilen ausblenden.** Verworfen — das ist ausdrücklich der Fehler, den ADR-0096
vermeidet.

**Den Hinweis «nichts mehr offen» als Spalte.** Verworfen: fast immer leer.

**Ein Freitextfeld für den Grund, mit Warnung.** Verworfen: eine Warnung, die man wegklickt, ist
keine Struktur. Der Katalog ist die Entscheidung des Backends und die Maske trägt sie mit.

**Eine eigene Maske für die Mahnstopp-Gründe.** Verworfen: es ist eine Auswahlliste wie jede
andere.

## Konsequenzen

- **Der Mahnstopp ist bedienbar**, an drei Stellen: Kunde, Beleg, Übersicht.
- **Der Arbeitsvorrat hat jetzt drei Abschnitte.** Der Untertitel nennt alle drei Zahlen.
- **`DunningCandidate` liefert für gesperrte Rechnungen eine Zeile je Rechnung**, nicht je
  Brief — sichtbare Folge davon, dass eine gesperrte Rechnung aus ihrem Brief fällt.
- **Der Stopp-Dialog kennt keinen Ratenplan.** Ein Enddatum deckt die Zahlungsvereinbarung ab.
- **`DunningBlockPage` steht unter dem Modulschalter**, anders als die Mahnungsliste: ein Stopp
  ist eine Einstellung des Mahnwesens, keine Korrespondenz mit zehnjähriger Aufbewahrung.
