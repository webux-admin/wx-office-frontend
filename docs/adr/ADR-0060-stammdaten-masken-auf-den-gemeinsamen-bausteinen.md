# ADR-0060 — Stammdaten-Masken auf den gemeinsamen Bausteinen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc bricht ab), ADR-0050 (Hinweise als Tooltip, Fehler am
  Feld) und ADR-0049 (Grössen als relative Tokens) für das Modul Stammdaten um.

## Kontext

Die Stammdaten-Seiten waren mit den Masken der Partner und Produkte nicht einheitlich. Der
Mandant nutzte `PageHeader` statt `FormMask`, sodass Esc ohne Rückfrage verwarf. Mehrere
Seiten trugen Erklärsätze unter Feldern, und die Pixelwerte in Spalten und Schrift waren
verstreut. Der Druckvorlagen-Editor hatte keinen Änderungsschutz.

## Entscheidung

1. **Der Mandant ist eine `FormMask`.** Esc, Zurück-Link und Änderungsschutz kommen aus dem
   gemeinsamen Baustein. Die Pflichtangaben der Absenderadresse (PLZ, Ort, Code, Name) sind
   Feldfehler, keine Meldung über dem Formular. Die Anlage zeigt die Vorgaben, die erst nach dem
   Anlegen gesetzt werden können, als gesperrte Felder mit Hinweis.
2. **Die Druckvorlage ist eine `FormMask`.** Der Änderungsschutz vergleicht den Stand mit der
   gespeicherten Vorlage. Ein Ziehen auf der Fläche erzeugt kein Eingabe-Ereignis, deshalb
   hört er nicht auf Eingaben.
3. **Erklärsätze werden Tooltips.** Ein Zustandshinweis bleibt sichtbar, etwa warum ein Feld
   nach dem Anlegen gesperrt ist. Das gilt für Mandant, Zahlungskonditionen, Nummernkreise,
   Auswahllisten, Feste Werte, Mehrwertsteuer, Belegarten und Druckvorlagen.
4. **Grössen kommen aus den Tokens oder sind relativ.** Schrift nach Rolle
   (`text-body`, `text-small`, `text-caption`). Breiten als rem-Werte, die dem bisherigen
   Pixelmass entsprechen, damit die Spalten nicht springen.
5. **Dialoge bleiben Dialoge.** Zahlungskonditionen, Nummernkreise, Auswahllisten, Feste Werte
   und Mehrwertsteuer-Perioden sind kleine Vorgänge, die `Dialog` mit Esc und Rückfrage nutzen.

## Begründung

Der Mandant trägt die Stammdaten, mit denen jeder Beleg gedruckt wird. Ein versehentlicher
Esc darf dort nichts verwerfen, ohne zu fragen. Tooltips halten die Masken ruhig, ohne die
Erklärung zu verlieren. Dass Dialoge bleiben, folgt der Vorgabe, dass ein Vorgang mit einem
Feld oder zwei kein Vollbild braucht.

## Verworfene Alternativen

**Den Mandant über die Liste neu anlegen lassen.** Verworfen: der Mandant wird über die
Systemeinstellungen verwaltet, und das bleibt so.

**Druckvorlage ohne Änderungsschutz.** Verworfen: ein Ziehen versehentlich über den Rand hinaus
würde ohne Rückfrage verloren gehen.

**Hinweise unverändert lassen.** Verworfen, siehe ADR-0050.

## Konsequenzen

- Die Mandant-Maske erzeugt die Fehler am Feld nur auf dem Client. Das Backend nennt für den
  Mandanten noch keine Felder. Wer das später will, folgt dem Muster aus ADR-0141.
- Die Druckvorlage vergleicht bei jedem Rendern den gesamten Stand. Das ist bei einer Vorlage
  mit einigen Dutzend Blöcken unkritisch.

## Abweichungen vom Issue

Keine.

## Offen

- Das Backend für den Mandanten liefert noch keine Feldangaben bei Fachregeln.
- Die Belegart-Liste und der Editor der Druckvorlagen sind nicht in jeder Breite geprüft.
