# ADR-0059 — Produktmaske: Neuanlage mit Preis je Preisgruppe, Fehler am Feld

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Ergänzt ADR-0050 (Hinweise als Tooltip, Fehler am Feld) und ADR-0048 (Esc
  bricht ab). Setzt das Backend-ADR-0141 um.

## Kontext

Die Produktmaske war die einzige Bearbeitungsmaske ohne `FormMask`. Esc reagierte darin gar
nicht, und der Zurück-Link fragte nicht nach ungespeicherten Änderungen. Fehler standen als
ein Satz über dem Formular. Die Neuanlage zeigte alle Stammdaten und die Register, der
Grundpreis lag aber im Register «Preise», also versteckt. Die Anlage lief in zwei Anfragen,
`POST` für das Produkt und `PUT` für die Preise.

## Entscheidung

1. **Die Maske ist eine `FormMask`.** Esc, der Zurück-Link und der Änderungsschutz kommen so
   aus dem gemeinsamen Baustein. Die Register erscheinen erst, wenn der Artikel gespeichert ist.
2. **Die Neuanlage zeigt nur das Nötige.** Stammdaten (Art, Artikelnummer, Bezeichnung,
   Einheit, MwSt-Behandlung) und je Preisgruppe ein Preisfeld. Der Grundpreis hat einen eigenen
   Eintrag ohne Gruppe. Die Staffeln und Zeiträume folgen im Register «Preise» nach dem
   Speichern.
3. **Eine Anfrage beim Anlegen.** `POST` schickt die Preise mit (Backend ADR-0141). Die
   Zwischenstand-Logik für die zweite Anfrage entfällt damit.
4. **Gespeicherter Artikel:** Register Hauptdaten, Preise, Buchhaltung, Lager (nur bei
   Lagerführung), Freifelder (nur wenn definiert). Oben eine Faktenzeile mit Nummer,
   Grundpreis, Einheit und MwSt-Satz. Das Update schickt Preise und Aktiv-Flag nur, wenn sie
   sich geändert haben.
5. **Feldfehler** kommen über `useFieldErrors` (ADR-0050). Die Vorprüfung in
   `productFieldErrors` und `priceFieldErrors` liefert Meldungen pro Feld. Die Preistabelle
   hat eine Meldung für die ganze Tabelle, unter dem Schlüssel `prices`.
   - Ein Fehler vom Backend, der nur auf Felder zeigt, die die Maske zeichnet, erscheint nur
     am Feld. Alles andere bleibt in einer Meldung oberhalb des Formulars.
   - Das Lagerflag hat kein Fehlerfeld, weil eine Checkbox keine Meldung tragen kann. Sein
     Fehler geht in die Meldung oberhalb.
6. **Hinweise sind Tooltips**, wo sie etwas erklären, das man dem Feld nicht ansieht (Eindeutigkeit
   der Nummer, Auswirkung von Aktiv und Rabattfähig). Sätze unter Feldern bleiben nur bei
   Zuständen, etwa dem Hinweis «Keine Preisgruppe erfasst».
7. **Grössen kommen aus den Tokens.** Die px-Werte der Produkt-Module (Listen, Preistabelle,
   Preisgruppen, Schnellerfassung, Freifelder, Lager) werden durch Spaltenbreiten und
   Schriftgrössen aus `index.css` ersetzt.

## Begründung

Die Produktmaske folgt damit dem Muster der Partner-Maske, die bereits umgestellt ist. Wer
einen neuen Artikel anlegt, will in einer Ansicht Name, Einheit und Preis sehen. Die Register
brauchen einen gespeicherten Artikel. Ein einziger Request beim Anlegen verhindert einen
Artikel ohne Preis, falls der zweite Schritt scheitert.

## Verworfene Alternativen

**Die Preise auf einem eigenen Register bei der Neuanlage lassen.** Verworfen: der
wichtigste Preis wäre versteckt, und es entstünde genau die Lücke, die die Vorgabe schliessen
soll.

**Zwei Anfragen beibehalten.** Verworfen, siehe Backend ADR-0141.

**Die Fehlermeldungen des Backends über das Feld raten.** Verworfen, siehe Backend ADR-0132.

**Ein eigenes Fehlerfeld am Lagerflag.** Verworfen: eine Checkbox trägt keine Meldung, und die
Zustandsfolge ist bereits durch die Art des Artikels gesichert.

## Konsequenzen

- Spaltenbreiten wechseln von festen Pixeln auf Tokens (etwa 110 px zu 7 rem). Die Tabellen
  wirken dadurch minimal anders, die Inhalte passen weiter.
- Die Neuanlage zeigt keine Register mehr. Wer dort eine Lager- oder Buchhaltungsfrage hat,
  speichert zuerst und öffnet den Artikel.
- `productFieldErrors` ersetzt `firstComplaint`, `priceFieldErrors` ersetzt
  `firstPriceComplaint`. Beide liefern Meldungen pro Feld.

## Abweichungen vom Issue

Keine.

## Offen

- Die Preistabelle zeigt Fehler nur für die Tabelle als Ganzes. Eine Markierung der Zeile ist
  erst sinnvoll, wenn das Backend die Zeilennummer im Feldnamen liefert (Backend ADR-0141).
- Der Lager-Fehler erscheint oberhalb des Formulars statt an der Checkbox.
