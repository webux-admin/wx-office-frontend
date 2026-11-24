# ADR-0084 — Register «Zeiten» am Projekt und am Kunden

- **Status:** Angenommen
- **Datum:** 2026-11-24
- **Verhältnis:** Neu. Setzt Backend ADR-0162 (Issue webux-admin/wx-office#126, «Zeiterfassung
  (4/6) — Abrechnungsart, Stundensatz und Zeiten am Projekt») um. Baut auf der Schnellzeile
  (ADR-0082) und der Stoppuhr (ADR-0083) auf und folgt den Registern einer Maske (ADR-0031), der
  Sortierregel der Einstellungen (ADR-0011) und den Fehlern am Feld (ADR-0050). Präzisiert
  ADR-0083, Entscheidung 5, für «verrechenbar» (siehe Entscheidung 9); ADR-0083 bleibt sonst
  unverändert.

## Kontext

Seit #126 sagt ein Projekt, wie seine Zeit abgerechnet wird und zu welchem Satz. Die Bedingungen
gehören der Zeiterfassung, nicht dem Projekt (Backend ADR-0162, Entscheidung 1). Das Backend liefert:

| Weg | Recht | Antwort |
|---|---|---|
| `GET /time-tracking/projects/{id}/terms` | `TIME_READ` oder `TIME_WRITE` | `ProjectTermsDto`, `lockVersion` fehlt, solange nie gespeichert |
| `PUT /time-tracking/projects/{id}/terms` | `TIME_WRITE` | dito, mit `openEntries`; 400 am Feld, 409 bei altem Stand, archiviertem Projekt, Projektmodul aus |
| `GET /time-tracking/projects/{id}/summary`, `…/customers/{id}/summary` | `TIME_READ` | Minuten nach Zustand |
| `GET /time-tracking/user-defaults`, `PUT …/{userId}` | `TIME_WRITE` | Standardleistung je Benutzer; `productId: null` entfernt |
| `GET /time-entries?projectId=&partnerId=&page=&size=` | `TIME_READ` | Seite von `TimeEntryDto`, neu mit `userName` |
| `GET /time-entries/lookups/default-billable?projectId=&partnerId=` | `TIME_TRACK` oder `TIME_WRITE` | Vorgabe und Sperre von «verrechenbar» |

Dazu weist `project` das Löschen eines Projekts mit Zeiten und das Archivieren eines Projekts mit
offenen verrechenbaren Zeiten mit 409 und einem Satz in `detail` ab (Backend ADR-0162,
Entscheidung 7).

## Entscheidung

1. **Die Projektmaske bekommt Register über `FormMask` (`tabs`), nicht über `RegisterNav`.**
   «Stammdaten» und «Zeiten», gleich wie die Partnermaske. Die Registerleiste erscheint nur an einem
   gespeicherten Projekt, bei eingeschaltetem Modul `TIMETRACKING` und mit `TIME_READ`; sonst hat die
   Maske keine Leiste, wie bisher.
2. **Die Meldungen stehen über den Registern.** Löschen und die Statusschritte stehen im Kopf und
   sind von beiden Registern aus erreichbar; ihre Abweisung — «12.50 Std. sind noch nicht
   abgerechnet. …» — steht dort, wo der Knopf gedrückt wurde. Das Löschen zeigt seinen Satz wie
   bisher im Dialog. Eine Beanstandung der Stammdaten beim Speichern holt das Register
   «Stammdaten» nach vorne, wie in der Partnermaske.
3. **Das Register «Zeiten» des Projekts** zeigt von oben nach unten:
   - **Kacheln** (`FactList`): Total, offen verrechenbar, im Entwurf, verrechnet, nicht
     verrechenbar — in Stunden der Uhr aus `lib/duration.ts` («42:30 Std.»), bei Total und offen
     mit der Zahl der Einträge. Gerechnet wird nichts; die Minuten sind die des Backends.
   - **«Abrechnung»**: Abrechnungsart und Projektsatz als Text. Mit `TIME_WRITE` und an einem nicht
     archivierten Projekt öffnet «Ändern» einen **Dialog** mit «Abrechnungsart» als
     `SegmentedControl` (Nach Aufwand · Pauschal · Nicht verrechenbar) und «Projektsatz pro Stunde».
     Der Dialog speichert für sich und schliesst die Maske nicht.
   - **«Einträge»**: die Liste aller Personen, Seite für Seite, mit Datum, Person, Leistung, Dauer
     (Von–Bis als Titel), Text und Zustand; nur zum Lesen.
   - **«Zeit erfassen»** im Kopf der Liste und im leeren Zustand, mit `TIME_TRACK` und nur auf einem
     offenen oder aktiven Projekt.
