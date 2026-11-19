# ADR-0054 — Die Identität eines Partners ist änderbar, die Standardadresse steht in den Stammdaten

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Ändert die gesperrten Felder aus
  [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md) (Abschnitt 1, `locked`).
- **Backend:** ADR-0133 (Art und Name nachträglich ändern)

## Kontext

Die Bearbeitungsmaske zeigte Art, Firmenname, Rechtsform und Personennamen gesperrt, mit einem
Schloss und dem Grund «Steht mit dem Anlegen fest». Für Name und Rechtsform stimmte das nicht
einmal: das Backend nahm sie schon an. Die Standardadresse stand nur in der Faktenzeile über
den Registern und im Register «Adressen». Verlangt ist, dass sich der Partner ganz bearbeiten
lässt und dass die Standardadresse in der Hauptansicht sichtbar ist, mit einem Stift zum
Bearbeiten.

## Entscheidung

1. Im Register «Stammdaten» sind Art (`SegmentedControl`), Firmenname, Rechtsform, Anrede,
   Vorname und Nachname änderbar. Pflichtfelder sind markiert, Fehler stehen am Feld. Die UID
   und der Handelsregistername stehen jetzt bei der Identität statt darunter.
2. Neuer Bereich «Standardadresse» unter der Identität (`DefaultAddressPanel`). Er zeigt die
   Adresse so, wie sie gedruckt wird. Der Stift öffnet denselben `AddressDialog` wie das
   Register «Adressen» und speichert die Adresse sofort. Fehlt eine Adresse, steht dort ein Plus
   zum Erfassen.
3. Der Tooltip am Firmennamen sagt, was eine Änderung bewirkt: neue Belege tragen den neuen
   Namen, ausgestellte behalten den alten.

## Begründung

Ein Tippfehler im Firmennamen ist der häufigste Grund, einen Partner zu öffnen. Ihn neu
anzulegen hinterliesse eine Dublette. Die Adresse in Feldern direkt in der Stammdatenmaske zu
bearbeiten, würde zwei Speichervorgänge verstecken: der Partner geht über `PUT /partners/{id}`,
die Adresse über ihren eigenen Endpunkt. Mit einem Dialog ist klar, was gespeichert wird.

## Verworfene Alternativen

**Die Adressfelder direkt in die Stammdaten legen.** Verworfen aus dem Grund oben. Ein
«Abbrechen» der Maske würde die Adresse nicht zurücknehmen, wenn sie schon gespeichert wäre.

**Die Faktenzeile reicht.** Verworfen: dort steht die Adresse in einer Zeile gekürzt und ohne
Weg zum Bearbeiten.

## Konsequenzen

- `LOCKED` und das Schloss an diesen Feldern sind weggefallen. `locked` bleibt als Möglichkeit
  von `Field` für andere Masken bestehen.
- Neue Funktion `addressLines` in `addressForm.ts`.

## Abweichungen vom Issue

Keine.

## Offen

Keins.
