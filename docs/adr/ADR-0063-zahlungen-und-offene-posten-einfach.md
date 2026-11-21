# ADR-0063 — Zahlungen und offene Posten: Listen und Dialoge auf den gemeinsamen Bausteinen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc), ADR-0049 (Grössen) und ADR-0050 (Tooltips) für die
  Zahlungen um. Der Klärungskorb folgt ADR-0043 unverändert.

## Kontext

Zu diesem Modul gehören der Zahlungseingang, die Kundenguthaben, die offenen Posten, der
Ausbuchungslauf und die Klärung. Die Erfassung läuft in Dialogen, die Auswertung in Listen.
Die Seiten hatten Pixelwerte und Erklärsätze unter den Feldern.

## Entscheidung

1. **Dialoge bleiben Dialoge.** Zahlungseingang, Vorauszahlung, Guthaben und Ausbuchen sind
   kleine Vorgänge mit Bestätigung. `Dialog` liefert Esc und die Rückfrage.
2. **Listen und der Klärungskorb bleiben in ihrer Struktur.** Der Klärungskorb ist ein eigenes
   Grid (ADR-0043) und wird nicht umgebaut.
3. **Grössen kommen aus rem und Schrift-Tokens.**
4. **Erklärsätze werden Tooltips.** Zustandshinweise bleiben sichtbar.

## Begründung

Die Zahlungen sind Vorgänge, keine Stammdaten. Ein Dialog mit einer Bestätigung passt zu
ihnen besser als eine Vollmaske, und er bietet Esc bereits. Eine Umstellung auf Vollmasken
würde die Abläufe nur verlängern.

## Verworfene Alternativen

**Den Zahlungseingang als Vollmaske.** Verworfen: ein Eingang hat wenige Felder und ist
schnell fertig. Eine Vollmaske würde für einen Vorgang einen Seitenwechsel verlangen.

**Den Klärungskorb umbauen.** Verworfen: er ist bereits ein eigenes Grid mit eigener
Tastatursteuerung (ADR-0043). Eine Änderung wäre ein Umbau ohne Nutzen.

## Konsequenzen

- Keine Änderung im Ablauf. Die Seiten sehen ruhiger aus und haben einheitliche Grössen.
- Der Klärungskorb bekommt nur Grössen-Tokens. Sein Aufbau und seine Tastatursteuerung bleiben.

## Abweichungen vom Issue

Keine.

## Offen

- Die Ausbuchungs- und Klärungsmasken sind in schmalen Fenstern nicht geprüft.