4. **Der Dialog «Abrechnung ändern»** schickt `billingMode`, `hourlyRate` und `lockVersion` nur,
   wenn die Bedingungen eine hatten; eine Währung nie. Vor dem Senden prüft er den Satz, soweit das
   Feld es sagen kann — lesbar und nicht negativ, mit dem Satz des Backends Wort für Wort —, den Rest
   (Nachkommastellen, Grösse) sagt das Backend am Feld. Wechselt die Art und hängen offene
   verrechenbare Einträge am Projekt, sagt ein Hinweis vor dem Speichern, dass sie bleiben, wie sie
   sind; nach dem Speichern sagt es der Satz unter den Bedingungen noch einmal, mit `openEntries` aus
   der Antwort. Eine 409 zeigt den Satz des Backends, die Bedingungen werden neu gelesen, und der
   Dialog füllt sich mit dem neuen Stand — das Backend verlangt «Neu laden und die Änderung
   wiederholen». Der Satz steht mit `currency` aus der Antwort; ohne Satz ist keine Währung
   bekannt, und der Tooltip nennt «die Währung des Mandanten».
5. **Die Liste ist ein Baustein in `src/timetracking/`** (`TimeEntryTable`, dazu
   `TimeSummaryFacts`), weil Projekt- und Partnermaske sie beide zeigen. Sie sortiert nicht: der
   Server liefert den spätesten Tag zuerst und nimmt keinen `sort` an.
6. **«Zeit erfassen» ist ein Link auf «Meine Zeiten» mit Router-State** `{ recordOn: TimeTargetChoice }`.
   «Meine Zeiten» liest ihn einmal beim Öffnen und prüft jedes Feld (`recordOnTargetOf`), legt das
   Projekt in die Schnellzeile, holt den Vorschlag der Leistung — zuletzt benutzt, sonst die
   Standardleistung des Benutzers — und setzt den Fokus auf «Dauer».
7. **Die Partnermaske bekommt das Register «Zeiten»** gleich nach «Projekte», nur für einen Kunden,
   nur mit eingeschalteter Zeiterfassung und `TIME_READ`, und unabhängig vom Projektmodul: ohne
   Projekte wird auf den Kunden erfasst. Es zeigt dieselben Kacheln und die Liste mit der Spalte
   «Projekt» («ohne Projekt» für die Zeiten auf dem Kunden allein).
8. **Die Standardleistung je Benutzer steht unter Moduleinstellungen → Zeiterfassung →
   Einstellungen** (`/zeiterfassung-einstellungen`), mit `TIME_WRITE`, der Schalter auf dem Ordner
   und dem Eintrag. Die Tabelle nennt jeden Benutzer, deaktivierte markiert, und die Leistung mit
   ihrer Nummer; eine deaktivierte Leistung heisst «wird nicht mehr vorgeschlagen», eine gelöschte
   «nicht mehr vorhanden». «Festlegen» und «Ändern» öffnen einen Dialog mit der Schnellsuche über
   die aktiven Leistungen (`ServiceLookup`, dieselbe Suche wie «Leistung» in der Schnellzeile);
   «Entfernen» schickt `productId: null` ohne Rückfrage.
9. **«verrechenbar» nimmt Vorgabe und Sperre vom Server** (`useBillableDefault`), in der
   Schnellzeile, in der Zeile in Bearbeitung und im Feld der Stoppuhr, ein Ergebnis je Ziel im
   Cache:
   - **Gesperrt heisst «lässt sich nicht einschalten»**, der Tooltip ist `lockedReason`. Ein Ja,
     das ein Eintrag oder die laufende Uhr schon trägt, bleibt angezeigt und lässt sich ausschalten,
     weil das Backend es stehen lässt (Backend ADR-0162, Entscheidung 2).
   - Ohne Sperre sagt der Tooltip, was die Vorgabe bestimmt (nach Aufwand, Pauschal mit Zusatzaufwand,
     Kunde ohne Projekt).
   - **Interne Zeit wird nicht gefragt**: sie ist nie verrechenbar, seit Backend ADR-0160 fest; die
     Box ist gesperrt, und der Tooltip nennt «Projekt» nur, wenn der Mandant Projekte führt.
   - Die Prüfung «Verrechenbar braucht eine Leistung» folgt derselben Vorgabe: auf einem pauschalen
     Projekt fragt eine unberührte Zeile nach keiner Leistung.
   - **Eine Änderung schickt, was die Box zeigt.** Nur wo das Ziel neu gewählt wurde und seine
     Vorgabe noch unterwegs ist, bleibt «verrechenbar» leer (`null`, bei der Uhr weggelassen), und
     der Server nimmt dieselbe Vorgabe. Das präzisiert ADR-0083, Entscheidung 5 («immer mit Wert»):
     ein geratenes Ja wäre auf einem pauschalen Projekt falsch und auf «Nicht verrechenbar» eine
     Abweisung.
