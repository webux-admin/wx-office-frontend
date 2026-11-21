# ADR-0073 — Verträge: Status, Schritte «Aktivieren» und «Beenden», Versionen lesen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Ergänzt [ADR-0072](ADR-0072-vertragsliste-und-vertragsmaske.md). Setzt Backend
  ADR-0145 (Vertragsversionen, Status und Beenden, Issue webux-admin/wx-office#107) um und folgt
  den Statusschritten der Projekte (ADR-0066), den Dialogen (ADR-0069) und den Fehlern am Feld
  (ADR-0050).

## Kontext

Ein Vertrag hat jetzt einen Status (Entwurf, Aktiv, Beendet), unveränderliche Versionen und zwei
Schritte. Ein aktiver Vertrag nimmt bei jeder Änderung am Vereinbarten eine neue Version und
braucht dafür den Tag, ab dem sie gilt; die Notiz allein nimmt keine. Ein beendeter Vertrag lässt
nur noch die Notiz ändern. Das Backend verlangt beim `PUT` die `lockVersion`, die die Maske
geladen hat, und weist eine veraltete Änderung mit 409 ab.

## Entscheidung

1. **Status in Liste und Maske** als `Badge` (Entwurf leise, Aktiv grün, Beendet neutral), dazu
   «V2» in der Liste und «Version 2» im Untertitel. Die Liste sortiert auch nach Status.
2. **Schritte als Knöpfe im Kopf:** «Aktivieren» beim Entwurf, mit Rückfrage
   (`ConfirmDialog`); «Beenden» beim aktiven Vertrag, mit eigenem Dialog. Beide sind
   **gesperrt, solange etwas ungespeichert ist**, und ein Satz unter dem Kopf sagt das: ein
   Schritt nimmt den gespeicherten Stand, Getipptes ginge sonst nicht in Version 1 ein.
3. **«Änderung gilt ab»** erscheint im Panel «Vertrag» genau dann, wenn ein aktiver Vertrag am
   Vereinbarten geändert ist — dieselbe Linie wie im Backend: alles ausser Notiz. Das Feld ist
   Pflicht, ohne Vorbelegung, und die Maske prüft Beginn und Ende; die Grenze «nicht vor der
   vorigen Version» meldet das Backend am Feld.
4. **Beenden-Dialog:** «Letzter Vertragstag» (vorbelegt mit dem vereinbarten Ende, wenn es eines
   gibt) und «Grund» als Auswahl aus den fünf Codes, **kein Freitext**. Die Kündigungsfrist steht
   als Hinweis darunter, ohne Prüfung.
5. **Beendet heisst: nur die Notiz.** Alle Felder und Positionen sind gesperrt, die Notiz und
   «Speichern» bleiben; ein Hinweis nennt letzten Tag und Grund.
6. **Register «Vertrag» und «Versionen»** (`Tabs`), sobald der Vertrag kein Entwurf mehr ist.
   «Versionen» zeigt den Verlauf (angelegt, aktiviert, beendet — wer und wann), die Liste der
   Versionen mit Gültigkeitstag und Erfassung, und die gewählte Version mit ihren Werten und den
   Positionen in derselben Tabelle wie die Maske, nur lesend. Die neueste ist vorgewählt.
7. **`lockVersion` und `validFrom` gehen mit jedem `PUT`**; ein 409 erscheint als Meldung über
   der Maske.

## Begründung

**Zu 2:** Ein Schritt, der still ungespeicherte Felder verwirft, ist die Falle, die das
Projektmuster in Kauf nimmt; beim Vertrag ginge dabei aber genau das verloren, was in Version 1
stehen soll. Sperren mit Begründung ist ehrlicher als eine weitere Rückfrage.

**Zu 3:** Ein vorbelegtes Datum (heute) würde bei einer im November vereinbarten Erhöhung auf
Januar still den falschen Tag speichern. Die Frage nach dem Tag gehört zum Benutzer.

**Zu 6:** Versionen sind Nachweis, keine Arbeitsfläche. Ein eigenes Register hält die Maske
schlank und macht klar, dass dort nichts geändert wird. Die Positionstabelle wiederzuverwenden
hält Beträge und Summen gleich formatiert wie in der Maske.

## Verworfene Alternativen

**Steps speichern die Felder mit.** Verworfen: der `PUT` und der Schritt wären zwei Requests ohne
gemeinsame Transaktion; scheitert der zweite, steht ein halber Zustand.

**Alle Versionen untereinander ausgeklappt.** Verworfen: bei zehn Versionen mit je zwanzig
Positionen wird das Register unlesbar. Die Liste mit Auswahl zeigt die Geschichte auf einen Blick.

**Versionen als eigene Seite mit Adresse.** Verworfen für jetzt: wie beim Projekt ist das Register
Zustand der Maske (ADR-0031). Eine Adresse je Version kann kommen, wenn eine Rechnung auf sie
verlinken soll.

**Gründe als Freitext oder mit Bemerkung.** Verworfen, Backend ADR-0145.

## Konsequenzen

- `lib/contract.ts` kennt Status- und Grundbeschriftungen, `agreementChanged`,
  `validFromComplaint`, `endingComplaints` und die Adressen der Schritte und Versionen.
- Neue Bausteine `pages/contract/EndContractDialog.tsx` und `pages/contract/ContractVersions.tsx`.
- Die Liste der fünf Gründe steht doppelt (Backend-Enum und `CONTRACT_END_REASON_LABELS`); ein
  sechster Grund braucht beide Seiten.
