# ADR-0053 — Ein Partner wird auf einer Seite erfasst, in Bereichen statt in Registern

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Löst [ADR-0052](ADR-0052-partner-erfassen-in-registern-mit-vorgaben.md) ab.
  Was dort zu den Vorgaben steht, gilt weiter: Sprache und Währung sind ausgefüllt, und die
  leere Zahlungskondition nennt die Vorgabe des Mandanten. Die Pflichtadresse und die
  Kontaktpersonen aus [ADR-0051](ADR-0051-partner-erfassen-mit-pflichtadresse-und-kontakten.md)
  bleiben.
- **Backend:** keins.

## Kontext

ADR-0052 verteilte die Felder der Erfassungsmaske auf vier Register in einem schmalen Kasten.
Rückmeldung im Gebrauch: die Maske ist zu klein, die Rechtsform-Auswahl zu schmal, und die UID
einer Firma gehört zu den Stammdaten. Die Felder sollen auf einer Seite stehen, in getrennten
Bereichen statt in Registern: die Kontaktpersonen unten, das Vorausgefüllte rechts.

## Entscheidung

Die Erfassungsmaske nutzt die ganze Breite der Seite und hat keine Register:

| Bereich | Lage | Inhalt |
|---|---|---|
| Stammdaten | links, drei Fünftel | Art. Bei einer Firma der Firmenname über die ganze Breite, darunter Rechtsform und UID je zur Hälfte. Bei einer Person Anrede, Vorname und Nachname. Dazu die Adresse sowie E-Mail, Telefon und Website |
| Konditionen | rechts oben | Zahlungskondition, Währung, Sprache, Kreditlimite, Kreditorenreferenz |
| Weitere Angaben | rechts darunter | Handelsregistername (nur bei Firmen), Rollen, interne Notiz |
| Kontaktpersonen | unten, ganze Breite | die Liste aus ADR-0051 |

Unter `lg` stehen die Bereiche untereinander, in derselben Reihenfolge.

## Begründung

Links steht, was man tippt, und rechts, was die Maske schon weiss. Wer nur Name und Adresse hat,
sieht trotzdem auf einen Blick, mit welcher Sprache und Währung der Partner entsteht. Ein
Register müsste man dafür erst öffnen. Ohne Register entfällt auch das Springen in das Register
eines Fehlers aus ADR-0052: jede Meldung steht sichtbar an ihrem Feld.

Die Rechtsform bekommt die halbe Breite des Bereichs statt eines Viertels. Ihre Bezeichnungen
(«Gesellschaft mit beschränkter Haftung») sind lang und wurden vorher abgeschnitten.

## Verworfene Alternativen

**Die Register behalten und nur den Kasten breiter machen.** Verworfen: die Vorgaben blieben
hinter einem Register versteckt, und genau das sollte die Maske zeigen.

**Die UID weiter unter «Weitere Angaben».** Verworfen: für eine Firma gehört die UID zur
Identität. Sie steht auf jeder Rechnung mit MWST, und man hat sie meist zusammen mit dem
Firmennamen zur Hand.

**Die Kontaktpersonen rechts neben den Stammdaten.** Verworfen: eine Liste mit mehreren Zeilen
braucht Breite, und rechts stehen schon die Vorgaben.

## Konsequenzen

- `CREATE_TABS` und das Springen in das Register eines Fehlers sind weggefallen.
- Die Erfassungsmaske ist breiter als die Dialoge. Die Bearbeitungsmaske ist ähnlich aufgebaut
  (zwei Spalten im Register «Stammdaten»), aber nicht gleich.

## Abweichungen vom Issue

Keine.

## Offen

Keins.
