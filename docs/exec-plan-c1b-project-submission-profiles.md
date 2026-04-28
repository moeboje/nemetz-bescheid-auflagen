# Umsetzungsplan C1b: Einreichprofile am Projekt

## Kurzfassung
- C1b ist eine additive Erweiterung der bereits serverseitig persistierten Domäne `projects`; es ist keine neue Persistenzphase.
- C1a `Project.status` bleibt unverändert bestehen; C1b ergänzt dazu fachliche Einreichprofile als getrenntes Konzept.
- C1b baut nur die fachliche und technische Grundlage für spätere Checklisten-, Vorlagen- und Modulaktivierung auf.
- Empfohlenes Zielmodell: kontrollierte Profil-Stammdaten plus Projekt-zu-Profil-Zuordnung, fachlich geführt als `ein Basisprofil + optionale Zusatzprofile`.

## 1. Zielbild
- Einreichprofile beschreiben den fachlichen Einreichkontext eines Projekts, nicht dessen Reifegrad.
- Der bereits eingeführte Projektstatus beschreibt weiterhin den Bearbeitungs- und Verfahrensstand des Projekts.
- Status und Profile bleiben getrennt, weil sich ein Status im Projektverlauf mehrfach ändern kann, ohne dass sich der fachliche Zuschnitt des Projekts ändert.
- Profile sind die spätere Grundlage dafür, Checklistenmodule, Vorlagenpakete und Zusatzlogik gezielt an einem Projekt zu aktivieren.
- C1b soll Mischfälle sauber vorbereiten: `GEWERBE`, `GEWERBE + AWG`, `GEWERBE + AWG + UVP_UVE`.

## 2. Nicht-Ziele
- Keine Checklisten-Engine.
- Keine Dokumentpflichtlogik.
- Keine Verantwortlichkeits- oder Fälligkeitslogik pro Checklistenpunkt.
- Keine automatische Rechtsprüfung.
- Keine direkte Umsetzung von UVP-Fachmodulen im UI.
- Keine direkte Template-Ausführung oder Laufzeitzuweisung im Portal.
- Keine Destabilisierung bereits serverseitig migrierter Domänen.

## 3. Fachliches Modell
- `SubmissionProfile` ist das fachliche Stammdatum für ein Einreichprofil.
- `ProjectSubmissionProfileAssignment` ist die Zuordnung zwischen Projekt und Profil.
- `SubmissionProfile` braucht konzeptionell mindestens `key`, `label`, `profileType`, `isActive`, optional `sortOrder`.
- `profileType` soll mindestens `BASE` und `ADDON` unterscheiden.
- Ein Projekt soll fachlich mehrere Profile gleichzeitig tragen dürfen, aber im MVP maximal ein `BASE`-Profil und beliebig viele `ADDON`-Profile.
- Für C1b genügen zunächst die stabilen Keys `GEWERBE`, `AWG`, `UVP_UVE`.
- Spätere Checklistenlogik soll nicht direkt am Status hängen, sondern aus den zugeordneten Profilen bzw. deren stabilen Keys Modulpakete ableiten.

## 4. Empfohlenes Profilmodell
- Einzelwert pro Projekt wird nicht empfohlen; er bildet die geforderten Mischfälle nur künstlich über zusammengesetzte Sonderwerte ab.
- Mehrfachzuordnung wird empfohlen, weil sie das gewünschte Basismodell `GEWERBE + optionale Zusatzprofile` direkt abbildet.
- Reine Enum-Werte am `Project` sind nicht empfohlen, weil spätere Labels, Aktivstatus, Sortierung und Erweiterungen unnötig an Schemaänderungen gekoppelt würden.
- Empfohlen ist eine kontrollierte Stammdatenstruktur mit serverseitig gepflegten, stabilen Keys; nicht frei editierbar im Admin-MVP, aber technisch erweiterbar.
- MVP-Empfehlung: `GEWERBE` als einziges `BASE`-Profil, `AWG` und `UVP_UVE` als `ADDON`.
- Begründung: Das ist fachlich nah an der Produktidee, vermeidet einen späteren Modellbruch und hält die erste UI trotzdem einfach.

## 5. Legacy- und Migrationsstrategie
- Bestehende Projekte sollen nicht zwangsweise nachklassifiziert werden.
- Historische Projekte dürfen zunächst ohne Profile bleiben und werden fachlich als neutral behandelt.
- Neue interaktiv angelegte Projekte sollen standardmäßig `GEWERBE` erhalten.
- Bestehende Importdateien oder Altbestände ohne Profilfeld sollen weiterhin akzeptiert werden und leer bleiben.
- Sichere MVP-Strategie: additive Schema-/API-Erweiterung, kein Backfill alter Projekte, keine Massenzuordnung, keine automatische Migration fachlicher Altannahmen.

## 6. Technisches Modell (konzeptionell)
- Technisch wird ein Join-Modell empfohlen, nicht ein einzelnes Feld am `Project`.
- Das bestehende `Project`-Modell bleibt die Aggregate-Wurzel; Profile werden als zugeordnete Stammdatensätze ergänzt.
- Spätere Projekt-API soll mindestens `submissionProfileKeys: string[]` lesen und schreiben können; optional zusätzlich ein aufgelöstes `submissionProfiles`-Array für Labels und Typen.
- Zusätzlich wird später ein read-only Endpunkt für verfügbare Profilstammdaten erwartet.
- Betroffen sind später nur bestehende Projekt-Schnittstellen: Prisma-Schema, Projekt-Route, `api/projects`, `ProjectsStore`, `ProjectModal`, `ProjectDetailPage`, optional `ProjectsPage`, Import/Export und Admin-Bulk-Flows.
- Import-, Export-, Demo- und Reset-Flows müssen das Feld mitführen, aber Legacy-Payloads ohne Profilangaben kompatibel lesen.

