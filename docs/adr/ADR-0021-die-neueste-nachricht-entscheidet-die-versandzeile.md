# ADR-0021 — Die Versandzeile am Beleg richtet sich nach der neuesten Nachricht

- **Status:** Angenommen
- **Datum:** 2026-08-28

## Kontext

[ADR-0020](ADR-0020-postausgang-drei-masken-und-ein-splitbutton.md) liess einen Punkt offen: die
Belegmaske sollte sagen, ob zu diesem Beleg schon eine Mail hinausgegangen ist, konnte es aber
nicht — es gab keinen Endpunkt dafür. Der ist inzwischen da:
`GET …/outbox/{kategorie}/{documentId}/messages`, `<KATEGORIE>_READ` und `OUTBOX_READ`,
Antwort **neueste zuerst**.

Damit stellt sich die Frage, die vorher nicht zu beantworten war: **ein Beleg kann mehrere Mails
haben.** Ein Versand, ein zweiter an eine andere Adresse, ein erneutes Senden nach einem Fehler.
Die Kopfzeile hat Platz für eine Zeile.

## Entscheidung

**Die neueste Nachricht entscheidet die Zeile.**

| Neueste Nachricht | Zeile | Farbe |
|---|---|---|
| `SENT` | «Gesendet am 28.08.2026 an kunde@example.ch» | grün |
| `FAILED` | «Versand fehlgeschlagen» | rot |
| `QUEUED` / `SENDING` | «Wartet im Postausgang» | neutral |

Bei mehr als einer hängt `· 3 Mails` an. **Ohne Nachricht steht gar nichts da.**

Die Zeile steht **neben dem Status** und ist ein **Link in den Postausgang**.

Gefragt wird nur, wo der Mandant das Modul betreibt, die Sitzung `OUTBOX_READ` hält **und** der
Beleg ausgestellt ist.

## Begründung

**Die neueste entscheidet, weil eine schlechte Nachricht hinter einer älteren guten zu
verstecken der schlimmere Fehler ist.** Ist nach einem gelungenen Versand ein zweiter
gescheitert, sagt «Gesendet am …» etwas Wahres und lässt das Wichtige weg. Umgekehrt kostet
«Versand fehlgeschlagen» einen Klick in den Postausgang, wo beides steht — und dieser Klick ist
genau der, den jemand in dieser Lage tun soll.

**Ohne Nachricht steht nichts da**, weil die meisten Belege nie per Mail hinausgehen. Ein
dauerhaftes «noch nicht gesendet» wäre eine Zeile auf jedem Lieferschein, den nie jemand
verschicken wollte.

**Neben dem Status**, weil es dieselbe Art von Auskunft ist: wo dieser Beleg gerade steht. Und
als Link, weil die Kopfzeile die Kurzfassung ist — Text, Anhang und der Grund eines Fehlers
stehen im Postausgang.

**Ein Entwurf wird nicht gefragt.** Er kann nicht gesendet worden sein, und eine Anfrage, deren
Antwort feststeht, ist eine Anfrage zu viel.

## Alternativen

**Die neueste **gesendete** Nachricht zeigen und Fehler ignorieren.** Freundlicher zu lesen.
Verworfen: siehe oben — das ist genau das Verstecken.

**Beide zeigen**, «gesendet am … , letzter Versuch fehlgeschlagen». Vollständig. Verworfen: die
Kopfzeile trägt schon Status, Datum, Empfänger und die Nachfolger-Schaltfläche; ein
Nebensatzgebilde dort liest niemand. Der Postausgang ist der Ort für die Vollständigkeit.

**Ein Badge statt einer Zeile.** Verworfen: ein Badge trägt ein Wort, und «gesendet» ohne Datum
und Adresse beantwortet die Frage nicht, die gestellt wird.

**Immer fragen, auch beim Entwurf und ohne Recht.** Einfacher zu schreiben. Verworfen: das sind
Anfragen, die der Server mit 403 oder mit einer leeren Liste beantwortet, auf jeder Belegmaske,
jedes Mal.

## Konsequenzen

- **Der offene Punkt aus ADR-0020 ist geschlossen.** Dessen Abschnitt «Alternativen» beschreibt
  den damaligen Zustand — dass der Endpunkt fehlte — und bleibt als solcher stehen; ADRs werden
  nicht nachträglich geändert.
- **`dispatchNote` liegt in `lib/outbox.ts` und nicht in der Maske**, weil die Regel eine
  Entscheidung ist und keine Darstellung. Acht Testfälle hängen daran, darunter der, um den es
  geht: Fehler nach Erfolg.
- **Der Senden-Dialog macht die Zeile ungültig**, sonst behauptete sie bis zum Neuladen, es sei
  nichts hinausgegangen.
- **Die Zeile sagt nichts über den Empfang.** «Gesendet» heisst: der Mailserver hat sie
  angenommen. Eine Unzustellbarkeitsmeldung wertet niemand aus, und das bleibt so, bis es ein
  Issue dafür gibt.
