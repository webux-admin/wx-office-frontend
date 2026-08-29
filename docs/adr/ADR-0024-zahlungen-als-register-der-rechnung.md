# ADR-0024 — Zahlungen als Register der Rechnung, «Offen» als eigene Spalte

- **Status:** Angenommen
- **Datum:** 2026-08-29

## Kontext

Das Backend führt neu den offenen Posten: Ausgleichszeilen in `document_payment`, nur anhängend,
der offene Betrag gerechnet statt gespeichert
([Backend-ADR-0091](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0091-offener-posten-und-zahlungserfassung.md)).
Das Frontend muss zwei Dinge zeigen: was auf **eine** Rechnung eingegangen ist, und welche
Rechnungen in der **Liste** noch offen sind.

Randbedingungen:

- Die Belegmaske ist eine Maske für vier Belegarten. Nur die Rechnung kann Geld schulden.
- Ein **Entwurf schuldet nichts** — der Endpunkt antwortet dort mit 400.
- Eine ausgestellte Rechnung lässt sich **zurückstellen**; danach ist sie wieder Entwurf.
- Der offene Betrag darf **negativ** sein (Überzahlung).
- `openAmount` fehlt ganz auf Belegen ohne Forderung — es ist **nicht** 0.
- Ändern und Löschen einer Zahlung gibt es serverseitig nicht.

## Entscheidung

**Ein eigenes Register «Zahlungen» auf der Belegmaske**, angeboten nur wenn
`kind.receivable` **und** der Beleg kein Entwurf ist. Das Register hängt an einem Flag der
Belegart, nie an der Kategorie — wie `kind.tracking` es beim Nachfassen schon tut.

**Das Register wird geklammert wie «Nachfassen».** Wer es offen hat und die Rechnung
zurückstellt, landet auf «Beleg», nicht auf einer leeren Fläche.

**Kein Ändern- und kein Löschen-Knopf, nur «Stornieren».** Die Gegenbuchung ist der einzige
Korrekturweg; beide Zeilen bleiben stehen und werden durchgestrichen dargestellt.

**Die Spalte «Offen» in der Rechnungsliste kennt drei Antworten**, nicht eine Zahl:

| Zustand | Darstellung |
|---|---|
| offen | Betrag, rot und fett wenn überfällig |
| ausgeglichen | Badge «bezahlt» |
| überzahlt | Betrag mit dem Zusatz «Guthaben» |
| trägt keine Forderung | «–», nicht 0.00 |

**Der Chip «Überfällig»** steht neben «Ausgestellt» und verengt ihn, statt ihn aufzuteilen.

## Begründung

**Ein Register und kein Abschnitt auf «Beleg»**, weil die Zahlungen eine Historie mit eigener
Tabelle und eigenen Dialogen sind. Auf dem Belegregister stünden sie unter den Positionen und
würden bei jeder Rechnung mitgeladen, auch wenn niemand hinschaut.

**Am Flag und nicht an der Kategorie**, aus demselben Grund wie `tracking`: eine zweite Belegart
mit Forderung nennt es an einer Stelle und nirgends sonst.

**Erst ab «ausgestellt»**, weil der Endpunkt auf einem Entwurf 400 antwortet. Ein Register, das
sich öffnen lässt und dann eine Fehlermeldung zeigt, ist eine Sackgasse.

**Drei Antworten in der Spalte**, weil ein negativer Betrag als «-0.20 offen» wie eine Schuld
von minus zwanzig Rappen liest und nicht wie ein Guthaben, das wir dem Kunden schulden. Und
«–» statt 0.00, weil 0.00 heisst «ausgeglichen», während der Entwurf schlicht nie gefragt wurde.

**Der Betrag ist mit dem offenen Betrag vorbelegt**, weil das der Normalfall ist. Eine falsche
Vorbelegung kostet einen Tastendruck, ein leeres Feld kostet jedes Mal die volle Eingabe. Bei
einer Überzahlung wird **nicht** vorbelegt — ein negativer Vorschlag wäre Unsinn.

**Der Hinweis auf MWSTG Art. 41** steht im Dialog, sobald Gutschrift, Skonto oder
Debitorenverlust gewählt wird. Ohne ihn liest sich der geschlossene Posten wie eine erledigte
Steuersache, und das ist er nicht.

## Alternativen

**Zahlungen als Abschnitt auf dem Belegregister.** Verworfen: Historie plus zwei Dialoge sind
kein Abschnitt, und die Daten würden bei jedem Aufruf jeder Rechnung mitgeladen.

**Register immer anbieten und im Entwurf einen Hinweis zeigen.** Verworfen: ein Register, das
in der Hälfte der Fälle nur erklärt, warum es leer ist, ist ein Register zu viel. Der Beleg
sagt über seinen Status schon, dass er noch nichts schuldet.

**«Offen» als Zahl ohne Sonderfälle.** Verworfen: siehe Begründung, der negative Fall.

**Eigene Seite «Offene Posten» statt Spalte und Chip.** *Nicht* verworfen, nur nicht in diesem
Schritt: der Endpunkt `/open-items` steht, die Maske dazu kommt mit dem Mahnwesen (Arbeitsvorrat,
Backend-Issue #61). Bis dahin beantwortet die Rechnungsliste die Frage.

**Den offenen Betrag im Browser rechnen.** Verworfen, ohne Diskussion: er hat genau eine
Definition, sie steht im Backend, und eine zweite im Browser wäre die dritte.

## Konsequenzen

- `SalesDocumentKind` trägt ein Flag mehr (`receivable`), gesetzt nur an der Rechnung.
- Die Rechnungsliste hat eine Spalte mehr und einen Chip mehr als die anderen drei Listen.
- **`RECEIVABLE` steht bewusst nicht in `SALES_DOCUMENT_CACHE_ROOTS`.** Eine Partneränderung
  kann die Zahlungsdaten nicht erreichen: die ausgestellte Rechnung trägt einen eingefrorenen
  Empfängerschnappschuss, und der Entwurf, der dem Partner folgt, schuldet gar nichts.
- **Die Sammelzahlung fehlt.** Wer eine Sammelüberweisung erfasst, teilt sie von Hand auf die
  Rechnungen auf — eine Zeile gehört zu genau einer Rechnung.
- **Die Nummer ADR-0024 war in der Planung von Backend-Issue #57 für die Mahnwesen-Masken
  vorgemerkt.** Sie ist hier vergeben, weil dieses Issue zuerst fertig wurde; die
  Mahnwesen-Masken bekommen die nächste freie Nummer. Für ein noch nicht gebautes Issue wird
  keine Nummer reserviert.
