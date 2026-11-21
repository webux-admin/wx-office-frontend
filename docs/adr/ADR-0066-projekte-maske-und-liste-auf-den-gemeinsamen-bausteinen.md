# ADR-0066 — Projekte: Maske auf `FormMask`, Liste bleibt

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc fragt bei ungespeicherten Änderungen), ADR-0049 (Grössen)
  und ADR-0050 (Tooltips) für die Projekte um. Die Projektmaske folgt dem Muster der
  Stammdatenmasken (ADR-0060).

## Kontext

Ein Projekt wird in einer Maske bearbeitet: Name, Laufzeit, Beschreibung, Kunde, Kontakt und
Verantwortlicher, dazu Statuswechsel, Archiv und Löschen. Die Maske nutzte `PageHeader`.
Esc und der Zurück-Link fragten nie nach, obwohl ungespeicherte Eingaben verloren gingen.
Die Liste ist eine Tabelle mit Suche.

## Entscheidung

1. **Die Projektmaske ist eine `FormMask`.** Die Statuswechsel, das Löschen und das
   Speichern liegen in den Kopfaktionen. Ein Statuswechsel lässt die Eingaben stehen, wie bisher.
2. **Ungespeicherte Änderungen** schalten `dirty` ein. Der Vergleich ist der Stand der Maske
   gegen das gespeicherte Projekt, bei einem neuen Projekt gegen die leere Vorlage.
3. **Die Liste bleibt** eine Tabelle mit `PageHeader`. Sie hat keine Eingaben.
4. **Grössen kommen aus rem und Schrift-Tokens.**
5. **Der Erklärsatz** unter dem Ende-Datum wird ein Tooltip. Die Kontakt-Hinweise bleiben
   sichtbar, weil sie sagen, warum das Feld leer ist (zuerst Kunde wählen, keine Kontaktperson).
   Der Archiv-Hinweis bleibt ebenfalls sichtbar.

## Begründung

Eine Projektmaske hat mehrere Felder und Kopfaktionen, die sich wie bei den Stammdaten
verhalten. Ohne Änderungsschutz geht bei Esc Arbeit verloren. Die Liste braucht keinen Schutz,
weil sie nichts speichert.

## Verworfene Alternativen

**Den Änderungsschutz über `useChangeTracker`.** Verworfen: der Tracker zählt jede Eingabe und
setzt nach dem Speichern nicht zurück. Der Vergleich mit dem gespeicherten Stand ist einfacher.

**Den Statuswechsel als eigene Seite.** Verworfen: er ist ein Knopf in der Kopfzeile und ändert
keine Felder.

## Konsequenzen

- Esc und der Zurück-Link in der Projektmaske fragen bei ungespeicherten Änderungen.
- Die Projektmaske ist nach dem Speichern verlassen, wie bisher. Der Schutz greift nur davor.

## Abweichungen vom Issue

Keine.

## Offen

- Die Projektmaske ist in schmalen Fenstern nicht im Browser geprüft. Dafür gilt dasselbe wie
  für das Bankmodul (ADR-0065).
