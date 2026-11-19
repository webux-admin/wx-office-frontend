# ADR-0055 — Die Adresse eines Belegs wird aus den Adressen des Kunden gewählt

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Neu.
- **Backend:** ADR-0134 (Adresse im Beleg wählbar)

## Kontext

Die Maske für einen neuen Beleg zeigte die Adresse, die das Backend vorschlug, als Text. Ein
Entwurf zeigte seinen Empfänger mit «Kunde wechseln» als einzigem Weg. Verlangt ist, dass man im
Vorgang zwischen den hinterlegten Adressen wählt, vorausgewählt die übliche.

## Entscheidung

1. **Beim Anlegen:** Hat der Kunde mehr als eine Adresse, steht unter «Empfänger» eine Liste von
   Karten (`AddressChoice`), eine je Adresse. Jede Karte zeigt die Adresse, wie sie gedruckt
   wird, und ist mit «Standard» und ihren Verwendungen markiert. Vorausgewählt ist die Adresse,
   die das Backend vorschlägt (`addressId` aus `…/defaults`). Wer sie stehen lässt, schickt keine
   `addressId`, und das Backend nimmt seine eigene. Mit nur einer Adresse bleibt die Anzeige als
   Text.
2. **Am Entwurf:** Neben «Kunde wechseln» steht «Adresse wählen». Der Knopf öffnet
   `ChangeAddressDialog` mit denselben Karten, gesetzt auf die Adresse, die der Entwurf trägt.
   «Übernehmen» schickt `PUT …/header` mit `addressId` und `priceMode: COPY`. Ohne Änderung wird
   nichts geschickt.
3. Die Standardadresse steht in der Liste immer zuerst.

## Begründung

Karten statt einer Auswahlliste, weil man Adressen am Ort und an der Strasse unterscheidet und
nicht an einem Namen. In einer Auswahlliste stünde fünfmal «Druckerei Meier AG». Die Wahl am
Entwurf geht über einen Dialog, weil sie sofort speichert: der Empfänger ist ein eigener Schritt
neben dem Kopf, wie «Kunde wechseln».

## Verworfene Alternativen

**Eine Auswahlliste (`select`).** Verworfen aus dem Grund oben.

**Die Adresse am Entwurf immer als Karten zeigen, ohne Dialog.** Verworfen: die Spalte rechts
ist schmal, und ein Klick würde ohne Bestätigung den Empfänger des Belegs ändern.

## Konsequenzen

- Neue Bausteine `document/AddressChoice.tsx`, `document/ChangeAddressDialog.tsx` und
  `document/usePartnerAddresses.ts`. Er liest den Kunden über denselben Query-Schlüssel wie die
  Partnermaske.
- `DocumentParty` im Frontend kennt `addressId` und `addressChosen`.

## Abweichungen vom Issue

Keine.

## Offen

Keins.
