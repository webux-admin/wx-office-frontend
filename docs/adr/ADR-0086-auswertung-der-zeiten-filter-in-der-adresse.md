# ADR-0086 — Auswertung der Zeiten: der Filter in der Adresse, die Auswahl aus den Gruppen

- **Status:** Angenommen
- **Datum:** 2026-11-24
- **Verhältnis:** Neu. Setzt Backend ADR-0164 um (Issue webux-admin/wx-office#128, «Zeiterfassung
  (6/6) — Auswertung und Export») und Entscheid 7 aus #122. Baut auf ADR-0082 bis ADR-0085 auf und
  folgt den Registerleisten der Ordner (ADR-0031) und den Hinweisen als Tooltip (ADR-0050).

## Kontext

Seit #128 liefert das Backend die Zeiten des ganzen Mandanten über einen Filter, alle vier Wege
unter `/api/tenants/{t}/time-entries` und mit `TIME_READ`:

| Weg | Antwort |
|---|---|
| `GET ?…&page=&size=&sort=` | eine Seite `TimeEntryDto`, sortierbar nach `workDate`, `userName`, `projectNumber`, `customerName`, `durationMinutes` |
| `GET /totals?…` | `TimeSummaryDto` über den ganzen Filter, neu mit `billableMinutes` |
| `GET /totals/by/{user\|project\|customer\|service\|week\|month}?…` | eine Zeile je Gruppe: `id`, `number`, `name` oder `period`, `from`, `to`, dazu `totals`; die Zeile ohne `id` ist «ohne …» |
| `GET /export.csv?…` | die Datei mit Namen in `Content-Disposition`; über 50'000 Einträge `422` mit `detail`, `entries`, `maximum` |

Der Filter ist für alle vier derselbe: `from`, `to`, `userId` (mehrere), `projectId`, `partnerId`,
`productId`, `state` (mehrere), `search` (höchstens 200 Zeichen), `unassigned` (`PROJECT`,
`CUSTOMER`, `SERVICE`). Ohne Projekt und Kunde sind beide Tage Pflicht, höchstens 366 Tage;
Abweisungen kommen als `400` am Feld. Das Issue verlangt, dass der Filter in der Adresse steht,
damit sich eine Auswertung als Link weitergeben lässt.

Die Nachschlagewege der Schnellzeile, `/lookups/targets` und `/lookups/services`, verlangen
`TIME_TRACK` oder `TIME_WRITE` und liefern nur, was **neue** Zeit nimmt: offene und aktive
Projekte, aktive Kunden und Leistungen (`TimeTrackingManagement#findTargets`).

## Entscheidung

1. **«Auswertung»** steht im Ordner «Zeiten» zwischen «Meine Zeiten» und «Abrechnen», unter
   `/zeiten-auswertung` (neben `/zeiten`, nicht darunter, wie ADR-0085 Entscheidung 1), mit
   `TIME_READ` und unter dem Schalter `TIMETRACKING`. Der Ordner ist ihre Registerleiste. Wer nur
   `TIME_READ` hat, sieht den Ordner mit «Auswertung» allein.
2. **Der Filter steht in der Adresse, mit deutschen Namen.** Die Namen sind ein Vertrag: ein
   weitergegebener Link muss morgen dasselbe zeigen.

   | Parameter | Wert |
   |---|---|
   | `von`, `bis` | `JJJJ-MM-TT`; fehlen beide, gilt der laufende Monat. Geschrieben werden immer beide, auch leer |
   | `person` | Benutzer-Id, wiederholt |
   | `projekt`, `kunde`, `leistung` | Id, oder `ohne` für die Einträge ohne |
   | `zustand` | `OPEN`, `IN_DRAFT`, `BILLED`, `NOT_BILLABLE`, wiederholt |
   | `suche` | der Text, wie getippt |
   | `nach` | `person`, `projekt`, `kunde`, `leistung`, `woche`, `monat`; fehlt er, die Einträge |

   Ein Wert, den der Filter nicht kennt, wird beim Lesen verworfen und nie geschickt. Seite und
   Sortierung stehen **nicht** in der Adresse; ein neuer Filter beginnt auf der ersten Seite. Jede
   Änderung **ersetzt** den Eintrag im Verlauf; nur ein Klick auf eine Gruppe legt einen an.
