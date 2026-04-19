# Masterplan Gesamt-Review und Release-Readiness

## Kurzfassung

Dieser Plan definiert einen einzigen, zusammenhängenden Review-Lauf für das gesamte Projekt. Ziel ist nicht die Implementierung neuer Features oder Phasen, sondern die systematische Prüfung, ob das bestehende System fachlich konsistent, technisch stabil, betriebsfähig und für einen späteren Azure-Rollout ausreichend abgesichert ist.

Der Plan berücksichtigt ausdrücklich:
- die bereits umgesetzte serverseitige Persistenz
- die bestehenden Migrations- und Bootstrap-Mechaniken
- die vorhandenen Mobile-Verbesserungen
- die bereits eingeführten Änderungen zu `Project.status`, `submissionType` und späteren Checklisten
- die vorhandenen Help-Center- und Hilfe-Strukturen
- die Vorgaben aus `AGENTS.md`, insbesondere keine UX-Neugestaltung, keine neue Architektur und keine unverbundenen Teilpläne

Der Review ist erfolgreich, wenn am Ende nachvollziehbar entschieden werden kann:
- fachlich konsistent: ja/nein
- technisch stabil: ja/nein
- betrieblich tragfähig: ja/nein
- rolloutfähig für Azure: ja/nein

## 1. Zielbild des Gesamt-Reviews

### Was der Gesamt-Review leisten soll

Der Gesamt-Review soll das Projekt vor weiterem Ausbau oder vor einem Azure-Rollout ganzheitlich absichern. Er soll nicht nur Codequalität bewerten, sondern prüfen, ob das Gesamtsystem unter realistischen Betriebsbedingungen konsistent funktioniert.

Er soll insbesondere sicherstellen:
- dass die bestehenden Domänen fachlich zusammenpassen
- dass serverseitige Persistenz nicht durch alte Snapshot- oder Browser-Pfade unterlaufen wird
- dass keine stillen Datenverlust- oder Reset-Risiken bestehen
- dass Bootstrap, Migration, Compose und Containerstart reproduzierbar funktionieren
- dass Admin-, Import-, Export- und Recovery-Funktionen keine versteckten Seiteneffekte haben
- dass mobile Nutzung, Hilfeinhalte und Nutzerführung hinreichend tragfähig sind
- dass vor einem Azure-Rollout klare Go/No-Go-Kriterien vorliegen

### Unterschied der Review-Arten

#### Technischer Review

Prüft Code, Datenmodell, API-Verträge, Zustandsquellen, Build-/Runtime-Stabilität, Bootstrap, Migrationen, Containerstart und Fehlerfälle.

#### Fachlicher Review

Prüft, ob die Domänenlogik, Zustände, Beziehungen, Archiv-/Restore-Verhalten, Statusmodelle, Submission-Flows, Fristen- und Aufgabenableitungen fachlich korrekt und verständlich sind.

#### Release-Readiness-Review

Prüft, ob das System in seinem aktuellen Zustand ausreichend stabil, nachvollziehbar testbar und für einen kontrollierten Produktivbetrieb vorbereitet ist.

#### Rollout-Review

Prüft, ob die Betriebsannahmen für Azure Container Apps, Datenbankstart, Revisionen, Baseline-/Migration-Handling, Rollback-Optionen und Wiederanlaufverhalten belastbar sind.

### Wann der Review als erfolgreich gilt

Der Review gilt als erfolgreich, wenn:
- alle Pflichtprüfungen ausgeführt und dokumentiert wurden
- alle P1-Befunde entweder behoben oder als harte Blocker dokumentiert sind
- die aktuelle Source-of-Truth pro Domäne eindeutig ist
- Bootstrap, Login, Kern-Domänenflüsse und Admin-/Recovery-Pfade nachvollziehbar geprüft sind
- die Dokumentation der tatsächlichen Systemrealität nicht mehr grob widerspricht
- eine klare Entscheidung `rolloutfähig ja/nein` inklusive Rest-Risiken vorliegt

## 2. Nicht-Ziele

Dieser Review-Lauf verfolgt ausdrücklich nicht folgende Ziele:
- keine direkte Implementierung
- keine spontanen Refactors
- keine neue Persistenzphase
- keine neue Mobile-Phase
- keine neue Help-Center-Phase
- keine neue Architektur
- kein Rollout in diesem Lauf
- kein Cleanup ohne Review-Nachweis
- keine spekulativen Verbesserungen ohne konkreten Befund
- keine Destabilisierung bereits serverseitig migrierter Domänen

## 3. Review-Umfang / Scope

Der Scope des Reviews umfasst das gesamte Projekt in folgenden Bereichen.

### Persistenz / Datenmodell / Source-of-Truth

Prüfung von Prisma-Schema, Migrationshistorie, Tabellenrealität, Snapshot-Resten, Browser-Persistenz, API-Persistenz und domänenspezifischer Zustandsführerschaft.

### Backend / API / Validierung / Bootstrap

Prüfung von Routen, Payload-Verträgen, Validierungen, Fehlerfällen, Auth-Absicherung, Bootstrap-Logik, Seed-/Startverhalten, Baseline-/Migration-Pfaden und Containerstart.

### Frontend / Stores / Routing / UI / Runtime-Stabilität

Prüfung von Datennachladung, Speichern, Fehlerbehandlung, Guards, Routen, abgeleiteten Projektionen, UI-Verhalten, Reload-Verhalten und Mehrsitzungs-Szenarien.

### Admin-Bereich

Prüfung von Admin-Funktionen für Benutzer, Rollen, Behörden, Import/Export, Reset, Demo-Daten, Integritätsdiagnostik und betriebliche Bulk-Operationen.

### Import / Export / Reset / Demo / Recovery

Prüfung aller Export- und Importpfade, Reset-Verhalten, Recovery-Export im ErrorBoundary, Demo-Daten und der Auswirkungen auf serverseitig persistierte sowie lokal verbleibende Daten.

### Mobile Usability

Prüfung der bereits eingeführten mobilen Verbesserungen auf Kernseiten, Tabellen, Modals, Drawer, Detailseiten, Dateiupload und Nutzbarkeit auf kleinen Displays.

### Help Center / FAQ / Kontext-Hilfe

Prüfung der inhaltlichen Vollständigkeit, Richtigkeit, Auffindbarkeit und Konsistenz von Help Center, FAQ, Auth-Hilfe, Recovery-Hilfe und Admin-Hilfe.

