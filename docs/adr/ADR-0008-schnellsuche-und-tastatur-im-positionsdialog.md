# ADR-0008 — Der Positionsdialog sucht als Typeahead und wird mit der Tastatur bedient

- **Status:** Angenommen
- **Datum:** 2026-08-22
- **Verhältnis:** ergänzt [ADR-0005](ADR-0005-belegart-als-vollmaske.md) und
  [ADR-0006](ADR-0006-kopfdaten-am-entwurf.md) um die Positionserfassung; hebt nichts auf.
- **Backend:** Gelesen werden `GET /products?search=&activeOnly=&size=&sort=`,
  `GET /products/{id}`, `GET /vat-rates?dateOfSupply=` und
  `GET /partners/{partnerId}/prices/{productId}?quantity=`. Alle vier gibt es im
  committeten Stand; für diese Phase wird **kein** Endpunkt gebaut oder geändert.
- **Ein Datum fehlt der Preisauskunft, und das ist Absicht.** Der MwSt-Satz wird für das
  Leistungsdatum gelesen, der Preis nicht — die Preisfindung kennt heute keinen Zeitraum,
  also gibt es nichts, wonach zu fragen wäre. Bekommen Preise einen Gültigkeitszeitraum,
  gehört `dateOfSupply` an denselben Aufruf, und zwar mit demselben Tag, der schon den
  Steuersatz bestimmt. Die Stelle ist in `productInfo.ts` als Kommentar markiert.

## Kontext

Die Position aus dem Katalog war eine Auswahlliste. Sie lud beim Öffnen des Dialogs die
ersten 200 Produkte (`PICKER_SIZE`) und legte sie als `<option>`-Liste ab. Das hat drei
Folgen, die alle in dieselbe Richtung zeigen:

**Ab 200 Produkten ist der Katalog unvollständig** — und zwar lautlos. Wer ein Produkt Nummer
812 verkauft, findet es im Dialog nicht und erfährt nicht, warum. Der Kommentar im Code sagte
das seit Phase 1 selbst («needs a type-ahead»).

**Auch darunter ist eine Auswahlliste das falsche Werkzeug.** Ein `<select>` sucht nur über
den Anfang der Bezeichnung. Wer die Artikelnummer kennt — der übliche Fall bei jemandem, der
zehn Positionen am Stück erfasst —, kann sie nicht eintippen.

**Der Dialog war nicht für die Tastatur gebaut.** Der Fokus landete beim Öffnen auf dem
Schliessen-Knopf (der erste fokussierbare Knopf im Kasten), die Menge musste angesteuert
werden, und nach jeder Position schloss sich der Dialog. Zehn Positionen hiessen zehnmal
«Aus Katalog» klicken.

Dazu zwei kleinere Punkte aus derselben Maske: der Rabatt stand gleichrangig neben der Menge,
obwohl er selten gesetzt wird, und zum gewählten Produkt zeigte der Dialog nichts — weder
Einheit noch Ertragskonto noch MwSt-Satz, und vor allem nicht den Preis, den dieser Kunde
bezahlt. Der stand erst nach dem Hinzufügen in der Tabelle.

## Entscheidung

**1. Die Produktwahl ist ein Typeahead gegen den Server.** `ProductQuickSearch` schickt, was
getippt wird, nach 200 ms Ruhe als `search=` an `/products?activeOnly=true&size=20`. Das
Backend sucht über Bezeichnung **und** Artikelnummer. Zwanzig Treffer, nicht zweihundert
Vorratsdatensätze.

**2. Das letzte Ergebnis bleibt stehen, solange das nächste unterwegs ist**
(`placeholderData: keepPreviousData`). Eine Liste, die bei jedem Tastendruck leer wird,
flackert genau dann, wenn sie gelesen wird.

**3. Das Feld ist eine Combobox nach ARIA**: `role="combobox"`, `aria-expanded`,
`aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant`, darunter eine
`role="listbox"` mit `role="option"` und `aria-selected`. Der Fokus bleibt im Eingabefeld;
die Treffer werden nie angesteuert, sondern markiert.

