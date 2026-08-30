# ADR-0036 — «Mandant» und «Zugang», und warum «Module» flach bleibt

- **Status:** Angenommen
- **Datum:** 2026-08-30
- **Verhältnis:** wendet [ADR-0031](ADR-0031-ordner-ist-registerleiste.md) an und **erfüllt**
  [ADR-0018](ADR-0018-modulliste-in-der-sitzung.md) samt seiner Ortsangabe für «Module».
  [ADR-0020](ADR-0020-postausgang-drei-masken-und-ein-splitbutton.md) bleibt unberührt: das
  Mailkonto wird **kein** Register der Mandantenmaske. Keine der beiden Dateien wird editiert.

## Kontext

Die Gruppe «Systemeinstellungen» zählte nach ADR-0035 noch sechs oberste Zeilen: «Werte»,
«Mandanten», «Postausgang», «Module», «Benutzer», «Rollen», «Sicherheit».

Randbedingungen:

- **Ein `NavFolder` kann ein `module` tragen**, und `allowed` wirft dann den **ganzen** Ordner
  samt Kindern weg.
- ADR-0018 verlangt: «Ein Menüeintrag zu einer Modulmaske darf niemals selbst modulgeschaltet
  sein» — «a screen that hides itself once somebody switches everything off leaves no way back
  but psql». Und es legt den Ort fest: flach, zwischen «Mandanten» und «Benutzer».
- **«Sicherheit» gehört keinem Mandanten.** Es hängt an `/api/login-policy` ohne
  Mandantensegment, trägt kein Recht und nur `superuser: true` (Backend-ADR-0090).
- **Das Mailkonto ist eine Betriebseinstellung des Mandanten**, kein Wert, den ein Modul liest
  (Backend-ADR-0082) — aber es trägt den Modulschalter.

## Entscheidung

**Zwei Ordner und eine flache Zeile**, in dieser Reihenfolge:

| | Kinder |
|---|---|
| **Mandant** (`TENANT_READ`) | Mandanten · Postausgang |
| **Module** | *flach, kein Ordner* |
| **Zugang** (kein Recht) | Benutzer · Rollen · Sicherheit |

**Der Modulschalter bleibt am Kind «Postausgang»**, nie am Ordner.

**«Zugang» trägt kein `permission`.**

## Begründung

**«Module» bleibt flach, und das ist das ganze Argument.** Ein Ordner darf ein `module`
tragen; bekäme «Mandant» je eines, ginge «Module» mit ihm unter — der eine Bildschirm, der
über die Schalter gebietet, verschwände hinter einem Schalter. Am Recht läge es nicht:
`allowed` liest ein `permission` am Ordner gar nicht, und es wäre ohnehin dasselbe Recht
(`MODULE_RIGHTS.read` **ist** `'TENANT_READ'`, weil einen Mandanten aufzusetzen und seine
Module zu schalten derselbe Vorgang ist). Es ist allein der Schalter.

**Die Ortsangabe von ADR-0018 bleibt erfüllt**, ohne dass sie umgeschrieben werden müsste:
`flattenNav` ersetzt einen Ordner **an Ort und Stelle** durch seine Kinder, also steht «Module»
in der aufgelösten Folge weiterhin genau zwischen «Mandanten» und «Benutzer» — und in der
eingeklappten Symbolschiene ebenso.

**Der Modulschalter gehört ans Kind.** Am Ordner läge er auf «Mandanten» mit, und ein Mandant
ohne Mailversand verlöre seine Stammdaten.

**«Zugang» trägt kein Recht, weil ein Recht dort auf zwei Wegen schadet.** Wanderte das Recht
von den Kindern an den Ordner, winkte `mayOpen` die Kinder durch, und eine Sitzung ohne jedes
Recht sähe «Benutzer» und «Rollen». Lernte `allowed` eines Tages Ordnerrechte zu prüfen, fiele
«Zugang» für eine rechtlose Sitzung weg — und mit ihm «Sicherheit», das an keinem Recht hängt,
sondern am Superuser-Flag. Ein Superuser wäre aus seinem eigenen Bildschirm ausgesperrt.

**«Mandant» trägt `TENANT_READ` trotzdem** — als Dokumentation, wie «Werte» sein `MASTER_DATA`.
Der Unterschied zu «Zugang» ist kein Widerspruch, sondern genau der Fall: bei «Mandant» ist es
das Recht, das beide Kinder ohnehin voraussetzen, bei «Zugang» gibt es kein solches Recht.

## Alternativen

**«Module» als Register unter «Mandant».** Verworfen: der Eintrag teilte die Modulfolge seines
Wirts, und das verbietet ADR-0018 wörtlich.

**«Sicherheit» unter «Mandant».** Verworfen: Installation gegen Mandant. Die Maske hängt an
`/api/login-policy` und unter keinem `RequireTenant`; Backend-ADR-0090 sagt, warum ein
Mandantenadministrator nicht entscheiden darf, wie sich alle anderen anmelden.

**Ein Recht am Ordner «Zugang».** Verworfen, siehe oben — auf beiden Wegen falsch.

**Das Mailkonto als Register der Mandantenmaske.** Verworfen und bereits in ADR-0020
verworfen: es ist ein eigener Bildschirm mit eigenem Recht und eigenem Modulschalter.

**Alle vier stehen hier, damit sie in einem Jahr nicht erneut vorgeschlagen werden.**

## Konsequenzen

- Die Gruppe zählt **vier oberste Zeilen** statt zwölf vor der Reihe: «Werte», «Mandant»,
  «Module», «Zugang» — mit vierzehn gefalteten Kindern.
- **52 Bildschirme, vorher wie nachher.** Die eingeklappte 64-Pixel-Schiene löst über
  `flattenNav` weiterhin jeden einzeln auf.
- Nach dem Abschalten von OUTBOX steht «Mandant» mit einem Kind da, «Module» unverändert
  daneben.
- Ein Superuser ohne Mandantenrecht sieht zwei Zeilen — «Dashboard» und «Zugang» — und landet
  über den Ordnerkopf auf `/sicherheit`.
- Nichts umbenannt, nichts umgeleitet: die zwanzig `originState`-Setzstellen hängen an
  Beschriftung und Adresse von **Bildschirmen**; ein Ordner nennt nur ihren Platz.
- `navGroupsKeepTheModuleScreenFlatBetweenTheFoldersTest` hält die vier Zeilen und die flache
  Modulzeile fest — wer eines Tages «aufräumt» und sie einfaltet, bekommt ihn rot.
