# ADR-0083 — Stoppuhr in der Kopfzeile

- **Status:** Angenommen
- **Datum:** 2026-11-24
- **Verhältnis:** Neu. Setzt Backend ADR-0161 (Issue webux-admin/wx-office#125, «Zeiterfassung
  (3/6) — Stoppuhr») um und baut auf der Schnellzeile auf (ADR-0082). Folgt den Fehlern am Feld
  (ADR-0050), den Rückfragen bei ungespeicherten Eingaben (ADR-0069) und den Tastenkürzeln
  (ADR-0012, ADR-0048).

## Kontext

Das Backend führt seit #125 eine Stoppuhr je Benutzer und Mandant (Backend ADR-0161). Sie läuft auf
dem Server, übersteht Neuladen, einen geschlossenen Browser und einen Gerätewechsel. Alle Wege
liegen unter `/api/tenants/{tenantId}/time-entries/mine` und verlangen `TIME_TRACK`:

| Weg | Antwort |
|---|---|
| `GET /timer` | 200 `RunningTimerDto` oder 204 |
| `POST /timer` | 201 `TimerStartDto`, 200 mit `started: false`, wenn ein anderes Gerät gleichzeitig gewann |
| `PUT /timer` | 200 `RunningTimerDto`; `lockVersion` Pflicht, weggelassenes `startedAt` heisst «behalten» |
| `POST /timer/stop` | 200 mit den Einträgen, einer je Tag; `correctedEnd` freiwillig |
| `DELETE /timer` | 204 |
| `POST /{entryId}/continue` | wie `POST /timer` |

`startedAt` ist **sekundengenau**. Die Antwort trägt `elapsedMinutes`, `longRunning` ab zwölf
Stunden, `endRequired` über 24 Stunden und `notice`, den Satz vor dem Anhalten. Eine Uhr über 24
Stunden weist das Anhalten mit 409 ab, mit `startedAt` und dem Feld `correctedEnd` unter `errors`;
verrechenbar ohne Leistung oder Kunde mit 400 am Feld, und die Uhr läuft weiter.

Das Issue verlangt: die Uhr auf jeder Seite sichtbar, ein kleines Feld mit den Feldern der
Schnellzeile, «Start», «Stopp» und «Verwerfen», die Zeit im Titel des Browser-Tabs, keine Abfrage im
Sekundentakt, und «Fortsetzen» an jedem Eintrag in «Meine Zeiten».

## Entscheidung

1. **Ein Knopf `TimerButton` im Kopf der Seitenleiste**, unter Mandant und Einklappknopf, auf
   jeder Seite an derselben Stelle. Ohne Uhr sagt er «▶ Zeit starten», mit Uhr «■ 0:42 · P-00012
   Website · Konzeption» auf grüner Fläche (`bg-accent`), die Zeit in Geist Mono. **Eingeklappt** ist
   er nur das Symbol; was er sagt, steht im zugänglichen Namen und im Tooltip («Stoppuhr läuft:
   0:42 · P-00012 Website · Konzeption»). **Auf dem Telefon** steht er in der oberen Leiste rechts
   neben «Navigation»; die Schublade wiederholt ihn nicht.
2. **Sichtbar nur mit eingeschaltetem Modul `TIMETRACKING` und `TIME_TRACK`.** Ohne beides
   erscheint er nicht und fragt nichts ab — wie der Menüeintrag «Zeiten». Laden zeigt einen
   Drehkreis, ein Lesefehler «Stoppuhr nicht geladen» mit dem Satz des Backends im Tooltip; ein
   Klick liest neu. Scheitert nur ein erneutes Lesen, bleibt die zuletzt gelesene Uhr stehen.
3. **Ein Klick öffnet ein kleines Feld**, gebaut als `Dialog` der Anwendung. Es öffnet erst, wenn
   die Uhr neu gelesen ist: der Hinweis ab zwölf Stunden ist nur so frisch wie die letzte Antwort,
   und ein anderes Gerät kann sie inzwischen angehalten haben.
   - **Keine Uhr:** «Zuletzt», Projekt oder Kunde, Leistung, Text, «verrechenbar»; «Abbrechen» und
     «▶ Start». Alles ist freiwillig — ein leeres Feld startet mit `{}` auf interner Zeit, weil die
     Uhr unvollständig laufen darf (Backend ADR-0161, Entscheidung 6). Der Fokus steht auf
     «Projekt oder Kunde»; Enter startet aus jedem Feld, ausser eine Liste übernimmt ihren Treffer.
   - **Uhr läuft:** dieselben Felder ausgefüllt, darunter «Gestartet am» und «Gestartet um»;
     «Verwerfen» links, «Speichern» und «■ Stopp» rechts. **Der Fokus steht auf «Stopp»**: Klick
     und Enter halten an. Strg+S und Enter in einem Feld speichern.
