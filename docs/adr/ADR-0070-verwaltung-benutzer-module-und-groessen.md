# ADR-0070 — Verwaltung: Benutzer auf `FormMask`, Module mit Rückfrage, Grössen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc fragt bei Änderungen), ADR-0069 (eine Regel für alle
  Masken), ADR-0049 (Grössen) und ADR-0050 (Tooltips) für die Verwaltung um.

## Kontext

Die Verwaltung umfasst Benutzer, Rollen, Mandanten, Nummernkreise, Mahneinstellungen,
Druckvorlagen, Belegarten und die Module des Mandanten. Die meisten Seiten sind Listen mit
einem Dialog oder Stammdatenmasken, die bereits auf `FormMask` liegen (Mandant, Druckvorlage,
Belegart, Mahneinstellungen). Zwei Stellen hatten noch keinen Schutz: die Benutzermaske, die
Anzeigename und E-Mail in der Kopfzeile speichert, und die Modulseite mit Schaltern und
Schwellen.

## Entscheidung

1. **Die Benutzermaske ist eine `FormMask`**, für das Neuanlegen wie für das Bearbeiten. Beim
   Bearbeiten gilt eine Änderung, wenn Anzeigename oder E-Mail vom gespeicherten Stand abweichen.
   Die Berechtigungen für Mandanten und das Zweite-Faktor-Panel speichern unabhängig und bleiben
   aus der Maske heraus, wie bisher.
2. **Die Modulseite fragt, ohne Zurück-Weg.** Sie ist ein Bildschirm der Einstellungen, kein
   Detail einer Liste. `useLeaveGuard` fragt bei Schaltern oder Schwellen, die geändert, aber nicht
   gespeichert sind. «Verwerfen» setzt beide auf den gespeicherten Stand zurück.
3. **Listen, Rollen und Nummernkreise bleiben.** Sie haben Dialoge mit eigener Rückfrage oder
   keine Eingaben.
4. **Grössen kommen aus rem und Schrift-Tokens.**
5. **Erklärsätze werden Tooltips**, wo sie nur erklären: die Prozentangabe und die Mengenangabe der
   Inventur-Schwellen, die Vorgabe für neue Belege. Zustandshinweise bleiben sichtbar, etwa die
   Mindestlänge des Passworts und die Angabe, dass nach dem Anlegen einiges feststeht.

## Begründung

Die Benutzermaske ist eine Stammdatenmaske mit Speichern in der Kopfzeile. Ohne Schutz geht bei
Esc ein halb geschriebener Name oder eine halb geschriebene Adresse verloren. Die Modulseite
enthält Schalter, die Folgen haben (Daten bleiben, Schreibwege sperren sich). Eine versehentlich
verworfene Schaltung wäre eine Entscheidung, die niemand bewusst getroffen hat, also fragt sie.

## Verworfene Alternativen

**Die Modulseite als `FormMask` mit einem Zurück-Weg auf die Startseite.** Verworfen: der Weg
hätte keinen Sinn, die Seite steht in den Einstellungen und hat keinen Herkunftsort.

**Die Benutzer-Berechtigungen in die Maske ziehen.** Verworfen: sie speichern mit eigenen
Endpunkten, die sofort wirken. Der Schutz der Kopfzeile würde sie nicht erfassen.

## Konsequenzen

- Esc und der Zurück-Link fragen auf den Benutzer- und Modulseiten bei ungespeicherten Änderungen.
- Die Benutzermaske speichert wie bisher Anzeigename und E-Mail und schliesst danach.

## Abweichungen vom Issue

Keine.

## Offen

- Die Verwaltungsmasken sind in schmalen Fenstern nicht im Browser geprüft.
