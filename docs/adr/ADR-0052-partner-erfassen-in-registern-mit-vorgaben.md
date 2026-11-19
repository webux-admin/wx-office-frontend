# ADR-0052 — Beim Erfassen eines Partners stehen alle Felder in Registern, mit den Vorgaben ausgefüllt

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Ändert Abschnitt 3 von
  [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md) («Erfassen fragt nur das Nötige»)
  und baut auf [ADR-0051](ADR-0051-partner-erfassen-mit-pflichtadresse-und-kontakten.md) auf.
  Die Pflichtadresse und die Kontaktpersonen aus ADR-0051 bleiben.
- **Backend:** keins.

## Kontext

Nach ADR-0050 zeigte die Erfassungsmaske nur Art, Name, Rechtsform, Adresse, E-Mail und
Telefon. Sprache, Währung und Zahlungskondition übernahm sie still aus den Vorgaben des
Mandanten. Wer etwas anderes wollte, etwa einen Kunden auf Französisch oder in Euro, musste den
Partner zuerst speichern, ihn danach suchen und dann ändern. Verlangt ist jetzt, dass die
übrigen Werte schon beim Erfassen eingetragen werden können und die Vorgaben dort sichtbar
sind, am besten in eigenen Registern.

## Entscheidung

Die Erfassungsmaske hat vier Register:

| Register | Inhalt |
|---|---|
| Stammdaten | Art, Name, Rechtsform, Adresse (PLZ und Ort Pflicht), E-Mail, Telefon, Website |
| Kontaktpersonen | die Liste aus ADR-0051, mit Anzahl im Register |
| Konditionen | Zahlungskondition, Währung, Sprache, Kreditlimite, bei Lieferanten die Kreditorenreferenz |
| Weitere Angaben | UID und Handelsregistername (nur bei Firmen), Rollen, interne Notiz |

1. **Die Vorgaben stehen sichtbar in den Feldern.** Sprache und Währung sind beim Öffnen mit
   der Vorgabe des Mandanten ausgefüllt. Die Zahlungskondition bleibt leer, und die leere
   Auswahl sagt, welche Vorgabe gilt («Vorgabe des Mandanten: 30 Tage netto»).
2. **Alle Register bleiben geladen, nur das offene ist sichtbar.** Dadurch füllt ein Feld seine
   Vorgabe aus, auch wenn sein Register nie geöffnet wurde. Eine Fehlermeldung bleibt bestehen,
   auch wenn sie in einem anderen Register steht.
3. **Speichern öffnet das Register mit dem Fehler.** Bei der eigenen Prüfung der Maske wie bei
   einer Ablehnung durch das Backend öffnet sich das erste Register, in dem ein Feld eine
   Meldung hat. Der Fokus landet auf diesem Feld.
4. **Konditionen und Rollen sind gemeinsame Bausteine** (`PartnerConditionFields`,
   `PartnerRoleFields`). Die Bearbeitungsmaske zeigt dieselben Felder mit demselben Text.

## Begründung

Eine Vorgabe, die man nicht sieht, kann man nicht prüfen. Wer einen Kunden aus Genf am Telefon
erfasst, merkt erst auf der ersten Offerte, dass sie deutsch geschrieben ist. In einem eigenen
Register stören die Felder trotzdem nicht. Wer nur Name und Adresse braucht, speichert wie
bisher aus dem ersten Register.

Die Zahlungskondition bleibt leer, weil ein leeres Feld etwas anderes bedeutet als ein
ausgefülltes: der Partner folgt dann der Vorgabe des Mandanten, auch wenn diese später ändert.
Würde die Maske die Vorgabe eintragen, wäre der Partner auf die heutige Kondition festgelegt,
ohne dass das jemand gewählt hat. Bei Sprache und Währung gibt es dieses «folgt der Vorgabe»
nicht: das Backend speichert dort immer einen Wert.

## Verworfene Alternativen

**Alles auf einer Seite untereinander.** Verworfen: die Maske würde dreimal so lang, und das
Wichtige wäre nicht mehr auf einen Blick zu sehen. Verlangt waren Register.

**Die Zahlungskondition mit der Vorgabe ausfüllen wie Sprache und Währung.** Verworfen aus dem
Grund oben: der Partner würde still auf die heutige Kondition festgelegt.

**Nur das offene Register laden.** Verworfen: ein Feld in einem nie geöffneten Register hätte
seine Vorgabe nicht ausgefüllt, und eine Meldung dort wäre beim Wechsel verloren gegangen.

**Die Bearbeitungsmaske gleich auf dieselben vier Register umstellen.** Nicht Teil dieses
Schritts: sie hat ihre eigenen Register für gespeicherte Daten (Adressen, Preise, Verlauf), und
ihr Register «Stammdaten» zeigt schon alle diese Felder.

## Konsequenzen

- Die Erfassungsmaske ist nicht mehr nur das Nötigste. Das erste Register ist es weiterhin.
- Die Bearbeitungsmaske nennt im leeren Eintrag der Zahlungskondition jetzt auch, welche
  Vorgabe gilt.
- Ein Test, der ein Feld eines anderen Registers sucht, findet es, aber in einem versteckten
  Bereich (`[hidden]`).

## Abweichungen vom Issue

Keine.

## Offen

Keins.