4. **Dieselben Bausteine wie die Schnellzeile.** Projekt oder Kunde, Leistung und «verrechenbar»
   liegen als `TargetField`, `ServiceField` und `BillableField` in `src/timetracking/`, ebenso die
   Chips «Zuletzt» (`RecentChips`); die Schnellzeile und das Feld der Stoppuhr benutzen sie beide.
   Die Regeln — Name getippt und nicht übernommen, Vorschlag der Leistung, «verrechenbar» folgt dem
   Ziel — gelten über `AssignmentForm` in `lib/timetracking.ts` für beide Formen.
5. **Ändern läuft über `PUT`** und schickt alles, worauf die Uhr läuft, weil ein weggelassenes Feld
   leer heisst; «verrechenbar» immer mit Wert. **Den Start schickt es nur, wenn er geändert
   wurde**, dann auf die Minute, wie das Feld ihn zeigt; sonst behält der Server ihn sekundengenau.
   Ein Start in der Zukunft steht mit dem Satz des Backends am Feld.
6. **«Stopp» speichert zuerst, was im Feld geändert ist**, dann hält es an. So trägt der Eintrag,
   was das Feld zeigt — vor allem die Leistung, die nach einer Abweisung ergänzt wurde. Verrechenbar
   ohne Leistung nennt das Feld schon vor dem Senden, mit dem Satz des Backends; beim Start und beim
   Speichern nicht, weil die Uhr so laufen darf. Weist das Backend ab, steht die Meldung am Feld, und
   **die Uhr läuft weiter**.
7. **Ab zwölf Stunden** (`longRunning`) steht `notice` als Hinweis im Feld, darunter «Ende am»
   (vorbelegt mit dem Tag des Starts) und «Ende um». Leer hält jetzt an. **Über 24 Stunden**
   (`endRequired`) ist «Ende um» Pflicht, und ohne Ende geht nichts hinaus. Meldet das Anhalten 409
   mit dem Feld `correctedEnd`, obwohl die Uhr nicht so markiert war, erscheinen die Felder ebenfalls,
   als Pflicht und mit dem Satz des Backends; daran — am Feld — unterscheidet die Maske diese 409 von
   den anderen (`isTimerTooLong`). Das echte Ende geht als `correctedEnd` hinaus.
8. **Die laufende Zeit rechnet der Browser aus `startedAt`**, in echten Minuten wie das Anhalten. Er
   zeichnet neu, wenn die Minute seit dem Start umschlägt — weil der Start sekundengenau ist, bei der
   Sekunde des Starts, nicht bei der vollen Minute der Uhr (`useSyncExternalStore` mit einem
   Zeitgeber bis zur nächsten Minute). Kein Abfragen, weder im Sekunden- noch im Minutentakt.
9. **Kehrt der Tab zurück** (`visibilitychange`), liest der Knopf die Uhr und die Einträge neu, damit
   ein Anhalten am Telefon hier ankommt — mit den Einträgen, die es geschrieben hat.
10. **Der Titel des Tabs** beginnt mit der Zeit: «▶ 0:42 · webux ERP». Beim Anhalten oder Verwerfen
    steht der alte Titel wieder da.
11. **Nach Start, Stopp, Verwerfen und «Fortsetzen»** setzt die Maske die Uhr aus der Antwort in den
    Cache (`timerKey`) und macht die Schlüssel der Einträge ungültig (`timeEntriesKey`): «Meine
    Zeiten», die Wochensummen und «Zuletzt» stimmen ohne Neuladen. Was geschah, sagt ein Satz über
    `aria-live` («Angehalten: 1 Std. 30 Min., P-00012 Website · Muster AG.», über Mitternacht je Tag).
12. **Ein anderes Gerät war schneller oder anders.** Startet es gleichzeitig (`started: false`),
    bleibt das Feld offen, zeigt dessen Uhr und sagt es. 404 (anderswo angehalten) und 409 (anderswo
    geändert) zeigen den Satz des Backends über den Feldern, die Maske liest Uhr und Einträge neu,
    und das Feld folgt dem, was jetzt läuft.
