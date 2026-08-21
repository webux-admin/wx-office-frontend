# ADR-0006 — Kopfdaten sind am Entwurf änderbar, der Kundenwechsel fragt nach den Preisen, und die Neuanlage beginnt beim Kunden

- **Status:** Angenommen
- **Datum:** 2026-08-22
- **Verhältnis:** [ADR-0001](ADR-0001-auswahlwerte-aus-der-api.md) gilt hier vollständig — auch
  Sprache, Währung und Zahlungskondition eines Belegs kommen aus der API, nicht aus einer
  Tabelle im Browser. [ADR-0003](ADR-0003-speichern-schliesst-die-maske.md) bleibt unberührt:
  die Auftragsmaske ist eine Arbeitsfläche, keine Speichern-und-Schliessen-Maske.
- **Backend:** setzt `PUT /{belege}/{id}/header` und `GET /{belege}/defaults` voraus, dazu die
  Währung am Partner.

## Kontext

Am Entwurf eines Auftrags liess sich alles ändern — ausser dem, was oben drauf steht. Wer sich
im Kunden vertan hatte, löschte den Entwurf und schrieb ihn neu, samt allen Positionen. Sprache,
Währung und Belegdatum standen nach dem Anlegen fest, obwohl der Beleg noch keine Nummer
gezogen hatte und rechtlich noch gar nicht existierte.

Die Neuanlage fragte in der falschen Reihenfolge: zuerst Belegart, Datum und **Währung**, dann
erst den Kunden. Die Währung ist aber eine Eigenschaft des Kunden, und die Maske liess sie den
Benutzer raten. Ebenso Sprache und Zahlungskondition: beide leitet das Backend beim Anlegen aus
dem Kunden ab, und die Maske zeigte davon nichts.

Dazu stand auf der Auftragsmaske eine Sektion **Absender** — die eigene Firmenadresse, auf jedem
Beleg dieselbe, direkt neben dem Empfänger. Sie beantwortete keine Frage, die jemand vor dem
Bildschirm hat.

## Entscheidung

**Die Absender-Sektion verschwindet aus der Oberfläche.** Im Backend bleibt der
`issuer`-Snapshot unangetastet: `DocumentRules` verlangt den Ausstellernamen, MWSTG Art. 26
Abs. 2 lit. a verlangt Name, Ort und UID des Leistungserbringers, und der Druck liest ihn bei
jedem Nachdruck. `SalesDocument.issuer` bleibt darum in `lib/types.ts` stehen, auch wenn keine
Maske ihn mehr zeichnet.

**Der Entwurf bekommt eine Sektion «Kopfdaten»** — Belegdatum, Sprache, Währung,
Umrechnungskurs, Kursdatum — die über `PUT /{id}/header` speichert. Ausgestellt zeigt dieselbe
Sektion dieselben Werte, nur ohne Knopf und ohne Eingabe.

**Ein Währungswechsel bepreist die Katalogpositionen neu, ohne Rückfrage.** Ein Betrag von 150
in einer anderen Währung ist ein anderer Betrag; ihn zu «behalten» hiesse, ihn umzuetikettieren.
Die Maske sagt das am Feld, und das Backend lehnt die andere Kombination ohnehin ab.

**Der Kundenwechsel ist ein Dialog** an der Empfänger-Sektion und fragt zwei Dinge:

- **Preise** — «Neu bepreisen» ist die Vorgabe. Ein anderer Kunde hat eine andere Preisliste,
  und ein Entwurf, der stillschweigend die Preise des vorherigen behält, ist der Fehler, den
  niemand vor dem Versand findet. «Beträge behalten» bleibt wählbar, denn es kommt vor, dass die
  Beträge so ausgehandelt wurden.
- **Währung** — rechnet der neue Kunde in einer anderen Währung, bietet der Dialog ein
  Ankreuzfeld «Beleg in EUR führen» an, angekreuzt. Das spiegelt die Auflösung, die das Backend
  beim Anlegen macht (ausdrückliche Angabe → Währung des Kunden → Basiswährung des Mandanten).
  Ist es angekreuzt, **ist «Beträge behalten» nicht anwählbar** — die Option bleibt in der Liste
  stehen, deaktiviert, und darunter steht warum.

**Freie Positionen werden vor dem Absenden namentlich genannt.** Neu bepreisen holt nur
Katalogzeilen aus der Preisliste; eine von Hand eingegebene Zahl kann niemand neu berechnen. Der
Hinweis nennt die Zeilennummern — «Die Positionen 2 und 4 sind von Hand geschrieben …» — und
steht dort, wo entschieden wird. Das Backend meldet dazu nichts, und das ist richtig: es tut
genau, was es soll.

**Die Zahlungs-Sektion ist am Entwurf änderbar**, über den bereits bestehenden Endpunkt
`PUT /{id}/payment`. Es brauchte dafür keinen neuen; die Maske hat ihn schlicht nie aufgerufen.

**Die Neuanlage wird umgedreht: erst Belegart und Kunde, dann alles andere.** Sobald beide
stehen, holt die Maske `GET /{belege}/defaults?documentTypeId=&partnerId=` und zeigt, womit der
Entwurf beginnt: Empfängeradresse samt Verwendung, Sprache, Währung, Zahlungskondition. Alle
Felder bleiben änderbar. Die Maske rechnet nichts davon selbst aus.

**Die Partnermaske bekommt ein Feld «Währung»**, nach dem Muster der übrigen
Stammdatenverweise. Die **Kreditlimite bleibt in der Buchführungswährung des Mandanten** — das
steht seit diesem Schritt als Hinweis am Feld, weil es mit einer Währung am Partner sonst
zweideutig wird.

