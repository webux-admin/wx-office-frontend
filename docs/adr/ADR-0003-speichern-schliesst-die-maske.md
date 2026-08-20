# ADR-0003 — Speichern schliesst die Maske und führt zur Ursprungsmaske zurück

- **Status:** Angenommen
- **Datum:** 2026-08-20

## Kontext

Wer in einer Detailmaske «Speichern» drückte, blieb in aller Regel darin stehen. Sichtbar
passierte nichts: kein Hinweis, kein Wechsel, nur ein kurz beschäftigter Knopf. Wer noch einmal
drückte, schickte denselben Stand ein zweites Mal. Der Weg zurück war der Pfeil oben links, den
man erst suchen muss.

Einheitlich war das ohnehin nicht. Von sechs Masken verhielt sich jede anders:

| Maske | Verhalten beim Speichern (vorher) |
|---|---|
| Kunde / Lieferant | schloss und ging auf die Liste |
| Produkt | blieb offen; beim Anlegen sprang sie auf den neuen Datensatz |
| Mandant | blieb offen; beim Anlegen sprang sie auf den neuen Datensatz |
| Benutzer | blieb offen |
| Neuer Benutzer | ging auf den neuen Datensatz |
| Neuer Auftrag | ging auf den neuen Entwurf |

Dazu kommt: **eine Maske hat mehr als einen Weg hinein.** Ein Kunde wird aus der Kundenliste
geöffnet, aber auch aus «Zuletzt erfasst» auf der Übersicht. Die Mandantenmaske wird aus der
Mandantenliste geöffnet und aus dem Hinweis auf der MWST-Maske. Ein fester Rücksprung auf die
Liste wirft den Benutzer also an einen Ort, an dem er nie war.

## Entscheidung

**«Speichern» beendet die Maske.** Die Maske schliesst und der Benutzer landet auf der
**Ursprungsmaske** — dem Bildschirm, von dem aus sie geöffnet wurde.

Fünf Festlegungen dazu:

1. **Die Ursprungsmaske nennt sich selbst.** Wer einen Link in eine Maske legt, hängt mit
   `originState(pfad, bezeichnung)` aus `lib/origin.ts` den Router-State daran. Die Maske liest
   ihn mit `originOf(location.state, rückfall)` zurück. Getragen wird der Pfad **und** die
   Bezeichnung, damit die Zeile «‹ Übersicht» dort steht, wo es zurück zur Übersicht geht.
2. **Jede Maske kennt ihren Rückfall.** Ohne brauchbaren State — bei einem in einem neuen Tab
   geöffneten Link, bei einer getippten, gespeicherten oder weitergegebenen Adresse — geht es
   auf die eigene Liste. `originOf` gibt nie `undefined` zurück. Ein Neuladen gehört
   ausdrücklich **nicht** dazu: der Browser hält den State beim Historieneintrag, F5 behält
   also die Ursprungsmaske.
3. **Nur Pfade dieser Anwendung werden akzeptiert.** Router-State überlebt ein Neuladen (siehe
   oben) und ist nicht allein von uns geschrieben — auch ein Eintrag aus einer älteren Version
   der Anwendung landet dort. `//fremder.host` und sein Backslash-Zwilling werden verworfen,
   sonst wäre der Speichern-Knopf ein offener Redirect.
4. **Der Historieneintrag wird ersetzt, nicht gestapelt** (`navigate(..., { replace: true })`).
   Eine gespeicherte Maske ist kein Ort, an den der Zurück-Knopf führen soll.
5. **Derselbe Ort für beide Wege hinaus.** Der Zurück-Pfeil im Kopf der Maske zeigt auf
   dieselbe Ursprungsmaske wie der Speichern-Knopf. Zwei Wege hinaus, die an verschiedenen
   Orten enden, sind ein Defekt.

### Zwei Ausnahmen, beide begründet

Ein Datensatz, der nach dem Anlegen **unbrauchbar** ist, öffnet sich statt zu schliessen. Die
Ursprungsmaske reist mit, das Speichern dort führt also an den richtigen Ort zurück.

- **Neuer Benutzer.** `POST /api/users` kennt keinen Mandanten, das Konto entsteht ohne Zugriff.
  `GET /api/users` beantwortet einem Nicht-Superuser nur die Benutzer des aktiven Mandanten —
  das neue Konto steht also gar nicht in der Liste, auf die geschlossen würde, und wäre über
  die Oberfläche nicht mehr erreichbar.