`aria-expanded`, `aria-controls` und `aria-activedescendant` hängen dabei am **tatsächlichen
Vorhandensein** der Liste, nicht am offenen Kasten: während des Ladens, bei «kein Treffer» und
bei einer Ablehnung gibt es keine Listbox, und einen Eintrag, den es nicht gibt, meldet das
Feld auch nicht. Die Trefferzahl steht in **einer** dauerhaft eingehängten `aria-live`-Region
mit wechselndem Text («3 Treffer» / «Kein Treffer») — eine Region, die zusammen mit ihrem Text
eingehängt wird, liest ein Screenreader nicht vor, und der leere Fall wurde vorher gar nicht
angesagt.

**4. Die Tastenbelegung ist:**

| Taste | Wirkung |
| --- | --- |
| Pfeil runter / hoch | markiert den nächsten / vorigen Treffer, umlaufend |
| Enter in der Suche | übernimmt den markierten Treffer |
| Strg+Enter in der Suche | übernimmt den Treffer **und** fügt die Position hinzu |
| Enter in der Menge | fügt die Position hinzu und schliesst |
| Strg+Enter (⌘+Enter) in der Menge | fügt hinzu und lässt den Dialog offen |
| Escape | schliesst den Dialog |

Beim Öffnen liegt der Fokus im Suchfeld; nach der Übernahme springt er in die Menge und
markiert den Wert, sodass Tippen ihn ersetzt. **Wird eine gespeicherte Zeile bearbeitet,
liegt der Fokus in der Menge**: im Suchfeld steht dann der Name des Produkts, und der erste
Tastendruck dort löst die Produktbindung.

**Enter übernimmt nur, was die aktuelle Eingabe beantwortet.** Solange die Entprellung läuft,
eine Anfrage unterwegs ist oder die letzte abgelehnt wurde, zeigt die Liste die Treffer des
vorigen Begriffs; Enter tut dann nichts. Und **die Pfeiltasten öffnen die Liste nicht, während
ein Produkt übernommen ist** — im Feld steht dann sein Anzeigename, und danach zu suchen
ergäbe «kein Treffer» für ein Produkt, das es gibt. Der Weg zurück in den Katalog ist Tippen.

**Eine Position geht einmal raus.** `send` bricht ab, solange eine Zeile unterwegs ist, und
verwirft eine Tastenwiederholung. Die Knöpfe waren gesperrt, die Tastatur war es nicht — drei
Enter in der Menge ergaben dreimal dieselbe Zeile auf dem Beleg.

**5. «Hinzufügen und weiter» leert Suche, Produkt, Menge und Rabatt und setzt den Fokus
zurück ins Suchfeld — das Leistungsdatum bleibt stehen.** Der Zeitraum gehört zur Lieferung
und nicht zur einzelnen Zeile; ein Rabatt gehört zur einzelnen Zeile.

**6. Sekundäres steht unter «Weitere Angaben»**: Rabatt (Prozent und Betrag) und Leistung
von/bis. Der Bereich ist **offen, sobald etwas drinsteht**, und trägt in jedem Fall eine
Zusammenfassung in der Kopfzeile («Rabatt 10 % · Leistung ab 01.07.2026»). Zugeklappt heisst
hier «weniger Platz», nie «versteckt». Dasselbe gilt für den Dialog der freien Position, wo
nur das Leistungsdatum in der Falte liegt. Ist der Rabatt beim gewählten Produkt gar nicht
zulässig, sagt die Zusammenfassung **«Rabatt entfällt»** statt einer Prozentzahl — sonst
behauptet sie einen Rabatt, der nicht gesendet wird.

**Ein Rabattfeld, das keine Zahl enthält, hält die Position auf.** «10%» oder «zehn» wurden
vorher stillschweigend verworfen: die Zeile ging ohne Rabatt raus, der Betrag war zu hoch, und
nichts in der Maske widersprach. Jetzt steht «Der Rabatt ist keine Zahl.» am Feld, wie bei der
Menge.

**7. Zum gewählten Produkt zeigt der Dialog Einheit, Ertragskonto, MwSt-Satz und den
aufgelösten Kundenpreis** — alles schreibgeschützt. Der Preis kommt aus
`/partners/{id}/products/{id}/price` mit Menge und Leistungsdatum, samt der Regel, die ihn
entschieden hat («Kundenpreis», «Preisgruppe», «Grundpreis»). Er ist als **«Einzelpreis»**
beschriftet, weil die Auflösung die Menge mitbekommt und trotzdem den Preis je Einheit
antwortet, und trägt in jedem Fall «inkl. MwSt» oder «exkl. MwSt» — das Fehlen des einen als
das andere zu lesen ist Raten. Ist die Auskunft nicht lesbar, **fehlt die Zahl** statt als
0.00 dazustehen, und darunter steht, dass sie nicht gelesen werden konnte: eine Zeile, die
lautlos verschwindet, ist von einer, die nie galt, nicht zu unterscheiden. Der ganze Block
wird als `aria-live`-Bereich angesagt, weil der Fokus nach der Übernahme in die Menge springt
und die Angaben darüber sonst nie vorgelesen werden.

