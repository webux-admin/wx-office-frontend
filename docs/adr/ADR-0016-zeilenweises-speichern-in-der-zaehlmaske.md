# ADR-0016 — Zeilenweises Speichern in der Zählmaske

- **Status:** Angenommen
- **Datum:** 2026-08-26

## Kontext

[ADR-0003](ADR-0003-speichern-schliesst-die-maske.md) legt fest, dass eine Maske einmal
speichert und sich dann schliesst. Das gilt für Stammdatenmasken, und es ist richtig: ein
Kunde wird in einem Zug erfasst, und ein Speichern-Knopf am Ende ist der Moment, in dem die
Eingabe gültig wird.

Die Zählmaske einer Inventur ist anders:

- **Sie dauert Stunden.** Eine Zählliste über einen ganzen Lagerort hat hunderte Zeilen, und
  gezählt wird zwischen Regalen.
- **Sie läuft am Telefon.** Im Lager gibt es WLAN-Löcher; ein Verbindungsabbruch ist der
  Normalfall und nicht der Ausnahmefall.
- **Zwei Personen zählen dieselbe Liste.** Wer am Ende einmal speichert, überschreibt, was der
  andere zwischendurch erfasst hat.
- **Ein verlorener Wert ist nicht wiederherstellbar.** Was gezählt wurde, steht nirgends sonst
  — die Person ist inzwischen drei Gänge weiter.

Ein einziger Speichern-Knopf am Ende würde bei einem Verbindungsabbruch eine Stunde Arbeit
verlieren, und niemand zählt sie ein zweites Mal.

## Entscheidung

Die Zählmaske hat **keinen Speichern-Knopf**. Jede Zeile speichert einzeln, beim Verlassen des
Mengenfeldes und bei `Enter`.

Scheitert ein Speichern: **roter Rand an der Zeile, Knopf «Erneut senden», und der getippte
Wert bleibt stehen.** Kein Verlassen-Warndialog, kein Sammelspeichern.

Eine bereits gezählte Zeile fragt vor dem Überschreiben nach: «Gezählt von Anna um 10:14 —
überschreiben?»

## Begründung

**Das ist die dritte Ausnahme zu ADR-0003, und sie hat denselben Grund wie die beiden anderen.**
Die Belegmaske speichert je Position (`POST …/lines`), die Preistabelle speichert einmal für
viele Zeilen ([ADR-0013](ADR-0013-preistabelle-mit-tastatur-und-einem-speichern.md)). Beide
Male entschied, wie lange die Arbeit zwischen zwei sicheren Zuständen dauert. Hier dauert sie
Stunden — also ist der sichere Zustand die einzelne Zeile.

**Neu ist nur das Speichern beim Verlassen des Feldes.** Je Position speichert die Belegmaske
längst; hier kommt hinzu, dass niemand einen Knopf drückt.

**Der getippte Wert bleibt bei einem Fehler stehen**, weil die Maske der einzige Ort ist, an
dem er existiert. Ihn zu verwerfen und die Serverantwort zu zeigen hiesse, die Zählung dieser
Zeile wegzuwerfen.

**Kein Verlassen-Warndialog.** Es gibt nichts Ungespeichertes zu warnen — ausser einer Zeile,
die gerade rot ist, und die sagt es selbst.

**Die Rückfrage vor dem Überschreiben** ist kein Sicherheitsnetz gegen Vertipper, sondern die
Antwort darauf, dass zwei Personen dieselbe Liste zählen. Die Zählung der anderen Person ist
eine Aussage mit Namen und Uhrzeit daran; sie stillschweigend zu ersetzen wäre falsch. Der
Filterchip «Offen» sorgt dafür, dass der Fall selten ist.

## Alternativen

**Ein Speichern-Knopf am Ende.** Verworfen: verliert bei einem Abbruch die ganze Zählung, und
zwei Personen überschreiben sich gegenseitig.

**Automatisches Speichern alle *n* Sekunden.** Verworfen: der Anwender weiss dann nie, was
gesichert ist und was nicht. Beim Verlassen des Feldes ist der Zeitpunkt sichtbar und mit einer
Handlung verknüpft.

**Zwischenspeichern im Browser (localStorage) und einmal senden.** Verworfen: dann liegt die
Zählung auf einem Telefon, das jemand weglegt, und die zweite Person sieht sie nie. Eine
Zählliste ist ein gemeinsames Dokument.

**Sammelspeichern je Seite.** Verworfen: eine Seite hat hundert Zeilen, und ein Abbruch
verliert wieder hundert Werte statt einen.

**Optimistisches Anzeigen ohne Warten auf die Antwort.** Verworfen: dann steht eine Zahl auf
dem Bildschirm, die der Server nie bekommen hat, und genau das darf bei einem Nachweis nach
OR 958c nicht passieren.

## Konsequenzen

- Eine Zählung erzeugt viele kleine Anfragen — eine je Zeile. Das ist gewollt und billig: die
  Anfrage trägt eine Zahl.
- Der Tastaturfluss ist der eigentliche Kern der Maske: Menge tippen, `Enter`, Fokus in der
  nächsten offenen Zeile. Er ist ohne Maus vollständig bedienbar, und die Zeile scrollt sich in
  den Blick.
- Der Fortschritt wird über `aria-live` angesagt («34 von 51 gezählt»), weil wer mit der
  Tastatur zählt nie in die Ecke des Bildschirms schaut.
- Die Maske hat damit **zwei** Zustände, die es sonst nicht gibt: eine Zeile, die gerade
  gespeichert wird, und eine, deren Speichern scheiterte. Beide sind an der Zeile sichtbar und
  nicht am Seitenkopf.
- Noch offen: unterhalb `sm` ist die Tabelle heute waagrecht rollbar statt als Kartenansicht
  gebaut. Die Kartenansicht wäre die erste im ganzen Frontend; sie bleibt eine eigene
  Entscheidung, und bis dahin gilt für diese Maske dieselbe Regel wie für alle anderen.
