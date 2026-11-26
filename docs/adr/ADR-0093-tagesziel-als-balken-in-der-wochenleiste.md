# ADR-0093 — Tagesziel als Balken in der Wochenleiste und Bereich in den Einstellungen

- **Status:** Angenommen
- **Datum:** 2026-11-26
- **Verhältnis:** Ergänzt [ADR-0082](ADR-0082-schnellzeile-und-wochenleiste-fuer-zeiten.md)
  (Wochenleiste) und [ADR-0092](ADR-0092-strich-fuer-jeden-tag-ohne-zeit.md) («–» für jeden leeren
  Tag). Setzt Backend ADR-0171 um. Issue webux-admin/wx-office#143, «Zeiterfassung verbessern
  (14/15)».

## Kontext

Mit #142 fällt ein leerer Werktag in der Wochenleiste nicht mehr auf. Ein Mandant soll das
zurückholen können: ein Tagesziel, das in «Meine Zeiten» als wachsender Balken erscheint, ein- und
ausschaltbar in `/zeiterfassung-einstellungen`. Das Backend liefert es mit `TIME_TRACK` unter
`GET /time-entries/mine/day-target` und speichert es mit `PUT /time-tracking/settings`, zusammen mit
dem Abrechnungstakt (Backend ADR-0171).

## Entscheidung

1. **`WeekBar` bekommt `dayTarget?: number`.** Fehlt es, gibt es keinen Balken. Sonst steht unter
   der Summe ein dünner Balken in der Akzentfarbe auf `bg-sunken`, so breit wie
   `min(Minuten / Ziel, 1)` (`dayTargetShare`) — nur Montag bis Freitag, nur bis und mit heute
   (`drawsDayTarget`). Ein Tag ohne Balken behält dessen Platz, damit alle Summen auf einer Höhe
   stehen. Der Anteil erscheint nirgends als Zahl.
2. **Nur die eigene Woche**: «Meine Zeiten» fragt das Ziel nur für `owner === 'mine'` und reicht es
   nur dann weiter. Unter «Zeiten von …» gibt es keinen Balken und keine Anfrage.
3. **Vorleser und Tooltip** sagen «6:15 von 8:00 erfasst» (`dayTargetText`), über dem Ziel «9:00 von
   8:00 erfasst» ohne «+1:00», ohne Zeit «keine Zeit von 8:00 erfasst». Der Balken selbst ist
   `aria-hidden`.
4. **Solange das Ziel lädt oder scheitert, gibt es keinen Balken**; die Woche bleibt bedienbar.
   Gefragt wird nach der Woche, damit die Woche zuerst kommt.
5. **Einstellungen, Bereich «Tagesziel»** unter dem Abrechnungstakt: ein Schalter «Tagesziel in
   «Meine Zeiten» zeigen» und «Stunden je Arbeitstag» (`8:00`), gelesen wie das Dauerfeld
   (`readDayTarget`), ein Von–Bis und ein leeres Feld abgewiesen; ob der Wert zwischen 1:00 und
   12:00 liegt, sagt der Server am Feld. Darunter: «Eine Erinnerung in der eigenen Woche. Kein Saldo,
   keine Überzeit, für andere nicht sichtbar.»
6. **Ein Schreibweg, beide Bereiche**: der Takt schickt das Ziel so mit, wie er es gelesen hat, und
   das Ziel den Takt. Nach dem Speichern liest «Meine Zeiten» das Ziel neu.

## Begründung

**Zu 1:** Eine Zahl wie «78 %» wäre eine Bewertung des Tages; der Balken erinnert nur. Eine Farbe,
keine Ampel (Backend ADR-0171).

**Zu 2:** Eine Erinnerung für sich selbst darf kein Werkzeug werden, mit dem man andere misst.

**Zu 6:** Die Einstellungen sind eine Zeile je Mandant; ein Request mit allen Werten lässt keinen
Wert versehentlich zurückfallen.

## Verworfene Alternativen

**Das Ziel aus der Antwort der Woche lesen.** Verworfen wie im Backend: dieselbe Antwort dient
«Zeiten von …».

**Den Balken auch am Wochenende, wenn dort Zeit steht.** Verworfen: das Ziel ist das eines
Arbeitstags; ein voller Balken am Samstag läse sich wie eine Pflicht.

**Den Anteil als Zahl in der Kachel.** Verworfen, siehe zu 1.

## Konsequenzen

- `lib/timetracking`: `dayTargetUrl`, `dayTargetKey`, `drawsDayTarget`, `dayTargetShare`,
  `dayTargetText`, `readDayTarget`, `dayTargetSavedText`. Typen `TimeTrackingSettings` (vorher
  `TimeBillingSettings`), `TimeTrackingSettingsRequest` und `TimeDayTarget`.
- `WeekBar` mit `dayTarget`; `TimeEntryPage` fragt das Ziel; `TimeTrackingSettingsPage` mit dem
  Bereich «Tagesziel».
