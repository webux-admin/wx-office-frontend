# ADR-0057 — Die Belegart-Maske folgt dem Muster der Partnermaske, ohne Drucker

- **Status:** Angenommen
- **Datum:** 2026-11-20
- **Verhältnis:** Wendet [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md) auf
  `/belegarten/:id` an. Setzt im Frontend Backend-ADR-0138 um (keine Drucker im System).

## Kontext

Die Belegart-Maske war älter als das Muster der Partnermaske. Lange Hinweissätze standen unter
jedem Feld, ein Panel «Aus der Kategorie» erklärte Technisches («Maske im Frontend»), und jede
Ausfertigung bot Drucker und Schacht an, obwohl eine Webseite beides nicht wählen kann.

## Entscheidung

1. **Drucker und Schacht verschwinden** aus der Belegart, aus dem Beleg und aus dem
   Druckdialog. Die Maske *Drucker* und ihr Menüeintrag fallen weg.
2. **`FormMask`** trägt die Maske: Escape, Ctrl+S und die Frage vor dem Verwerfen wie beim
   Partner. Die Faktenzeile zeigt Kategorie, Adresse, Druckvorlage und Ausdruck.
3. **Register:** Allgemein, Druck, Übernahme. «Hauptdaten» heisst «Allgemein», das Panel «Aus
   der Kategorie» entfällt: die Adressverwendung steht in der Faktenzeile.
4. **Hinweise als Tooltip**, Kategorie und Code mit `locked`. Deaktivieren fragt mit
   `ConfirmDialog` und wird für die Standard-Belegart nicht angeboten.
5. Einfachere Wörter: «Wirkung» statt «Lagerwirkung», «Als Standard festlegen», «Aktuelle
   Preise holen», Badge «Aus Rechnung» statt «Ohne Maske», «3 Blätter» statt «3 ×».

## Begründung

Dieselbe Bedienung in jeder Vollmaske spart Lernaufwand. Ein Feld, das nichts steuert, kostet
Pflege und weckt falsche Erwartungen.

## Verworfene Alternativen

**Drucker nur ausblenden, Daten behalten.** Siehe Backend-ADR-0138: Rechte und Daten ohne
Leser verwirren.

**Fehler am Feld (ADR-0050 Abschnitt 2) im selben Schritt.** `firstComplaint` liefert einen
Satz, keine Feldzuordnung. Der Umbau auf `FieldErrors` ist eigene Arbeit und bleibt offen.

## Konsequenzen

- Fehler erscheinen weiter als Hinweis über der Maske, nicht am Feld.
- Gespeicherte Drucker gehen mit der Backend-Migration V126 verloren.
