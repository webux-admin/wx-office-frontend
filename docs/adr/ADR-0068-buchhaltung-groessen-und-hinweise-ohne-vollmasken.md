# ADR-0068 — Buchhaltung: Grössen und Hinweise, Buchen und Vorjahressaldi bleiben eigene Masken

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Setzt ADR-0049 (Grössen) und ADR-0050 (Tooltips) für die Buchhaltung um.
  Die Buchungserfassung folgt ADR-0045 (Raster) und ADR-0006 (Entwurf am Kopf) unverändert.
  Esc und die Rückfrage (ADR-0048) gelten für Masken auf `FormMask`; für die beiden Ausnahmen
  unten steht die Begründung hier.

## Kontext

Die Buchhaltung ist das grösste verbleibende Modul: Kontenplan, Steuercodes, Geschäftsjahre,
Buchen und Journal, Bilanz und Erfolgsrechnung, Saldenliste und Kontoblätter, Abschluss,
Berichtsarchiv, Abstimmung, Integritätsprüfung und Vorjahressaldi. Die meisten Seiten sind
Listen, Auswertungen oder Assistenten. Nur wenige haben Eingaben, die verloren gehen können.

## Entscheidung

1. **Auswertungen und Listen bleiben.** Journal, Bilanz, Erfolgsrechnung, Saldenliste,
   Kontoblätter, Berichtsarchiv, Integritätsprüfung, Steuercodes und Abstimmung zeigen Daten.
   Sie haben keinen Speichervorgang, also gibt es nichts, das Esc schützen müsste.
2. **Assistenten bleiben.** Abschluss, Geschäftsjahr und Einrichtung führen über Schritte mit
   eigenen Bestätigungen. Eine Vollmaske würde die Schritte überlagern.
3. **Buchen bleibt eine eigene Maske.** Die Erfassung ist ein Raster (ADR-0045). Was getippt,
   aber nicht gespeichert ist, wird lokal gerettet (ADR-0006). Beim Verlassen geht also nichts
   verloren, und eine Rückfrage würde einen Verlust behaupten, den es nicht gibt.
4. **Die Vorjahressaldi bleiben eine eigene Seite.** Sie werden einmal beim Umstieg erfasst.
   Der Kopf liegt in der äusseren Seite, die Eingaben in einer inneren Komponente. Eine
   `FormMask` bräuchte den Zustand oben, und das wäre ein Umbau für eine einmalige Erfassung.
5. **Grössen kommen aus rem und Schrift-Tokens.** Pixelbreiten der Spalten und Felder sind in rem.
6. **Erklärsätze werden Tooltips**, wo sie nur erklären: Berichtsnamen, Serienhinweise,
   Felder der Abstimmung und der Kontoauswahl. Zustandshinweise bleiben sichtbar, etwa «Dieser
   Tag ist mitgesperrt», «Es entsteht keine Eröffnungsbuchung», die Zähler der Begründungen
   und die Pflichtangaben beim Storno.

## Begründung

Eine Vollmaske für Listen und Assistenten würde die Abläufe verlängern und keinen Verlust
verhindern. Die Buchungserfassung hat bereits einen besseren Schutz als eine Rückfrage, weil
sie rettet. Die Pflicht, Esc in jeder Maske zu fragen, gilt dort, wo wirklich etwas verloren
geht.

## Verworfene Alternativen

**Buchen als `FormMask` mit Rückfrage.** Verworfen: die Rückfrage würde sagen, dass Eingaben
verloren gehen, obwohl die Rettung sie hält. Das verwirrt mehr, als es schützt.

**Die Vorjahressaldi auf `FormMask` heben.** Verworfen für diese Runde: der Zustand liegt in
der inneren Komponente. Der Umbau lohnt sich nicht für eine Seite, die einmal beim Umstieg
gebraucht wird.

**Alle Hinweise als Tooltip.** Verworfen: Zähler, Pflichtangaben und Zustände müssen sichtbar
bleiben, sonst übersieht man sie beim Erfassen.

## Konsequenzen

- Die Seiten haben einheitliche Grössen und ruhigere Erklärungen. Der Ablauf bleibt gleich.
- Esc in der Buchungserfassung schliesst nicht, es fragt auch nicht. Das ist bisher so.

## Abweichungen vom Issue

- Die Buchungserfassung ist keine `FormMask`. Der Grund ist die Rettung (Punkt 3).
- Die Vorjahressaldi ist keine `FormMask`. Der Grund ist der Zustand in der inneren
  Komponente (Punkt 4).

## Offen

- **Ein gespeicherter Entwurf, der bearbeitet wird, hat keinen Schutz.** Die Rettung greift nur
  für neue Buchungen (`editing === null`). Wer einen gespeicherten Entwurf ändert und dann
  zurückgeht oder Esc drückt, verliert die Änderung ohne Rückfrage. Das braucht eine eigene
  Entscheidung: eine Rückfrage für den Entwurf oder eine Rettung auch beim Bearbeiten.
- Die Buchhaltungsmasken sind in schmalen Fenstern nicht im Browser geprüft.