- **Neuer Mandant.** Mehrwertsteuer, Bank und die Beleg-Vorgaben sind beim Anlegen ausgeblendet
  (ihre Auswahllisten entstehen erst mit dem Mandanten), und die Maske sagt das im Panel «Nach
  dem Anlegen» ausdrücklich zu. Ein Mandant ohne Zahlungsverbindung kann keine QR-Rechnung
  stellen — QR-Rechnung ist seit 01.10.2022 Pflicht.

Der Knopf «Entwurf anlegen» der Auftragsmaske ist kein Speichern und bleibt, wie er war: es gibt
keinen Endpunkt, der einen Beleg zusammen mit seinen Positionen anlegt, ein Entwurf ohne
Position ist kein Beleg.

## Begründung

Ein Formular ist fertig, wenn es gespeichert ist. Offen stehen zu bleiben behauptet das
Gegenteil und lässt den Benutzer raten, ob überhaupt etwas passiert ist. Der Wechsel auf die
Liste ist die Rückmeldung — der Datensatz steht dort mit seinen neuen Werten.

Die Ursprungsmaske über den Router-State zu tragen, statt eine feste Liste einzutragen, kostet
eine Zeile pro Link und macht den Unterschied zwischen «wo dieser Datensatz hingehört» und «wo
der Benutzer herkam». Nur der zweite ist der Weg zurück.

`navigate(-1)` wäre kürzer gewesen und ist trotzdem falsch: nach einem Neuladen oder einer
getippten Adresse führt es aus der Anwendung hinaus.

## Alternativen

**Auf der Maske bleiben und eine Erfolgsmeldung einblenden.** Verworfen. Die Anwendung hat kein
Meldungssystem, und eine Meldung beantwortet die eigentliche Frage nicht — man ist immer noch in
einem Formular, mit dem man fertig ist.

**Fest auf die Liste des Datensatzes zurück, ohne Ursprungsmaske.** Verworfen: das ist genau der
Fall, den die Übersicht und die MWST-Maske brechen. Es wäre auch der billigere Weg gewesen — bis
zum ersten Quereinstieg, den jemand einbaut.

**`navigate(-1)` statt eines mitgeführten Ursprungs.** Verworfen, siehe oben.

**Den Ursprung in der Adresse führen (`?from=/`).** Verworfen. Er stünde in jeder Adresse, die
jemand kopiert und weitergibt, und ein Pfad in der Query-Zeile lädt zum Manipulieren ein. Der
Router-State ist für genau das da.

## Konsequenzen

- `DataTable` bekommt `rowState`, `LinkButton` bekommt `state`. Beide reichen den Ursprung nur
  durch; Fachwissen kommt keines dazu.
- **Ein Klick mit Modifiertaste verliert den Ursprung.** `DataTable` öffnet ihn mit
  `window.open` in einem neuen Tab, und ein neuer Tab kann keinen Router-State tragen. Dort
  greift der Rückfall auf die Liste. Hingenommen.
- **Seite, Sortierung und Suchbegriff einer Liste überleben den Rücksprung nicht.** Sie stehen
  in `useState`, nicht in der Adresse. Wer aus Seite 5 einer gefilterten Liste speichert, landet
  auf Seite 1 ohne Filter. Das war schon beim Zurück-Pfeil so. `originState` nimmt einen Pfad
  mit Query entgegen — sobald der Listenzustand in der Adresse steht, wird er ohne weitere
  Änderung mitgeführt.
- Beim Anlegen eines Produkts, eines Kunden oder eines Lieferanten schliesst die Maske ebenfalls.
  Preise je Preisgruppe, weitere Adressen und Kontaktpersonen werden am gespeicherten Datensatz
  gepflegt, der über die Liste wieder offen ist. Beim Kunden reist die erste Adresse im
  Anlege-Aufruf mit, das Produkt fällt ohne Gruppenpreis auf seinen Grundpreis zurück — es steht
  also nichts halb fertig da.
- **Das Backend bleibt unverändert.** Jeder Schreibendpunkt hinter diesen Masken antwortet
  bereits mit dem vollständigen gespeicherten Datensatz, und die Listen lesen dieselben Zeilen.
  Es gibt nichts, das nur die Detailantwort trägt und die Maske vor dem Schliessen bräuchte.