13. **«Fortsetzen» (▶)** steht an jedem Eintrag in «Meine Zeiten», nur in der eigenen Ansicht und
    nur bei `editable`. Es startet die Uhr ohne Rückfrage; läuft schon eine, hält das Backend sie an,
    und der Satz unter der Schnellzeile nennt beides. Ein abgeschlossenes Projekt weist das Backend ab
    (400 `projectId`); der Satz steht über der Liste.
14. **Verwerfen fragt** mit `ConfirmDialog` und nennt die Zeit, die verloren geht.
15. **Der Dialog wird in `body` gezeichnet** (Portal). Die Seitenleiste und die Leiste des Telefons
    sind eigene Ebenen; darin läge er unter allem, was eine Seite darüber legt.

## Begründung

**Zu 1:** Die Uhr ist der einzige Zustand, der über alle Seiten weiterläuft. Er gehört an einen
Ort, der auf allen Seiten derselbe ist, und nicht in den Inhalt einer Seite. Auf dem Telefon soll man
anhalten können, ohne erst das Menü zu öffnen.

**Zu 3:** Das Issue verlangt ein Feld mit «Start», «Stopp» und «Verwerfen». Dass Klick und Enter
anhalten, hält den Weg so kurz wie einen Knopf, ohne dass ein Fehlklick in der Seitenleiste eine Uhr
anhält. Das Feld öffnet auf der frisch gelesenen Uhr, weil ein Hinweis ab zwölf Stunden, der aus
einer Antwort vom Morgen stammt, gerade dann fehlt, wenn er gebraucht wird.

**Zu 4:** Zwei Formen mit eigener Schnellsuche würden auseinanderlaufen, sobald eine davon einen
Fehler behoben bekommt. Die Bausteine wandern deshalb aus `pages/timetracking/` nach
`src/timetracking/`, wie `src/masterdata/` die Auswahlfelder für mehrere Seiten hält; die
Seitenleiste soll nichts aus `pages/` holen.

**Zu 5 und 6:** Ein weggelassenes Feld heisst beim Backend «leer». Wer nur die Startzeit ändert,
darf die Leistung nicht verlieren. Den Start nur bei Änderung zu schicken, verhindert, dass ein
Speichern die Sekunden des Starts abschneidet und Zeit dazugibt (Backend ADR-0161, Entscheidung 2).

**Zu 7:** Eine Uhr, die einen Tag läuft, wurde vergessen. Das Feld fragt, statt sie zu kürzen; die
Grenzen setzt das Backend, die Maske liest nur die Flaggen.

**Zu 8:** Ein Abfragen im Sekundentakt kostet je Benutzer 3600 Anfragen in der Stunde, um eine Zahl
zu zeigen, die der Browser selbst kennt. Neu gezeichnet wird nur, wenn sich die angezeigte Minute
ändert.

**Zu 13:** «Fortsetzen» ist der Wechsel zu anderer Arbeit mit einem Klick (Toggl). Eine Rückfrage
nähme genau diesen Klick wieder weg; was angehalten wurde, sagt der Satz danach.

## Verworfene Alternativen

**Ein Klappfeld am Knopf statt eines Dialogs.** Verworfen: neben einer 64 Pixel breiten Leiste und
in der Leiste des Telefons fehlt der Platz, und Fokusfalle, Escape, Rückfrage bei Änderungen und
Strg+S gäbe es ein zweites Mal. Der `Dialog` hat sie schon (ADR-0012, ADR-0069).

**Ein geteilter Knopf: das Symbol startet oder hält sofort an, der Text öffnet das Feld.** Verworfen:
eingeklappt ist nur Platz für ein Symbol, und zwei Ziele nebeneinander in einer Zeile von 2.25 rem
werden verwechselt; ein Fehlklick hielte eine Uhr an und schriebe einen Eintrag. Klick und Enter
genügen.

**«Start» auch bei laufender Uhr im Feld**, als Wechsel zu anderer Arbeit. Verworfen: ein vierter
Knopf im kleinen Feld, und unklar, ob er die geänderten Felder der laufenden Uhr nimmt oder neue. Der
Wechsel mit einem Klick ist «Fortsetzen»; sonst «Stopp» und «Start».

**Die laufende Zeit vom Server abfragen**, im Sekunden- oder Minutentakt. Verworfen, siehe Begründung
zu 8; das Issue verbietet es.

**Die Zeit aus `elapsedMinutes` weiterzählen** statt aus `startedAt`. Verworfen: das Issue und
Backend ADR-0161 nennen `startedAt`; eine Zählung ab der Antwort wiche nach jedem Neuladen um bis zu
einer Minute ab.

