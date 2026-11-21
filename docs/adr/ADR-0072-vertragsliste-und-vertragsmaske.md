# ADR-0072 — Verträge: Liste, Maske mit Positionen im Dialog, Katalog als Vorschlag

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Neu. Setzt Backend ADR-0144 (Vertrag anlegen, Positionen als Werte) um und
  folgt den Mustern der Projekte (ADR-0066), der Masken auf `FormMask` (ADR-0048), der Grössen
  (ADR-0049) und der Fehler am Feld (ADR-0050).

## Kontext

Mit Backend-Issue #106 lassen sich Verträge anlegen, ändern und listen. Ein Vertrag hat einen
Kopf (Bezeichnung, Kunde, Laufzeit, Kündigungsfrist, Notiz) und eine Liste von Positionen, die
mit ihm in **einem** Request gespeichert werden. Das Backend rechnet die Beträge je Position
und die Summen je Intervall; die Oberfläche rechnet keine Beträge nach (CLAUDE.md). Der
Produktkatalog darf Positionen vorschlagen, gespeichert werden nur Werte.

## Entscheidung

1. **Liste unter `/vertraege`**, eine `DataTable` mit Schnellsuche (Nummer, Bezeichnung,
   Kunde), Sortierung nach Nummer, Bezeichnung, Kunde und Beginn und der Zahl der Positionen.
   Der Navigationseintrag «Verträge» steht in «Verkauf» nach den Projekten, mit `CONTRACT_READ`
   und hinter dem Modulschalter `CONTRACT`.
2. **Die Maske ist eine `FormMask`**: links der Vertrag (Bezeichnung, Beginn, Ende,
   Kündigungsfrist mit Einheit), rechts der Kunde (dieselbe Typ-voraus-Suche wie beim Projekt,
   über `/contracts/customers`) und die Notiz, darunter die Positionen über die ganze Breite.
3. **Positionen werden in einem Dialog erfasst** und in der Maske gehalten, wie die
   Kontaktpersonen eines neuen Partners. Reihenfolge mit den Pfeilen, Bearbeiten und Entfernen
   je Zeile. Gesendet wird alles beim Speichern des Vertrags; der Positionsschlüssel geht
   unverändert zurück.
4. **Der Katalog ist ein Feld im Dialog**, das bestehende `ProductQuickSearch` der Belege. Es
   erscheint nur mit `PRODUCT_READ`, und es ist gesperrt, solange kein Kunde gewählt ist. Ein
   gewähltes Produkt füllt Bezeichnung, Produktnummer und MwSt-Kategorie, und der Preis kommt
   aus der Preisauflösung des Backends für diesen Kunden zum Vertragsbeginn, samt «inkl. MWST».
   Findet sie keinen Preis, sagt der Dialog das und lässt das Feld leer.
5. **Beträge nur vom Backend.** Eine gespeicherte Position zeigt ihren Betrag, die Liste die
   Summen je Intervall. Sobald eine Position in der Maske geändert, hinzugefügt, entfernt oder
   verschoben ist, steht statt der Summen «Die Summen stehen nach dem Speichern», und die
   geänderte Zeile zeigt keinen Betrag.
6. **Fehler am Feld.** Die Maske prüft dieselben Regeln wie das Backend vor dem Senden
   (`contractComplaints`, `positionComplaints`). Ein Feldfehler des Backends zum Kopf steht am
   Feld; einer zu einer Position (`positions[2].unitPrice`) steht oben als Meldung, deren Satz
   die Position nennt.

## Begründung

**Zu 3:** Eine Position hat zehn Felder. In einer Tabellenzeile wären sie unlesbar, und der
Dialog ist das Muster, das Partneradressen und Kontaktpersonen schon haben. Positionen einzeln
zu speichern hiesse, den Vertrag halb geändert stehen zu lassen — mit #107 wäre das eine Version
je Klick.

**Zu 4:** Der Preis, den die Maske vorschlägt, muss der sein, den der Kunde tatsächlich zahlt.
Nur das Backend kennt Kundenpreis und Preisgruppe. Ohne Kunde gibt es diese Antwort nicht, und
der Grundpreis wäre bei jedem Kunden mit eigenem Preis falsch.

**Zu 5:** Menge mal Preis sieht harmlos aus, aber die Rundung ist eine Regel des Backends. Eine
zweite Rechnung im Browser wäre eine zweite Wahrheit.

**Zu 6:** Die Felder der Positionen stehen im Dialog, nicht in der Maske. Der Satz des Backends
nennt die Position, das reicht zum Finden.

## Verworfene Alternativen

**Positionen als editierbares Raster** wie die Buchungserfassung (ADR-0045). Verworfen: das
Raster lohnt sich für viele kurze Zeilen mit wenigen Feldern; ein Vertrag hat wenige Zeilen mit
vielen Feldern.

**Katalog aus `/contracts/products`**, damit es ohne `PRODUCT_READ` geht. Verworfen im Backend
(ADR-0144): das wäre eine Kante `contract → product`.

**Grundpreis vorbelegen, wenn kein Kunde gewählt ist.** Verworfen, siehe Begründung zu 4.

**Betrag im Browser vorrechnen, bis gespeichert ist.** Verworfen, siehe Begründung zu 5.

**Feldfehler einer Position im Dialog anzeigen.** Verworfen: der Dialog ist beim Speichern zu,
und ihn mit der richtigen Position wieder zu öffnen, hiesse den Index aus dem Feldnamen zu
lesen. Die Regeln stehen ohnehin schon im Dialog.

## Konsequenzen

- Neue Bausteine: `lib/contract.ts`, `pages/ContractListPage.tsx`, `pages/ContractPage.tsx`,
  `pages/contract/ContractPositions.tsx`, `pages/contract/PositionDialog.tsx`.
- `ProductQuickSearch` und `PartnerQuickSearch` werden aus `pages/document` mitbenutzt, wie
  die Projektmaske es mit der Kundensuche schon tut. Verschoben werden sie nicht in diesem
  Schritt: das betrifft die Belegmasken und gehört in einen eigenen.
- Mit den Versionen (#107) bekommt die Maske einen Status und eine Versionsliste; der Kopf und
  die Positionsliste bleiben.

## Abweichungen vom Issue

Keine.

## Offen

Nichts.
