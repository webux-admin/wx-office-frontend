# ADR-0022 — Der zweite Faktor ist ein Register im eigenen Konto, und der zweite Anmeldeschritt bleibt auf der Anmeldeseite

- **Status:** Angenommen
- **Datum:** 2026-08-28

## Kontext

Das Backend kann seit ADR-0087 und ADR-0089 einen zweiten Faktor: TOTP aus einer
Authenticator-App, wahlweise ein Code per E-Mail, dazu zehn Wiederherstellungscodes und ein
zweistufiger Anmeldeweg. Nichts davon ist bedienbar.

Randbedingungen:

- **Der zweite Faktor ist eine Einstellung des Benutzers, kein Modul des Mandanten.**
  `user_second_factor` trägt kein `tenant_id`, und es gibt keine Mandantenrichtlinie.
- **`ProfilePage` trägt heute zwei `Panel` untereinander** — Passwort ändern und Rechte im
  aktiven Mandanten — auf 129 Zeilen.
- **`components/Tabs.tsx` ist da** und wird in `ProductPage`, `PartnerPage`, `TenantPage` und
  der Belegmaske benutzt.
- **[ADR-0005](ADR-0005-belegart-als-vollmaske.md) hält fest:** «Das Register bleibt lokaler
  Zustand, wie `Tabs` es überall in diesem Projekt hält: eine Adresse je Datensatz, nicht je
  Register.»
- **Zwischen den beiden Anmeldeschritten gibt es keine Sitzung.** Ein geschützter Endpunkt
  antwortet 401, und der schwebende Zustand lebt fünf beziehungsweise zehn Minuten in der
  HTTP-Session des Servers.
- **Die Wiederherstellungscodes gibt es genau einmal zu sehen.** Danach sind sie nur noch neu
  zu erzeugen, und das entwertet die alten.
- **Die Antwort des ersten Schritts trägt nichts über das Konto** — keinen Namen, keine
  Adresse. Das ist Absicht.

## Entscheidung

**Der zweite Faktor sitzt als Register «Zwei-Faktor» im eigenen Konto** (`/profil`), zwischen
«Passwort» und «Rechte». Kein Eintrag in der Seitenleiste, kein `NavModule`-Wert, kein
Modulschalter, keine Mandantenrichtlinie. In `navigation.ts` ändert sich nichts.

**Das offene Register steht in der Adresse**, als `?register=zwei-faktor` — abweichend von
ADR-0005 und nur hier.

**Der zweite Anmeldeschritt bleibt auf der Anmeldeseite**, als Zustand von `LoginPage`, nicht
als eigene Route.

**Sechs Ziffern senden sich selbst ab**, einmal je Code. Darunter steht offen «Ich habe keinen
Zugriff auf meine App» und öffnet das Feld für einen Wiederherstellungscode.

**Die Wiederherstellungscodes verlangen eine Bestätigung**: «Weiter» bleibt gesperrt, bis das
Kästchen «Ich habe die Codes gesichert» gesetzt ist. Daneben «Herunterladen» und «Drucken».

**Die Anmeldeseite nennt keine Adresse**, auch keine verkürzte.

**Der Zähler bis zum nächsten Mailcode läuft im Browser**, sechzig Sekunden, als Text.

**Die Benutzerverwaltung zeigt den Zustand und kann zurücksetzen**, in einem eigenen Panel
unter `USER_TWO_FACTOR_RESET`, mit Rückfrage. **Keine Spalte in der Benutzerliste** — siehe
Konsequenzen.

## Begründung

**Ins eigene Konto, weil es dem Benutzer gehört.** Ein Modulschalter wäre die Aussage, dass ein
Mandant darüber verfügt; eine Seitenleisten-Seite die Aussage, dass es eine Verwaltungsaufgabe
ist. Beides stimmt nicht: ein Benutzer richtet ein, was er will, und niemand schreibt es ihm
vor.

**Register statt eines vierten Panels**, weil ein QR-Code, zwei Einrichtungswege und zehn
Wiederherstellungscodes unter dem Passwortformular aus einer kurzen Seite eine Rolle machen.
Die beiden bestehenden Panels bleiben unverändert — ein Test hält fest, dass sie beide
erreichbar sind und dasselbe zeigen.

**Die Adresse trägt das Register, obwohl ADR-0005 das Gegenteil sagt — und der Unterschied ist
der Datensatz.** ADR-0005 begründet seine Regel mit «eine Adresse je Datensatz»: die Belegmaske
wird über ihren Beleg erreicht, und das Register, auf dem jemand sie verlassen hat, ist keine
zweite Adresse wert. Das eigene Konto hat **keinen Datensatz**, auf dessen Adresse ein Register
mitreiten könnte, und es ist der einzige Bildschirm, auf den von aussen gezeigt werden soll:
«richten Sie Ihren zweiten Faktor ein» muss irgendwo landen können. Deshalb `?register=…` und
`replace` statt `push` — der Zurück-Knopf gehört dem Bildschirm, von dem jemand kam.

**Der zweite Anmeldeschritt auf derselben Seite, weil eine eigene Route ein Lesezeichen wäre.**
Sie funktionierte nur mit schwebendem Zustand in der Session; wer sie speichert und morgen
öffnet, steht vor einem Codefeld ohne Anmeldeversuch dahinter. Als Zustand der Anmeldeseite
gibt es diesen Fall nicht — und ein Neuladen landet richtigerweise wieder beim Passwort.

