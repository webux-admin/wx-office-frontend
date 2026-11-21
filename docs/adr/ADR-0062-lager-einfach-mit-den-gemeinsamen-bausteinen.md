# ADR-0062 — Lager: einfache Masken auf den gemeinsamen Bausteinen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0049 (Grössen als relative Tokens) und ADR-0050 (Hinweise als
  Tooltip) für das Lager um. Die Inventur-Zählung folgt ADR-0016 (zeilenweises Speichern).

## Kontext

Das Lager besteht aus Listen (Bestand, Bewegungen, Reservierungen, Unterdeckung, Stand zum
Stichtag, Lagerorte), kleinen Dialogen (Bewegung buchen, Los anlegen, Reservierung lösen,
Bewegung umkehren) und der Inventur. Die Listen und Dialoge hatten Pixelwerte und
Erklärsätze unter den Feldern. Die Inventur-Zählung speichert jeden Zählwert beim Verlassen
des Feldes.

## Entscheidung

1. **Listen und Dialoge bleiben, wie sie sind.** Sie brauchen keine Vollmaske. Esc und
   Bestätigung kommen aus `Dialog`.
2. **Grössen kommen aus rem und Schrift-Tokens.** Dieselben Regeln wie in den Modulen davor.
3. **Erklärsätze werden Tooltips.** Zustandshinweise bleiben sichtbar.
4. **Die Inventur-Zählung bleibt bei `PageHeader`.** Ein Zählwert wird beim Verlassen des
   Feldes gespeichert. Esc würde die Seite schliessen, bevor das Feld den Wert abgibt, und
   der Wert ginge verloren.

## Begründung

Das Lager hat keine Masken mit mehreren Registern und wenig ungespeicherten Zustand. Die
einfachste Lösung ist, die vorhandenen Bausteine beizubehalten und nur Grössen und Hinweise
anzupassen. Eine Vollmaske für die Inventur würde den Zählfluss verändern, den der Lagerist
tagtäglich mit der Tastatur bedient.

## Verworfene Alternativen

**Die Inventur auf `FormMask` umstellen.** Verworfen wegen des Zählwertverlusts beim Esc,
siehe Punkt 4.

**Einen eigenen Listenrahmen bauen.** Verworfen: die Listen unterscheiden sich in Spalten,
nicht im Aufbau. Ein Rahmen wäre für drei Listen mehr Code als Nutzen.

## Konsequenzen

- Der Lagerist bekommt keine Änderung im Ablauf, nur ruhigere Hinweise und einheitliche
  Grössen.
- Die Inventur bleibt die einzige Seite des Moduls ohne Esc-Rückfrage. Das ist bewusst.

## Abweichungen vom Issue

Die Inventur bleibt bei `PageHeader`, weil Esc dort Zählwerte verliert. Das ist die einzige
Ausnahme in diesem Modul.

## Offen

- Wenn die Zählung einen Zwischenstand braucht, der beim Esc gesichert werden soll, wäre das
  eine eigene Entscheidung.