**8. Der MwSt-Satz kommt aus `/vat-rates` zum Leistungsdatum.** Gibt es zur Kategorie an
diesem Tag keinen Satz, steht die Bezeichnung der MwSt-Behandlung da, keine Zahl. Für die
beiden Behandlungen **ohne** Satz — befreit (MWSTG Art. 23) und ausgenommen (Art. 21) — steht
immer die Bezeichnung: der Endpunkt antwortet für beide 0, und «0 %» macht sie ununterscheidbar
voneinander und von einem echten Nullsatz.

**9. «In der Produktmaske suchen» führt mit dem getippten Begriff nach `/produkte?suche=…`
und nimmt über `origin` den Weg zurück in den Beleg mit.** Die Produktliste liest den Begriff
einmal aus der Adresse und zeigt den Rückweg in der Kopfzeile.

## Begründung

**Serverseitig suchen ist die einzige Variante, die mitwächst.** Ein Katalog, den man im
Browser filtern kann, braucht keine Suche; einer, der eine braucht, passt nicht mehr in den
Browser. Dazwischen gibt es keinen stabilen Punkt, an dem man die Grenze zöge. Dass die
Bedingung `lower(name) LIKE '%x%' OR lower(product_number) LIKE '%x%'` ohne Trigramm-Index
die ganze Produkttabelle liest, ist ein Indexproblem und wird dort gelöst
(`webux-office/docs/adr/ADR-0041`), nicht dadurch, dass man die Suche in den Browser
verschiebt.

**Entprellt, weil sonst jede Taste eine Anfrage ist** und die Antworten in einer Reihenfolge
eintreffen, die niemand kontrolliert. 200 ms sind ungefähr eine Tippbewegung: kürzer nützt
nichts, länger fühlt sich hakelig an.

**Die Tastenbelegung folgt dem, was der Erfassung im Weg steht.** Wer zehn Positionen
schreibt, macht zehnmal dieselben vier Schritte: suchen, übernehmen, Menge, hinzufügen. Jeder
Griff zur Maus dazwischen kostet mehr als die ganze Maske einspart. Deshalb ist «Hinzufügen
und weiter» ein eigener Knopf und nicht nur ein Kürzel — ein Kürzel, das niemand kennt, gibt
es nicht.

**Escape schliesst den Dialog, nicht nur die Liste.** Die übliche Combobox-Regel («erst die
Liste, dann der Kasten») verlangt, dass der Benutzer weiss, in welchem der beiden Zustände er
gerade ist. In einem Dialog, dessen Liste fast immer offen ist, heisst das: Escape scheint
beim ersten Mal nichts zu tun. Eine Taste, eine Wirkung.

**Ein Preis, der erst nach dem Hinzufügen sichtbar wird, kommt zu spät.** Die Preisfindung
bleibt trotzdem vollständig im Backend: Der Dialog fragt sie, er rechnet sie nicht nach, und
er schickt keinen Preis mit. Beim Speichern entscheidet dieselbe Auflösung noch einmal — die
Anzeige ist eine Auskunft, keine Eingabe.

**Ein zugeklappter Bereich, der einen gesetzten Rabatt verbirgt, ist ein Fehler** und nicht
Aufräumen. Ein Rabatt ist ein Betrag; ein Betrag, den niemand sieht, ist ein Betrag, den
niemand korrigiert. Deshalb die Zusammenfassung in der Kopfzeile, und deshalb öffnet sich der
Bereich von selbst, sobald etwas drinsteht — dieselbe Regel, die das Leistungsdatum seit
Phase 1 hat.

## Alternativen

**Beim Öffnen den ganzen Katalog laden und im Browser filtern.** Verworfen: genau der Zustand,
der ersetzt wird. Er ist ab 200 Produkten still falsch, und «still falsch» ist bei
Belegdaten die schlechteste Eigenschaft, die eine Maske haben kann.

