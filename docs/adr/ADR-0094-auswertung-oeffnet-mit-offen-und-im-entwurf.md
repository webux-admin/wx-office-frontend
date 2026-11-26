# ADR-0094 — Die Auswertung öffnet mit «offen» und «im Entwurf»

- **Status:** Angenommen
- **Datum:** 2026-11-26
- **Verhältnis:** Ergänzt [ADR-0086](ADR-0086-auswertung-der-zeiten-filter-in-der-adresse.md) (Filter
  in der Adresse) und [ADR-0089](ADR-0089-suchfeld-mit-quelle-im-browser-und-filtermaske-in-gruppen.md)
  (Filtermaske in Gruppen, «Filter zurücksetzen»). Backend: kein Umfang, `state` nimmt schon mehrere
  Werte. Issue webux-admin/wx-office#144, «Zeiterfassung verbessern (15/15)».

## Kontext

Die Rückmeldung: «Bei /zeiten-auswertung kannst du als Standard ‹offen› und ‹im Entwurf›
anhaken.» Die Auswertung wird meist geöffnet, um zu sehen, was noch auf keiner ausgestellten
Rechnung steht; «verrechnet» und «nicht verrechenbar» sind erledigt.

Bisher hiess kein Häkchen «alle Zustände», und ohne `zustand` in der Adresse war kein Häkchen
gesetzt. Wird «ohne `zustand`» zur Vorgabe, braucht «alle Zustände» ein eigenes Zeichen — sonst
öffnete ein geteilter Link auf alle Zustände gefiltert.

## Entscheidung

1. **Steht kein `zustand` in der Adresse, gelten «offen» und «im Entwurf»** (`DEFAULT_STATES`). Mit
   dieser Ansicht öffnet die Auswertung aus der Navigation.
2. **«Alle Zustände» steht als `zustand=alle` in der Adresse.** `evaluationSearchOf` schreibt es,
   wenn kein Häkchen gesetzt ist; `evaluationFilterOf` liest es als alle. Ein bekannter Zustand
   daneben gewinnt; nur unbekannte Werte ergeben die Vorgabe, nachsichtig wie bisher. Ein Link mit
   einzelnen Zuständen bleibt, wie er ist.
3. **«Filter zurücksetzen» führt zur Startansicht** (`startingView`): der Zeitraum bleibt, die
   Zustände sind wieder «offen» und «im Entwurf», alles andere leer. Der Knopf erscheint, sobald der
   Filter davon abweicht (`isAtStart`).
4. **Die gesetzten Zustände stehen als Chips unter «Aktive Filter», auch in der Startansicht.** Die
   Summen gelten über den ganzen Filter; wer nicht sieht, dass «verrechnet» fehlt, liest ein zu
   kleines Total. Sind alle Zustände gewählt und sonst nichts, steht dort «Alle Zustände».
5. **Die Auswahllisten hängen weiter am Zeitraum allein** (`rangeOnly`, alle Zustände): ein Häkchen
   ändert nicht, welche Projekte, Kunden und Leistungen zur Wahl stehen.
6. **Der Export folgt dem Filter wie bisher**; wer alle Zeiten exportieren will, nimmt die Häkchen
   heraus.

## Begründung

**Zu 2:** Die Adresse ist die eine Quelle des Filters (ADR-0086). Ohne ein Zeichen für «alle» würde
die neue Vorgabe jeden geteilten Link auf alle Zustände still umdeuten.

**Zu 4:** Ein Filter, den man nicht sieht, ist eine Falle für jede Summe darunter.

## Verworfene Alternativen

**Vorgabe nur in der Maske, ohne Zeichen für «alle» in der Adresse.** Verworfen: ein geteilter
Link auf alle Zustände öffnete gefiltert.

**Vorgabe im Backend**, also ohne `state` nur offen und im Entwurf. Verworfen: dieselbe Liste dient
den Registern «Zeiten» am Projekt und am Kunden, die ohne `state` alle Zustände erwarten. Die
Vorgabe gehört der Maske.

**Die gewählten Zustände je Benutzer im Browser merken.** Verworfen: derselbe Link wäre je nach Gerät
verschieden (ADR-0086).

**Die Chips der Vorgabe verstecken.** Verworfen, siehe zu 4.

## Konsequenzen

- `lib/timeEvaluation`: `DEFAULT_STATES`, `rangeOnly`, `startingView` und `isAtStart` statt
  `withoutNarrowing`; `isNarrowed` bleibt für die Chips und den Satz bei leerer Liste.
- **Ein Link ohne `zustand` aus der Zeit vor dieser Änderung zeigt danach nur «offen» und «im
  Entwurf».** Die Auswertung ist erst seit wenigen Tagen in Gebrauch (#128); das wird hingenommen.
- Backend `docs/processes/zeit-erfassen.md`, Abschnitt «Auswertung und Export»: ein Satz zur
  Vorgabe der Maske.