**Selbst absenden, weil niemand nach einer sechsstelligen Zahl noch einen Knopf sucht.** Der
Schutz davor ist die eigentliche Arbeit: ohne ihn feuerte jeder Tastendruck jenseits der
sechsten eine weitere Anfrage, und fünf davon verbrauchen den Versuchszähler des Servers.

**Der Weg für das verlorene Telefon steht offen da und nicht hinter «Probleme?».** Wer ihn
braucht, steht um sieben Uhr morgens mit einem neuen Telefon da und hat keine Geduld für eine
Suche.

**Die Wiederherstellungscodes brauchen ein Kästchen, weil sie einmal existieren.** Ein Dialog,
den man wegklicken kann, wird weggeklickt. Wer das hier tut, merkt es erst beim nächsten
Telefonverlust — und dann muss die Verwaltung ran. Ein Kästchen ist die kleinste Hürde, die
diesen Moment zu einer Entscheidung macht.

**Keine Adresse auf der Anmeldeseite, auch keine verkürzte.** Das Issue schlug
`a••••@example.ch` vor. Der Server sendet die Adresse gar nicht — die Antwort des ersten
Schritts trägt bewusst nichts über das Konto (ADR-0087) —, und das ist die bessere Antwort:
auch `a••••@example.ch` verrät auf einer offenen Seite die erste Stelle und die Domäne einer
fremden Mailadresse. «An die hinterlegte Adresse» sagt genug, um zu wissen, wo man nachschaut.

**Der Zähler läuft im Browser, weil der Server schweigt.** Er lehnt einen zweiten Code
innerhalb einer Minute ab und antwortet trotzdem 204 (ADR-0089). Ohne sichtbaren Zähler
entdeckt jemand die Sperre, indem er dreimal drückt und nichts geschieht.

**Kein Weg, einen Faktor für jemand anderen einzurichten.** Ein zweiter Faktor, den eine
Administration eingerichtet hat, ist ein zweiter Faktor, den eine Administration passieren
kann.

## Alternativen

**Ein eigener Bildschirm «Sicherheit» in der Seitenleiste.** Sichtbarer. Verworfen: die
Seitenleiste ist nach Mandantenarbeit geordnet, und das eigene Konto hängt seit jeher am
Benutzermenü. Ein Eintrag dort wäre der einzige, der nicht dem Mandanten gehört.

**Eine eigene Route `/anmelden/code` für den zweiten Schritt.** Sauber trennbar, testbar,
verlinkbar. Verworfen: verlinkbar ist hier ein Nachteil — siehe oben.

**Das Register als lokaler Zustand, wie überall sonst.** Regelkonform nach ADR-0005. Verworfen:
dann gibt es keine Adresse, auf die eine Hilfe oder eine spätere Aufforderung zeigen könnte,
und der einzige Grund für die Regel — «eine Adresse je Datensatz» — trifft auf eine Seite ohne
Datensatz nicht zu.

**Die Wiederherstellungscodes nur anzeigen, ohne Bestätigung.** Weniger Klicks. Verworfen: der
eine Klick steht zwischen jemandem und einem Anruf bei der Administration in sechs Monaten.

**Den Faktor beim Anmelden erzwingen, wenn keiner eingerichtet ist.** Wirksam. Verworfen: das
wäre eine Richtlinie, und die gehört an den Mandanten — sie ist ausdrücklich nicht Teil dieser
Reihe.

**Eine Spalte «2FA» in der Benutzerliste.** Im Issue vorgesehen. Verworfen, siehe unten.

## Konsequenzen

- **Die Benutzerliste bekommt die Spalte nicht.** `GET /api/users` liefert die Benutzer eines
  Mandanten **ungeteilt**, und `UserDto` trägt den Zustand des zweiten Faktors nicht. Die
  einzige Auskunft ist `GET /api/users/{id}/two-factor`, also **eine Anfrage je Zeile** — auf
  einem Listenbildschirm, der zum Überfliegen da ist, und mit einer Rechteprüfung je Aufruf.
  Das ist der falsche Preis für ein Abzeichen. Der Zustand steht auf der Benutzerseite, wo er
  eine Anfrage kostet. Ein Feld in `UserDto` wäre die richtige Lösung und ist ein
  Backend-Issue, das dieses Issue ausschliesst.
- **`AuthState` wächst um zwei Mitglieder**, und damit sind 26 Testdoppel gewachsen. Ein
  gemeinsamer Baustein für diese Doppel wäre die Antwort, wenn das dritte Mal kommt.
- **`signIn` gibt jetzt ein `SignInResult` zurück statt eines Benutzers.** Alle Aufrufer
  müssen den dritten Ausgang behandeln; es gibt genau einen.
- **Zwischen den Schritten bleibt `user` `null`.** Ein Test hält das fest — es ist dieselbe
  Zusicherung, die das Backend mit 401 gibt, nur von der anderen Seite.
- **Die Demokonten der Anmeldeseite sind unberührt** und haben keinen zweiten Faktor. Sie
  sollen auch keinen bekommen: sie sind dafür da, mit einem Klick hineinzukommen.
- **Der QR-Code wird als SVG aus dem Backend eingesetzt** (`dangerouslySetInnerHTML`). Er
  kommt aus der eigenen Anwendung und enthält keinen fremden Text; ein Bild daraus zu bauen
  hiesse, einen zweiten Kodierer im Browser zu haben.
- **Kein Code und kein Geheimnis landet in `localStorage`, in einer Adresse oder in einem
  Protokoll.** Der Zustand des zweiten Anmeldeschritts lebt in React und stirbt mit der Seite.
