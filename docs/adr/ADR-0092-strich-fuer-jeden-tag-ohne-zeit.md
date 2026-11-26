# ADR-0092 — «–» für jeden Tag ohne Zeit in der Wochenleiste

- **Status:** Angenommen
- **Datum:** 2026-11-26
- **Verhältnis:** Löst in [ADR-0082](ADR-0082-schnellzeile-und-wochenleiste-fuer-zeiten.md) Punkt 2
  den Satz «Ein leerer Werktag zeigt «0:00», ein leerer Samstag oder Sonntag «–»» und die Begründung
  dazu ab. Issue webux-admin/wx-office#142, «Zeiterfassung verbessern (13/15)». Das Auffallen eines
  leeren Werktags übernimmt der Balken aus #143.

## Kontext

Die Wochenleiste von `/zeiten` zeigte für einen leeren Werktag «0:00» und für einen leeren Samstag
oder Sonntag «–» (`dayTotalText`). Weil das Backend jeden Tag des Bereichs schickt, auch Tage nach
heute, stand am Donnerstag der laufenden Woche «0:00». Die Rückmeldung: «Bei Zeiten in der Zukunft
sollte es generell - sein. Bei Zeiten in der Vergangenheit auch -, wenn nichts gebucht wurde.»

## Entscheidung

1. **Keine Minute → «–».** Der Wochentag spielt keine Rolle mehr; ein Tag mit Zeit zeigt seine
   Summe wie bisher, auch ein Samstag mit 1:30. Eine Funktion `totalText(minutes)` in
   `lib/timetracking.ts` ersetzt `dayTotalText(day, minutes)`.
2. **Tage nach heute zeigen «–»**, weil das Backend für sie keine Zeit annimmt (Backend ADR-0160). Im
   Browser wird dafür nichts gerechnet; ihr Tooltip und ihr Vorlesetext aus #132 bleiben.
3. **Dieselbe Regel an drei Stellen**: Kachel, Wochensumme und Summe im Kopf der Tagesliste. Sonst
   stünde über der leeren Tagesliste «0:00» und daneben in der Kachel «–».
4. **Der Vorleser sagt, was gilt**: ein leerer Tag bis und mit heute heisst «Dienstag,
   17. November: keine Zeit erfasst» statt «… 0 Min.». Während die Woche lädt, steht weiter «·».

## Begründung

**Zu 1:** Eine Leiste voller Nullen gewöhnt das Auge daran, über sie hinwegzulesen — das Argument
von ADR-0082, jetzt für jeden Tag. Ob ein leerer Werktag auffallen soll, entscheidet der Mandant mit
dem Tagesziel (#143).

**Zu 3:** Eine Summe, die je nach Ort anders aussieht, liest sich wie zwei verschiedene Zahlen.

## Verworfene Alternativen

**«0:00» für vergangene Werktage behalten, «–» nur für die Zukunft.** Verworfen: die Rückmeldung
verlangt «–» auch in der Vergangenheit, und die Nullen würden weiter überlesen.

**Leere Werktage einfärben.** Verworfen: das bewertet den Tag. Das Auffallen übernimmt der
abschaltbare Balken aus #143, und der hat keine Ampelfarben.

## Konsequenzen

- `dayTotalText` entfällt; `WeekBar` und `TimeEntryPage` nehmen `totalText`. `isWeekend` bleibt in
  `lib/week.ts` für #143.
- Kein Backend: es schickt weiter jeden Tag, auch mit 0.
