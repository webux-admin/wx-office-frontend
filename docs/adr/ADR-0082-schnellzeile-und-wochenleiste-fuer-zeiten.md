# ADR-0082 — Schnellzeile und Wochenleiste für Zeiten

- **Status:** Angenommen; Punkt 5 teilweise abgelöst durch ADR-0087 (Punkt im Zeitbereich, kein Hinweis unter der Dauer); «Auf heute kopieren» in Punkt 10 abgelöst durch «Kopieren» unter das Original (Backend ADR-0167); in Punkt 2 «0:00» für einen leeren Werktag abgelöst durch ADR-0092 («–» für jeden Tag ohne Zeit)
- **Datum:** 2026-11-24
- **Verhältnis:** Neu. Setzt Backend ADR-0160 (Issue webux-admin/wx-office#124, «Zeiterfassung
  (2/6)») um und folgt den Fehlern am Feld (ADR-0050), den Rückfragen bei ungespeicherten
  Eingaben (ADR-0069), den Tastenkürzeln (ADR-0012, ADR-0048) und den Grössen-Tokens (ADR-0049).

## Kontext

Das Backend nimmt seit #124 Zeiteinträge an: Datum und Dauer genügen, die Dauer kommt als
`durationMinutes` **oder** als `startTime` und `endTime`, Projekt oder Kunde und Leistung sind
freiwillig. Wie «1:30» oder «9-10:30» zu lesen ist, entscheidet die Maske; das Backend kennt nur
Minuten und Uhrzeiten (Backend ADR-0160, Entscheidung 2). Es liefert die Woche mit Tages- und
Wochensumme (`GET /mine`, für Kolleginnen und Kollegen `GET /sheet?userId=`), die Chips «Zuletzt»,
die Vorgabe der Leistung und die Auswahllisten unter `/lookups`.

Das Ziel des Issues: Erfassen kostet nicht mehr als eine Notiz auf Papier, und keine
verrechenbare Stunde geht verloren.

## Entscheidung

1. **Ein Bildschirm «Meine Zeiten» unter `/zeiten`.** Der Menüeintrag «Zeiten» steht in «Verkauf»
   auf oberster Ebene direkt nach «Projekte», mit `TIME_TRACK` und hinter dem Schalter
   `TIMETRACKING`. Er bleibt, wenn das Projektmodul aus ist. Ist die Zeiterfassung aus, zeigt die
   Adresse den Hinweis «Modul nicht eingeschaltet», wie die Projektliste.
2. **Wochenleiste nach ISO 8601**, Montag bis Sonntag, im Kopf «‹ KW 48 · 23.–29. Nov. 2026 ›» und
   «Heute». Je Tag ein Knopf mit der Tagessumme; ein Klick wählt den Tag, den die Liste zeigt und
   auf den ein neuer Eintrag geht. Ein leerer Werktag zeigt «0:00», ein leerer Samstag oder
   Sonntag «–». Tage nach heute und die Woche nach der laufenden lassen sich nicht wählen. **Alle
   Summen kommen vom Backend** (`days`, `totalMinutes`), die Maske zählt nichts zusammen. Die
   Wochenrechnung steht in `lib/week.ts`, in UTC gerechnet, damit kein Tag über eine Zeitumstellung
   rutscht.
3. **Die Schnellzeile** hat die Felder in fester Reihenfolge: Projekt oder Kunde, Leistung, Dauer,
   Text, «verrechenbar», «Speichern». Auf dem Telefon stehen sie untereinander, in derselben
   Reihenfolge. **Enter speichert aus jedem Feld** — ausser wenn eine Liste offen ist und ein
   Treffer markiert: dann übernimmt Enter den Treffer. Nach dem Speichern bleiben Projekt und
   Leistung stehen, Dauer und Text werden leer, der Fokus springt auf «Dauer», und eine Zeile
   unter der Schnellzeile sagt, was gespeichert wurde. Strg+S und Strg+Enter speichern die Zeile,
   in der der Fokus steht.