### Projektstatus / Einreichtyp / spätere Checklisten-Erweiterung

Prüfung der aktuell aktiven Modelle für `Project.status`, `Project.submissionType` und der späteren Checklistenfähigkeit, einschließlich Abgrenzung zu älteren Planständen.

### Test-/Build-/Environment-/Compose-Pfade

Prüfung von Build, Prisma-Workflow, Testdatenbank-Schutz, Compose-Konfiguration, lokalen Umgebungen, `.env.example`, Startskripten und Wiederanlaufverhalten.

### Azure-Rollout-Bereitschaft

Prüfung von Rollout-Voraussetzungen, Revision-/Startup-Risiken, Migrations-/Bootstrap-Reihenfolge, Restore-/Rollback-Überlegungen und Mindestanforderungen vor Go-Live.

## 4. Review-Dimensionen

### D1 Fachlogik

#### Typische Fragestellungen

- Sind die Domänenbeziehungen fachlich korrekt und nachvollziehbar?
- Werden Status, Archivierung, Wiederherstellung und Ableitungen korrekt verwendet?
- Entspricht das Verhalten den bestehenden Workflows ohne versteckte UX-Änderung?

#### Typische Risiken

- fachliche Inkonsistenzen zwischen Domänen
- falsche Zuordnungen von Projekten, Behörden oder Scopes
- Status- oder Submission-Logik widerspricht Dokumentation oder UI
- Aufgaben-/Fristenableitung passt nicht zu Erwartungen

#### Typische Artefakte

- `apps/web/src/*Page.tsx`
- `apps/web/src/stores/*`
- `apps/api/src/routes/*.ts`
- `docs/exec-plan-*.md`
- Help- und FAQ-Inhalte

### D2 Persistenz / Datenintegrität

#### Typische Fragestellungen

- Welche Quelle ist je Domäne führend?
- Gibt es konkurrierende lokale und serverseitige Zustandsquellen?
- Bleiben Daten nach Reload, Inkognito, API-Neustart und Container-Neustart konsistent?

#### Typische Risiken

- doppelte Source-of-Truth
- schleichender Datenverlust
- unvollständige Bulk-Replaces
- veraltete Legacy-Daten werden rehydriert
- Export/Import deckt reale Datenlage nicht ab

