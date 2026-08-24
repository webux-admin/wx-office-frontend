# ADR-0015 — Offene Restmengen in Übernahmedialog und Belegmaske

- **Status:** Angenommen
- **Datum:** 2026-08-24

## Kontext

Das Backend führt neu je Belegzeile eine offene Restmenge
([ADR-0065](../../webux-office/docs/adr/ADR-0065-zeilenreferenz-und-offene-restmengen.md)).
Die Übernahme legt einen Entwurf mit den offenen Mengen an, überspringt vollständig
übernommene Positionen und lehnt einen erledigten Vorgängerbeleg mit HTTP 409 ab.

Damit stehen drei Fragen an der Oberfläche:

1. Woran sieht der Erfasser **vor** dem Klick, was er bekommt?
2. Wie erfährt er, dass ein Kandidat erledigt ist — bevor er einen Fehler kassiert?
3. Wo beantwortet die Anwendung «was fehlt dem Kunden noch»?

Die Restmenge ist **je Kategorie des Folgebelegs** verschieden: was ein Lieferschein aus einem
Auftrag genommen hat, sagt nichts darüber, was die Rechnung noch verrechnen muss. Der Endpunkt
liegt deshalb an der Belegart, die geschrieben wird
(`GET /{resource}/predecessors/{sourceId}/open-quantities`), und ist durch deren Leserecht
geschützt.

## Entscheidung

**Der Übernahmedialog zeigt nach der Auswahl eine Vorschau der offenen Positionen** — je Zeile
bestellt, geliefert und offen, rechtsbündig mit `tabular-nums`. Vollständig übernommene
Positionen erscheinen nicht, weil der neue Beleg sie auch nicht tragen wird.

**Ein erledigter Kandidat bleibt in der Liste**, mit dem Vermerk «erledigt» statt der Zahl der
offenen Positionen; das Backend stellt ihn hinten an. Wird er ausgewählt, sagt der Dialog im
Klartext, dass nichts mehr offen ist, und der Knopf «Übernehmen» ist gesperrt.

**Die Positionstabelle bekommt zwei neue, optionale Fähigkeiten**, beide nur wenn der Aufrufer
die Zahlen mitliefert:

- eine Spalte **Offen** je Position — gezeigt auf dem **ausgestellten Auftrag**, gefragt wird
  der Lieferschein-Endpunkt, sichtbar nur mit dem Recht `DELIVERY_NOTE_READ`;
- eine **Markierung** an einer Position, die höher erfasst ist, als der Vorgänger noch offen
  hat. Sie wird benannt, nie gesperrt.

## Begründung

**Die Vorschau macht die vorbelegte Menge glaubwürdig.** Eine Zahl, die einfach im Feld steht,
wird entweder blind übernommen oder misstrauisch überschrieben. «10 bestellt, 6 geliefert, 4
offen» beantwortet die Rückfrage, bevor sie entsteht, und kostet keinen Klick.

**Sperren statt 409.** Der Fehler des Backends bleibt die Absicherung, aber ein gesperrter
Knopf mit einem Satz daneben ist die bessere Auskunft als eine rote Meldung nach dem Klick.
Der Kandidat verschwindet trotzdem nicht aus der Liste: er ist der Beleg, den jemand sucht,
wenn er wissen will, ob schon alles draussen ist.

**Die Markierung sperrt nichts.** Eine Nachlieferung über die bestellte Menge hinaus kommt vor;
das Backend lässt sie zu, und die Maske darf nicht strenger sein als die Regel. Der häufigere
Grund ist aber ein versehentlich überschriebener Vorschlag — deshalb wird die Abweichung
benannt.

**Die Spalte Offen hängt am Lieferschein-Recht, nicht am Auftragsrecht.** «Was fehlt dem Kunden
noch» ist eine Frage nach Lieferungen, und die Antwort kommt aus den Lieferscheinen. Wer sie
nicht lesen darf, bekommt die Spalte nicht — statt einer Spalte, die für ihn immer «alles
offen» sagen würde.

**Nur auf dem ausgestellten Auftrag.** Ein Entwurf hat noch keine Folgebelege, und auf einem
Lieferschein oder einer Rechnung wäre die Spalte eine Frage, die niemand stellt.

## Alternativen

- **Positionsauswahl mit Mengenfeldern im Dialog.** Verworfen für jetzt: der Entwurf ist frei
  änderbar, und die vorbelegte Restmenge löst den häufigen Fall ohne einen einzigen Klick. Der
  Dialog wäre die richtige Antwort, sobald Positionen regelmässig einzeln gezogen werden — die
  Datenhaltung trägt ihn bereits.
- **Erledigte Kandidaten ausblenden.** Verworfen: die Liste ist auch ein Nachschlagewerk. Ein
  Beleg, der spurlos verschwindet, sieht aus wie ein gelöschter.
- **Die Übernahme höherer Mengen sperren.** Verworfen: das Backend erlaubt sie mit gutem
  Grund, und eine Maske, die strenger ist als die Regel, treibt den Erfasser in einen Freitext
  oder in eine zweite Zeile.
- **Die Spalte Offen immer zeigen, auch ohne Lieferschein-Recht.** Verworfen: sie stünde dann
  auf «alles offen», was falsch statt leer ist.
- **Die drei Zahlen in der Positionstabelle des Entwurfs statt im Dialog.** Verworfen: dort
  kommen sie zu spät. Die Entscheidung, welchen Beleg man übernimmt, fällt im Dialog.