4. **Escape leert die Zeile** — eine offene Liste schliesst er zuerst. Steht eine Dauer oder ein
   Text in der Zeile, fragt er vorher «Änderungen verwerfen?» (`useLeaveGuard`, ADR-0069). Projekt
   und Leistung allein gelten nicht als Verlust: sie sind mit einem Klick wieder gewählt.
5. **Das Dauerfeld** liest `lib/duration.ts`: `1:30`, `1.5`, `1,5`, `90m`, `2h`, `2h 15m`, `2h15`,
   `9-10:30`, `9:00-10:30`, auch mit dem Gedankenstrich, und die Wörter, die die Maske selbst
   schreibt («1 Std. 30 Min.»). Eine Zahl ohne Einheit sind Stunden; ein Bruchteil wird auf die
   Minute gerundet. Ein Bereich endet mit «0» oder «24:00» um Mitternacht am Ende des Tages und
   geht als `00:00` hinaus. Abgewiesen werden weniger als eine Minute, mehr als 24 Stunden, ein
   Bereich, der nicht nach seinem Beginn endet — einer über Mitternacht eingeschlossen —, und
   Text. Unter dem Feld steht live, was verstanden wurde («= 1 Std. 30 Min.») oder warum nichts;
   rot wird es erst beim Speichern. **Ein Bereich geht nur als `startTime` und `endTime` hinaus,
   eine Dauer nur als `durationMinutes`**: nie beides, damit sie sich nicht widersprechen können.
6. **Projekt oder Kunde ist eine Typ-voraus-Suche** über `/lookups/targets`, Projekte und Kunden in
   einer Liste («P-00012 Website · Muster AG», «Muster AG (ohne Projekt)»). Leer heisst intern; der
   Platzhalter sagt es. **Ein getippter Name, der nicht aus der Liste übernommen wurde, wird vor
   dem Senden abgewiesen**, statt die Stunde still zu einer internen zu machen. Ohne Projektmodul
   heisst das Feld «Kunde», und der Zusatz «(ohne Projekt)» fällt weg.
7. **Die Leistung** kommt aus `/lookups/services`. Wird ein Projekt oder Kunde gewählt, fragt die
   Zeile `/mine/default-service` und setzt die Antwort ein — aber nur über eine Leistung, die nicht
   von Hand gewählt wurde, und nur, solange die Zeile noch dasselbe Ziel nennt. Kein Vorschlag
   (204) lässt das Feld, wie es ist.
8. **«verrechenbar» folgt dem Ziel**: mit Kunde an, ohne Kunde aus und gesperrt. Ein neuer
   Eintrag schickt `billable: null`, solange niemand das Kästchen berührt hat, und überlässt die
   Vorgabe dem Server; eine Änderung schickt den Wert immer. Nach dem Speichern und bei jedem
   neuen Ziel kehrt das Kästchen zur Vorgabe zurück. Verrechenbar ohne Leistung nennt die Maske
   vor dem Senden am Feld «Leistung», mit dem Satz des Backends.
9. **Die Chips «Zuletzt»** stehen über der Zeile und füllen Ziel und Leistung, Dauer und Text
   bleiben; der Fokus geht auf «Dauer». Ohne Chips gibt es keine Zeile «Zuletzt».
10. **Die Liste des Tages** zeigt je Eintrag Von–Bis, Dauer, Ziel, Leistung, Text und den Zustand
    als Badge («offen», «nicht verrechenbar»). Ein Klick öffnet den Eintrag **an seiner Stelle in
    derselben Zeilenform**, mit «Abbrechen» und «Speichern»; der Fokus steht auf «Dauer». Wer mit
    Änderungen in der offenen Zeile einen anderen Tag, eine andere Woche, eine andere Person oder
    einen anderen Eintrag wählt, wird gefragt. «Auf heute kopieren» schreibt sofort eine Kopie mit
    Dauer, Ziel, Leistung, Text und «verrechenbar» auf heute, **ohne Von–Bis**. «Löschen» fragt mit
    `ConfirmDialog`. Ist `editable` falsch, steht `readOnlyReason` unter der Zeile, und Bearbeiten
    und Löschen fehlen.
