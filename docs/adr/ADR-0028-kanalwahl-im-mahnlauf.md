# ADR-0028 — Kanalwahl im Mahnlauf: eine Wahl, zwei Zahlen, und der Versandstand aus dem Postausgang

- **Status:** Angenommen
- **Datum:** 2026-08-29

## Kontext

Mahnungen gehen jetzt auch per Mail hinaus. Das Backend löst den Kanal **je Brief** auf und
liefert ihn im Arbeitsvorrat bereits mit
([Backend-ADR-0095](https://github.com/webux-admin/wx-office/blob/main/docs/adr/ADR-0095-mahnung-per-mail-kanal-je-brief.md)).

Randbedingungen:

- **`AUTO` ist die Vorgabe**; `MAIL` und `PRINT` sind eine bewusste Übersteuerung.
- **Der Mandant kann gar nicht mailen** — Modul aus, kein Mailkonto, Konto ausgeschaltet.
  Das Backend sagt, *warum*.
- **Der Mailversand verlangt zusätzlich `OUTBOX_SEND`.**
- **Der Versandstand liegt im Postausgang**, nicht auf der Mahnung.
- Eine Mahnung kann **ausgestellt** sein und trotzdem **nicht versandt** — sie steht dann in
  `unsent` und muss gedruckt werden.
- [ADR-0027](ADR-0027-mahnungen-ausstellen-und-zuruckziehen.md) hat den Freigabedialog gebaut,
  der beide Zahlen — Briefe und Rechnungen — nennt.

## Entscheidung

**Die Kanalwahl steht im Freigabedialog**, nicht im Seitenkopf und nicht in den Einstellungen.
Ein `SelectField` mit den drei Möglichkeiten, dazu ein Satz, was die gewählte bedeutet.

**Der Dialog nennt jetzt drei Zahlen:** Briefe, Rechnungen und die Aufteilung
*«12 per Mail, 3 auf Papier»*.

**Kann der Mandant nicht mailen, ist die Wahl gesperrt** und zeigt als Hinweis den Satz des
Servers — *«Dieser Mandant betreibt den Postausgang nicht»*. Die Liste enthält dann nur
*Nur auf Papier*, und der Lauf schickt `PRINT`.

**Das Ergebnis-Panel bekommt einen dritten Abschnitt**: *«Ausgestellt, aber nicht versandt»*,
mit dem Satz, dass diese Briefe stehen und gedruckt werden müssen.

**Das Register «Mahnungen» bekommt eine Spalte «Weg»** — *Gedruckt*, *Gesendet an …*,
*Wartet im Postausgang*, *Versand fehlgeschlagen* oder *Kein Versand protokolliert — bitte
drucken* —, bei Mail mit einem Link in den Postausgang.

**Der Versandstand wird je Mahnung nachgefragt**, mit `useQueries`, und nur für die, die per
Mail gingen.

**Die zwei Mail-Einstellungen stehen in der Mahnwesen-Einstellungsmaske** und sind gesperrt,
solange der Mandant nicht mailen kann.

**Die Mahnadresse braucht keine Maskenarbeit.** Die Verwendung *Mahnung* steht seit jeher im
Adresskatalog, und die Adressmaske zeichnet die Verwendungen aus dem Katalog.

## Begründung

**Die Wahl im Dialog**, weil sie zu diesem einen Lauf gehört. Eine Einstellung wäre eine
Vorgabe, die man vergisst; im Seitenkopf stünde sie ohne den Zusammenhang, in dem sie etwas
bedeutet.

**Drei Zahlen**, weil sie verschieden viel kosten. Eine Mail kostet nichts, ein Brief kostet
Porto und den Weg zum Briefkasten. Ein Dialog, der nur die Summe nennt, verschweigt die Zahl,
die den Benutzer interessiert.

**Gesperrt statt versteckt**, mit dem Satz des Servers: eine ausgegraute Auswahl ohne Begründung
ist ein Rätsel, und der Benutzer weiss nicht, ob er etwas falsch gemacht hat oder ob etwas
fehlt. Der Satz sagt, was einzurichten wäre.

**Der dritte Abschnitt im Ergebnis**, weil «ausgestellt» und «versandt» hier auseinanderfallen
können. Ohne ihn stünde die Mahnung in der Liste der ausgestellten und niemand wüsste, dass sie
noch gedruckt werden muss.

**Die Spalte «Weg» statt eines Häkchens**, weil es fünf Zustände sind und nicht zwei. *«Kein
Versand protokolliert»* ist der wichtigste davon: er ist der einzige, der eine Handlung verlangt.

**Der Versandstand je Mahnung nachgefragt**, weil er im Postausgang liegt. Eine Spalte auf der
Mahnung wäre eine zweite Wahrheit, die auseinanderläuft, sobald der Postausgang einen Fehlschlag
nachträgt — dieselbe Überlegung, die auch das Backend angestellt hat.

**Nur für die per Mail gegangenen**, weil eine gedruckte Mahnung im Postausgang nichts zu suchen
hat und die Abfrage garantiert leer bliebe.

**Die Einstellungen gesperrt ohne Postausgang**, weil sie sonst etwas verspräche, das nirgends
wirkt.

## Alternativen

**Die Kanalwahl im Seitenkopf, neben dem Stichtag.** Verworfen: der Stichtag verändert die
Liste, der Kanal nicht. Zwei Dinge, die verschieden wirken, gehören nicht nebeneinander.

**Die Kanalwahl als Mandanteneinstellung.** Verworfen: eine Vorgabe, die man einmal setzt und
danach vergisst, ist bei einer nicht zurückholbaren Aussendung das falsche Werkzeug.

**Ein Häkchen «per Mail senden» statt einer Auswahl.** Verworfen: es gibt drei Möglichkeiten,
und der Unterschied zwischen «Mail wo möglich» und «nur Mail» ist genau der, den ein Häkchen
nicht ausdrücken kann.

**Die Kanalspalte im Arbeitsvorrat.** Verworfen: die Liste hat schon sieben Spalten, und der
Kanal ändert sich mit der Wahl im Dialog — eine Spalte, die erst nach dem Öffnen des Dialogs
stimmt, wäre irreführend. Die Aufteilung steht im Dialog, wo sie gebraucht wird.

**Den Versandstand in `DunningNotice` mitliefern.** Verworfen: siehe Begründung.

**Eine eigene Maske für die Mahnadresse.** Verworfen: sie existiert, und zwar in der
Adressmaske, wo alle Verwendungen stehen.

**Den Postausgang-Link nur bei Fehlern zeigen.** Verworfen: «wo kann ich nachschauen» ist auch
dann die Frage, wenn alles geklappt hat.

## Konsequenzen

- **«Mahnungen senden» ist für beide Wege fertig.** Papier über das Sammel-PDF, Mail über den
  Postausgang.
- **Der Freigabedialog ist die einzige Stelle mit einer Kanalwahl.** Der Knopf *Jetzt mahnen* am
  Beleg fragt nicht — er nimmt `AUTO`.
- **`DunningCandidate` trägt jetzt `channel` und `mailAddress`.** Beide nur zur Anzeige; was
  hinausgeht, entscheidet der Server im Moment des Ausstellens neu.
- **Ohne `OUTBOX_SEND` antwortet der Lauf mit 403**, auch beim voreingestellten `AUTO`. Die
  Maske fängt das nicht ab — wer das Recht nicht hat, sieht die Meldung.
- **Der Mahnstopp hat weiterhin keine Maske.**
