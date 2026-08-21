# ADR-0005 — Die Belegart wird eine Vollmaske, und die Verbindung zur Druckvorlage steht in beiden Listen

- **Status:** Angenommen
- **Datum:** 2026-08-21
- **Verhältnis:** [ADR-0003](ADR-0003-speichern-schliesst-die-maske.md) gilt hier
  vollständig. [ADR-0004](ADR-0004-navigation-mit-submenues.md) wird um einen Ordner
  *Belegwesen* **ergänzt**, nicht abgelöst.

## Kontext

Belegarten und Druckvorlagen gehören fachlich zusammen — eine Belegart druckt auf einer
Vorlage —, und in der Oberfläche sah man davon nichts.

**Auf der Belegarten-Seite** war die Vorlage an genau einer Stelle sichtbar: als Dropdown
im Bearbeiten-Dialog. Die Liste zeigte Code, Bezeichnung, Kategorie, Präfix, Ausfertigungen,
Adresse und Status — die Vorlage nicht. Von acht einstellbaren Werten fehlten drei in der
Tabelle (Druckvorlage, Vorgängerbelege, Preise beim Kopieren), und einer stand darin, ohne
einstellbar zu sein (Adresse — sie folgt aus der Kategorie).

**Auf der Druckvorlagen-Seite** fehlte die Gegenrichtung ganz. Eine Vorlage, auf der alle
Rechnungen laufen, sah aus wie eine, die niemand gewählt hat.

**Der Dialog selbst** war der grösste der Anwendung und der einzige, der `wide` nicht
gesetzt hatte: 440 px für acht Feldgruppen, darunter zwei Listen mit bis zu neun
beziehungsweise zehn Zeilen, alles einspaltig, ohne Register.

Dazu zwei kleinere Fundstücke: der Knopf «+ Vorlage» legte keine Vorlage an, sondern
kopierte die alphabetisch erste; und wer nur `PRINT_LAYOUT_READ` hatte, kam nie an das
Aussehen einer Vorlage heran, weil die einzige Vorschau im Designer sass, der ganz hinter
`PRINT_LAYOUT_WRITE` liegt.

## Entscheidung

**Die Belegart wird eine Vollmaske** unter `/belegarten/:id` (`neu` legt an), nach dem
Muster von `ProductPage` und `PartnerPage`: `PageHeader` mit Rückweg, drei Register,
`Panel` je Abschnitt.

- **Hauptdaten** — Kategorie, Code, Bezeichnung, Präfix, dazu ein Panel *Aus der Kategorie*,
  das Adressverwendung und «Maske im Frontend» als Lesewerte zeigt statt als Spalte, die wie
  eine Einstellung aussieht.
- **Druck** — die Druckvorlage mit Code, Herkunft, Zustand, dem Satz «Wird ausserdem benutzt
  von …», einem Musterbeleg als PDF und dem Weg zur Vorlage selbst: bei einer selbst
  gestalteten der Sprung in den Designer, bei einer mitgelieferten «Zum Gestalten kopieren» —
  denn eine mitgelieferte Vorlage hat keine Zeichnung, die sich öffnen liesse, und ein
  Speichern darauf lehnt das Backend ab. Darunter die Ausfertigungen, mit Pfeilen sortierbar.
- **Übernahme** — die Vorgängerbelege, ebenfalls sortierbar, und was eine Kopie mit den
  Preisen macht.

**Beide Listen zeigen die Beziehung**, jede in ihre Richtung: die Belegarten-Liste eine
Spalte *Druckvorlage* (Bezeichnung und Code), die Druckvorlagen-Liste eine Spalte *Verwendet
von* mit den Namen der Belegarten als Links.

**Die drei Bildschirme eines Belegs stehen im Seitenleisten-Ordner *Belegwesen***:
Belegarten, Druckvorlagen, Nummernkreise. Der Ordner hat kein eigenes Recht — die Shell
filtert die Kinder einzeln nach ihrem.