11. **«Zeiten von …»** erscheint nur mit `TIME_READ`, als Auswahl über `/lookups/colleagues`, man
    selbst zuoberst mit «(ich)», Deaktivierte markiert. Die Woche kommt von
    `/sheet?userId=&from=&to=`. Schreiben für andere gibt es nur mit `TIME_WRITE`, über
    `POST ?userId=`, `PUT /{id}?userId=` und `DELETE /{id}?userId=`; ohne das Recht sagt ein Satz,
    dass die Zeiten nur lesbar sind. Chips und Vorgabe der Leistung gibt es dort nicht.
12. **Ein neuer Baustein `LookupField`** in `components/`: die Typ-voraus-Suche ohne Fachwissen,
    nach dem Muster von `PartnerQuickSearch`, mit zwei Unterschieden — ein leeres Feld markiert
    keinen Treffer, und Escape schliesst eine offene Liste, als erledigt markiert. `Panel` kann das
    Abschneiden abschalten (`clipped`), damit die Liste über den Rand einer einzeiligen Zeile
    reichen kann, und `IconButton` kennt `disabled`.
13. **Fehler am Feld.** Ein Feldfehler des Backends steht am Feld der Zeile: `durationMinutes`,
    `startTime` und `endTime` an «Dauer», `projectId` und `partnerId` an «Projekt oder Kunde»,
    `productId` an «Leistung», `description` an «Text». Alles andere — `workDate`, `lockVersion`,
    die 409 für den abgeschalteten Schalter, die veraltete Version oder «nur lesbar» — steht als
    Meldung über der Zeile.

## Begründung

**Zu 2:** Der Tag ist der Zusammenhang, in dem erfasst wird: «was habe ich heute gemacht». Eine
Woche zeigt auf einen Blick den Tag mit 0:00, an dem eine Stunde fehlt. Ein leerer Werktag soll
auffallen, ein leerer Sonntag nicht; sonst lernt man, über die Nullen hinwegzulesen.

**Zu 3 und 4:** Wer zehn Einträge nacheinander für dasselbe Projekt schreibt, tippt nur Dauer,
Text und Enter. Enter muss deshalb aus jedem Feld speichern; dass er über einer offenen Liste den
Treffer nimmt, ist die Erwartung an jede Typ-voraus-Suche. Escape leert, weil die Zeile keinen
Rückweg hat (ADR-0069, Punkt 2).

**Zu 5:** Die Formate sind die des Issues. Dazu kommen die Wörter, die die Maske selbst zeigt —
wer den Hinweis abtippt, soll nicht abgewiesen werden. Gerundet wird nur, was kleiner als eine
Minute ist, weil ein Eintrag auf die Minute gilt; einen Takt gibt es bei der Eingabe nicht
(Backend ADR-0160). Mitternacht als «24:00» in der Liste, weil «22:00–00:00» wie eine Zeit über
Mitternacht aussieht.

**Zu 6:** Ein leeres Feld ist eine Entscheidung (intern), ein getippter Name ohne Übernahme ist
keine. Ihn als intern zu speichern hiesse, eine verrechenbare Stunde zu verlieren, ohne dass es
jemand merkt — das Gegenteil des Ziels.

**Zu 7:** Der Vorschlag kommt nach dem Klick an. Was der Benutzer in der Zwischenzeit von Hand
gewählt hat, ist die neuere Entscheidung.

**Zu 8:** `null` beim Anlegen, weil ab #126 die Abrechnungsart des Projekts die Vorgabe bestimmt,
die nur der Server kennt; die Maske soll sie dann nicht mit ihrer eigenen Vermutung überschreiben.
Das Kästchen wird nach dem Speichern zurückgesetzt, weil eine Kulanzstunde eine Ausnahme ist und
nicht die Regel für die nächsten Einträge.