3. **Die Filterleiste:** Von und Bis mit den vier Vorgaben «Diese Woche» (ISO-Woche Mo–So),
   «Dieser Monat», «Letzter Monat» und «Dieses Jahr» als Knöpfe; gedrückt ist, wessen Tage im Filter
   stehen. «Mitarbeitende» ist eine Auswahl zum Hinzufügen aus `/lookups/colleagues`, deaktivierte
   markiert, die Gewählten stehen als Chips mit «×». Projekt (nur mit Projektmodul), Kunde und
   Leistung sind Auswahlfelder, der Zustand vier Häkchen, dazu «Suche im Text». Jede Änderung fragt
   sofort, die Suche erst nach 300 ms Ruhe. «Filter zurücksetzen» behält den Zeitraum.
4. **Die Auswahl für Projekt, Kunde und Leistung kommt aus den Gruppen** über den Zeitraum allein —
   `/totals/by/project`, `/customer`, `/service` —, nicht aus den Nachschlagewegen der
   Schnellzeile. Angeboten wird, was im Zeitraum Zeit hat, abgeschlossene Projekte und deaktivierte
   Kunden eingeschlossen, und «ohne Projekt», wo es Zeit ohne gibt. Eine Wahl aus einem Link, die im
   Zeitraum keine Zeit hat, bleibt stehen als «Gewähltes Projekt, ohne Zeit im Zeitraum».
5. **Sechs Kacheln** über den ganzen Filter: Total (mit Anzahl), Verrechenbar (`billableMinutes`),
   Offen verrechenbar (mit Anzahl), Im Entwurf, Verrechnet, Nicht verrechenbar — in Stunden der Uhr,
   mit demselben Baustein wie die Register (`TimeFigureFacts`). Die Register bleiben bei fünf.
6. **Der Umschalter** «Einträge · nach Mitarbeitenden · nach Projekt · nach Kunde · nach Leistung ·
   nach Woche · nach Monat» ist eine Registerleiste (`Tabs`) und steht in der Adresse (`nach`).
   «nach Projekt» fehlt ohne Projektmodul.
7. **Die Tabelle je Gruppe** zeigt den Namen als Link, darunter bei Woche und Monat die Tage im
   Filter und bei einer Leistung ihre Nummer, dann Einträge, Total, Verrechenbar, Offen, Im
   Entwurf, Verrechnet und Nicht verrechenbar — so, wie das Backend sie je Zeile liefert, **ohne
   Summenzeile**. Ein Klick auf eine Zeile öffnet die Einträge genau dieser Gruppe: eine Person als
   `person`, ein Projekt, Kunde oder eine Leistung als Id oder `ohne`, eine Woche oder ein Monat als
   `von` und `bis` aus der Zeile. Alles andere am Filter bleibt.
8. **Die Tabelle der Einträge** zeigt Datum, Person, Projekt (mit Projektmodul), Kunde, Leistung,
   Dauer, Text und Zustand, seitenweise und sortierbar nach den fünf Feldern des Backends, zuerst
   der späteste Tag. Nur zum Lesen, wie die Register; das Badge führt mit `INVOICE_READ` auf die
   Rechnung, und deren Weg zurück auf genau diese Auswertung.
9. **«Als CSV herunterladen»** steht im Kopf und lädt über `api.file` den Filter am Bildschirm; den
   Namen gibt der Server. Eine `422` zeigt den Satz des Backends über dem Filter, eine Statuszeile
   «Heruntergeladen: zeiten-2026-11.csv» den Erfolg — beides nur, solange der Filter derselbe ist.