**Präfixsuche (`name LIKE 'x%'`) statt Teilstringsuche.** Verworfen im Frontend, weil die
Entscheidung im Backend liegt und dort gegen die Praxis spricht: «Wartung Serverraum» wird
als «server» gesucht. Die Indexfrage dazu steht in `webux-office/docs/adr/ADR-0041`.

**Eine fertige Combobox-Bibliothek (Downshift, Headless UI, Radix).** Verworfen: das
Designsystem ist eigen, die Bausteine sind es auch, und die Tastenbelegung ist hier keine
Standardbelegung, sondern die Antwort auf einen bestimmten Erfassungsablauf. Ein weiteres
Paket im Stack braucht einen besseren Grund als 120 Zeilen, die ohnehin getestet werden.

**Die Treffer als überlagerndes Dropdown zeichnen.** Verworfen: der Dialogkörper scrollt, ein
absolut positioniertes Feld würde daran beschnitten oder mit ihm wegscrollen. Die Liste steht
darum im Fluss unter dem Feld. Sie schiebt die Menge nach unten, solange sie offen ist — und
sie ist geschlossen, sobald ein Produkt gewählt ist, also genau dann, wenn die Menge gebraucht
wird.

**Den Suchbegriff dauerhaft in die Adresse der Produktliste schreiben.** Verworfen: die Liste
hält Seite, Sortierung und Filter ohnehin im Zustand, nicht in der Adresse. Der Begriff wird
einmal beim Öffnen gelesen; jede Taste danach in die Historie zu schreiben, macht den
Zurück-Knopf unbrauchbar.

**Den Rabatt sichtbar lassen und stattdessen das Leistungsdatum ausblenden.** Verworfen: beide
werden selten gesetzt, und beide gehören damit an dieselbe Stelle. Sichtbar bleibt, was jede
Position braucht — Produkt und Menge.

## Konsequenzen

- Neu: `src/pages/order/ProductQuickSearch.tsx` (Combobox), `ProductFacts.tsx` (Anzeige zum
  Produkt), `productInfo.ts` (MwSt-Text, Preisauflösung, Trefferzeile),
  `src/components/useDebouncedValue.ts`, `src/lib/highlight.ts` (Treffer hervorheben),
  `src/lib/keyboardList.ts` (Marke bewegen).
- `Dialog` nimmt neu `initialFocus`: ohne das landet der Fokus auf dem Schliessen-Knopf, weil
  der der erste fokussierbare Knopf im Kasten ist. Für eine Frage ist das richtig, für ein
  Formular nicht.
- `TextField` spreizt die Props des Aufrufers jetzt **vor** den eigenen Handlern. Vorher hat
  ein übergebenes `onFocus` den eigenen überschrieben, und die Fokuslinie des Designsystems
  blieb aus.
- `MoreDetails` nimmt `summary`; `lineForm.moreDetailsSummary` baut den Text.
- `origin.optionalOriginOf` ergänzt `originOf` für Bildschirme, die normalerweise **keinen**
  Rückweg zeigen — eine Liste hat keinen sinnvollen Ersatzwert.
- Die Produkt- und die Partnerliste sind auf dieselbe Entprellung umgestellt
  (`useDebouncedValue`) und halten ihre Zeilen mit `placeholderData: keepPreviousData`.
  `useDeferredValue` verschiebt nur den Renderzeitpunkt und begrenzt keine Anfragen; bei
  fünfzig Zeilen ist der Render lange vor dem nächsten Tastendruck fertig, also ging jede
  Taste als eigene Abfrage raus und die Tabelle sprang dazwischen in den Ladezustand.
- Der leere Zustand der Schnellsuche heisst «Kein aktives Produkt im Katalog.», nicht «Der
  Katalog ist leer.»: die Abfrage läuft fest mit `activeOnly=true`, ein Mandant mit lauter
  deaktivierten Produkten hat also einen vollen Katalog und keinen Treffer.
- Neuer Token `--color-highlight` in beiden Erscheinungsbildern, hinter dem hervorgehobenen
  Treffertext. Er fehlt noch im Figma-File und ist dort nachzuführen.
- `OrderLines` lädt keine Produktliste mehr; `PICKER_SIZE` bleibt für die Kundenauswahl im
  Kundenwechsel-Dialog bestehen, die dieselbe Behandlung noch braucht.
- `ProductLineDialog.onSubmit` gibt neu ein Promise zurück, weil der Dialog selbst entscheidet,
  ob er nach der Antwort schliesst oder für die nächste Position stehen bleibt.