**Zu 10:** Bearbeiten an der Stelle hält den Blick in der Liste, auch auf dem Telefon, wo die
Schnellzeile weit oben steht. Die Kopie lässt Von–Bis weg, weil sie sonst eine Uhrzeit behauptet,
die niemand für heute genannt hat; die Dauer ist, was verrechnet wird.

**Zu 11:** Fremde Zeiten sind Personendaten über das Arbeitsverhalten (OR Art. 328b). Die Auswahl
erscheint nur, wo das Backend lesen lässt. «Zuletzt» und die Vorgabe der Leistung sind die des
angemeldeten Benutzers; für jemand anderen wären sie falsch, und ab #126 erst recht, wenn die
Standardleistung je Benutzer dazukommt.

**Zu 12:** In der Schnellzeile darf ein Feld leer bleiben. Die Suche der Belege markiert den ersten
Treffer auch bei leerem Feld; dort ist das richtig, weil ein Beleg einen Kunden braucht, hier würde
Enter zum Speichern einen Kunden einsetzen, den niemand gewählt hat.

## Verworfene Alternativen

**Ein Datumsfeld in der Schnellzeile.** Verworfen: die Wochenleiste sagt schon, welcher Tag es ist.
Zwei Orte für das Datum können sich widersprechen, und das Feld kostet bei jedem Eintrag einen
Tabulator.

