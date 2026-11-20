# ADR-0056 — Alle Register des Partners folgen dem Muster von Adressen und Kontaktpersonen

- **Status:** Angenommen
- **Datum:** 2026-11-20
- **Verhältnis:** Wendet [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md) (Hinweise
  als Tooltip) auf die übrigen Register an.
- **Backend:** keins. `PUT …/partners/{id}/prices` mit `id` schreibt einen Preis schon heute um.

## Kontext

Stammdaten, Adressen und Kontaktpersonen waren auf die neuen Maskenbausteine umgebaut. Preise,
Einstellungen, Projekte und Verlauf noch nicht: der Preis wurde in einer Formularzeile unter
der Tabelle erfasst, liess sich nicht bearbeiten und wurde ohne Rückfrage gelöscht. Ein
gelerntes Zahlungskonto wurde ebenfalls ohne Rückfrage vergessen. Hinweise standen als Zeilen
unter den Feldern.

## Entscheidung

1. **Ein Muster für jede Liste:** Panel mit Titel, Knopf «+ …» oben rechts, Tabelle, Stift und
   Papierkorb je Zeile, Klick auf die Zeile öffnet die Bearbeitung, Entfernen fragt zuerst.
2. **Preise** werden in einem Dialog erfasst und bearbeitet. Beim Bearbeiten bleibt das Produkt
   fest, weil das Backend eine Zeile nur innerhalb ihres Produkts umschreibt.
3. **Gelernte Zahlungskonten** stehen als Tabelle; «Vergessen» fragt zuerst.
4. **Hinweise als Tooltip** in Dokumenten, Mahnwesen und Preisgruppe. Ob das Mahnwesen dem
   Mandanten folgt, steht als Badge im Kopf des Panels.
5. Projekte und Verlauf bekommen einen Panel-Titel wie alle anderen Register.

## Begründung

Wer ein Register beherrscht, beherrscht alle. Eine Zeile Formular unter der Tabelle war der
einzige Ort, an dem man anders arbeitete, und der einzige ohne Bearbeiten.

## Verworfene Alternativen

**Preise direkt in der Tabelle bearbeiten.** Verworfen: fünf Felder je Zeile in einer schmalen
Tabelle, und ein Tippfehler würde sofort gespeichert.

**Das Produkt beim Bearbeiten wählbar lassen.** Verworfen: das Backend lehnt das ab, der Dialog
würde einen Fehler provozieren, den er vermeiden kann.

## Konsequenzen

- `PartnerPrices` hat einen eigenen `PriceDialog`, getestet in `PartnerPrices.test.tsx`.
- Der Hinweis «Belegarten ohne Leserecht erscheinen nicht» im Verlauf fällt weg. Das Verhalten
  bleibt: der Server lässt diese Zeilen weg.

## Abweichungen vom Issue

Keine.

## Offen

Keins.