10. **Die Zustände:** Fehlt ein Tag, geht keine Anfrage hinaus; das Feld sagt «Einen Tag wählen.»,
    die Tabelle «Kein Zeitraum», der Download ist gesperrt. Eine `400` an `from`, `to` oder `search`
    steht am Feld und nirgends sonst, die Tabelle sagt «Filter prüfen». Jede andere Abweisung steht
    als Meldung. Ohne `TIME_READ` steht «Keine Berechtigung», ohne Schalter «Modul nicht
    eingeschaltet».
11. **Das Suchfeld hält, was getippt wurde.** Die Adresse folgt jedem Tastendruck, mit einer Marke
    im Router-State; ändert sich die Adresse von anderswo — Menü, Zurück, Zurücksetzen, Klick auf
    eine Gruppe —, folgt das Feld der Adresse.

## Begründung

**Zu 2:** Ein Link ist der Grund für die Adresse, und ein Link hält nur, wenn seine Namen bleiben.
Deutsch, weil jede Adresse der Anwendung deutsch ist (`suche`, `produkt`, `lagerort`, `vorgang`).
Ids statt Namen, weil Namen von Personen und Kunden nicht in eine Adresse gehören (CLAUDE.md,
Abschnitt 5) und eine Id genügt. Konkrete Tage statt einer Vorgabe: «Dieser Monat», im Dezember
geöffnet, zeigte dem Empfänger eines Novemberlinks etwas anderes. Beide Tage immer geschrieben,
weil eine Adresse ohne Tage «laufender Monat» heisst und ein eben geleertes Feld sonst
zurückspränge. Ersetzen statt Anlegen, weil der Zurück-Knopf zu dem Bildschirm gehört, von dem man
kam; der Klick auf eine Gruppe ist dagegen ein Schritt hinein, und Zurück führt wieder zu den
Summen.

**Zu 4:** Die Nachschlagewege sind für das Erfassen gebaut: sie verlangen ein Recht, das ein Leser
der Zeiten nicht haben muss, und lassen weg, was keine neue Zeit mehr nimmt — ein abgeschlossenes
Projekt, nach dem eine Auswertung am häufigsten fragt. Die Gruppen über den Zeitraum sind genau die
Menge, nach der sich filtern lässt, mit `TIME_READ` lesbar und mit Namen. Über den Zeitraum allein
und nicht über den ganzen Filter, damit die Auswahl nicht mit jedem anderen Feld schrumpft.

**Zu 5 und 7:** Die Maske rechnet nichts nach. Die Summe über den Filter liefert `/totals`, also
steht sie in den Kacheln und nicht als selbst addierte letzte Zeile der Gruppen.

**Zu 6:** Die Gruppierung ist Teil der Frage — «nach Projekt im Oktober» ist die Auswertung, die
man weitergibt. Bei einer Maske ist das Register keine Adresse wert (`Tabs`); hier schon.

**Zu 10:** Die Grenze von 366 Tagen ist eine Regel des Backends; es sagt sie am Feld `to`. Im
Browser geprüft wäre sie eine zweite Fassung derselben Regel.

**Zu 11:** React Router schreibt die Adresse in einer Transition. Ein Feld, das seinen Wert von dort
liest, verliert einen Buchstaben, der während der Transition getippt wird.

## Verworfene Alternativen

**Den Filter im Zustand der Seite halten.** Verworfen: kein Link, und ein Neuladen verliert ihn.

**Die Namen der API in der Adresse (`from`, `userId`, `projectId`).** Verworfen, siehe Begründung
zu 2.

**Die Vorgabe als Wert in der Adresse (`zeitraum=dieser-monat`).** Verworfen, siehe Begründung zu
2.

**Seite und Sortierung in der Adresse.** Verworfen: sie gehören zum Lesen, nicht zur Frage, wie im
Zugriffsprotokoll der Buchhaltung.

**Die Auswahl aus `/lookups/targets` und `/lookups/services`.** Verworfen, siehe Begründung zu 4.

