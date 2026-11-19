# ADR-0051 — Ein neuer Partner braucht eine Adresse und kann gleich Kontaktpersonen mitbringen

- **Status:** Angenommen
- **Datum:** 2026-11-19
- **Verhältnis:** Ändert Abschnitt 3 von
  [ADR-0050](ADR-0050-hinweise-als-tooltip-fehler-am-feld.md) für das Erfassen eines Partners.
  Alles andere aus ADR-0050 gilt weiter.
- **Backend:** keins. `POST /partners` nimmt Adressen und Kontaktpersonen schon heute mit.

## Kontext

Nach ADR-0050 war die Adresse beim Erfassen freiwillig: blieb sie leer, entstand der Partner
ohne Adresse, und PLZ und Ort wurden erst Pflicht, sobald jemand ein Adressfeld ausgefüllt hatte.
Kontaktpersonen gab es erst am gespeicherten Partner, im Register «Kontakte». Verlangt ist
jetzt: beim Erfassen muss eine Adresse eingegeben werden, mindestens PLZ und Ort, und auch
Kontaktpersonen sollen sich gleich mit erfassen lassen.

## Entscheidung

1. **PLZ und Ort sind auf der Erfassungsmaske immer Pflicht.** Strasse, Hausnummer und Land
   bleiben freiwillig, das Land beginnt mit der Vorgabe des Mandanten. Die Adresse wird immer
   mitgeschickt und wird Standardadresse.
2. **Kontaktpersonen werden in einer Liste unter der Maske gesammelt.** «Kontaktperson
   hinzufügen» öffnet denselben `ContactDialog` wie am gespeicherten Partner. Bis zum Speichern
   wird nichts geschickt. Danach gehen die Personen in derselben Anfrage mit wie der Partner.
3. **Die erste Person beginnt als Hauptkontakt.** Wer einer anderen Person das Häkchen gibt,
   nimmt es der bisherigen weg. Am gespeicherten Partner lehnt das Backend einen zweiten
   Hauptkontakt ab. Vor dem Speichern gibt es nichts abzulehnen, also wandert das Häkchen.
4. **Eine erfasste Kontaktperson zählt als Änderung.** Escape und der Zurück-Link fragen dann
   vor dem Verwerfen (ADR-0048), obwohl die Eingabe in einem Dialog stattfand.

## Begründung

Ein Kunde ohne Adresse kann weder eine Offerte noch eine Rechnung bekommen. Wer ihn so anlegt,
muss gleich danach die Adresse nachtragen, und das vergisst man leicht. PLZ und Ort reichen dem
Backend und der QR-Rechnung als Mindestangabe. Eine Strasse fehlt etwa bei einer Postfachadresse.

Die Kontaktperson ist oft die Person, mit der man gerade telefoniert. Weil Speichern zur Liste
zurückführt (ADR-0003), müsste man sonst den neuen Eintrag suchen und das Register öffnen.

## Verworfene Alternativen

**Die Adresse auch im Backend zur Pflicht machen.** Erwogen, weil eine Fachregel dorthin gehört.
Für jetzt verworfen, weil auch Abläufe ohne Maske Partner anlegen und Partner ohne Adresse
erwarten, etwa Importe und Tests anderer Module. Das braucht einen eigenen Entscheid mit Blick
auf diese Wege.

**Kontaktpersonen als Zeilen direkt in der Maske, ohne Dialog.** Verworfen: eine Kontaktperson
hat acht Felder. Mehrere davon nebeneinander machen die schlanke Erfassungsmaske lang, und der
Dialog ist am gespeicherten Partner schon da und geprüft.

**Erst den Partner speichern, dann die Kontaktpersonen einzeln schicken.** Verworfen: scheitert
die zweite Anfrage, steht ein halber Partner in der Datenbank. In einer Anfrage gelingt alles
zusammen oder nichts.

## Konsequenzen

- `AddressFields` kennt keine freiwillige Postanschrift mehr, PLZ und Ort sind dort immer
  Pflicht. `isUntouched` ist weggefallen.
- Neuer Baustein `partner/NewContacts.tsx` und neue Funktion `withSinglePrimary` in
  `contactForm.ts`. `ContactDialog` nimmt `startsAsPrimary`.
- Eine Ablehnung einer Kontaktperson durch das Backend (`contacts.…`) erscheint als Hinweis über
  der Maske, weil die Felder dazu im geschlossenen Dialog stehen.

## Abweichungen vom Issue

Keine.

## Offen

- Ob die Pflichtadresse auch im Backend gelten soll.