**Wochenraster mit Zeilen je Projekt und Spalten je Tag, wie das Timesheet von Harvest.**
Verworfen: es braucht ein Projekt je Zeile und kennt weder Text noch Leistung je Eintrag. Ein
Raster über alle Benutzer ist Sache der Auswertung (#128).

**Bearbeiten oben in der Schnellzeile.** Verworfen: die Zeile verlöre Projekt und Leistung für
den nächsten Eintrag, und der Blick springt weg vom Eintrag, der korrigiert wird.

**Bearbeiten in einem Dialog.** Verworfen: das Issue verlangt dieselbe Zeilenform, und ein Dialog
wäre eine zweite Form mit eigenen Fehlern.

**Tages- und Wochensumme im Browser zusammenzählen.** Verworfen: das Backend liefert sie; zwei
Rechnungen wären zwei Wahrheiten.

**Live rote Fehler im Dauerfeld.** Verworfen: «9-» ist halb getippt, nicht falsch. Der Hinweis sagt
neutral, was verstanden wurde; rot erst beim Versuch zu speichern (ADR-0050).

**Der Punkt als Uhrzeit-Trenner («8.30-10»).** Verworfen: «1.30» allein ist ein Dezimalbruch von
Stunden. Ein Zeichen mit zwei Bedeutungen im selben Feld führt zu falschen Minuten.

**Rundung der Eingabe auf 5 oder 15 Minuten.** Verworfen im Backend (ADR-0160): sie verfälscht die
gemessene Zeit.

**Einen getippten, nicht übernommenen Namen als intern speichern.** Verworfen, siehe Begründung zu
6.

**«verrechenbar» beim Anlegen immer als Wert schicken.** Verworfen, siehe Begründung zu 8.

**Das Kästchen nach dem Speichern stehen lassen.** Verworfen, siehe Begründung zu 8.

**«Auf heute kopieren» mit Von–Bis.** Verworfen, siehe Begründung zu 10.

**«Auf heute kopieren» als vorgefüllte Schnellzeile statt sofort.** Verworfen: wer kopiert, will
dieselbe Arbeit noch einmal; ein zweiter Schritt bringt nichts, ändern lässt sich die Kopie in
ihrer Zeile.

**Zukünftige Tage wählbar lassen.** Verworfen: das Backend nimmt keine Zeit für morgen an, und ein
Tag, der nur zu einer Abweisung führt, ist keine Wahl.

**Den Bildschirm bei abgeschalteter Zeiterfassung lesbar lassen.** Verworfen für diesen Schritt:
das Menü blendet den Eintrag dann aus (#124), und eine Adresse ohne Weg dahin wäre ein zweites
Verhalten neben der Projektliste. Lesbar bleiben die Zeiten im Backend; zeigen werden sie das
Projekt (#126) und die Auswertung (#128).

**Chips und Vorgabe der Leistung auch für Kolleginnen und Kollegen.** Verworfen: das Backend hat
beide nur unter `/mine`, und die eigenen wären für jemand anderen falsch. Im Browser aus den
Einträgen der Woche zu raten, verbietet ADR-0160 ausdrücklich.

**Die bestehende Kundensuche (`PartnerQuickSearch`) für das Ziel umbauen.** Verworfen: ihre
Beschriftung, ihre Hinweise und ihr Verhalten bei leerem Feld gehören zu den Belegen; sie zu
verallgemeinern hiesse, die Belegmasken mitzuändern. `LookupField` ist der allgemeine Baustein
daneben.

## Konsequenzen

- Neue Bausteine: `lib/duration.ts`, `lib/week.ts`, `components/LookupField.tsx`,
  `pages/TimeEntryPage.tsx` mit `pages/timetracking/` (`TimeEntryLine`, `WeekBar`, `RecentChips`,
  `DayEntries`); `lib/timetracking.ts` trägt Adressen, Cache-Schlüssel, Wörter und die Regeln der
  Zeile; die Typen stehen in `lib/types.ts`.
- `Panel` hat `clipped`, `IconButton` hat `disabled`; beide wie bisher, wo nichts gesetzt ist.
- Der Zustand eines Eintrags ist eine Union; `IN_DRAFT` und `BILLED` (#127) brauchen je ein Wort
  und einen Ton in `TIME_ENTRY_STATE_LABELS` und `TIME_ENTRY_STATE_TONES`, die Typprüfung verlangt
  beide.
- Mit der Stoppuhr (#125) bekommt die Schnellzeile einen Startknopf; mit #126 fällt die Vorgabe der
  Leistung serverseitig auf die Standardleistung zurück, ohne Änderung hier.
- Die älteren Typ-voraus-Suchen (`PartnerQuickSearch`, `ProductQuickSearch`, `StockProductSearch`)
  könnten auf `LookupField` umziehen; das ist ein eigener Schritt.

## Abweichungen vom Issue

- **Escape leert die Zeile nicht immer sofort:** stehen Dauer oder Text darin, fragt er zuerst —
  so verlangt es dasselbe Issue mit `useLeaveGuard` «wie auf jeder Maske».
- **Die Woche eines Kollegen** liest `GET /sheet?userId=&from=&to=`, nicht `GET ?userId=` wie im
  Issue (Backend ADR-0160, Entscheidung 7).
- **Die Vorgabe der Leistung** kommt vom eigenen Weg `/mine/default-service` (Backend ADR-0160),
  nicht aus den Chips.
- **«Zeiten von …»** zeigt weder Chips noch Vorgabe der Leistung: das Backend hat beide nur für den
  angemeldeten Benutzer.

## Offen

- **Der Tag eines Eintrags lässt sich in der Zeile nicht ändern**, weil die Zeilenform kein
  Datum hat. Wer am falschen Tag erfasst hat, löscht und erfasst neu. Ein Datumsfeld nur in der
  offenen Zeile wäre ein eigener Entscheid.
- **Für andere** gibt es weder «Zuletzt» noch die Vorgabe der Leistung, bis das Backend dafür Wege
  mit `userId` anbietet.
- Die Maske ist mit Tests über `fetch` geprüft, aber nicht im Browser in hellem und dunklem
  Erscheinungsbild und in schmalen Fenstern angeschaut; das steht vor dem Zusammenführen an.