**Eine Schnellsuche über `/projects`, `/partners` und `/products`.** Verworfen: sie verlangte
`PROJECT_READ`, `PARTNER_READ` und `PRODUCT_READ` zusätzlich, und die Zeiterfassung fragt fremde
Module nur über ihre eigenen Wege (Backend ADR-0160).

**Die Auswahl über den ganzen Filter, wie Facetten.** Verworfen, siehe Begründung zu 4: wer einen
Kunden wählt, fände das Projekt eines anderen Kunden nicht mehr, um zu wechseln.

**Die Vorgaben als Auswahlfeld mit «Eigener Zeitraum».** Verworfen: ein Klick mehr, und «Eigener
Zeitraum» wäre eine Wahl, die nichts tut.

**`SegmentedControl` für den Umschalter.** Verworfen: er ist für zwei bis vier Werte gedacht, hier
sind es sieben.

**Eine Summenzeile unter den Gruppen.** Verworfen, siehe Begründung zu 5 und 7.

**Der Klick auf eine Gruppe ersetzt die Adresse.** Verworfen: Zurück führte nicht zu den Summen.

**Die 366 Tage im Browser prüfen.** Verworfen, siehe Begründung zu 10.

**Die CSV-Datei als gewöhnlicher Link.** Verworfen: eine abgelaufene Sitzung zeigte in einem neuen
Tab eine nackte `401` statt der Anmeldung (`lib/api.ts`).

**Die Tabelle der Register (`TimeEntryTable`) wiederverwenden.** Verworfen: sie kennt nur Projekt
oder Kunde, keinen Filter und keine Sortierung, und «Vom Entwurf lösen» gehört nicht in eine
Auswertung.

## Konsequenzen

- Neuer Baustein `lib/timeEvaluation.ts`: Adresse lesen und schreiben, die vier Adressen und
  Schlüssel (unter `timeEntriesKey`, ein geschriebener Eintrag frischt die Auswertung auf),
  Vorgaben, Gruppen, Klick auf eine Gruppe, Auswahl und Kacheln. `lib/week.ts` kennt dazu
  `monthTitle`, `firstOfMonth` und `lastOfMonth`.
- Neue Seite `pages/TimeEvaluationPage.tsx` mit `pages/timetracking/EvaluationFilters.tsx`,
  `EvaluationEntries.tsx`, `EvaluationGroups.tsx` und `useEvaluationAddress.ts`.
- `TimeSummary` trägt `billableMinutes`, `lib/types.ts` kennt `TimeGroup` und `TimeGrouping`.
- `TimeSummaryFacts` gibt seine Darstellung als `TimeFigureFacts` her; `colleaguesKey` teilen
  «Zeiten von …» und die Auswertung; `QuickSearchField` nimmt `error`.
- Die Parameter der Adresse sind ein Vertrag. Wer einen umbenennt, macht jeden weitergegebenen Link
  zur Auswertung des laufenden Monats.
- **Was fehlt:** Ein Projekt, ein Kunde oder eine Leistung ohne Zeit im Zeitraum hat in der
  Auswahl keinen Namen. Einen Nachschlageweg mit `TIME_READ`, der auch abgeschlossene Projekte
  kennt, gibt es im Backend nicht; für die Auswertung genügt die Auswahl aus den Gruppen.

## Abweichungen vom Issue

- **Ein ADR im Frontend**, obwohl das Issue keines vorsieht: die Adresse ist eine Schnittstelle,
  die Links überdauern muss, und die Herkunft der Auswahl ist eine Entscheidung gegen den
  naheliegenden Weg.
- **Sechs Kacheln statt fünf:** neben den fünf des Issues «Offen verrechenbar» mit der Anzahl, wie
  auf den Registern.
- **«Mitarbeitende» als Auswahl mit Chips**, weil es keinen Baustein für eine Mehrfachauswahl gibt
  und ein natives `select multiple` sich mit der Maus kaum bedienen lässt.
