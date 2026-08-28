# ADR-0019 — Die Retourenmaske warnt vor einer Nummer, die schon im Lager liegt

- **Status:** Angenommen
- **Datum:** 2026-08-28
- **Setzt um:** [Backend ADR-0081](../../wx-office/docs/adr/ADR-0081-die-retoure-warnt-vor-einer-nummer-im-lager.md)

## Kontext

`LotAllocationField` bietet auf einer Retoure die zuletzt ausgelieferten Nummern an und warnt vor
einer, die nicht darunter ist — nimmt sie aber, denn die Chargenwahl auf einer Retoure ist frei
([Backend ADR-0069](../../wx-office/docs/adr/ADR-0069-chargen-an-der-belegposition.md),
[ADR-0073](../../wx-office/docs/adr/ADR-0073-zuletzt-ausgelieferte-nummern.md)).

Eine Nummer, die zwar einmal ausgeliefert wurde, inzwischen aber wieder im Lager liegt, wird vom
Server beim **Ausstellen** abgelehnt
([Backend ADR-0077](../../wx-office/docs/adr/ADR-0077-seriennummer-auf-der-belegretoure.md)) — und
sie steht sogar in der angebotenen Liste. Bis heute merkt das niemand, bis der ganze Beleg
erfasst ist, und die Meldung nennt den Lagerort, nicht die Position.

Randbedingungen:

- Das Feld kennt `product.tracking`, aber die Ablehnung entscheidet über die **eingefrorene Art
  des Loses**. Die beiden können auseinanderlaufen.
- Ein Storno-Gegenbeleg ist von der Ablehnung ausgenommen. Das Feld hat kein Merkmal dafür — und
  braucht keines: `writeCounterDocument` finalisiert den Gegenbeleg im selben Aufruf, und eine
  Position lässt sich nur an einem Entwurf bearbeiten. `correctsDocumentId` steht im
  `DocumentDto`, kommt in `types.ts` aber gar nicht vor.
- Der Server hat den Endpunkt
  `GET …/products/{productId}/serial-number-holding?lotNumber=` bekommen. Er antwortet immer mit
  200 und nennt einen Lagerort nur, wo eine Warnung fällig ist.

## Entscheidung

**Das Feld fragt jede fertig getippte Nummer einer Retoure und zeigt eine `WarningNotice`** —
denselben Satz, den der Server beim Ausstellen sagen würde, plus die Folge:

> SN-4711 liegt bereits in Hauptlager. Das Ausstellen weist die Position ab.

Bei mehreren Nummern ohne Lagerort, weil sie in verschiedenen liegen können: «SN-4711 und eine
weitere liegen bereits im Lager.»

**Gewarnt, nie gesperrt.** Die Nummer bleibt im Feld, zählt in der Kopfzeile mit und wird nach
oben gemeldet — genau wie die Warnung über eine Nummer, die nie ausgeliefert wurde.

**Das Feld entscheidet nicht, welche Nummer eine Warnung wert ist.** Es fragt jede — auch bei
einer Charge — und der Server antwortet für alles, was nicht abgelehnt würde, ohne Lagerort.

**Eine Abfrage je Nummer** (`useQueries`), nicht eine für alle. Der Schlüssel trägt die
kleingeschriebene Nummer, so wie der Server vergleicht.

**Die Zeile, in der gerade getippt wird, ist ausgenommen** — dieselbe Regel, die
`neverIssuedWarning` schon befolgt.

**Kein `reversal`-Merkmal am Feld.**

## Begründung

**Der Server entscheidet**, weil die Alternative zwei Orte für dieselbe Regel wären und der
zweite der ist, der beim nächsten Umbau vergessen wird. Konkret: die Losart ist eingefroren, das
Feld kennt nur `product.tracking`. Ein Produkt, das von Seriennummern auf Chargen umgestellt
wurde, trägt weiterhin Seriennummern-Lose — ein Feld, das über `product.tracking` entscheidet, ob
es überhaupt fragt, schwiege genau dort, wo das Ausstellen ablehnt. Der Preis ist eine Anfrage je
Chargennummer, deren Antwort «nichts» lautet.

**Kein `reversal`-Merkmal**, weil es nie `true` würde: ein Gegenbeleg ist kein Entwurf, und diese
Maske bearbeitet nur Entwürfe. Backend ADR-0077 nennt ausserdem als Stolperschwelle, dass es
bereits zwei Stellen gibt, die den Storno anders behandeln, und eine dritte ein Anlass zum
Bündeln wäre. Ein Merkmal, das nie greift, wäre diese dritte Stelle — und in einem Jahr eine
falsche Fährte.

**Der Satz nennt die Folge**, anders als die Warnung über eine nie ausgelieferte Nummer. Dort
heisst es «Die Rücknahme wird trotzdem gebucht», hier «Das Ausstellen weist die Position ab» —
denn das tut es. Eine Warnung, die verschweigt, dass der Beleg so nicht durchgeht, wäre die
halbe Auskunft.

**Eine Abfrage je Nummer**, weil die einundzwanzigste Nummer dann eine Anfrage kostet statt
aller einundzwanzig noch einmal.

## Alternativen

**Erst beim Speichern der Position warnen.** Verworfen: derselbe Fehler eine Stufe früher. Wer
zwanzig Nummern scannt, will beim zwanzigsten wissen, dass der dritte nicht stimmt.

**Nur bei `product.tracking === 'SERIAL'` fragen.** Spart die Anfragen bei Chargen. Verworfen
aus dem Grund oben: die eingefrorene Losart ist nicht `product.tracking`.

**Die Nummer im Feld sperren, wie eine unbekannte Nummer beim Ausbuchen gesperrt wird.**
Verworfen: die Chargenwahl auf einer Retoure ist bewusst frei (Backend ADR-0069), und wer die
Ware in der Hand hält, weiss mehr als das Journal. Die Sperre gehört ans Ausstellen und steht
dort schon.

**Die Warnung auch in der Handbuchung zeigen** (`BookStockDialog`). Verworfen: dort ist der
Zugang eine Zeile, die Ablehnung kommt sofort und wird bereits sichtbar gezeichnet.

## Konsequenzen

- Eine Retoure über zwanzig Geräte löst zwanzig kleine Anfragen aus, je Nummer gecacht.
- Solange eine Antwort unterwegs ist, wird nicht gewarnt. Das ist immer noch früher als das
  Ausstellen.
- Neu in `lib/inventory.ts`: `serialNumberHoldingUrl` und `serialNumberHoldingKey`. Neu in
  `lib/types.ts`: `SerialNumberHolding`. Neu in `pages/inventory/lotAllocation.ts`:
  `alreadyInStockWarning`.
- Ändert sich je etwas daran, dass ein Gegenbeleg nie ein Entwurf ist, gehört diese Entscheidung
  mit geprüft: die Warnung erschiene dann dort, wo nichts abgelehnt wird, und eine solche
  Warnung lernt man wegzuklicken.