10. **Der Fehlerweg der Projektmaske bleibt, wie er war**, und ist für beide Abweisungen getestet:
    `ApiError` trägt `detail`, `ErrorNotice` zeigt ihn.

## Begründung

**Zu 1:** `RegisterNav` ist für Geschwister-Bildschirme mit eigener Adresse, `Tabs` für die
Register einer Maske (ADR-0031). «Zeiten» ist dasselbe Projekt, kein zweiter Bildschirm; die
Partnermaske macht es ebenso. Das Issue nennt `RegisterNav`, meint aber Register an der Maske.

**Zu 3 und 4:** Die Maske hat ein «Speichern», das das Projekt speichert und die Maske schliesst,
mit Strg+S und der Rückfrage bei Esc. Die Bedingungen gehören einem anderen Modul und gehen über
einen anderen Weg; ein zweites «Speichern» im Register stünde neben dem ersten, und Strg+S wüsste
nicht, welches gemeint ist. Der Dialog hat Esc, Strg+S und die Rückfrage schon (ADR-0012, ADR-0069).
Der Hinweis vor dem Speichern lässt bewusst entscheiden, was die Antwort danach bestätigt.

**Zu 6:** Die Schnellzeile braucht Nummer, Name und Kunde des Projekts für ihre Anzeige. Ein
Parameter in der Adresse trüge nur die Id, und die Zeiterfassung hat keinen Nachschlageweg nach
Id. Der Router-State trägt das ganze Ziel, übersteht ein Neuladen und wird wie das `origin` einer
Maske geprüft statt geglaubt.

**Zu 8:** Die Sortierregel von ADR-0011 fragt, wie viele Module einen Wert lesen. Die
Standardleistung liest nur die Zeiterfassung; sie gehört in deren Ordner unter
«Moduleinstellungen», wie die Einstellungen des Mahnwesens und der Buchhaltung. Der
Abrechnungstakt kommt mit #127 auf dieselbe Seite.

**Zu 9:** Die Abrechnungsart steht in den Bedingungen, die nur mit `TIME_READ` lesbar sind; wer
nur erfasst, soll den Projektsatz nicht sehen (Backend ADR-0162, Begründung zu 8). Der schmale Weg
`default-billable` sagt genau, was die Box braucht. Die Regel im Browser nachzubauen hiesse, sie an
zwei Orten zu führen.

## Verworfene Alternativen

**`RegisterNav` mit eigener Adresse `/projekte/:id/zeiten`.** Verworfen, siehe Begründung zu 1: ein
Register einer Maske ist kein eigener Bildschirm, und die Partnermaske zeigt «Projekte» auch als
Register.

**Abrechnung inline im Register, mit eigenem «Speichern».** Verworfen, siehe Begründung zu 3: zwei
«Speichern» auf einer Maske, Strg+S doppeldeutig, und Esc fragte nicht nach einer ungespeicherten
Abrechnung.

**Abrechnung mit dem Projekt speichern.** Verworfen: zwei Module, zwei Anfragen, und ein halber
Erfolg — Projekt gespeichert, Bedingungen abgewiesen — liesse die Maske in einem Zustand, den
niemand verlangt hat. Das Backend trennt beides bewusst (ADR-0162, Begründung zu 1).

**Die Kacheln in Dezimalstunden wie der Satz des Backends** («12.50 Std.»). Verworfen: «Meine
Zeiten» zeigt Stunden der Uhr, und eine Anwendung mit zwei Schreibweisen für dieselbe Stunde lässt
den Leser rechnen. Der Satz des Backends bleibt, wie er kommt.

**Summen im Browser aus der Liste rechnen.** Verworfen: die Liste hat Seiten, und das Frontend
rechnet nicht nach (CLAUDE.md).

**Die Vorgabe «verrechenbar» aus den Bedingungen ableiten.** Verworfen, siehe Begründung zu 9.

**Die Vorgabe auch für interne Zeit fragen.** Verworfen: die Antwort steht fest, und ihr Satz nennt
«Projekt» auch dort, wo der Mandant keine Projekte führt.

