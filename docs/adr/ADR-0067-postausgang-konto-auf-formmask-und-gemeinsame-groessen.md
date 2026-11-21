# ADR-0067 — Postausgang: Konto auf `FormMask`, Liste und Vorlagen bleiben

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc fragt bei ungespeicherten Änderungen), ADR-0049 (Grössen)
  und ADR-0050 (Tooltips) für den Postausgang um. Das Mailkonto ist eine Einzelmaske wie die
  Stammdaten (ADR-0060).

## Kontext

Der Postausgang besteht aus der Nachrichtenliste mit Filtern, den Mailvorlagen je Kategorie
und Sprache, dem Nachrichten-Dialog und dem Mailkonto. Das Mailkonto ist ein einzelner
Datensatz mit Speichern in der Kopfzeile. Die Maske nutzte `PageHeader`. Esc und der
Zurück-Link fragten nicht nach ungespeicherten Eingaben, obwohl Server, Port und Absender
verloren gehen konnten.

## Entscheidung

1. **Das Mailkonto ist eine `FormMask`.** Es hat einen Datensatz, ein Speichern und einen
   Zurück-Weg zur Liste. Der Verbindungstest bleibt im Seitenbereich, weil er den gespeicherten
   Stand prüft.
2. **Die Liste und die Vorlagen bleiben.** Die Liste hat Filter, die Vorlagen sind eine
   Auswahl mit Textfeldern je Kategorie. Beide haben keinen gemeinsamen Speichervorgang.
3. **Grössen kommen aus rem und Schrift-Tokens.**
4. **Erklärsätze werden Tooltips.** Das betrifft «Leer lassen» bei Servername und Antwortadresse
   und den Hinweis zum Ausschalten.
5. **Zustandshinweise bleiben sichtbar.** Die Anmeldeart «Microsoft 365 folgt» zeigt, was
   fehlt. Der Passwort-Hinweis sagt, dass ein gespeichertes Passwort nie herausgegeben wird;
   er bleibt unter dem Feld.

## Begründung

Das Mailkonto ist ein Datensatz mit Speichern. Ohne Änderungsschutz geht ein halb geschriebener
Server bei Esc verloren, und das Passwort lässt sich nicht wiederherstellen. Die Liste und die
Vorlagen brauchen keinen solchen Schutz, weil sie keine Eingaben über mehrere Felder sammeln.

## Verworfene Alternativen

**Die Vorlagen als `FormMask`.** Verworfen: jede Kategorie und Sprache speichert für sich, wie
bei den Mahntexten (ADR-0064).

**Den Verbindungstest auf die offenen Änderungen anwenden.** Verworfen: der Test braucht das
Passwort aus der Datenbank, das im Formular nie angezeigt wird. Der Hinweis sagt das deutlich.

## Konsequenzen

- Esc und der Zurück-Link im Mailkonto fragen bei ungespeicherten Änderungen.
- Der Zurück-Weg führt zur Postausgangsliste.

## Abweichungen vom Issue

Keine.

## Offen

- Die Anmeldung an Microsoft 365 fehlt im Backend (CLAUDE.md). Die Anzeige «folgt» bleibt,
  bis sie gebaut ist.
- Die Postausgangsmasken sind in schmalen Fenstern nicht im Browser geprüft.
