# ADR-0050 — Hinweise stehen im Tooltip, Fehler direkt am Feld, und Erfassen ist schlanker als Bearbeiten

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Neu. Pilot ist das Partner-Modul; die anderen Module folgen beim Überarbeiten.
- **Backend:** ADR-0132 (Feldfehler im ProblemDetail)

## Kontext

Unter vielen Feldern stand ein Satz, der wenig half («Die Prüfziffer kontrolliert das
Backend.», «Kann Empfänger von Aufträgen sein.»), manchmal auch ein falscher (im
Deaktivieren-Dialog: «Ein Gegenstück dazu kennt die API nicht» — das Backend kann
reaktivieren). Fehler kamen als ein Satz über dem Formular, immer nur der erste. Pflichtfelder
waren nicht markiert. Und die Maske zum Anlegen eines Kunden zeigte schon alles, was ein
gespeicherter Kunde hat.

## Entscheidung

### 1. Ein Hinweis ist ein Tooltip — oder gar nichts

`Field` (und damit `TextField`, `SelectField`, `TextAreaField`, `CodeSelect`) und
`CheckboxField` nehmen `tooltip`. Er steht als kleines Info-Symbol neben der Beschriftung,
öffnet beim Überfahren und beim Fokus, schliesst mit Escape und wird über `aria-describedby`
mit dem Feld vorgelesen. Er sagt etwas, das man dem Feld nicht ansieht: ein Format, eine
fachliche Bedeutung, eine Folge. Ein Satz, der nur die Beschriftung wiederholt, kommt weg.
`hint` bleibt für den seltenen Fall einer Zeile, die gerade jetzt gilt (Feststelltaste).

Ein Wert, der nach dem Anlegen feststeht, bekommt `locked` mit einem Schloss-Symbol und dem
Grund dahinter, statt eines Satzes über dem ganzen Panel.

### 2. Ein Fehler steht am Feld

`error` zeichnet die Meldung unter das Feld, rot umrandet, über `aria-live` angesagt. Die
Meldungen kommen aus zwei Quellen und landen in derselben Form (`FieldErrors`): aus der
Prüfung der Maske und aus `errors` der Backend-Antwort (`fieldErrorsOf`). `useFieldErrors`
bündelt beides: still bis zum ersten Speichern, danach live; scheitert ein Versuch, geht der
Fokus auf das erste falsche Feld. Was an keinem sichtbaren Feld stehen kann, erscheint wie
bisher als Hinweis über dem Formular (`isToldByFields`).

Pflichtfelder tragen `required`: einen roten Stern neben der Beschriftung und `aria-required`.

### 3. Erfassen fragt nur das Nötige, Bearbeiten zeigt alles

Am Partner: Erfassen zeigt Art (Firma/Person als `SegmentedControl`), Name, Rechtsform, eine
Postanschrift sowie E-Mail und Telefon. Sprache, Währung und Zahlungskondition beginnen mit
den Vorgaben des Mandanten, der Empfänger der Adresse ist der Name des Eintrags, und die
Adresse wird Standardadresse. Speichern führt danach zur Liste zurück (ADR-0003 bleibt).

Die Bearbeitungsmaske zeigt über den Registern eine Faktenzeile (`FactList`):
Standardadresse, Hauptkontakt, Telefon, E-Mail und das Kundenguthaben, das vorher im
Register «Dokumente» versteckt war. Die Register tragen ihre Anzahl («Adressen 3»). Das
Sammelregister «Dokumente» heisst jetzt «Einstellungen». Speichern geht aus jedem Register.
Deaktivieren und **Reaktivieren** stehen im Kopf und fragen mit `ConfirmDialog`.

## Begründung

Ein Satz unter jedem Feld wird nach dem dritten Mal nicht mehr gelesen, auch dort nicht, wo er
wichtig wäre. Hinter einem Symbol steht er nur dort, wo es etwas zu sagen gibt — und das
Symbol selbst zeigt, wo das ist. Ein Fehler am Feld spart die Suche nach dem Feld, von dem der
Satz oben spricht, und alle Fehler auf einmal sparen eine Runde je Fehler.

Beim Anlegen am Telefon zählt, dass in einer Minute eine Offerte geschrieben werden kann.
Alles Weitere wird am gespeicherten Eintrag gepflegt, wo es seinen Platz in einem Register hat.

## Verworfene Alternativen

**Nach dem Anlegen den neuen Datensatz öffnen.** Vorgeschlagen, weil Kontaktpersonen und
weitere Adressen der natürliche nächste Schritt wären. Verworfen auf Entscheid des
Auftraggebers: Speichern führt zur Übersichtsliste, wie überall (ADR-0003).

**Hinweise als `title`-Attribut.** Verworfen: mit der Tastatur nicht erreichbar, auf
Touch-Geräten unsichtbar, und der Browser zeigt ihn mit Verzögerung.

**Die Hinweise unter den Feldern lassen und nur kürzen.** Verworfen: das Problem ist die
Menge, nicht die Länge.

**Fehler weiter als ein Satz über dem Formular, nur mit allen Fehlern.** Verworfen: der Satz
nennt das Feld, und der Benutzer muss es selbst finden. Am Feld fällt diese Suche weg.

**Die Rechtsform beim Anlegen weglassen.** Erwogen, weil sie selten zählt. Verworfen: das
Backend verlangt sie für eine Firma, und nach dem Anlegen lässt sie sich nicht mehr ändern.

## Konsequenzen

- Neue Bausteine in `components/`: `Tooltip`, `FormMask`, `ConfirmDialog`,
  `DialogCancelButton`, `SegmentedControl`, `FactList`, `IconButton`, `useChangeTracker`,
  `useFieldErrors`. In `lib/`: `fieldErrors.ts`.
- `firstComplaint`, `addressComplaint` und `contactComplaint` des Partner-Moduls sind durch
  Prüfungen je Feld ersetzt (`partnerComplaints`, `addressComplaints`, `contactComplaints`).
- Die anderen Module haben ihre Hinweise noch unter den Feldern. Sie werden beim Überarbeiten
  nach derselben Regel aufgeräumt.

## Abweichungen vom Issue

Keine.

## Offen

- Die übrigen Module.
