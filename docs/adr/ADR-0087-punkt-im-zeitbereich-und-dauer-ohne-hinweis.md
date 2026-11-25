# ADR-0087 — Der Punkt im Zeitbereich ist eine Uhrzeit, und unter der Dauer steht kein Hinweis

- **Status:** Angenommen
- **Datum:** 2026-11-25
- **Verhältnis:** Löst in ADR-0082 Punkt 5 teilweise ab — den Satz zum Hinweis unter dem Feld und
  die verworfene Alternative «Der Punkt als Uhrzeit-Trenner». Alles andere aus Punkt 5 gilt weiter.
  Issue webux-admin/wx-office#131, «Zeiterfassung verbessern (2/12)».

## Kontext

Aus dem ersten Gebrauch der Zeiterfassung kamen zwei Wünsche zum Feld «Dauer»:

- «1.» soll eine Stunde sein. Wer schnell tippt, setzt den Punkt nach der Zahl, bevor er merkt,
  dass nichts mehr folgt. `DECIMAL_HOURS` verlangte nach dem Punkt eine Ziffer.
- «9.3-16.15» soll 09:30 bis 16:15 sein. So schreibt man Uhrzeiten in der Schweiz: «9.30 Uhr».
  Im Bereich trennte bisher nur der Doppelpunkt Stunden und Minuten.

Dazu: der Hinweis «= 1 Std. 30 Min.» unter dem Feld, der sich bei jedem Tastendruck neu rechnet,
stört mehr, als er hilft. Das Tooltip genügt.

ADR-0082 hatte den Punkt als Uhrzeit-Trenner verworfen: «1.30» allein ist ein Dezimalbruch von
Stunden, und ein Zeichen mit zwei Bedeutungen im selben Feld führe zu falschen Minuten.

## Entscheidung

1. **«1.» und «1,» sind eine Stunde.** Eine Zahl mit Punkt oder Komma und nichts dahinter zählt wie
   die Zahl allein. «0.» ist zu kurz, «24.» genau ein Tag.
2. **Im Bereich ist der Punkt eine Uhrzeit, ausserhalb ein Dezimalbruch.** Wie der Punkt gelesen
   wird, hängt am Bindestrich: `1.5` ist anderthalb Stunden, `9.5-10` ist 09:50 bis 10:00.
3. **Eine einzelne Ziffer nach dem Punkt zählt als Zehnerminuten**, wie in «9.3 Uhr»: `9.3` ist
   09:30 und nicht 09:18. Zwei Ziffern sind die Minuten (`9.05` ist 09:05), keine Ziffer die volle
   Stunde (`9.-10` ist 09:00 bis 10:00). Das Komma gilt wie der Punkt. Was keine Minute ist
   (`9.75`, `9.60`), wird abgewiesen.
4. **Nach dem Doppelpunkt bleibt es bei zwei Ziffern.** «9:3» ist weiterhin keine Uhrzeit: wer den
   Doppelpunkt tippt, schreibt die Minuten aus.
5. **Unter dem Feld steht nichts mehr.** Das Tooltip nennt alle Formen und den einen Stolperstein:
   «1:30, 1.5, 90m, 2h 15m, 9-10:30 oder 9.30-16.15. Eine Zahl ohne Einheit sind Stunden; im
   Bereich trennt der Punkt Stunden und Minuten, 9.3 ist also 09:30.» Eine Dauer, die keine ist,
   steht beim Speichern rot am Feld — wie jeder andere Feldfehler (ADR-0050).

## Begründung

**Zu 2:** Der Einwand aus ADR-0082 gilt für ein Zeichen, das im **selben** Zusammenhang zweierlei
heisst. Hier entscheidet der Bindestrich, und er ist eindeutig: ein Bereich besteht aus zwei
Uhrzeiten, und eine Uhrzeit ist nie ein Dezimalbruch. «9.5 Uhr» meint niemand als 09:30. Wer
dagegen «1.5» allein tippt, meint anderthalb Stunden — das bleibt so.

**Zu 3:** «9.3» als 09:18 zu lesen (0.3 Stunden) wäre rechnerisch folgerichtig und fachlich falsch:
niemand schreibt so eine Uhrzeit. Die Zehnerminute entspricht dem, wie man «halb zehn» kurz
notiert.

**Zu 5:** Der Hinweis war gedacht, damit niemand eine falsch gelesene Dauer speichert. Im Gebrauch
hat er vor allem bei jedem Tastendruck geflackert. Was gespeichert wurde, steht danach in der Liste
des Tages mit Von–Bis und Dauer, und die Meldung «Gespeichert: 6 Std. 45 Min.» sagt es noch einmal.

## Verworfene Alternativen

**Den Punkt überall als Uhrzeit lesen, auch ohne Bereich.** Verworfen: «1.5» als 1:50 bräche die
Gewohnheit aller, die schon erfassen, und jede Dezimalzahl aus einer Tabelle.

**«9.3» als 09:03 lesen.** Verworfen: niemand schreibt drei Minuten nach neun so; die Ziffer nach
dem Punkt ist in der Alltagsschreibweise die Zehnerstelle.

**Den Hinweis behalten, aber erst nach einer Pause im Tippen zeigen.** Verworfen: eine zweite
Stelle neben dem Tooltip, die etwas erklärt, und ein Zeitgeber mehr in der Zeile, die schnell sein
soll.

## Konsequenzen

- `lib/duration.ts`: `CLOCK` kennt den Punkt und das Komma, `DECIMAL_HOURS` einen Punkt ohne
  Ziffer dahinter; `DURATION_FORMS` ist der Text des Tooltips und steht neben den Formen, die er
  beschreibt.
- `pages/timetracking/TimeEntryLine.tsx` zeigt kein `hint` mehr. Die Schnellzeile und das
  Bearbeiten in der Zeile lesen beide über `readDuration`.
- Das Backend ist nicht berührt: es kennt nur Minuten und Uhrzeiten (Backend ADR-0160).
