# ADR-0075 — Abo-Lauf: ein Monat, eine Vorschau, ein Start mit Rückfrage, drei Listen

- **Status:** Angenommen
- **Datum:** 2026-11-21
- **Verhältnis:** Neu. Setzt Backend ADR-0147 (Issue webux-admin/wx-office#109) um und folgt dem
  Sammellauf mit Vorschlag und Ergebnis (Ausbuchungslauf, `WriteOffRunPage`), den Rückfragen
  (ADR-0069), den Hinweisen als Tooltip (ADR-0050) und den Grössen-Tokens (ADR-0049).

## Kontext

Das Backend rechnet je Abrechnungsmonat aus, welche Vertragsperioden fällig sind, und schreibt auf
Auslösung je Vertrag einen Rechnungsentwurf. Die Vorschau
(`GET /subscription-runs/preview?month=`) braucht `SUBSCRIPTION_READ`, der Lauf
(`POST /subscription-runs`) `SUBSCRIPTION_RUN` und den Schalter `SUBSCRIPTION`. Das Ergebnis
kommt in drei Listen — erstellt, übersprungen, fehlgeschlagen — und mit Hinweisen.

## Entscheidung

1. **Ein Bildschirm «Abo-Lauf»** unter `/abo-lauf`, im Menü «Verkauf» direkt nach «Verträge»,
   sichtbar nur mit dem Schalter `SUBSCRIPTION` und `SUBSCRIPTION_READ`. Verträge bleiben
   sichtbar, wenn der Lauf ausgeschaltet ist: zwei Module, zwei Schalter.
2. **Die Wahl ist ein Monat** (`<input type="month">`), vorbelegt mit dem laufenden Monat. Ein
   Tooltip sagt, was fällig heisst: jede Periode, die in diesem Monat beginnt.
3. **Die Vorschau lädt beim Wählen**, ohne Knopf: Kennzahlen (Entwürfe, Positionen,
   Übersprungene, Summe wie vereinbart je Währung), eine Tabelle je Vertrag mit Nummer, Kunde,
   Version und Betrag, aufklappbar zu den Positionen mit Leistungszeitraum. Übersprungenes und
   Hinweise stehen in eigenen Panels darunter, der Grund als kurzes Wort und der Satz des
   Backends dahinter; ist die Periode schon verrechnet, führt ein Link auf den Beleg.
4. **«Abo-Lauf starten»** steht nur mit `SUBSCRIPTION_RUN` im Kopf, ist gesperrt, solange nichts
   fällig ist, und fragt mit `ConfirmDialog`: Anzahl Entwürfe, Monat, Summe, und dass der Lauf
   beim Start neu rechnet und nichts finalisiert. Geschickt wird nur der Monat.
5. **Das Ergebnis** steht über der Vorschau: ein Satz mit den drei Zahlen, dann die Listen
   «Erstellt» (mit «Entwurf öffnen» auf `/rechnungen/{id}`), «Übersprungen», «Fehlgeschlagen»
   (mit dem Satz, dass von diesen Verträgen nichts geblieben ist) und «Hinweise». Eine leere
   Liste erscheint nicht. Ein anderer Monat räumt das Ergebnis weg.
6. **Nach dem Lauf** werden die Vorschauen und die Rechnungsliste neu gelesen; die Vorschau des
   Monats zeigt danach die Perioden als «Bereits verrechnet».

## Begründung

**Der Monat ist die Frage des Backends** (ADR-0147, Entscheidung 1). Ein Datum hätte das
Missverständnis eingeladen, es seien die Perioden bis zu diesem Tag gemeint.

**Keine Auswahl einzelner Verträge.** Der Lauf ist «alles Fällige des Monats»; wer einen Vertrag
nicht verrechnen will, ändert ihn oder löscht den Entwurf danach. Kreuzfelder je Vertrag würden
eine zweite Wahrheit darüber erzeugen, was fällig ist.

**Summe «wie vereinbart».** Die Vorschau kennt den vereinbarten Betrag, nicht die MWST; die
genaue Summe steht im Entwurf. Das Wort sagt das, statt eine Zahl als Rechnungsbetrag
auszugeben, die keiner ist.

## Verworfene Alternativen

**Vorschau auf Knopfdruck.** Verworfen: die Vorschau schreibt nichts und ist billig; ein
zusätzlicher Klick vor jeder Antwort bringt nichts.

**Ergebnis auf einer eigenen Seite.** Verworfen: der Benutzer prüft das Ergebnis gegen die
Vorschau, die er gerade gesehen hat. Auf einer neuen Seite wäre die verloren.

**Positionen aller Verträge in einer flachen Tabelle.** Verworfen: bei zwanzig Verträgen mit
je fünf Positionen verliert man, welche Zeilen ein Entwurf werden. Aufklappen je Vertrag hält die
Zuordnung.

**Gründe nur als Code.** Verworfen: der Code ist für die Gruppierung da, der Satz für den
Menschen; beide stehen nebeneinander.

## Konsequenzen

- Neuer Baustein `lib/subscription.ts` mit Pfad, Rechten, Adressen, Monatswörtern und
  Ergebnissatz; Typen in `lib/types.ts`.
- Neue Seite `pages/SubscriptionRunPage.tsx`, Route in `App.tsx`, Eintrag in
  `layout/navigation.ts`.
- Der Katalog der Gründe steht doppelt (Backend `SkipReason`, hier `SKIP_REASON_LABELS`); ein
  neuer Grund braucht beide Seiten.
- Vertragsnummer und Version auf der Rechnung und das Teilen bei Satzwechsel (#110) ändern am
  Bildschirm nichts Grundsätzliches; das Teilen bringt mehrere Positionen je Periode in die
  Aufklappung.