## 7. UI-/UX-Konzept
- Primärer Pflegeort soll das bestehende Projektmodal bleiben; kein neuer Navigationspfad.
- Im Projektdetail sollen die Profile zusätzlich read-only sichtbar sein, idealerweise als Badges/Chips nahe beim Status.
- In der Projektliste ist eine kompakte Anzeige sinnvoll, aber kein komplexer Filter Pflichtbestandteil des MVP.
- Die Bearbeitung soll nicht als starres Einzel-Dropdown erfolgen.
- Empfohlen ist im MVP eine einfache UX als `Basisprofil + Zusatzprofile`: `GEWERBE` sichtbar als Basis, `AWG` und `UVP_UVE` als zuschaltbare Zusatzprofile.
- Die UX bleibt dadurch fachlich verständlich und vermeidet eine generische, erklärungsbedürftige Multi-Select-Maske.

## 8. Auswirkungen auf spätere Phasen
- C1b liefert C2 die stabile Projekt-zu-Profil-Zuordnung, auf der eine Checklisten-Engine später aufsetzen kann.
- AWG- und UVP-Module können später über Profilkeys gezielt zugeschaltet werden, ohne den Projektstatus zu missbrauchen.
- Template-Logik kann später Modulpakete wie `GEWERBE_CORE`, `AWG_ADDON`, `UVP_UVE_ADDON` aus den Profilzuordnungen ableiten.
- Ohne C1b müsste C2 Status, Freitext oder Sonderfälle als Proxy für fachliche Einreicharten verwenden; das soll explizit vermieden werden.

## 9. Risiken / offene Fragen
- Fachliches Risiko: Status und Profil werden im UI verwechselt, wenn beide nicht klar getrennt beschriftet werden.
- Datenmodell-Risiko: Ein Einzelwert-MVP würde sehr schnell zu einem Breaking Change Richtung Mehrfachmodell führen.
- UX-Risiko: Eine zu generische Mehrfachauswahl kann unnötig kompliziert wirken; daher Basis-plus-Add-ons statt freies Profilchaos.
- Migrationsrisiko: Ein automatischer Backfill auf `GEWERBE` für Altprojekte würde fachliche Annahmen erzwingen, die heute nicht belegt sind.
- Technisches Risiko: Projekt-Import, Export, Demo-Reset und Bulk-Replace müssen konsistent mitgezogen werden, sonst entstehen partielle Projektshapes.
- Vorbedingung für spätere Implementierung: Das bekannte lokale Prisma-/Migrationshistorie-Thema bleibt relevant; bei C1b-Schemaänderungen muss lokal weiter mit `npx prisma generate` plus `npx prisma db push --skip-generate` validiert werden, weil die Repo-Historie noch Übergangsspuren aus dem alten SQLite-/Migration-Lock-Zustand trägt.
- Offene Produktfrage: Soll `UVP_UVE` langfristig nur zusammen mit `AWG` vorkommen oder später auch direkt auf `GEWERBE` aufsetzbar sein?
- Offene Scope-Frage: Soll die Projektliste in C1b schon einen Profilfilter erhalten oder erst in C2+?

## 10. MVP-Empfehlung
- Kleinste sinnvolle C1b-Version: kontrollierte Profilstammdaten, Projekt-zu-Profil-Zuordnung, Projekt-API-/Store-Erweiterung, Pflege im Projektmodal, Anzeige im Projektdetail und kompatible Import-/Export-Führung.
- Mehrfachzuordnung soll bereits im MVP kommen, aber fachlich begrenzt auf `genau ein Basisprofil + optionale Zusatzprofile`.
- Bestehende Projekte sollen leer bzw. neutral bleiben.
- Neue interaktiv angelegte Projekte sollen `GEWERBE` als Default erhalten.
- Ausdrücklich erst ab C2 oder später: Checklisten-Engine, Template-Materialisierung, Dokumentpflichtlogik, Verantwortliche/Fälligkeiten, Reports, UVP-Fachoberflächen und jede Laufzeitaktivierung von Modulen.

## 11. Prüf- und Abnahmeszenarien für die spätere Umsetzung
- Neues Projekt anlegen ohne manuelle Profiländerung: Status bleibt `DRAFT`, Profil-Default ist `GEWERBE`.
- Neues Projekt anlegen mit `GEWERBE + AWG`: Projekt speichert beide Zuordnungen stabil und zeigt sie nach Reload unverändert.
- Bestehendes Projekt ohne Profil laden: Projekt bleibt bearbeitbar und wird nicht implizit umklassifiziert.
- Import einer Legacy-Projektdatei ohne Profilfeld: Import bleibt kompatibel, Profil bleibt leer.
- Export und Re-Import eines Projekts mit mehreren Profilen: Profilkeys roundtrippen verlustfrei.
- Projektliste, Projektdetail und Projektmodal zeigen Status und Profile getrennt und verständlich.

## 12. Annahmen und Defaults
- `GEWERBE` ist im MVP das einzige Basisprofil.
- `AWG` und `UVP_UVE` sind im MVP Zusatzprofile.
- Profilstammdaten sind im MVP kontrolliert und nicht frei administrierbar.
- C1b verändert keine Archivierungslogik; `isArchived` und `archivedAt` bleiben unverändert das einzige Archivkonzept.