#### Typische Artefakte

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/src/routes/*.ts`
- `apps/web/src/stores/*Store.ts`
- `apps/web/src/lib/exportPayload.ts`
- lokale Persistenzkeys und Legacy-Reconcile-Logik

### D3 API / Validierung / Verträge

#### Typische Fragestellungen

- Sind Request-/Response-Formate konsistent?
- Sind Validierungen ausreichend und fehlerrobust?
- Werden Admin-/Bulk-Routen korrekt abgesichert?
- Stimmen API-Verträge mit Frontend-Annahmen überein?

#### Typische Risiken

- Payload-Drift
- unklare Fehlercodes
- fehlende Feldvalidierung
- implizite Fallbacks im Frontend
- Bulk-Routen überschreiben mehr als beabsichtigt

#### Typische Artefakte

- `apps/api/src/app.ts`
- `apps/api/src/routes/*.ts`
- `apps/api/src/*.test.ts`
- `apps/web/src/api/*`
- `apps/web/docs/DATA_CONTRACT.md`

### D4 Frontend-Runtime / UX / Fehlerfälle

#### Typische Fragestellungen

- Lädt und speichert die UI stabil?
- Funktionieren Guards, Reload, Route-Wechsel und Fehlerzustände?
- Bleibt der bestehende Workflow erhalten?
- Sind ErrorBoundary und Safe Mode operativ sinnvoll?

#### Typische Risiken

- Runtime-Abstürze
- stilles Überschreiben im Store
- kaputte Reload- oder Inkognito-Flows
- Reset/Recovery führt zu inkonsistentem Zustand
- UI zeigt alte Annahmen trotz neuer Persistenz

#### Typische Artefakte

- `apps/web/src/App.tsx`
- `apps/web/src/components/ErrorBoundary.tsx`
- `apps/web/src/stores/*`
- betroffene Pages und Modals

### D5 Admin- und Betriebsfunktionen

#### Typische Fragestellungen

- Können Admin-Flows produktionsnah genutzt werden?
- Funktionieren Import, Export, Reset, Demo und Integritätsdiagnostik?
- Sind Bulk-Operationen sicher genug für einen echten Betrieb?

#### Typische Risiken

- versehentliche Massenüberschreibung
- unvollständige Exporte
- Reset löscht zu viel oder zu wenig
- Demo-Daten kontaminieren reale Daten
- Admin-Hilfetexte stimmen nicht mit Verhalten überein

#### Typische Artefakte

- `apps/web/src/pages/AdminPage.tsx`
- `apps/web/src/stores/UsersStore.ts`
- `apps/web/src/stores/RolesStore.ts`
- `apps/web/src/stores/ExternalOrgsStore.ts`
- Admin-bezogene API-Endpunkte

### D6 Mobile / Responsive

#### Typische Fragestellungen

- Sind Kernflows auf Mobilgeräten benutzbar?
- Sind Tabellen, Modals, Drawer und Formularstrecken robust?
- Bleiben Upload-, Detail- und Navigationsflüsse bedienbar?

#### Typische Risiken

- abgeschnittene Inhalte
- unbedienbare Tabellen
- Modal-Fallen
- überlagerte Drawer
- Touch-Ziele zu klein
- mobile-only Regressionen

#### Typische Artefakte

- `packages/ui/src/components/AppShell.tsx`
- `packages/ui/src/components/DataTable.tsx`
- `packages/ui/src/components/Modal.tsx`
- Kernseiten in `apps/web/src/pages/*`

### D7 Doku / Help / Nutzerverständlichkeit

#### Typische Fragestellungen

- Ist die Hilfe inhaltlich korrekt und aktuell?
- Versteht ein Nutzer Status, Submission-Typen, Recovery und Admin-Funktionen?
- Sind leere Zustände und Validierungsnachrichten verständlich?

#### Typische Risiken

- veraltete Hilfetexte
- widersprüchliche Begrifflichkeiten
- fehlende Hilfen an kritischen Stellen
- Doku beschreibt alten Prototype-Zustand

#### Typische Artefakte

- `docs/*.md`
- `apps/web/src/help/helpContent.ts`
- `apps/web/src/pages/HelpPage.tsx`
- `apps/web/src/components/HelpHintCard.tsx`
- `README.md`
- `apps/web/README.md`

### D8 Dev-/Test-/Container-/Compose-Umgebung

#### Typische Fragestellungen

- Ist die lokale Umgebung reproduzierbar?
- Ist die Testdatenbank sicher isoliert?
- Funktionieren Build, Start und Compose konsistent?
- Sind `.env`-Beispiele und tatsächliche Konfiguration kompatibel?

#### Typische Risiken

- Compose driftet von echter Runtime weg
- Start hängt an stillen Voraussetzungen
- falsche DB-URLs
- Testpfade treffen falsche Datenbank
- lokale Setups sind nicht reproduzierbar

#### Typische Artefakte

- `docker-compose.yml`
- `apps/api/start-container.sh`
- `apps/api/src/migrationBootstrap.ts`
- `apps/api/src/bootstrap.ts`
- `apps/api/src/config.ts`
- `.env.example`
- `apps/api/.env.example`
- Dockerfiles und Nginx-Konfiguration

### D9 Bootstrap / Migration / Rollback / Rollout

#### Typische Fragestellungen

- Kann eine leere DB sauber hochfahren?
- Kann eine bestehende DB sauber migrieren?
- Gibt es Baseline-/Partial-State-Risiken?
- Sind Rollback- und Restore-Überlegungen dokumentiert und praktisch nutzbar?

#### Typische Risiken

- Migration driftet von Schema ab
- Baseline-Modus kaschiert echte Inkonsistenzen
- Partial-State blockiert Start
- Azure-Revision startet uneinheitlich
- Rollback ist nur theoretisch

#### Typische Artefakte

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/*`
- `apps/api/start-container.sh`
- `apps/api/src/migrationBootstrap.ts`
- Deploy-/Rollout-Dokumentation

## 5. Review nach Domänen

### authorities

#### Fachlich prüfen

- Behördenstruktur, Namensführung, Archivierung und Restore-Verhalten
- Verwendung in Projekten und Admin-Bereich
- Sichtbarkeit und Bearbeitbarkeit wie bisher

#### Technisch prüfen

- API-CRUD, Archiv-Flags, Bulk-Replace, Snapshot-Rollback-Pfade
- Persistenz nach Reload und Sitzungssprung
- keine Rehydrierung aus lokaler Altquelle

#### Typische Regressionen

- archivierte Behörden verschwinden falsch oder bleiben aktiv referenzierbar
- falsche Sortierung oder fehlende Beziehung zu Projekten
- Bulk-Import überschreibt unerwartet

#### Imports/Exports/Resets

- Export enthält Behörden vollständig
- Import/Replace reproduziert Admin-Zustand
- Reset behandelt Behörden konsistent

#### Manuelle Browser-Smokes

- Behörde anlegen, ändern, archivieren, wiederherstellen
- Projekt mit Behörde verknüpfen
- Reload, Inkognito, zweite Sitzung

### authority contacts

#### Fachlich prüfen

- Ansprechpartnerdaten: Name, E-Mail, Telefon, Rolle/Funktion
- Zuordnung zur Behörde
- Archiv-/Restore-Verhalten

#### Technisch prüfen

- API-Verhalten und Admin-Bearbeitung
- Referenzierbarkeit in Projekten
- keine stille lokale Persistenz

#### Typische Regressionen

- Kontakt löst sich von Behörde
- archivierte Kontakte sind weiter auswählbar
- Projektreferenz zeigt veralteten Kontakt

#### Imports/Exports/Resets

- vollständige Export-/Import-Abdeckung
- korrekte Wiederherstellung referenzierter Kontakte

#### Manuelle Browser-Smokes

- Kontakt anlegen/ändern/archivieren/wiederherstellen
- Kontakt im Projekt auswählen
- Reload, zweite Sitzung

### scopes (companies, sites, facilities)

#### Fachlich prüfen

- Hierarchie und Benennung
- Beziehungen Company -> Site -> Facility
- Nutzbarkeit in Projekten und Admin-Flows

#### Technisch prüfen

- Serverpersistenz als eindeutige Quelle
- Bulk-Replace/Backfill/Rollback-Pfade
- Integrität bei Relationen

#### Typische Regressionen

- Site ohne Company
- Facility an falschem Scope
- Referenzen in Projekten brechen bei Änderungen

#### Imports/Exports/Resets

- Export der gesamten Hierarchie
- Import mit stabilen IDs/Beziehungen
- Reset entfernt Scope-Daten reproduzierbar

#### Manuelle Browser-Smokes

- Company/Site/Facility anlegen und verwenden
- Projektbezug setzen
- Reload, Inkognito, API-Neustart

### projects

#### Fachlich prüfen

- Kernprojektfelder, Relationen, Verantwortliche, Teilnehmer, Behördenbezug
- bestehende Workflows ohne UX-Änderung
- Zusammenspiel mit Status, Submission Type und Checklisten

#### Technisch prüfen

- API-Verträge, Relationen, Persistenz, Bulk-Replace
- keine Rückfälle in lokale Projektspeicherung
- Belastbarkeit bei Bearbeiten, Reload und paralleler Sitzung

#### Typische Regressionen

- Relation auf Scope/Behörde/Kontakt bricht
- Projektdetail zeigt veraltete Daten
- Export/Import verliert Relationen

#### Imports/Exports/Resets

- vollständiger Projekt-Export
- Import mit stabilen Relationen
- Reset und Demo ohne versteckte Restdaten

#### Manuelle Browser-Smokes

- Projekt anlegen, bearbeiten, neu laden
- Projektliste/Detailansicht
- Scope/Behörde/Kontakt verknüpfen
- zweite Sitzung

### project status

#### Fachlich prüfen

- Statusmodell passt zum erwarteten Lebenszyklus
- Statusbezeichnungen, Default-Werte, Filter und Darstellung
- Hilfe erklärt Status korrekt

#### Technisch prüfen

- Enum-Nutzung in Prisma/API/UI
- Persistenz und Filter-/Sortierverhalten
- keine Status-Drift zwischen Detail, Liste und Export

#### Typische Regressionen

- Status springt nach Reload zurück
- falsche Badge/Farbzuordnung
- Help Center nennt anderen Statusstand

#### Imports/Exports/Resets

- Status muss exportiert/importiert werden
- Reset darf Status nicht in Default zwingen, wenn Import erfolgt

#### Manuelle Browser-Smokes

- Status ändern
- Listenfilter prüfen
- Reload und Inkognito
- Hilfeeintrag prüfen

### submission type

#### Fachlich prüfen

- Es gilt das aktuell autoritative Modell `Project.submissionType`
- Begriffe, Auswahl, Beschreibung und spätere Checklistenfähigkeit
- klare Abgrenzung zu älteren Submission-Profile-Konzepten

#### Technisch prüfen

- Enum/API/UI-Konsistenz
- keine versteckte Abhängigkeit mehr auf alte Submission-Profile
- Schema, Migrationshistorie und Dokumentation widerspruchsfrei bewerten

#### Typische Regressionen

- UI nutzt `submissionType`, DB/Migration noch altes Profilmodell
- Hilfetexte oder Admin-Beschreibungen referenzieren veraltete Profile
- Export/Import kennt unterschiedliche Modelle

#### Imports/Exports/Resets

- Submission Type muss sauber exportiert/importiert werden
- ältere Artefakte dürfen spätere Restore-/Import-Pfade nicht vergiften

#### Manuelle Browser-Smokes

- Submission Type setzen/ändern
- Projektdetail, Listenansicht, Hilfe und Export prüfen

### legalDocs

#### Fachlich prüfen

- Rechtsdokumente sind korrekt mit Projekten verknüpft
- Felder, Status und Sicht auf Dokumente entsprechen Workflow
- Interaktion mit Auflagen nachvollziehbar

#### Technisch prüfen

- API-Routen, Persistenz, Bulk-Replace
- Dateianhänge/Metadaten und Kommentare soweit relevant
- keine Snapshot-Konkurrenz

#### Typische Regressionen

- Dokumente verschwinden nach Reload
- Projektbezug bricht
- falscher Status oder leere Detailansicht

#### Imports/Exports/Resets

- Export deckt Dokumente vollständig ab
- Import rekonstruiert Projektbezüge
- Reset/Demo behandelt Dokumente konsistent

#### Manuelle Browser-Smokes

- Dokument anlegen/bearbeiten
- im Projekt/Detail anzeigen
- Reload und Inkognito

### obligations

#### Fachlich prüfen

- Auflageninhalt, Status, Verantwortlichkeit und Verknüpfung zu Rechtsdokumenten/Projekten
- fachlich korrekte Ableitung in Übersichten und Aufgaben

#### Technisch prüfen

- Persistenz, API, Bulk-Replace
- Beziehung zu Deadlines und Task-Ableitung
- Beibehaltung bestehender UX

#### Typische Regressionen

- Auflage verliert Dokument- oder Projektbezug
- Status oder Erfüllung wird falsch berechnet
- Aufgabenprojektion reagiert nicht mehr

#### Imports/Exports/Resets

- vollständiger Export
- Import mit stabilen Relationen
- Reset ohne hängende Folgedaten

#### Manuelle Browser-Smokes

- Auflage anlegen/bearbeiten
- Verknüpfungen prüfen
- Aufgabenansicht beobachten
- Reload/zweite Sitzung

### deadlines

#### Fachlich prüfen

- Fristenbezug, Datum, Relevanz und Sichtbarkeit
- erwartetes Zusammenspiel mit Auflagen und Aufgaben

#### Technisch prüfen

- API, Persistenz, Bulk-Replace
- Datumsverhalten und Sortierung
- stabile Ableitung in Dashboards/Tasks/Benachrichtigungen

#### Typische Regressionen

- Frist verschwindet nach Reload
- falsche Sortierung oder Fälligkeit
- Aufgaben-/Benachrichtigungsansicht driftet

#### Imports/Exports/Resets

- Fristen müssen vollständig enthalten sein
- Import darf Aufgabenprojektion nicht zerbrechen

#### Manuelle Browser-Smokes

- Frist anlegen/ändern
- Listen, Dashboard, Aufgaben prüfen
- Reload, Inkognito

### taskState

#### Fachlich prüfen

- Bearbeitungszustand von Aufgaben ist nachvollziehbar und stabil
- Evidenz-, Status-, Reopen- und Kommentarlogik soweit sichtbar verständlich
- Legacy-Reconcile nur noch als kontrollierter Übergang

#### Technisch prüfen

- API-Verhalten für Status, Evidenz, Reopen, Cleanup, Reconcile
- Legacy-localStorage-Reconcile in `TaskStateStore`
- Persistenz nach Reload, Inkognito, API-Neustart

#### Typische Regressionen

- lokaler Legacy-Stand überschreibt Serverstand
- Reconcile erzeugt doppelte oder verlorene Zustände
- Cleanup löscht zu viel

#### Imports/Exports/Resets

- Export enthält TaskState vollständig
- Import/Reset handhabt Legacy-Reste reproduzierbar
- Recovery-Pfade dokumentiert prüfen

#### Manuelle Browser-Smokes

- Aufgabe erledigen/wieder öffnen
- Evidenz hinzufügen, falls aktiv
- Reload, Inkognito, API-Neustart
- Legacy-Reconcile-Szenario explizit prüfen

### tasks als abgeleitete Read-Projection

#### Fachlich prüfen

- Aufgaben sind nur eine konsistente Lesesicht auf Obligations, Deadlines und TaskState
- keine versteckte Primärpersistenz

#### Technisch prüfen

- Ableitungslogik in `TasksStore`
- Konsistenz bei Änderungen an Auflagen, Fristen und TaskState
- Export/Import behandeln Aufgaben nicht als eigenständige Wahrheit

#### Typische Regressionen

- Aufgaben werden als echte Entität behandelt
- abgeleitete Daten hängen nach
- UI zeigt alte Projektion trotz aktualisiertem TaskState

#### Imports/Exports/Resets

- Aufgaben selbst nicht als führende Entität exportieren
- Review soll prüfen, dass nur Quell-Domänen maßgeblich sind

#### Manuelle Browser-Smokes

- Auflage/Frist ändern und Auswirkungen in Aufgaben beobachten
- TaskState ändern und Projektion prüfen
- Reload

## 6. Review nach Querschnittsthemen

### Auth / Session / MFA / Passwortfluss

Prüfen:
- Login, Logout, Session-Fortbestand
- MFA-Verifikation
- Forgot/Reset-Password
- Security Settings
- Schutz privater Routen und Help/Auth-Seiten

Risiken:
- Session-Drift
- MFA- oder Reset-Fluss unvollständig
- Guard-Lücken
- unklare Fehlertexte

Artefakte:
- `apps/web/src/stores/AuthStore.ts`
- Auth-Seiten
- `apps/api/src/auth.ts`
- `apps/api/src/routeAuth.ts`
- zugehörige Tests

### Rollen / Berechtigungen

Prüfen:
- Rollenmodell, Admin-Zugriff, Benutzerverwaltung
- Sichtbarkeit von Admin-Seiten und Admin-Funktionen
- RBAC-Demo-Flags vs echte Rechte

Risiken:
- Admin-Funktionen für falsche Nutzer sichtbar
- Rolle nur im UI, nicht im API-Schutz
- inkonsistente Rechtekommunikation

Artefakte:
- `UsersStore`, `RolesStore`, `AdminUsersPage`, `AdminRolesPage`
- API-Rollen/Guards

### ErrorBoundary / Recovery-Export

Prüfen:
- Recovery-Export erzeugt sinnvolle Artefakte
- Reset all persisted data verhält sich nachvollziehbar
- Safe Mode und Diagnosepfade sind verständlich

Risiken:
- Recovery exportiert nicht alle relevanten Daten
- Reset löscht zu aggressiv oder nicht vollständig
- Hilfetexte sind veraltet

Artefakte:
- `apps/web/src/components/ErrorBoundary.tsx`
- `apps/web/src/lib/exportPayload.ts`

### Import / Export / Reset / Demo

Prüfen:
- Vollständigkeit der Exporte
- Verträglichkeit von Importen mit serverseitigen Domänen
- Demo- und Reset-Funktionen im Zusammenspiel mit API-Daten
- Trennung zwischen server- und lokalpersistierten Artefakten

Risiken:
- partieller Export
- lokale Artefakte nicht im Export
- Import zerstört serverseitige Wahrheit
- Demo kontaminiert echte Daten

Artefakte:
- `AdminPage.tsx`
- Export-/Import-Helfer
- API-Bulk-Routen

### Containerstart / Bootstrap / Seed

Prüfen:
- leerer Start
- Start mit bestehender DB
- Baseline-Start
- Verhalten bei inkonsistentem Zustand

Risiken:
- `baseline` kaschiert Drift
- `partial` blockiert ohne klares Recovery
- Seed/Admin-Erzeugung nicht deterministisch

Artefakte:
- `apps/api/start-container.sh`
- `apps/api/src/migrationBootstrap.ts`
- `apps/api/src/bootstrap.ts`

### Prisma / Postgres / TEST_DATABASE_URL / DATABASE_URL

Prüfen:
- Provider und Migrationshistorie sind konsistent
- Testdatenbank-Schutz greift
- keine unklaren Drifts zwischen Migrationen und Schema

Risiken:
- Migrationen erzeugen Objekte, die im Schema fehlen
- alte SQLite-/Snapshot-Annahmen leben fort
- Testpfad trifft falsches Schema

Artefakte:
- `schema.prisma`
- `migration_lock.toml`
- `migrations/*`
- `config.ts`

### Compose / lokale Umgebungen

Prüfen:
- `docker-compose.yml`
- Port-, Host- und Health-Annahmen
- lokale Startanleitung vs tatsächliche Runtime

Risiken:
- Compose und Docs widersprechen sich
- lokale Umgebung startet nur unter Spezialannahmen
- Nginx/API/DB-Reihenfolge instabil

### Azure Container Apps / Revisionen / Startverhalten

Prüfen:
- Container-Startlogik ist revisionssicher
- Bootstrap und Migrationshandling sind idempotent genug
- Rollout- und Rollback-Annahmen sind dokumentiert

Risiken:
- mehrere Revisionen/Starts gegen dieselbe DB
- Race Conditions bei `migrate deploy` und Bootstrap
- unklare Restore-Schritte

### Mobile Drawer / Tables / Modals

Prüfen:
- Drawer-Öffnen/Schließen
- Tabellen in Listenansichten
- Modals auf kleinen Screens
- Touch-Bedienbarkeit zentraler Flows

Risiken:
- Fokus-/Scroll-Probleme
- Aktionselemente außerhalb des Viewports
- Daten unlesbar auf Mobil

### Help Center / FAQ / Kontext-Hilfe

Prüfen:
- Help Center deckt Kernfragen ab
- FAQ und Inline-Hints passen zur aktuellen Realität
- Auth-, Recovery-, Admin- und Mobile-Hilfen sind belastbar

Risiken:
- veraltete Texte
- falsche Begriffe
- fehlende Hilfe an kritischen Stellen

### Projektstatus / Einreichtyp / spätere Checklistenfähigkeit

Prüfen:
- aktuelles Zielmodell ist konsistent
- ältere Profile-Dokumentation ist sauber eingeordnet
- spätere Checklistenfähigkeit bleibt nachvollziehbar, ohne jetzt neue Phase zu starten

Risiken:
- Konzeptdrift zwischen Code, Schema, Migrationen und Docs
- Produktmodell ist vor Rollout nicht eindeutig

## 7. Prüflogik / Priorisierung

### P1 = harter Rollout-Blocker

Ein Befund ist P1, wenn er:
- Datenverlust oder Inkonsistenz erzeugen kann
- eine Domäne ohne eindeutige Source-of-Truth lässt
- Login, Session, Rollen oder Admin-Schutz fundamental bricht
- Bootstrap, Migration oder Containerstart unzuverlässig macht
- Import/Export/Reset so fehlerhaft macht, dass Recovery nicht belastbar ist
- Azure-Rollout ohne hohes Betriebsrisiko unmöglich macht

### P2 = vor Live sehr sinnvoll zu beheben

Ein Befund ist P2, wenn er:
- keinen sofortigen Totalausfall verursacht
- aber reale fachliche Fehlentscheidungen, Bedienfehler oder hohe Supportlast erwarten lässt
- mobile Kernnutzung spürbar behindert
- Help/Doku in kritischen Flows irreführend macht
- Admin-/Recovery-Pfade unzuverlässig oder missverständlich macht

### P3 = späterer Verbesserungsbedarf

Ein Befund ist P3, wenn er:
- funktional aktuell tolerierbar ist
- aber Wartbarkeit, Nachvollziehbarkeit oder Produktreife begrenzt
- Inkonsistenzen in Doku, Tests oder Randfällen erzeugt
- vor weiterem Ausbau sinnvoll bereinigt werden sollte

### P4 = Beobachtung / Optimierung

Ein Befund ist P4, wenn er:
- aktuell keinen relevanten Release- oder Betriebsimpact hat
- primär Dokumentations-, Komfort- oder Feinschliff-Charakter besitzt
- nur unter Randbedingungen sichtbar wird

### Entscheidungsregel

Bei Unsicherheit gilt:
- Daten-, Auth-, Bootstrap-, Migration-, Reset- und Rollout-Risiken eher höher stufen
- reine Darstellungs- oder Komfortthemen niedriger stufen
- Dokumentationsdrift wird P1 oder P2, wenn sie falsche Betriebsentscheidungen oder falsche Datenpfade begünstigt

## 8. Artefakte und Dateien, die typischerweise geprüft werden müssen

### Backend

- `apps/api/src/app.ts`
- `apps/api/src/routes/*.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/routeAuth.ts`
- `apps/api/src/bootstrap.ts`
- `apps/api/src/migrationBootstrap.ts`
- `apps/api/src/config.ts`
- `apps/api/src/*.test.ts`

### Datenmodell und Migration

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migration_lock.toml`
- `apps/api/prisma/migrations/*`

### Frontend Runtime und Stores

- `apps/web/src/App.tsx`
- `apps/web/src/pages/*`
- `apps/web/src/stores/*Store.ts`
- `apps/web/src/lib/exportPayload.ts`
- `apps/web/src/lib/integrityScan.ts`
- `apps/web/src/components/ErrorBoundary.tsx`
- `apps/web/src/components/ProjectChecklistTab.tsx`
- `apps/web/src/help/helpContent.ts`
- `apps/web/src/config/runtimeConfig.tsx`

### Shared UI

- `packages/ui/src/components/AppShell.tsx`
- `packages/ui/src/components/DataTable.tsx`
- `packages/ui/src/components/Modal.tsx`

### Doku und Hilfen

- `README.md`
- `apps/api/README.md`
- `apps/web/README.md`
- `apps/web/docs/DATA_CONTRACT.md`
- `docs/*.md`

### Betrieb und Environment

- `docker-compose.yml`
- `.env.example`
- `apps/api/.env.example`
- `apps/api/start-container.sh`
- Dockerfiles und Nginx-/Ops-Dateien

### Admin- und Recovery-Bereiche

- `apps/web/src/pages/AdminPage.tsx`
- Admin-bezogene Pages und Stores
- relevante Bulk-/Rollback-/Cleanup-Routen in der API

## 9. Technische Verifikation

Die technische Verifikation soll in einer reproduzierbaren Reihenfolge erfolgen und alle ausgeführten Befehle später im Review-Bericht dokumentieren.

### 9.1 Prisma-Grundprüfung

Pflicht:
1. `cd apps/api && npx prisma validate`
2. `cd apps/api && npx prisma generate`

Prüfen:
- Schema syntaktisch valide
- Client generierbar
- keine offensichtliche Inkonsistenz im Generator/Provider

### 9.2 Repo-konformer Schemaabgleich

Pflicht:
- Review des projektspezifischen Workflows ausführen
- lokal gegen Entwicklungsdatenbank prüfen, nicht gegen Azure
- bevorzugt der im Repo etablierte Weg für Schemaabgleich und Migration

Konkrete Kandidaten:
- `cd apps/api && npx prisma db push --skip-generate`
- zusätzlich Review von `npm run migrate:dev` bzw. `npm run migrate:deploy` auf Eignung nur als Verifikationsschritt

Prüfen:
- Drift zwischen `schema.prisma` und realer DB
- besondere Aufmerksamkeit für Submission-Profile- und Submission-Type-Widersprüche
- Tabellen wie `PortalSnapshot` und andere Legacy-Reste bewusst einordnen

### 9.3 Build-Prüfung

Pflicht:
1. `cd apps/api && npm run build`
2. `cd apps/web && npm run build`

Empfohlen:
- `cd packages/ui && npm run build`

Prüfen:
- TypeScript-Builds sauber
- keine offensichtlichen Dead-Code- oder Import-Probleme
- Shared-UI baut stabil

### 9.4 Optionale Tests

Pflicht, soweit lokal vorhanden und lauffähig:
- `cd apps/api && npm test`

Prüfen:
- Auth-, Projects-, Checklists- und API-Kernpfade
- Testdatenbank-Schutz
- dokumentieren, welche Domänen nicht durch Tests abgedeckt sind

### 9.5 Compose-Prüfung

Pflicht:
- `docker compose config`

Empfohlen:
- kompletter frischer Compose-Start mit leerer lokaler DB
- Start aus bereits befüllter DB
- wiederholter Start nach Neustart

Prüfen:
- Konfigurationskonsistenz
- Dienste, Ports, Umgebungsvariablen
- Reihenfolge DB -> API -> Web
- Nginx/API-Erreichbarkeit

### 9.6 Frischer Bootstrap

Pflicht:
- lokales Szenario mit leerer Datenbank
- API- oder Compose-Start
- Bootstrap-Logs dokumentieren

Prüfen:
- `fresh`-, `ready`-, `baseline`- und `partial`-Pfadlogik
- initialer Admin wird nur einmal erzeugt
- Start scheitert kontrolliert bei Partial-State

### 9.7 Lokale Login-Checks

Pflicht:
- Login mit lokalem Admin
- Logout
- Session-Fortbestand nach Reload
- Passwortfluss und MFA nur soweit lokal verfügbar und vorgesehen

### 9.8 API-Smokes

Pflicht:
- Gesundheits- und Kernrouten indirekt über UI und gezielt per API prüfen
- je Domäne mindestens Lesen und Schreiben einer Kernoperation

Prüfen:
- Fehlercodes
- Validierungsverhalten
- Bulk-Routen nur kontrolliert und bewusst prüfen

### 9.9 Runtime-Smokes im Browser

Pflicht:
- reguläres Profil
- Inkognito oder zweites Browser-Profil
- Reload
- API-Neustart bei offenem Browser
- erneutes Laden und Wiederanmelden

Prüfen:
- Persistenz, Fehlertoleranz, Reauth, Datennachladung
- keine Rückfälle in lokale Altzustände

### 9.10 Mehrinstanz-/Race-/Bootstrap-Fälle

Empfohlen, wenn praktikabel:
- wiederholtes Starten des API-Containers gegen dieselbe DB
- Prüfung mehrfacher Startversuche in kurzem Abstand
- Beobachtung von Migration- und Bootstrap-Rennen

Prüfen:
- idempotentes Verhalten
- keine inkonsistente Initialisierung
- keine Mehrfach-Seed- oder Mehrfach-Baseline-Probleme

## 10. Fachliche Browser-Smoke-Tests

Der spätere Review-Lauf soll mindestens folgende manuelle Tests ausführen und dokumentieren.

### Login / Dashboard

- Login mit gültigem Nutzer
- Reload nach Login
- Logout
- erneuter Login
- Dashboard zeigt erwartete Kernbereiche
- keine irreführenden Prototype- oder Offline-Hinweise

### Projekte

- Projektliste öffnen
- Projekt anlegen oder bearbeiten
- Projektdetail prüfen
- Scope-, Behörden- und Kontaktbezüge setzen
- speichern, reloaden, erneut öffnen

### Projektstatus

- Status setzen/ändern
- Darstellung in Liste und Detail prüfen
- Reload
- Export/Import-Relevanz beobachten

### Einreichtyp

- Submission Type setzen/ändern
- Hilfe- und Begrifflichkeit prüfen
- Konsistenz in Detail und Export prüfen

### Rechtsdokumente

- Dokumentliste und Detail
- Erstellen/Bearbeiten
- Projektbezug
- Reload und Rücknavigation

### Auflagen

- Auflage anlegen/bearbeiten
- Dokument- und Projektbezug
- Statuswirkung auf Aufgaben prüfen

### Fristen

- Frist anlegen/bearbeiten
- Sortierung und Fälligkeit
- Sichtbarkeit in Übersichten/Aufgaben

### Aufgaben / TaskState

- Aufgabenliste prüfen
- TaskState ändern
- Aufgabe erledigen/wieder öffnen
- Auswirkungen von Auflagen- und Fristenänderungen beobachten
- Legacy-Reconcile-Szenario, wenn lokal reproduzierbar

### Behörden / Ansprechpartner

- Behördenliste
- Kontaktliste
- Anlegen, Bearbeiten, Archivieren, Restore
- Verknüpfung in Projekten

### Externe Firmen

- Admin-Verwaltung externer Organisationen
- CRUD und Verwendbarkeit prüfen
- Rollensichtbarkeit

### Import / Export / Reset / Demo

- Voll-Export erzeugen
- Import in kontrollierter Testumgebung
- Reset all persisted data prüfen
- Demo-Daten laden und Verhalten dokumentieren
- sicherstellen, dass serverseitige Domänen nicht still inkonsistent bleiben

### ErrorBoundary-Recovery-Export

- Fehlerfall künstlich oder kontrolliert nachvollziehen, soweit praktikabel
- Recovery-Export erstellen
- Verständlichkeit und Inhalt prüfen
- Reset und Safe Mode prüfen

### Mobile Kernflows

- Login
- Navigation per Drawer
- Projektliste und Detail
- Auflagen, Fristen und Tasks
- Admin-Einstieg nur soweit mobile Nutzung relevant ist
- Modals, Tabellen und Upload-Komponenten prüfen

### Help Center / FAQ / Hilfe-Einstiege

- zentrale Help-Seite
- Auth-Hilfe
- thematische Hilfe zu Projekten, Status, Submission, Recovery und Admin
- Inline-Hints und leere Zustände
- Konsistenz von Begriffen und Verweisen

## 11. Review von Dokumentation und Hilfe

### Ziel

Das Projekt soll nicht nur technisch funktionieren, sondern für Nutzer und Betreiber verständlich sein. Der Review muss daher explizit die Dokumentation und Hilfe auf Richtigkeit, Verständlichkeit und Aktualität prüfen.

### Prüffelder

#### Help Center

- deckt Kern-Domänen ab
- erklärt Recovery, Admin, Auth, Mobile und Grundbegriffe
- verweist nicht auf veraltete Workflows

#### FAQ

- beantwortet reale Nutzerfragen
- erklärt Grenzen und typische Fehlerfälle
- stimmt mit aktuellem Systemstand überein

#### Inline-Hints

- erscheinen an fachlich kritischen Stellen
- sind kurz, korrekt und handlungsleitend
- widersprechen nicht dem Help Center

#### Leere Zustände

- verständlich
- nicht irreführend
- geben nächsten sinnvollen Schritt vor

#### Status-/Einreichtyp-Erklärung

- Statusmodell und Submission Type müssen im Wording konsistent sein
- ältere Submission-Profile-Begriffe dürfen die Nutzerführung nicht verwirren

#### Fachliche Einreichhilfe

- Hilfe zur Einreichung muss zur tatsächlichen Produktlogik passen
- spätere Checklistenfähigkeit darf erklärt werden, ohne aktuelle Implementierung zu überschreiben

#### Admin-Hilfen

- Import, Export, Reset, Demo, Rollen und Recovery müssen für Admins verständlich beschrieben sein

#### Fehlertexte / Validierungsnachrichten

- Fehlermeldungen müssen verständlich, handlungsorientiert und fachlich korrekt sein
- keine widersprüchlichen oder rein technischen Texte an kritischen Stellen

### Spezielle Review-Regel

Alle Doku- und Hilfebefunde müssen gegen die tatsächliche Code- und Runtime-Realität geprüft werden. Besonders kritisch zu prüfen sind:
- veraltete Prototype- und localStorage-Aussagen
- Drift zwischen älteren Submission-Profile-Dokumenten und aktuellem `submissionType`
- Help-Inhalte, die noch alte Persistenzannahmen spiegeln

## 12. Rollout-Readiness-Review

### Ziel

Am Ende des Gesamt-Reviews muss eine belastbare Go/No-Go-Entscheidung für einen späteren Azure-Rollout möglich sein.

### Entscheidungskriterien `rolloutfähig ja/nein`

#### Rolloutfähig nur wenn

- keine offenen P1-Befunde existieren
- Source-of-Truth pro Domäne eindeutig dokumentiert ist
- Bootstrap, Migration und Wiederanlauf lokal reproduzierbar funktionieren
- Login, Kern-Domänen, Admin-Kernfunktionen und Recovery-Pfade geprüft wurden
- Import/Export/Reset keine unkontrollierten Datenrisiken aufweisen
- die größten Doku- und Betriebswidersprüche dokumentiert oder bereinigt sind

#### Vor Azure zwingend zu klären

- Schema- und Migrationsdrift, insbesondere bei Submission-Themen
- Baseline- und Bootstrap-Verhalten
- DB-Start und mehrfacher Containerstart
- Admin-, Reset- und Recovery-Risiken
- tatsächliche Dokumentation des Betriebsmodells

#### Nach Rollout verschiebbare Themen

- P3- und P4-Befunde ohne Daten- oder Betriebsimpact
- kosmetische Mobile- oder Doku-Optimierungen
- zusätzliche Tests für Randfälle, sofern Kernrisiken bereits abgesichert sind

### Rollback- und Restore-Überlegungen, die dokumentiert werden müssen

- welche Exporte vor kritischen Eingriffen gezogen werden sollen
- wie ein fehlerhafter Import oder Bulk-Replace zurückgenommen werden kann
- wie DB-Zustand und Applikationszustand wiederhergestellt werden können
- welche Grenzen der ErrorBoundary-Recovery-Export hat
- welche Schritte bei fehlgeschlagenem Bootstrap oder Migrationsdrift vorgesehen sind

## 13. Abschlussausgabe des späteren Reviews

Der spätere echte Review-Lauf soll in einem strukturierten Abschlussbericht dokumentiert werden.

### Pflichtinhalte

#### Status pro Domäne

- authorities
- authority contacts
- scopes
- projects
- project status
- submission type
- legalDocs
- obligations
- deadlines
- taskState
- tasks-Projektion

#### Kritische Blocker

- alle P1-Befunde
- betroffene Bereiche
- Grund des Blockers
- empfohlene Mindestmaßnahme vor Rollout

#### Warnungen / Rest-Risiken

- P2 bis P4 geordnet
- fachlich, technisch und betrieblich getrennt kenntlich

#### Bootstrap-/Environment-Status

- Build ok/nicht ok
- Prisma ok/nicht ok
- Compose ok/nicht ok
- frischer Bootstrap ok/nicht ok
- Wiederanlauf ok/nicht ok

#### Mobile-Readiness-Status

- Kernflows ok/nicht ok
- bekannte Einschränkungen

#### Admin-Readiness-Status

- Import/Export/Reset/Demo/Recovery ok/nicht ok
- bekannte Restrisiken

#### Doku-/Help-Readiness-Status

- Help Center ok/nicht ok
- FAQ/Inline-Hints ok/nicht ok
- veraltete Dokumente identifiziert ja/nein

#### Ausgeführte Befehle

- vollständige Befehlsliste
- relevante Ergebnisse kurz dokumentiert

#### Finale manuelle Checkliste

- welche Browser-Smokes durchgeführt wurden
- welches Profil oder Setup verwendet wurde
- welche Szenarien offen blieben

#### Gesamturteil

- rolloutfähig: ja/nein
- falls nein: welche Mindestpunkte zuerst zu lösen sind

## 14. Priorisierte Reihenfolge für die spätere echte Review-Durchführung

Die spätere echte Review-Durchführung soll in dieser Reihenfolge erfolgen:

1. Environment / Build / Bootstrap
- zuerst technische Grundfähigkeit absichern
- Prisma, Build, Compose, frischer Start, Login-Basis

2. Persistenz / Datenmodell / Source-of-Truth
- Schema, Migrationen, Bulk-/Rollback-Pfade, Legacy-Reste
- Submission-Type-/Submission-Profile-Drift früh klären

3. Kern-Domänen fachlich und technisch
- authorities und contacts
- scopes
- projects
- legalDocs
- obligations
- deadlines
- taskState
- tasks-Projektion

4. Admin / Import / Export / Reset / Recovery
- betriebliche Kernfunktionen nach Domänenprüfung
- besonders kritisch vor Azure

5. Frontend-Runtime / Browser-Smokes
- Reload, Inkognito, API-Neustart, zweite Sitzung
- Kernflows vollständig durchgehen

6. Mobile
- mobile Kernflüsse gezielt nach gesicherter Desktop-Funktion prüfen

7. Help Center / Doku / Nutzerverständlichkeit
- erst gegen bereits verifizierten Ist-Zustand prüfen
- Widersprüche klar dokumentieren

8. Rollout-Readiness
- Schlussentscheidung aus allen vorherigen Ergebnissen ableiten

## 15. Empfehlung für den kleinsten sinnvollen echten Review-Lauf

### Kleinster sinnvoller Startpunkt

Der kleinste sinnvolle echte Review-Lauf ist kein Feature-Review, sondern ein minimaler System-Readiness-Lauf mit:
- Prisma- und Build-Prüfung
- frischem Bootstrap
- Login
- Kern-Domänen-Smoke für Scopes, Authorities und Projects
- Export-, Import- und Reset-Grundprüfung
- Reload, Inkognito und API-Neustart
- Submission-Type- und Migrationsdrift-Prüfung
- Admin- und Recovery-Grundprüfung

### Absolut verpflichtende Prüfungen

- `prisma validate`
- `prisma generate`
- API-Build
- Web-Build
- frischer lokaler Bootstrap
- Login und Session-Retention
- Persistenz-Smokes für serverseitig migrierte Domänen
- Import-, Export- und Reset-Grundprüfung
- ErrorBoundary- und Recovery-Export-Bewertung
- Prüfung von `submissionType` gegen Migrationshistorie und ältere Planstände
- Compose- und Startverhalten
- finale P1- und P2-Einstufung

### Nachgelagerte Prüfungen

Diese können nachgezogen werden, wenn die Pflichtprüfungen stabil sind:
- vertiefte Mobile-Feinheiten
- vollständige Help- und FAQ-Textoptimierung
- zusätzliche Randfall- oder Parallelstartszenarien
- weitergehende P3- und P4-Wartbarkeitsthemen

## Wichtige projektspezifische Annahmen und Defaults

- Maßgebliche Leitplanke ist `AGENTS.md`: keine UX-Neugestaltung, keine neue Architektur, keine neue Migrationsphase in diesem Lauf.
- Der Review bewertet den aktuellen Projektstand; er führt keine Implementierung und keinen Cleanup aus.
- Bereits serverseitig persistierte Domänen werden als zu schützender Ist-Stand betrachtet.
- `TaskState` bleibt als besonders risikoreicher Übergangsbereich mit Legacy-Reconcile explizit im Fokus.
- `Tasks` werden als abgeleitete Read-Projection geprüft, nicht als führende Persistenzdomäne.
- Für `Project.status` und `Project.submissionType` gilt der neuere kombinierte Plan als vorrangige Produktreferenz; ältere Submission-Profile-Artefakte sind aktiv auf Drift zu prüfen.
- Dokumentationswidersprüche sind Teil des Reviews und nicht bloß Nebenbefund, wenn sie Betriebs- oder Rolloutentscheidungen beeinflussen.
