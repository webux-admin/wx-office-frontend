# ADR-0065 — Bank: Listen, Dialoge und Regeln auf den gemeinsamen Bausteinen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc), ADR-0049 (Grössen) und ADR-0050 (Tooltips) für das
  Bankmodul um. Die Zuordnungs-Klärung folgt ADR-0043 und ADR-0063 unverändert.

## Kontext

Zum Bankmodul gehören die Bankauszüge, die Bankbuchungen, die Bankkonten, die Zuordnungsregeln
und der Klärungskorb. Die Listen, die Detailansicht eines Auszugs und die Regelmaske hatten
Pixelwerte und Erklärsätze unter den Feldern. Die Bankkonten und die Regeln sind Listen mit
einem Dialog zur Erfassung.

## Entscheidung

1. **Listen, Dialoge und die Regelmaske bleiben in ihrem Aufbau.** Die Bankkonten und die
   Regeln werden über einen Dialog erfasst. `Dialog` liefert Esc und die Rückfrage.
2. **Die Auszugsdetails bleiben eine Detailseite mit `PageHeader`.** Sie zeigt nur Daten.
3. **Grössen kommen aus rem und Schrift-Tokens.**
4. **Erklärsätze werden Tooltips.** Das betrifft Stichtage und Filter, Konfidenz, Rundung,
   Schwellen und die Hinweise zu Bankkonto und Regel.
5. **Zustandshinweise bleiben sichtbar.** Ein Feld, das nach dem Anlegen feststeht, zeigt
   «Steht fest» unter dem Feld. Die Datei-Auswahl für den Auszug zeigt das Format sichtbar,
   weil man es vor dem Hochladen wissen muss.

## Begründung

Das Bankmodul besteht aus Listen und kleinen Erfassungen. Eine Vollmaske brächte hier keinen
Gewinn. Die Regelmaske hat viele Felder, aber ihre Erklärungen sind Entscheidungshilfen und
keine Pflichtangaben; ein Tooltip reicht. Die Hinweise, die sagen, dass ein Feld nicht mehr
geändert werden kann, bleiben sichtbar, weil man sie beim Erfassen nicht übersehen soll.

## Verworfene Alternativen

**Die Regelmaske als `FormMask`.** Verworfen: die Regel wird aus der Liste heraus in einem
Dialog bearbeitet, und eine Vollmaske würde für eine Regel mit wenigen Feldern den Kontext
verlassen.

**Alle Hinweise als Tooltip.** Verworfen: ein «Steht fest» unter einem gesperrten Feld erklärt,
warum es gesperrt ist. Ein Tooltip wäre bei der Erfassung leicht zu übersehen.

**Das Format der Auszugsdatei als Tooltip.** Verworfen: die Angabe bestimmt, ob die Datei
angenommen wird. Sie bleibt unter dem Feld.

## Konsequenzen

- Keine Änderung im Ablauf. Die Seiten haben einheitliche Grössen und ruhigere Hinweise.
- Der Klärungskorb bekommt nur Grössen-Tokens. Sein Aufbau bleibt.

## Abweichungen vom Issue

Keine.

## Offen

- Das Feld «IBAN» in den Bankkonten zeigt beim Anlegen einen Hinweis, der nur Auskunft gibt
  («Mit oder ohne Leerzeichen»). Er bleibt unter dem Feld, weil er zusammen mit «Steht fest»
  in einem Hinweis steht. Ein Aufteilen wäre ein eigener Schritt.
- Die Bankmasken sind in schmalen Fenstern nicht geprüft.