**Bei unbekannter Vorgabe ein Ja schicken**, wie vor #126. Verworfen, siehe Entscheidung 9.

**Ein Parameter `?projektId=` für «Zeit erfassen».** Verworfen, siehe Begründung zu 6.

**«Zeit erfassen» als Knopf mit `navigate`.** Verworfen: was einen anderen Bildschirm öffnet, ist
ein Link (`LinkButton`), damit er sich in einem neuen Tab öffnen lässt.

**«Zeit erfassen» auch auf einem abgeschlossenen Projekt.** Verworfen: es nimmt keine neue Zeit an
(Backend ADR-0160); der Knopf führte in eine Abweisung.

**Die Standardleistung direkt in der Tabellenzeile wählen.** Verworfen: die Trefferliste einer
Schnellsuche öffnet über den unteren Rand und würde in der Tabelle abgeschnitten, und jede Wahl
wäre schon ein Speichern. Der Dialog ist der Weg der anderen Tabellen (Lagerorte, Preisgruppen).

**Eine Rückfrage beim Entfernen der Standardleistung.** Verworfen: nichts geht verloren, was sich
nicht mit zwei Klicks wieder festlegen liesse, und bestehende Einträge bleiben, wie sie sind.

**Die Einstellungen unter «Systemeinstellungen»**, wie das Issue sie nennt. Verworfen, siehe
Begründung zu 8.

## Konsequenzen

- Neu: `pages/project/ProjectTimes.tsx`, `pages/partner/PartnerTimes.tsx`,
  `pages/TimeTrackingSettingsPage.tsx`, `src/timetracking/TimeSummaryFacts.tsx`,
  `src/timetracking/TimeEntryTable.tsx`, `src/timetracking/useBillableDefault.ts`.
- `ProjectPage` hat Register; `PartnerPage` das Register «Zeiten»; `TimeEntryPage` liest das
  übergebene Projekt; `BillableField` nimmt Vorgabe und Sperre; `ServiceField` baut auf dem neuen
  `ServiceLookup`; `LinkButton` nimmt jeden Router-State, nicht nur ein `origin`.
- `lib/timetracking.ts`: Wege und Schlüssel der Bedingungen, Zusammenfassungen, Liste und
  Standardleistungen, `effectiveBillable`/`billableLocked`/`billableTooltip` mit Vorgabe, die Form
  des Dialogs und ihre Wörter, `recordOnState`/`recordOnTargetOf`. `lib/types.ts`: `BillingMode`,
  `TimeBillableDefault`, `ProjectTerms`, `ProjectTermsRequest`, `TimeSummary`, `TimeUserDefault`,
  `TimeUserDefaultRequest`, `TimeEntry.userName` — 1:1 nach den Records des Backends.
- Menü: Ordner «Zeiterfassung» unter «Moduleinstellungen», Route im `RegisterGroupLayout`.
- Neue Schlüssel: `timeTermsKey` (Bedingungen und Vorgaben, ein Speichern der Bedingungen erneuert
  beide), `userDefaultsKey`; Zusammenfassung und Liste hängen unter `timeEntriesKey`, ein neuer
  Eintrag erneuert sie.

## Abweichungen vom Issue

- **Register über `FormMask`/`Tabs` statt `RegisterNav`** (Entscheidung 1).
- **Die Einstellungen unter «Moduleinstellungen»** statt «Systemeinstellungen» (Entscheidung 8).
- **Abrechnung im Dialog** statt direkt im Register (Entscheidung 3).
- **Ein Hinweis schon vor dem Speichern** zu den offenen Einträgen, zusätzlich zum Satz aus der
  Antwort (Entscheidung 4).
- **«Zeit erfassen» nur auf offenen und aktiven Projekten** (Verworfene Alternativen).
- **Interne Zeit fragt keine Vorgabe ab** (Entscheidung 9).
- Der Zustand kennt bis #127 nur «offen» und «nicht verrechenbar»; «im Entwurf» und «verrechnet»
  stehen in den Kacheln mit 0:00.

## Offen

- Die Masken sind über `fetch` getestet, aber nicht im Browser angeschaut — hell und dunkel, auf dem
  Telefon, die Kacheln mit fünf Werten in einer Zeile und die Tabelle mit sieben Spalten am Kunden.
- «Abrechnen» (#127), die übrigen Filter und der Export der Liste (#128).
- Der Satz des Backends für interne Zeit («Ohne Projekt oder Kunde …») nennt das Projekt auch ohne
  Projektmodul; das Frontend benutzt ihn nicht (Entscheidung 9), andere Clients schon.