**«+ Vorlage» öffnet einen Dialog, der wirklich anlegt**: mit «Vorlage übernehmen von» und
der Möglichkeit «Leere Standardanordnung».

## Begründung

**Register gibt es in diesem Projekt nur auf Vollseiten.** `Tabs` steht heute ausschliesslich
in `ProductPage`, `PartnerPage` und `TenantPage`. Ein 1040-px-Dialog mit Registern, Panels
und einer Seitenleiste ist eine Vollmaske mit Backdrop — dann lieber die Vollmaske, die es
schon gibt, samt Deep-Link, Zurück-Knopf und Öffnen im neuen Tab.

**Die Spalten sind die eigentliche Antwort auf die Beschwerde.** Sie beantworten «welche
Belegart druckt worauf» und «wen trifft eine Änderung an dieser Vorlage», bevor irgendetwas
geöffnet wird. Die Maske ist die zweite Hälfte; ohne die Spalten bliebe die Frage bestehen.

**Ein Speichern-Knopf, kein Speichern je Register.** `PUT /document-types/{id}` ist ein
Vollersatz: ein weggelassenes Feld behält seinen Wert nicht, es setzt ihn zurück.
`toPayload()` schickt deshalb immer das vollständige Objekt, und das steht als Kommentar in
`documentTypeForm.ts`.

**Die Vorschau ist ein Lese-Endpunkt.** Wer sehen darf, welche Vorlagen es gibt, darf auch
sehen, wie sie aussehen — sonst wählt man sie in der Belegart blind aus. Der Endpunkt kennt
die Belegart und richtet den Musterbeleg danach: ein Lieferschein zeigt keine MwSt, die er
nie druckt.

## Alternativen

**Breiter Dialog mit Registern und einer festen Vorlagen-Leiste rechts.** Der Wunsch, aus
dem diese Arbeit entstand, lautete «gegebenenfalls ein breiteres Fenster». Verworfen nach
Rückfrage: `Dialog.tsx` hätte eine dritte Grösse gebraucht, was acht bestehende Aufrufstellen
anfasst, und das Ergebnis wäre eine Vollmaske ohne deren Vorteile gewesen.

**Master-Detail: Belegarten links, Einstellungen und Vorlage rechts.** Verworfen: es gibt im
ganzen Baum kein solches Layout, und ein Bildschirm, auf den niemand verlinken kann, bricht
ADR-0003.

**Eine Miniatur der Vorlage im Register «Druck».** Verworfen: ein zweiter Renderer für
Daten, die `DesignCanvas` schon zeichnet, und die Frage «welche Anordnung ist das»
beantwortet der Name der Vorlage bereits. Der PDF-Knopf zeigt statt einer Andeutung das
echte Druckbild.

**Die Beziehung im Browser zusammensetzen**, statt sie vom Server auflösen zu lassen.
Verworfen — die Begründung steht im Backend-ADR-0037: Belegarten und Vorlagen haben
getrennte Rechte, und ein Client-Join verlangt beide.

## Konsequenzen

**«+ Belegart» ist ein Seitenwechsel statt eines Dialogs.** Der Preis der Vollmaske.

**Das Register bleibt lokaler Zustand**, wie `Tabs` es überall in diesem Projekt hält: eine
Belegart wird über ihren Datensatz erreicht, nicht über das Register, auf dem sie zuletzt
stand.

**Der Designer kennt jetzt einen zweiten Rückweg.** Aus der Belegart geführt zeigt er «‹
Auftrag» statt «‹ Druckvorlagen», über `originState`.

**Nicht umgesetzt:** Es gibt weiterhin kein Reaktivieren für eine deaktivierte Belegart oder
Vorlage. Der Designer verliert ungespeicherte Änderungen bei Navigation innerhalb der
Anwendung — `useBlocker` verlangt einen Data Router, `App.tsx` benutzt `BrowserRouter` mit
`<Routes>`. Und die Vorschau vervielfältigt die Ausfertigungen nicht und zeigt keinen
QR-Zahlteil, weil `PrintoutSamples` keinen mitgibt.
