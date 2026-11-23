# ADR-0079 — Die Gutschrift entsteht in der Rechnung und hat eine Maske, aber keine Liste

- **Status:** Angenommen
- **Datum:** 2026-11-23
- **Verhältnis:** Setzt Backend ADR-0155 um (Issue webux-admin/wx-office#112). Löst in
  `lib/salesDocument.ts` die Aussage «The Gutschrift … gets a mask when that way exists» ein.

## Kontext

Das Backend kennt die Gutschrift als eigenen Beleg: immer aus einer ausgestellten Rechnung, mit
Verweis auf sie, Positionen nur aus Rechnungspositionen mit kopiertem Satz, nie mehr als die
Rechnung je Satz noch hergibt (Backend ADR-0155). Die Endpunkte:

- `GET /invoices/{id}/creditable` — Positionen der Rechnung, was je Position und je Satz schon
  gutgeschrieben ist und was übrig bleibt;
- `POST /invoices/{id}/credit-notes`, `GET /invoices/{id}/credit-notes`;
- `GET|PUT|DELETE /credit-notes/{id}`, `PUT …/texts`, `POST …/finalise`, `POST …/cancel`,
  `GET …/pdf`, `GET …/status-trail`, `GET …/related`.

Bisher kannte das Frontend die Kategorie `CREDIT_NOTE` nur als Belegart ohne Maske; die Kette,
der Postausgang und die Partnerhistorie zeigten eine Gutschrift als Text ohne Link. Im
Zahlungsdialog stand «Gutschrift» als Ausgleichsart, die das Backend jetzt abweist.

## Entscheidung

1. **Der Einstieg ist das Register «Gutschriften» der Rechnung.** Es steht neben «Zahlungen» und
   «Mahnungen», sobald die Rechnung ausgestellt ist und der Benutzer `CREDIT_NOTE_READ` hat, und
   listet alle Gutschriften der Rechnung samt Entwürfen. Der Knopf «Gutschrift erstellen…» steht
   dort, nur für eine ausgestellte Rechnung und mit `CREDIT_NOTE_WRITE` — nicht in der schon
   vollen Knopfzeile der Maske.
2. **Ein Dialog schreibt die Gutschrift** (`CreditNoteDialog`): je Rechnungsposition ein Häkchen,
   darunter Menge, Preis in der Preisbasis der Position («inkl.» oder «exkl. MWST») und eine
   eigene Bezeichnung; dazu Datum und Kopftext. Vorbelegt ist der Preis, der die ganze Position
   gutschreibt (`fullCreditUnitPrice`). Satz, Konto und Leistungsdatum werden nicht angeboten.
   Derselbe Dialog schreibt einen Entwurf neu.
3. **Die Zahlen kommen vom Server.** Der Dialog zeigt «Noch gutschreibbar» und je Satz, was übrig
   ist, wie `creditable` es sagt; er prüft selbst nur Menge und Preis über null. Ob die Gutschrift
   passt, sagt die Antwort des Backends, und die steht im Dialog.
4. **Die Gutschrift hat eine Maske unter `/gutschriften/:id`, aber keine Liste.**
   `CREDIT_NOTE_KIND` hat die Form der vier Belegarten, steht aber nicht in
   `SALES_DOCUMENT_KINDS` — es gibt kein Menü, keine Kachel und keine Liste. Die Maske zeigt
   Positionen und Totale (`LinesTable`, nur lesend), Texte, Empfänger, Verlauf und
   Zusammenhänge, mit den Knöpfen Entwurf löschen, Positionen bearbeiten, Vorschau oder Drucken,
   Ausstellen und Stornieren. Der Weg zurück führt zur Rechnung.
5. **Links auf einen einzelnen Beleg kennen die Gutschrift**: `documentKindFor` statt
   `salesDocumentFor` in der Kette, im Postausgang und in der Partnerhistorie.
   `salesDocumentFor` bleibt für Listen und Menüs.
6. **«Gutschrift» ist keine Ausgleichsart mehr.** Der Zahlungsdialog bietet sie nicht an; eine
   Ausgleichszeile, die eine Gutschrift geschrieben hat, trägt «Gutschrift öffnen» statt
   «Stornieren».

## Begründung

**Der Einstieg an der Rechnung, weil die Gutschrift dort beginnt.** Backend ADR-0047 hat die
Liste «Gutschriften» mit «Neu» verworfen: man wählt die Rechnung, die man korrigiert, nicht die
Belegart. Das Register an der Rechnung ist auch der Ort, an dem man später nachsieht, was einer
Rechnung gutgeschrieben wurde.

**Eine eigene, kleinere Maske statt der Belegmaske**, weil die Belegmaske alles anbietet, was an
einer Gutschrift falsch wäre: Positionen aus dem Katalog mit Satz nach Leistungsdatum, Kunde
wechseln, Währung, Rabatt, Zahlungskondition. Ausblenden hätte die Maske um eine Bedingung je
Abschnitt erweitert. Was gleich ist — Positionstabelle, Texte, Verlauf, Kette, Druck —, ist
dieselbe Komponente.

**Der Dialog rechnet nicht**, weil die Grenze je Satz nach Belegrabatt und abzüglich der
ausgestellten Gutschriften eine Regel des Backends ist. Zwei Rechnungen derselben Grenze — eine
im Browser, eine im Server — liefen beim ersten Rabatt auseinander.

## Verworfene Alternativen

- **Die Gutschrift in der Belegmaske, mit `CREDIT_NOTE` in `SALES_DOCUMENT_KINDS`.** Verworfen,
  siehe Begründung; ausserdem hätte sie Menüeintrag, Kachel und Liste bekommen.
- **Ein Knopf «Gutschrift erstellen…» in der Kopfzeile der Rechnung.** Verworfen: die Zeile trägt
  schon bis zu sechs Knöpfe (ADR-0020), und der Knopf im Register steht neben dem, was er
  verändert.
- **Ein Betragsfeld je Position statt Menge und Preis.** Einfacher zu tippen. Verworfen: die
  Gutschrift druckt Menge und Preis wie eine Rechnung, und das Backend nimmt beide.
- **Prüfen der Grenze im Dialog.** Verworfen, siehe Begründung.

## Konsequenzen

- Nach Ausstellen und Storno einer Gutschrift liest die Maske Rechnung, offenen Posten, Register
  und `creditable` neu; nichts davon wird im Browser nachgeführt.
- Ein eigenes Druckformular zeigt den Bezug auf die Rechnung erst, wenn es die Felder
  «Gutschrift zu Rechnung» und «Datum der gutgeschriebenen Rechnung» platziert (Backend
  ADR-0155).
- Der Versand per E-Mail ist in der Gutschriftmaske noch nicht angeboten, obwohl das Backend die
  Endpunkte hat.

## Abweichungen vom Issue

Keine.

## Offen

- Versand der Gutschrift per E-Mail aus ihrer Maske, über `SendDocumentDialog`.
