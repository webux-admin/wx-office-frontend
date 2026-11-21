# ADR-0069 — Ungespeicherte Eingaben fragen überall gleich

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc fragt bei Änderungen) für alle Masken um. Überholt die
  Abschnitte «Entscheidung» 3 und 4 und «Offen» von ADR-0068: die Buchung und die Vorjahressaldi
  fragen jetzt ebenfalls. Die Inventur bleibt eine Ausnahme nach ADR-0062.

## Kontext

ADR-0048 legt fest, dass Esc und der Zurück-Link bei ungespeicherten Änderungen fragen. Umgesetzt
war das nur in `FormMask`. Andere Masken mit Eingaben fragten nicht: die Buchungserfassung, die
Vorjahressaldi, die Mahntexte und die Mailvorlagen. Dort ging beim Esc Arbeit verloren, und die
Masken verhielten sich unterschiedlich.

## Entscheidung

1. **Eine Regel für alle Masken.** Die Logik steht in `useLeaveGuard`, nicht mehr in `FormMask`.
   Sie hat drei Teile: Esc und der Zurück-Link fragen bei Änderungen, ohne Änderungen gehen sie
   sofort, und die Frage wird mit «Verwerfen» beantwortet, was `abandon` ausführt.
2. **`abandon` passt zur Maske.** Eine Maske mit Zurück-Weg geht dorthin. Eine Maske ohne Zurück-Weg
   leert ihre Eingaben oder setzt sie auf den gespeicherten Stand zurück.
3. **Die Buchungserfassung fragt auch beim Entwurf.** Für eine neue Buchung leert «Verwerfen» die
   Maske und löscht die gerettete Kopie, sonst bietet das Banner sie wieder an. Für einen
   gespeicherten Entwurf führt «Verwerfen» zurück zur Entwurfsliste.
4. **Die Vorjahressaldi fragen.** Die innere Komponente meldet, ob die Eingaben von den
   gespeicherten Zeilen abweichen. «Verwerfen» geht zu den Geschäftsjahren.
5. **Die Mahntexte fragen.** Jede Sprache meldet ihren Stand über `onDirtyChange`. «Verwerfen»
   setzt alle Felder auf den gespeicherten Text zurück.
6. **Die Mailvorlagen fragen.** Ein Entwurf existiert nur, solange sein Text vom gespeicherten
   abweicht. «Verwerfen» löscht alle Entwürfe.

## Begründung

Eine Regel, die je nach Maske anders wirkt, lehrt den Benutzer, Esc nicht zu vertrauen. Mit einem
gemeinsamen Hook gilt überall dasselbe, und die Maske bestimmt nur, was «Verwerfen» tut.

Bei der Buchung bleibt die Rettung bestehen. Sie schützt vor einem Seitenwechsel über die Seitenleiste.
Esc ist eine bewusste Handlung, deshalb fragt er dort auch.

## Verworfene Alternativen

**Die Buchung ohne Rückfrage lassen, weil sie rettet.** Verworfen: die Rettung deckt nur neue
Buchungen ab, und ein Esc, der bei manchen Masken still etwas verwirft und bei anderen fragt,
ist unberechenbar. Eine Frage ist die einheitliche Antwort.

**Eine eigene Rückfrage je Maske.** Verworfen: das wäre fünfmal derselbe Text mit eigenen Fehlern.

## Konsequenzen

- Alle Masken mit Eingaben verhalten sich bei Esc und Zurück gleich.
- Die Rückfrage tritt bei der Buchung auch dann auf, wenn die Rettung die Eingabe sichern würde.
- `useLeaveGuard` hat eigene Tests. Die Seitenverdrahtung der Mahntexte und Vorlagen ist durch
  Typprüfung und Lint abgesichert, nicht durch einen eigenen Seitentest.

## Abweichungen vom Issue

Keine, außer der Inventur (siehe Offen).

## Offen

- **Die Inventur.** Ihre Zählwerte speichern beim Verlassen des Feldes (ADR-0062). Ein Esc, der
  während der Eingabe kommt, verliert den Wert, bevor das Feld ihn abgibt. Der saubere Weg ist,
  das Feld beim Esc zuerst abgeben zu lassen und danach zu fragen. Das ist eine eigene Änderung.
- Die Masken sind in schmalen Fenstern nicht im Browser geprüft.
