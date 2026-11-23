# ADR-0081 — Ein Überschuss aus Gutschrift und Überzahlung wird geteilt

- **Status:** Angenommen
- **Datum:** 2026-11-23
- **Verhältnis:** Löst aus [ADR-0080](ADR-0080-gutschrift-nach-der-gegenlese.md), Entscheidung 2,
  die Aussage «Steht ein Teil des Überschusses aus einer Überzahlung daneben, gilt die Meldung
  der Gutschrift» ab. Setzt Backend ADR-0157, Entscheidung 5, um (zweite Prüfrunde zu Issue
  webux-admin/wx-office#112).

## Kontext

Rechnung 1'000.00, bezahlt 1'010.00, danach 100.00 gutgeschrieben: offen −110.00. ADR-0080
nannte den ganzen Überschuss «Guthaben aus Gutschrift» und nahm «Einbehalten» und
«Zurückzahlen» weg. Die 10.00, die tatsächlich zu viel ankamen, liessen sich damit nicht mehr
nach Backend ADR-0105 behandeln.

## Entscheidung

`surplusParts` in `lib/receivable.ts` teilt den Überschuss: zuerst der Teil aus Gutschriften,
höchstens die Summe der Ausgleichszeilen, die eine Gutschrift geschrieben hat und die noch
zählen; der Rest ist eine gewöhnliche Überzahlung. Das Register «Zahlungen» zeigt beide Meldungen
nebeneinander — «Guthaben aus Gutschrift» mit «Zahlung erfassen» über den negativen
Gutschrift-Teil, «zu viel bezahlt» mit «Einbehalten» und «Zurückzahlen» über den Rest. Ein
Einbehalt schlägt nur den Rest vor. Das Abzeichen sagt «überzahlt», solange ein Rest da ist.

Gerechnet wird aus den Zeilen, die das Backend liefert (`creditNoteId` und Betrag); ein eigenes
Feld braucht es nicht. `hasStandingCreditNote` entfällt.

## Begründung

Die beiden Teile haben verschiedene Rechtsgründe: der eine ist eine Entgeltsminderung, die
zurückgeht, der andere Geld, das zu viel kam und über das der Empfänger nicht allein entscheidet
(OR Art. 62/63). Eine Meldung für beides nimmt einem der beiden seinen Weg.

## Verworfene Alternativen

- **Ein Feld im offenen Posten vom Backend.** Verworfen: die Zeilen tragen alles, und ein Feld
  müsste in Java und SQL gleich gerechnet werden.
- **Zuerst die Überzahlung, dann die Gutschrift abziehen.** Verworfen: was zu viel ankam, lässt
  sich nicht von den Zeilen ablesen — was eine Gutschrift gab, schon. Der ablesbare Teil kommt
  zuerst, der Rest ist der andere.

## Konsequenzen

- Bei einem gemischten Überschuss stehen zwei Meldungen im Register.

## Abweichungen vom Issue

Keine.

## Offen

- Das Vorzeichen eines Einbehalts aus der Maske (Backend ADR-0157, Offen).
