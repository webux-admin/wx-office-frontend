# ADR-0002 — Stammdatenpflege: vier Masken statt einer

- **Status:** Angenommen
- **Datum:** 2026-08-19

## Kontext

Mit [ADR-0001](ADR-0001-auswahlwerte-aus-der-api.md) liest das Frontend alle Auswahlwerte aus
der API. Pflegen liess sich damit nur eines: die acht gepflegten Listen unter
`/auswahllisten`. Das Backend speichert aber mehr, und für den Rest gab es keine Oberfläche —
Zahlungskonditionen mit Skonto-Staffeln, die Beschriftung der festen Werte, die
Mehrwertsteuersätze.

Die vier Sachen sind technisch verschieden, und die Unterschiede sind nicht Geschmack:

| Gegenstand | Endpunkt | Was der Mandant darf |
|---|---|---|
| Gepflegte Listen | `/{liste}` | anlegen, umbenennen, sortieren, deaktivieren, löschen |
| Feste Werte (Kataloge) | `/catalogues/{name}/{code}` | **nur** umbenennen, sortieren, ausblenden |
| Zahlungskonditionen | `/payment-terms` | anlegen, umbenennen, Frist und Skonto setzen, sortieren, deaktivieren, löschen |
| MWST-Sätze | `/vat-rates` | **nichts** — es gibt keinen Schreibendpunkt |

## Entscheidung

**Vier Routen, je eine Maske**: `/auswahllisten`, `/feste-werte`, `/zahlungskonditionen`,
`/mehrwertsteuer`. Nicht eine Seite mit zwanzig Reitern.

Dazu fünf Festlegungen, die für jede dieser Masken gelten:

1. **Die Bezeichnung wird zweimal geschrieben.** `name` ist beim Backend nur der Rückfall für
   eine Sprache ohne Übersetzung — ausgeliefert ist er **immer deutsch**, egal in welcher
   Sprache ein Mandant arbeitet. Die Übersetzung für die Sprache des Mandanten steht in
   `labels`. Beide hält das Backend nicht synchron. Deshalb hat jede Maske **ein** Feld
   «Bezeichnung»: gefüllt wird es aus `labels[Standardsprache] ?? name`, geschrieben mit
   `labelPayload()` aus `lib/masterData.ts` an beide Stellen. Wer nur `name` anzeigt, zeigt
   einem französischen Mandanten das deutsche Wort — und überschreibt damit beim Speichern
   seine französische Beschriftung.
2. **Ein PUT ist ein vollständiger Ersatz, kein Patch.** Weggelassene `labels` löschen die
   Übersetzungen, ein weggelassenes `visible` setzt sichtbar, weggelassene `discounts` löschen
   die Staffeln. Jede Maske sendet deshalb immer den kompletten Stand — auch beim Sortieren und
   beim Aus- und Einblenden.
3. **Was das Backend nicht als Satz beantwortet, prüft die Maske vorher.** Der
   Katalog-Controller hängt an keinem `@RestControllerAdvice`: eine zu lange Bezeichnung, ein
   unbekannter Code und ein Schreibkonflikt kommen alle als nackte 500 zurück. Auch die
   Codeformate der Listen (`de`, `CH`, `CHF`) beantwortet das Backend auf Englisch. Beides prüft
   das Frontend deshalb selbst und sagt es auf Deutsch. Sobald das Backend diese Fälle abbildet,
   ist die Doppelspurigkeit hier zu entfernen.
4. **Die MWST-Maske zeigt und erklärt, sie bietet nichts an.** Die Sätze sind eidgenössisch,
   hängen an keinem Mandanten und haben keinen Schreibendpunkt. Ein Knopf, der so aussieht, als
   liesse sich ein Satz ändern, wäre eine Lüge — die Maske sagt stattdessen in einem Satz, warum
   hier nichts zu ändern ist und wo es weitergeht.
5. **Gerechnet wird nicht.** Was eine Zahlungskondition für einen Betrag bedeutet — Fälligkeit,
   Skontoabzug, der Satz für den Beleg — beantwortet `/payment-terms/{id}/calculation`. Die
   Vorschau im Dialog zeigt diese Antwort und rechnet nichts nach.

## Begründung

Eine Seite mit allen Reitern hätte den Unterschied verwischt, auf den es ankommt: bei den
gepflegten Listen kommt ein Wert dazu, bei den festen Werten nie. Ein «Neu»-Knopf, der je nach
Reiter da ist oder fehlt, liest sich als Defekt. Getrennte Masken machen die Regel sichtbar.

Zahlungskonditionen haben ausserdem eine eigene Fachlichkeit — Frist, Basis, bis zu drei
Staffeln, deren Satz mit längerer Frist fallen muss — und passen in keine Tabelle, die für
Code, Name und Kurzform gebaut ist.

## Alternativen

**Alles unter `/auswahllisten` mit weiteren Reitern.** Verworfen: siehe oben, und siebzehn
Reiter in einer Zeile sind keine Navigation.

**MWST-Sätze als Formular anlegen und beim Speichern 405 zeigen.** Verworfen. Eine Maske, die
eine Aktion anbietet, die es nicht gibt, ist schlimmer als keine Maske.

**Client-Validierung weglassen und die 500 anzeigen.** Verworfen: «Das Backend meldet einen
Fehler.» sagt niemandem, dass die Bezeichnung 61 Zeichen hat.

## Konsequenzen

- Vier Einträge mehr in der Seitenleiste unter *Einstellungen*, jeder mit dem Recht des
  Endpunkts dahinter (`MASTERDATA_READ`, `TENANT_READ`, `MASTERDATA_READ`, `PRODUCT_READ`).
- Weil beim Sortieren der komplette Stand eines festen Werts zurückgeschrieben wird, entsteht
  für diesen Wert eine Override-Zeile mit den mitgelieferten Übersetzungen darin. Verbessert
  eine spätere Version die ausgelieferte Beschriftung, sieht dieser Mandant sie nicht mehr.
  Hingenommen: es gibt keinen Endpunkt, der die ausgelieferten Werte separat liefert.
- `DueDateBasis` («Belegdatum», «Monatsende») ist das einzige Enum, dessen deutsche Wörter
  wieder im Frontend stehen — es hat keinen Katalog. Kommt einer, wandern die zwei Wörter
  dorthin.
- Die Sortierpfeile brauchten mit der dritten Maske eine eigene Komponente:
  `components/RowOrderButtons.tsx`. Sie kennt die Fachdomäne nicht — sie bekommt den Namen des
  Datensatzes für die Beschriftung und zwei Rückrufe.
