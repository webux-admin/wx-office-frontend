# ADR-0089 — Suchfeld mit Quelle im Browser, und die Filtermaske der Auswertung in Gruppen

- **Status:** Angenommen
- **Datum:** 2026-11-26
- **Verhältnis:** Ergänzt ADR-0086 (Auswertung der Zeiten) und ADR-0088 (schwebende
  Trefferliste). Issue webux-admin/wx-office#138, «Zeiterfassung verbessern (9/12)»; Vorarbeit für
  #115 (Schnellsuche statt Dropdown in allen Masken).

## Kontext

Die Filtermaske in `/zeiten-auswertung` hatte eine lange Reihe von Feldern. Mitarbeitende,
Projekt, Kunde und Leistung waren `SelectField`s; bei einigen hundert Einträgen muss man darin
rollen statt suchen. Die Werte sind schon im Browser: die Kolleginnen und Kollegen und die
Gruppen des Zeitraums (`/totals/by/project|customer|service`). Ein Nachschlageweg auf dem Server
wäre ein zweiter Weg zu denselben Daten.

Jan nennt für die Gestaltung den Skill «/design»; in dieser Umgebung steht er nicht zur Verfügung.
Die Maske ist nach den Regeln der `CLAUDE.md` (Tokens, Grössen, Zustände) und mit Sichtprüfung in
hell, dunkel und Telefonbreite gestaltet.

## Entscheidung

1. **Ein Baustein `components/ChoiceField`**: eine Combobox nach dem ARIA-Muster über eine Liste,
   die der Browser hält (`Choice`: Wert, Beschriftung, Zusatz, ruhig). Gefiltert wird in
   `lib/choices.ts`: Beschriftung oder Zusatz enthält den Begriff, ohne Gross- und
   Kleinschreibung, als Text und nie als Muster. Der Treffer ist markiert wie in `LookupField`.
2. **Bedienung wie `LookupField`**: der Fokus öffnet die ganze Liste mit der gewählten Zeile
   markiert, Tippen grenzt ein, Pfeiltasten bewegen die Markierung, Enter und Klick wählen, Escape
   schliesst ohne Änderung und wird nicht an Dialog oder Maske weitergegeben. Die Liste schwebt
   (ADR-0088); die Platzierung teilen sich beide Bausteine über `useFloatingList`.
3. **Ohne `value` fügt das Feld hinzu**: es bleibt leer und gibt jede Wahl weiter — so werden
   Mitarbeitende mehrfach gewählt, die Gewählten stehen als Chips daneben.
4. **«Alle …» und «ohne …» sind Einträge der Liste**, ruhig gesetzt. Die Werte in der Adresse
   bleiben, wie sie sind (ADR-0086).
5. **Die Maske hat drei Gruppen**: Zeitraum; Wer und worauf; Zustand und Text — mit einem kurzen
   Titel links auf breitem Bildschirm, darüber auf schmalem, und Trennlinien statt Rahmen.
6. **Darunter die aktiven Filter auf einen Blick**: je ein Chip für Person, Projekt, Kunde,
   Leistung, Zustand und Suchtext, jeder einzeln herausnehmbar, dazu «Filter zurücksetzen». Die
   Zeile erscheint nur, wenn etwas über den Zeitraum hinaus filtert.

## Begründung

**Zu 1:** `LookupField` fragt bei jedem Begriff den Server und braucht dafür einen Endpunkt. Für
Listen, die schon geladen sind, wäre das ein Umweg; ein eigener Baustein mit Quelle im Browser
hält beide einfach. #115 kann je Maske wählen: Liste im Browser oder Suche auf dem Server.

**Zu 6:** Ein gewählter Wert steht im Suchfeld nur, solange niemand darin tippt; die Zeile darunter
zeigt alles, was die Zahlen gerade einschränkt, an einer Stelle.

## Verworfene Alternativen

**`LookupField` eine zweite Quelle geben.** Verworfen: Entprellen, Laden, Fehler und
«die Treffer passen noch zum Begriff» würden zu Sonderfällen eines Bausteins, der sie für die
Quelle im Browser nicht braucht.

**Ein natives `<datalist>`.** Verworfen: kein Wert getrennt von der Beschriftung, keine
Markierung des Treffers, und jeder Browser zeigt die Liste anders.

**Die gewählten Personen weiter als eigene Chip-Zeile unter dem Feld.** Verworfen: die Zeile der
aktiven Filter zeigt sie schon; zweimal dasselbe wäre Unruhe.

## Konsequenzen

- Neue Bausteine `components/ChoiceField.tsx`, `components/useFloatingList.ts` und
  `lib/choices.ts`; `remInPixels` steht in `lib/dropdownPlacement.ts` und wird von Tooltip,
  `LookupField` und `ChoiceField` geteilt.
- `pages/timetracking/EvaluationFilters.tsx` ist neu gegliedert; Adresse, Endpunkte und Ergebnis
  bleiben.
- Tests fragen die Einträge der Liste im `document` ab, nicht im Container des Tests.