## Begründung

**Sprache und Zahlungskondition passen nicht in `CreateDocumentRequest`.** Die Payload zum
Anlegen kennt Belegart, Kunde, Datum, Währung und Kurs — sonst nichts. Eine geänderte Sprache
oder Kondition wird deshalb unmittelbar nach dem Anlegen auf den frischen Entwurf angewandt,
über dieselben zwei Endpunkte, die die Entwurfsmaske dafür benutzt. Bis zu drei Requests für
einen Entwurf sind der Preis dafür, dass die Vorgaben schon in der Neuanlage sichtbar und
änderbar sind. Damit ein abgelehnter Nachtrag nicht beim zweiten Versuch einen zweiten Entwurf
erzeugt, merkt sich die Maske die Nummer des angelegten Belegs und schickt nur nach, was noch
aussteht.

**Nur geänderte Felder gehen raus.** `PUT /header` lässt weg, was nicht genannt wird. Würde die
Maske den Kunden unverändert mitschicken, zöge das Backend die Adresse erneut aus den
Stammdaten — und ein Entwurf, der vor dem Umzug des Kunden geschrieben wurde, zöge stillschweigend
mit um (ADR-0019 im Backend).

**Lokaler Formularzustand wird über `key` zurückgesetzt, nicht über einen Effekt.** Ein
Kundenwechsel schreibt Sprache und Zahlungskondition am Beleg neu; die Sektionen, die diese
Werte bearbeiten, halten das Getippte in `useState`. Beide bekommen einen Schlüssel über die
gespeicherten Werte (`headerKey`, `paymentKey`) und werden dadurch neu aufgebaut, sobald sich am
Beleg etwas davon ändert. Kein zweiter Zustand, kein Effekt, der synchronisiert.

**Eine Auswahlliste mit deaktivierter Option statt einer Radiogruppe.** Eine Option, die
verschwindet, sieht nach fehlender Funktion aus; eine, die dasteht und nicht anwählbar ist, sieht
nach einer Regel aus — und die Regel steht darunter. Ausserdem gibt es in `components/` keine
Radiogruppe, und für zwei Werte eine einzuführen wäre Aufwand ohne Gewinn.

## Alternativen

**Die Währung des neuen Kunden still übernehmen.** Verworfen: dann ändert ein Kundenwechsel den
Beleg an einer Stelle, nach der niemand gefragt hat. Das Ankreuzfeld kostet eine Zeile und macht
den Wechsel zu einer Entscheidung statt zu einer Überraschung.

**Den Währungswechsel ganz aus dem Dialog heraushalten** und nur in den Kopfdaten zulassen.
Verworfen: dann wechselt man den Kunden, bekommt neue Preise in der falschen Währung, und
bepreist im zweiten Schritt ein zweites Mal neu.

**Auch bei einer Datumsänderung nach den Preisen fragen.** Preise haben seit ADR-0035 im
Backend einen Gültigkeitszeitraum, ein anderes Belegdatum kann also andere Preise bedeuten.
Verworfen für diesen Schritt: der Auftrag lautete auf Kunde und Währung, und eine dritte
Preisfrage an einer Stelle, an der man nur ein Datum korrigiert, macht die Maske zäh. Wer neu
bepreisen will, wechselt den Kunden auf denselben Kunden — das geht heute nicht, und deshalb
steht das hier als offener Punkt und nicht als erledigte Sache.

**Sprache und Zahlungskondition erst im Entwurf anbieten**, nicht schon in der Neuanlage.
Verworfen: der Auftrag verlangt ausdrücklich, dass die vorbelegten Felder änderbar bleiben, und
eine Vorbelegung, die man nur anschauen darf, ist eine Anzeige, keine Vorbelegung.

**Die Vorgaben im Browser zusammensetzen** — Sprache aus dem Partner, Währung aus Partner oder
Mandant, Adresse nach Verwendung der Belegart. Verworfen: das wäre eine zweite Auflösungslogik
neben der des Backends, die genau so lange stimmt, bis sich dort eine Regel ändert.

## Konsequenzen

**`OrderPage.tsx` teilt sich auf.** Die Kopfdaten-, Zahlungs- und Kundenwechsel-Teile liegen in
`pages/order/`, die reine Formularlogik in `pages/order/headerForm.ts`. Die Seite selbst zeichnet
noch Kopfzeile, Positionen, Texte, Empfänger und Verlauf.

**Die drei neuen Bausteine sind nicht auftragsspezifisch.** Sie bekommen den Pfad des Belegs als
`base` und heissen nur deshalb «Order…», weil es bisher nur die Auftragsmaske gibt. Die Masken
für Offerte und Rechnung übernehmen sie unverändert.

**Ein Beleg ohne Empfängeradresse ist jetzt gestaltet**: die Empfänger-Sektion zeigt dann einen
Satz statt gar nichts, damit der Knopf «Kunde wechseln» erreichbar bleibt.

**Nicht umgesetzt:** Ein Entwurf lässt sich nicht auf denselben Kunden neu bepreisen — der
Dialog wechselt den Kunden, und derselbe Kunde ist für das Backend kein Wechsel. Der
Umrechnungskurs wird nicht vorgeschlagen; wer auf eine Fremdwährung wechselt, trägt ihn selbst
ein, sonst weist das Backend die Änderung zurück. Und die Kundenliste in beiden Masken ist eine
Auswahlliste über bis zu 200 Einträge; darüber hinaus braucht es eine Suche, wie überall sonst
in dieser Anwendung auch.
