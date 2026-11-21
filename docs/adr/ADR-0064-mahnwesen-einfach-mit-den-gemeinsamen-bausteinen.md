# ADR-0064 — Mahnwesen: Listen, Dialoge und Mahntexte auf den gemeinsamen Bausteinen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0048 (Esc), ADR-0049 (Grössen) und ADR-0050 (Tooltips) für das
  Mahnwesen um. Die Mahneinstellungen sind bereits eine `FormMask` (ADR-0060) und bleiben so.

## Kontext

Zum Mahnwesen gehören der Arbeitsvorrat, die ausgestellten Mahnungen, die Mahnstopps, die
Mahnstufen, die Mahntexte und der Mahnlauf. Die Listen und der Mahnlauf-Dialog hatten
Pixelwerte, Schriftgrössen in Pixeln und Erklärsätze unter den Feldern. Die Mahntexte haben
je Stufe und je Sprache einen eigenen Speichervorgang.

## Entscheidung

1. **Listen und Dialoge bleiben.** Arbeitsvorrat, Mahnungen, Mahnstopps und Mahnstufen sind
   Listen mit einer Aktion. Der Mahnlauf und der Mahnstopp sind kleine Vorgänge mit
   Bestätigung; `Dialog` liefert Esc und die Rückfrage.
2. **Die Mahntexte bleiben Felder je Sprache.** Jede Sprache speichert für sich. Eine
   `FormMask` mit einem gemeinsamen Speichern würde diese Trennung aufheben.
3. **Grössen kommen aus rem und Schrift-Tokens.** Spaltenbreiten stehen in rem.
4. **Erklärsätze werden Tooltips.** Das gilt für den Mahnlauf-Stichtag, die Mahnstopp-Gründe
   und den Mahntext-Anschreiben. Der Hinweis zum Versandweg bleibt sichtbar: er zeigt den
   Grund, warum ein Versandweg gesperrt ist, und ist damit ein Zustand, kein Erklärsatz.

## Begründung

Das Mahnwesen besteht aus Listen und kleinen Vorgängen. Eine Vollmaske brächte hier keinen
Gewinn und verlängerte die Arbeit des Mahnlaufs. Die Mahntexte sind ein Editor mit mehreren
Speichervorgängen; ein gemeinsamer Änderungsschutz würde beim Speichern einer Sprache die
Änderungen der anderen verwerfen oder fälschlich anzeigen.

## Verworfene Alternativen

**Die Mahntexte als `FormMask`.** Verworfen: mehrere Speichervorgänge auf einer Seite und
keine Liste, zu der die Maske zurückführen könnte.

**Den Mahnlauf als Vollmaske.** Verworfen: ein Stichtag und eine Bestätigung. Der Dialog
reicht.

**Den Versandweg-Hinweis als Tooltip.** Verworfen: der Hinweis erklärt, warum der Mailversand
gesperrt ist. Wer das nicht sieht, versteht die Sperre nicht.

## Konsequenzen

- Keine Änderung im Ablauf. Die Seiten haben einheitliche Grössen und ruhigere Hinweise.
- Die Mahntexte haben weiter keinen Esc-Schutz. Eine ungespeicherte Änderung in einer Sprache
  geht beim Verlassen verloren. Das ist der offene Punkt dieses Moduls.

## Abweichungen vom Issue

Keine.

## Offen

- Die Mahntexte brauchen einen Änderungsschutz je Sprache, damit Esc bei ungespeichertem Text
  fragt. Das ist eine eigene Entscheidung, wenn die Seite gebraucht wird.
- Die Gebührenrechnung ist im Backend noch nicht gebaut; das Frontend bekommt sie danach.