**Neu zeichnen auf der vollen Minute der Uhr.** Verworfen, seit der Start sekundengenau ist: die
Anzeige schlüge bis zu 59 Sekunden zu früh oder zu spät um.

**Den Hinweis ab zwölf Stunden selbst ausrechnen** (lokal gezählte Minuten ≥ 720). Verworfen: die
Grenze gehört dem Backend. Das Feld liest die Uhr stattdessen beim Öffnen neu.

**Nach einer Abweisung «verrechenbar» still ausschalten**, damit das Anhalten durchgeht. Verworfen:
eine verrechenbare Stunde ginge unbemerkt verloren (#122). Die Meldung steht am Feld, die Uhr läuft
weiter.

**«Stopp» ohne vorheriges Speichern**, mit dem alten Stand der Uhr. Verworfen: der Eintrag trüge
nicht, was im Feld steht, und die ergänzte Leistung fehlte darin.

**Die Uhr im Browser (`localStorage`)** als Zwischenstand. Verworfen wie im Backend: sie kennt kein
zweites Gerät. Die Maske hält nur, was im Feld getippt ist.

**Ein Startknopf in der Schnellzeile**, wie ADR-0082 unter «Konsequenzen» vermutete. Nicht gebaut:
#125 verlangt ihn nicht, und «Fortsetzen» und der Knopf in der Kopfzeile decken das Starten ab. Ein
eigener Schritt, falls er gewünscht wird.

**«Fortsetzen» auch in der Woche einer Kollegin.** Verworfen: die Stoppuhr ist die eigene, und eine
Uhr für andere gibt es auf keinem Weg (Backend ADR-0161, Entscheidung 12).

## Konsequenzen

- Neu: `src/timetracking/` mit `TimerButton`, `TimerDialog`, `useRunningTimer.ts`
  (`useRunningTimer`, `useMinutesRunning`, `useReloadOnReturn`, `useTimerTabTitle`),
  `AssignmentFields` (`TargetField`, `ServiceField`, `BillableField`), `RecentChips` (verschoben aus
  `pages/timetracking/`) und `enterSubmits`. `TimeEntryLine` benutzt die gemeinsamen Felder.
- `lib/timetracking.ts`: die Wege der Stoppuhr, `timerKey`, die Zählung (`minutesSince`,
  `msUntilNextMinute`), Wörter und Titel, die Form `TimerForm` mit ihren Anfragen und Prüfungen,
  `isTimerTooLong`. `TimeEntryForm` ist jetzt `AssignmentForm` mit `duration`; die `with…`-Helfer
  nehmen beide Formen.
- `lib/types.ts`: `RunningTimer`, `TimerStart`, `TimerRequest`, `TimerChangeRequest`,
  `TimerStopRequest`, 1:1 nach den Records des Backends.
- `layout/AppShell.tsx`: der Knopf im Kopf der Seitenleiste und in der Leiste des Telefons.
- `DayEntries` hat «Fortsetzen»; `TimeEntryPage` startet damit die Uhr und setzt sie in den Cache.
- Am Tag der Zeitumstellung zeigt der Knopf echte Minuten; Von–Bis des Eintrags weicht dann um eine
  Stunde davon ab, wie im Backend beschrieben.

## Abweichungen vom Issue

- **Das «kleine Feld» ist ein Dialog** (siehe Verworfene Alternativen), mit «Speichern» als viertem
  Schritt, weil das Ändern der laufenden Uhr — auch der Startzeit — einen eigenen Weg braucht.
- **«Start» steht nur ohne laufende Uhr im Feld**; mit Uhr stehen dort «Verwerfen», «Speichern» und
  «Stopp».
- **Die Startzeit** ändert sich über «Gestartet am» und «Gestartet um», nicht über ein Feld wie «vor
  10 Minuten».
- **Der Titel des Tabs** nennt die Zeit und den bisherigen Titel («▶ 0:42 · webux ERP»), nicht das
  Projekt.

## Offen

- Die Masken sind über `fetch` getestet, aber nicht im Browser in hellem und dunklem
  Erscheinungsbild, eingeklappt und auf dem Telefon angeschaut; das steht vor dem Zusammenführen an.
  Besonders zu prüfen: der grüne Knopf auf der dunklen Seitenleiste im dunklen Erscheinungsbild und
  der Fokusrahmen (`accent-text`) auf der Seitenleiste im hellen.
- Die Uhrzeiten im Feld liest die Maske auf der Uhr des Browsers. Wer in einer anderen Zeitzone
  arbeitet als Europe/Zurich, sieht den Start in seiner Zeit; die Tage der Einträge schneidet das
  Backend in Zürich.
