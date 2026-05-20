# Migrationsplan: Domain-Persistenz von Snapshot auf PostgreSQL

## 1. Ziel
- Nach Abschluss sind die Fachdomänen `Behörden`, `Ansprechpartner`, `Firmen`, `Standorte`, `Anlagen`, `Projekte`, `Rechtsdokumente`, `Auflagen`, `Fristen` und `Task-State/Aufgaben` serverseitig in PostgreSQL persistiert.
- Die Web-App behält dieselben Seiten, Labels, Formulare, Dialoge, Navigationspfade und Nutzerabläufe bei.
- Für bereits migrierte Domänen ist die API plus PostgreSQL die einzige fachliche Source of Truth. Browser-Storage und `PortalSnapshot` sind dort nicht mehr primär.
- Daten überleben Reload, Inkognito, neuen Browser, lokalen API-Neustart und später Azure-Redeploys.
- Die Migration bleibt minimal-invasiv: bestehende Entity-Shapes, Store-Namen und UI-Flows bleiben soweit möglich erhalten.

## 2. Nicht-Ziele
- Keine Neugestaltung von UI, Navigation, Übersetzungen, Berechtigungs-UX oder Formularflüssen.
- Keine Umbenennung von Fachbegriffen, Routen oder Seiten ohne technische Notwendigkeit.
- Keine Einführung einer neuen Frontend-Architektur, State-Library oder Datenfetching-Library.
- Kein vollständiger Refactor von Dokumenten-Upload, Evidence-Binary-Speicherung oder IndexedDB-Dateiinhalten; in Phase 6 werden nur Task-/Deadline-State und Evidence-Metadaten serverseitig gemacht.
- Kein sofortiges Entfernen aller `localStorage`-Nutzung; nur die Domänen-Keys und Snapshot-Mechanik werden phasenweise zurückgebaut.
- Keine produktive Azure-Umstellung vor erfolgreichem lokalen Abschluss jeder einzelnen Phase.

## 2aa. Erweiterungslauf 2026-04-29: Projekt-Auflagen und externe Durchführung
- Ziel dieses Laufs ist keine neue Persistenzphase, sondern die Erweiterung der bereits serverseitig migrierten Auflagen-Domäne.
- Projektzugehörige Auflagen werden weiterhin über `Project -> LegalDocument -> Obligation` abgeleitet; es wird keine konkurrierende `projectId` an `Obligation` eingeführt.
- Wiederkehrende Auflagen erhalten ein optionales date-only Feld `recurrenceEndDate`; `null`/leer bedeutet unbefristet.
- Auflagen können optional eine aktive externe Firma und einen aktiven externen Portalbenutzer als Durchführung referenzieren; interne Owner/Deputy bleiben interne Compliance-Verantwortliche.
- Externe Projektbeteiligte dürfen bestehende Freitextdaten behalten, neue Einträge können aber echte externe Portalbenutzer referenzieren oder mit `users.manage` sicher per Reset-Link erzeugen.
- Externe Domain-Zugriffe bleiben in diesem Lauf fail-closed. Es werden keine allgemeinen Projekt-, Aufgaben-, Dokument-, User- oder Stammdatenlisten für externe Nutzer geöffnet.
- Legacy Bulk-/Snapshot-/Recovery-Pfade bleiben über den bestehenden Guard gesperrt; Import/Reset wird nicht reaktiviert.
- Keine Azure-Arbeit in diesem Lauf.

## 2ab. Hotfix 2026-04-29: Pflichtnachweis Dokument bei Task-Abschluss
- Ziel ist die Korrektur der Evidence-Requirement-Logik im bestehenden Aufgabenabschluss ohne UI-Redesign oder Schemaänderung.
- Root Cause: PDFs werden fachlich als `REPORT`/`Pruefdokument` klassifiziert, `requireDocument` zählte bisher aber nur `DOCUMENT`.
- Neue Regel: `REPORT` ist ein gültiger Nachweis für `requireDocument`; `requireReport` bleibt spezifisch. Ein einzelnes Attachment erfüllt nicht gleichzeitig zwei aktive Anforderungen.
- Der Bereich `DocumentsPanel` bleibt eine separate serverseitige Dokumentablage und zählt im Abschlussdialog nicht als Pflichtnachweis.
- Frontend und API verwenden dieselbe Requirement-Semantik; obligation-basierte Task-Abschlüsse werden serverseitig gegen `Obligation.evidenceRequirements` validiert.
- Lokale Tests: reine Unit-Tests für Attachment-Requirement-Matching, API-Integrationstests für Task-State-Completion, plus API-/Web-Build.

## 2ac. Remediation-Fixlauf 2026-04-29 fuer Projekt-Auflagen-Review-Findings
- Dies ist keine neue Persistenzphase, keine Feature-Phase und keine Azure-Arbeit.
- Ziel dieses Laufs ist ausschliesslich die minimal-invasive Behebung von drei Review-Findings aus der Projekt-Auflagen-/External-Executor-Erweiterung.
- Zulaessiger Umfang:
- `POST /task-state/:taskInstanceId/evidence` bleibt fachlich eine Completion-Aktion und muss deshalb serverseitig `tasks.complete` verlangen; `tasks.edit` allein darf keine Aufgabe auf `DONE` setzen oder per Legacy-Reconcile einschleusen.
- Der Projekt-Auflagen-Tab darf eine gesetzte `externalOrgId` nicht als `Nicht zugewiesen` anzeigen, wenn nur der ExternalOrg-Lookup nicht geladen ist; ohne Lookup wird ein neutraler Zugewiesen-Hinweis angezeigt.
- Der Projekt-Auflagen-Tab stuetzt seinen Empty State auf aktive/verfuegbare Rechtsdokumente, damit Projekte mit nur archivierten Rechtsdokumenten eine handlungsleitende Erklaerung erhalten.
- Nicht-Ziele:
- keine neue RBAC-Architektur, keine breitere ExternalOrg-Verzeichnisfreigabe, keine Import-/Export-/Migration-/PowerAutomate-Aenderungen, keine UI-Neugestaltung.

## 2ad. Erweiterungslauf 2026-05-02: Projektzugriff und Altbescheide
- Ziel dieses Laufs ist die serverseitige Begrenzung projektbezogener Fachdomänen sowie eine getrennte historische Ablage fuer Altbescheide.
- Neues Datenmodell:
- `ProjectAccess` verwaltet explizite Projektfreigaben pro Benutzer mit Rollen `PROJECT_VIEWER`, `PROJECT_EDITOR`, `EXTERNAL_PROJECT_VIEWER`, `EXTERNAL_EXECUTOR`.
- `LegacyDecision` verwaltet historische Bescheide getrennt von aktiven `LegalDocument`-Eintraegen.
- Altbescheide sind projektbezogen, dokumentierbar, archivierbar und optional mit aktiven Rechtsdokumenten verknuepfbar, erzeugen aber keine Auflagen, Fristen oder Tasks automatisch.
- Serverseitiges Scoping gilt fuer Projekte, Rechtsdokumente, Auflagen, Fristen, Task-State, Dokumente, Kommentare, Projektchecklisten und Altbescheide.
- Globale Admin-/Compliance-Manager-Rollen koennen weiterhin alle Projekte lesen; normale interne Benutzer brauchen impliziten oder expliziten Projektzugriff.
- Externe Benutzer erhalten keine breiten Fachdomänenlisten. Projektlisten liefern nur explizit freigegebene Projekt-Shells; abhängige Domänen bleiben fuer externe Benutzer fail-closed.
- Dokumentzugriff prueft `ownerType`, `ownerId` und den darunterliegenden Projektkontext; `LEGACY_DECISION` ist ein eigener Dokument-Owner.
- Frontend:
- Im Projektdetail gibt es Tabs fuer `Altbescheide` und, fuer berechtigte Admins, `Zugriff`.
- Listen verlassen sich auf serverseitige Scopes und zeigen bei fehlenden Zuweisungen leere Zustände statt lokaler Ersatzdaten.
- Import/Export/Recovery:
- Der generische Teil-Export liest Altbescheide ueber die API in den aktuellen Zugriffsscope ein.
- ProjectAccess, Benutzer, Rollen und Security-Konfiguration bleiben server-managed und werden nicht generisch importiert.
- Import/Reset und alte Recovery-/Snapshot-Pfade bleiben gesperrt; keine Azure-Arbeit in diesem Lauf.

## 2ae. Gezielter Review-Fixlauf 2026-05-02 fuer ProjectAccess und Altbescheide
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine Rollenarchitektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der aktuellen P1/P2/P3-Review-Findings aus Merge-/Rollout-Review.
- Zulaessiger Umfang:
- Neue ProjectAccess-/Altbescheid-Module und Migration muessen review-sichtbar sein und im finalen Commit enthalten sein.
- Projektzugriff ist nur Scope und ersetzt keine Fach-Leserechte fuer LegalDocs, Auflagen, Fristen, Tasks, Dokumente, Kommentare, Checklisten oder Altbescheide.
- Single Hard-Delete fuer Auflagen nutzt dieselben Sperren vor dem Dependency-Check wie die Bulk-/Safe-Delete-Pfade.
- `POST /projects/:projectId/legacy-decisions` darf nicht generisch `projects.create` verlangen, sondern braucht das fachliche LegalDoc-/Altbescheid-Schreibrecht plus Projekt-Schreibzugriff.
- ProjectAccess-Mutationen respektieren `admin.access + users.manage` und werden nicht vorab durch das generische Project-Edit-Gate blockiert.
- Projekt-Auflagen-Schreibaktionen im UI sind an Projekt-Schreibzugriff gekoppelt.
- Nicht-Ziele:
- keine Notification-/PowerAutomate-/Azure-Aenderungen, keine Import-/Export-/Recovery-Aenderungen ausser zwingenden Compile-/Review-Sichtbarkeitskorrekturen, keine neuen Dependencies.

## 2af. Gezielter Access-Control-Fixlauf 2026-05-03 fuer Project Read/Write Scope
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine Rollenarchitektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der zwei Review-Findings zu `projects.viewAll` und `currentUserAccessSource: "GLOBAL"`.
- Backend-Regel:
- `projects.viewAll` ist globaler Projekt-Lesescope und darf allein niemals `canWrite=true` erzeugen.
- Echte Projekt-Schreibberechtigung kommt aus explizitem ProjectAccess `PROJECT_EDITOR`, implizitem Owner/Deputy oder aus dem bewusst vorhandenen globalen Schreibscope `projects.viewAll + projects.edit`.
- `PROJECT_VIEWER`, `EXTERNAL_PROJECT_VIEWER`, interne Teilnehmer und `GLOBAL` durch reines `projects.viewAll` bleiben read-only.
- Domain-Mutationen und Kommentar-Mutationen brauchen weiterhin Domain-Write-Permission plus echten Project-Write-Scope.
- ProjectAccess-Verwaltung bleibt getrennt auf `admin.access + users.manage`.
- Frontend-Regel:
- `GLOBAL` wird nicht mehr als Edit-/Write-Quelle interpretiert.
- UI-Schreibaktionen verwenden serverseitige Flags wie `currentUserCanWrite`, `canUpdate` und `canArchive` oder die daraus abgeleitete Projekt-Policy.
- Nicht-Ziele:
- keine Azure-, Notification-/PowerAutomate-, MigrationBootstrap-, Import-/Export-/Recovery-Aenderungen, keine neuen Dependencies, keine UI-Neugestaltung.

## 2ag. Gezielter RBAC-Fixlauf 2026-05-03 fuer Projekt-Read und TaskState-Status
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine Rollenarchitektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der zwei Review-Findings zu Projekt-Read-Routen und `TaskState`-Statuswechseln.
- Backend-Regel:
- ProjectAccess ist nur Projekt-Scope und ersetzt fuer interne Benutzer kein Projekt-Domain-Leserecht.
- Interne `GET /projects`- und `GET /projects/:id`-Aufrufe brauchen zuerst `projects.view` oder `projects.viewAll`; danach wird ProjectAccess bzw. globaler Lesescope angewendet.
- Externe Benutzer behalten nur den bestehenden explizit gescopten Project-Shell-Zugriff und erhalten keine breite Projektliste oder interne Vollsicht.
- `POST /task-state/:taskInstanceId/status` prueft status-spezifisch im Handler: `DONE` braucht `tasks.complete`, `OPEN` und `IN_PROGRESS` brauchen `tasks.edit`.
- `/complete` und Evidence-Completion bleiben weiterhin `tasks.complete`.
- Nicht-Ziele:
- keine Azure-, Notification-/PowerAutomate-, MigrationBootstrap-, Import-/Export-/Recovery-Aenderungen, keine neuen Dependencies, keine UI-Neugestaltung.

## 2ah. Gezielter UI-/RBAC-Fixlauf 2026-05-03 fuer Domain-Write und Altbescheide
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine Rollenarchitektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der P2-Review-Findings zu Domain-Write-Gating, Altbescheid-Tab-Sichtbarkeit und Altbescheid-Archive-/Restore-Permissions.
- Domain-Seiten duerfen Schreibaktionen nicht aus dem globalen `ProjectsStore` ableiten, weil scoped Domain-Listen auch ohne `projects.view` serverseitig korrekt gefuellt sein koennen.
- API-DTOs duerfen minimal berechnete Projekt-Titel und ProjectWrite-Flags liefern; Create-Selectoren duerfen nur domain-scoped writable Projektoptionen erhalten, keine breite Projektliste.
- Altbescheide werden im Projektdetail nur geladen und angezeigt, wenn das API-konforme LegalDoc-/Legacy-Read-Recht vorhanden ist.
- Archive-/Restore-Aktionen fuer Altbescheide verwenden `legalDocs.archive`; `legalDocs.edit` reicht dafuer nicht.
- Nicht-Ziele:
- keine Prisma-Schema-/Migration-Aenderungen, keine Azure-, Notification-/PowerAutomate-, Import-/Export-/Recovery-Aenderungen, keine neuen Dependencies, keine UI-Neugestaltung.

## 2ai. Portal-Design-Feature 2026-05-03: optionales Sidebar-Logo und Icon
- Ziel ist ein optionales Admin-verwaltetes Portal-Logo oberhalb der linken Navigation und ein separates Icon fuer den eingeklappten Sidebar-Zustand.
- Fallback-Regel: Ohne hochgeladenes Logo/Icon wird kein Wrapper, kein Platzhalter und kein zusaetzlicher Abstand gerendert; die Sidebar bleibt visuell und funktional unveraendert.
- Persistenz erfolgt ueber eine kleine PostgreSQL-Tabelle `BrandingAsset` mit je einem aktuellen Asset pro Typ `SIDEBAR_LOGO` und `SIDEBAR_ICON`.
- Admin-Routen liegen unter `/api/admin/design`; lesende Branding-Routen unter `/api/branding*` sind fuer eingeloggte Nutzer verfuegbar.
- Uploads sind auf kleine Bilddateien begrenzt: Logo PNG/JPEG/WebP bis 1 MB, Icon PNG/ICO/WebP bis 256 KB; SVG wird in dieser Umsetzung nicht zugelassen.
- Design-Verwaltung nutzt `admin.access + masterData.manage`; es wird keine neue Permission und keine neue externe Storage-Infrastruktur eingefuehrt.
- Nicht-Ziele: kein Theme-System, keine Farbverwaltung, keine Mandantenfaehigkeit, kein Azure Blob Storage, kein Browser-Tab-Favicon und keine Aenderung bestehender Navigation ausser optionalem Logo/Icon sowie Admin-Design-Link.

## 2a. Verifizierter Stand 2026-04-15
- Phase 1 ist im aktuellen Code bereits serverseitig umgesetzt:
- `apps/api/src/routes/scopes.ts`
- `apps/api/src/routes/authorities.ts`
- `apps/web/src/state/ScopesStore.tsx`
- `apps/web/src/state/AuthoritiesStore.tsx`
- Der `AuthProvider`-Hotfix in `apps/web/src/App.tsx` ist bereits vorhanden; `ScopesProvider` und `AuthoritiesProvider` laufen innerhalb des Auth-Kontexts und dürfen in Phase 2 nicht beschädigt werden.
- Lokale Pflicht-Basisprüfung vor Phase 2 ist auf dem realen Repository-Stand erfolgreich gewesen:
- `npx prisma generate`
- `npx prisma db push --skip-generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- Seed + Login gegen die lokale PostgreSQL-Entwicklungsdatenbank funktionieren.
- `/api/scopes` und `/api/authorities` liefern serverseitige Daten.
- Bekannter Repo-Übergangszustand bleibt bestehen:
- `apps/api/prisma/migrations/migration_lock.toml` zeigt historisch noch `provider = "sqlite"`.
- Lokale Verifikation für diese Migration stützt sich deshalb auf `prisma generate` plus `prisma db push`; Phase-2-Umsetzung wird nicht an `prisma migrate deploy` blockiert.
- Fokus der aktuellen Umsetzung ist ausschließlich Phase 2:
- `projects` werden serverseitig in PostgreSQL zur einzigen Source of Truth.
- `legalDocs`, `obligations`, `deadlines`, `taskState` und `tasks` bleiben in dieser Phase außerhalb der serverseitigen Migration, abgesehen von minimalen Anschlussanpassungen.
- Laufzeitregel für Phase 2:
- Seed-Projekte aus `apps/web/src/data/projects.ts` bleiben nur noch für explizite Admin-Reset-/Demo-Aktionen erlaubt, nicht mehr als stiller Fallback beim normalen Start oder bei fehlgeschlagenem Reload.

## 2b. Verifizierter Stand 2026-04-16
- Pflicht-Basisprüfung für Phase 3 ist auf dem realen Repository-Stand erfolgreich:
- `pg_isready -h localhost -p 5433`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npx prisma db push --skip-generate`
- Lokaler API-/Web-Start funktioniert; Login gegen die lokale PostgreSQL-Entwicklungsdatenbank funktioniert mit den in `.env` hinterlegten Admin-Credentials.
- `/api/projects` liefert serverseitige Daten.
- Phase 3 ist im aktuellen Code-Stand noch nicht umgesetzt:
- `apps/api/prisma/schema.prisma` enthält noch kein `LegalDocument`-Modell.
- `apps/api/src/app.ts` mountet noch keine `legalDocs`-Route.
- `apps/web/src/state/LegalDocsStore.tsx` ist noch `localStorage`-/Seed-basiert.
- `apps/web/src/components/ServerStateSync.tsx` behandelt `legalDocs` weiterhin als Snapshot-Laufzeitquelle.
- `GET /api/legal-docs` liefert lokal aktuell `404`.
- Fokus der aktuellen Umsetzung ist ausschließlich Phase 3:
- `legalDocs` werden serverseitig in PostgreSQL zur einzigen Source of Truth.
- `obligations`, `deadlines`, `taskState` und `tasks` bleiben in dieser Phase außerhalb der serverseitigen Migration, abgesehen von minimalen Anschlussanpassungen.
- Laufzeitregel für Phase 3:
- Seed-Rechtsdokumente aus `apps/web/src/data/legalDocs.ts` bleiben nur noch für explizite Admin-Reset-/Demo-Aktionen erlaubt, nicht mehr als stiller Fallback beim normalen Start oder bei fehlgeschlagenem Reload.

## 2c. Verifizierter Stand 2026-04-16 vor Phase 4
- Pflicht-Basisprüfung für Phase 4 ist auf dem realen Repository-Stand erfolgreich:
- `pg_isready -h localhost -p 5433`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npx prisma db push --skip-generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- Lokaler API- und Web-Start funktionieren; Login gegen die lokale PostgreSQL-Entwicklungsdatenbank funktioniert mit den in `apps/api/.env` hinterlegten Admin-Credentials.
- Die bereits migrierten Endpunkte funktionieren lokal:
- `GET /api/auth/me`
- `GET /api/scopes`
- `GET /api/authorities`
- `GET /api/projects`
- `GET /api/legal-docs`
- Phase 3 ist im aktuellen Code-Stand abgeschlossen:
- `apps/api/prisma/schema.prisma` enthält `LegalDocument`.
- `apps/api/src/app.ts` mountet `createLegalDocsRouter`.
- `apps/api/src/routes/legalDocs.ts` bietet CRUD, Archive/Restore und interne Bulk-Helfer.
- `apps/web/src/state/LegalDocsStore.tsx` lädt/schreibt `legalDocs` über die API und löscht den alten Storage-Key aktiv.
- `apps/web/src/components/ServerStateSync.tsx` behandelt `legalDocs` nicht mehr als Snapshot-Laufzeitquelle.
- Phase 4 ist im aktuellen Code-Stand noch nicht umgesetzt:
- `apps/api/prisma/schema.prisma` enthält noch kein `Obligation`-Modell.
- `apps/api/src/app.ts` mountet noch keine `obligations`-Route.
- `apps/web/src/state/ObligationsStore.tsx` ist noch `localStorage`-basiert und fällt bei `replaceObligations()`/`resetObligations()` auf Seed-Daten zurück.
- `apps/web/src/components/ServerStateSync.tsx` behandelt `obligations` weiterhin als Snapshot-Laufzeitquelle.
- `apps/web/src/state/importExport/exportPayload.ts` exportiert `obligations` derzeit noch direkt aus `localStorage`.
- Fokus der aktuellen Umsetzung ist ausschließlich Phase 4:
- `obligations` werden serverseitig in PostgreSQL zur einzigen Source of Truth.
- `deadlines`, `taskState` und `tasks` bleiben in dieser Phase außerhalb der serverseitigen Migration, abgesehen von minimalen Anschlussanpassungen.
- Laufzeitregel für Phase 4:
- Seed-Auflagen aus `apps/web/src/data/obligations.ts` bleiben nur noch für explizite Admin-Reset-/Demo-/Rollback-Helfer erlaubt, nicht mehr als stiller Fallback beim normalen Start oder bei fehlgeschlagenem Reload.

## 2d. Verifizierter Stand 2026-04-16 vor Phase 5
- Pflicht-Basisprüfung für Phase 5 ist auf dem realen Repository-Stand erfolgreich:
- `pg_isready -h localhost -p 5433`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npx prisma db push --skip-generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- Lokaler API-Start (`cd apps/api && npm run start`) und Web-Start (`cd apps/web && npm run dev -- --host 127.0.0.1 --port 5173`) funktionieren.
- Login gegen die lokale PostgreSQL-Entwicklungsdatenbank funktioniert mit den in `apps/api/.env` hinterlegten Admin-Credentials.
- Die bereits migrierten Endpunkte funktionieren lokal:
- `GET /api/auth/me`
- `GET /api/scopes`
- `GET /api/authorities`
- `GET /api/projects`
- `GET /api/legal-docs`
- `GET /api/obligations`
- Phase 4 ist im aktuellen Code-Stand abgeschlossen:
- `apps/api/prisma/schema.prisma` enthält `Obligation`.
- `apps/api/src/app.ts` mountet `createObligationsRouter`.
- `apps/web/src/state/ObligationsStore.tsx` lädt/schreibt `obligations` über die API und löscht den alten Storage-Key aktiv.
- `apps/web/src/components/ServerStateSync.tsx` behandelt `obligations` nicht mehr als Snapshot-Laufzeitquelle.
- Phase 5 ist im aktuellen Code-Stand noch nicht umgesetzt:
- `apps/api/prisma/schema.prisma` enthält noch kein `Deadline`-Modell.
- `apps/api/src/app.ts` mountet noch keine `deadlines`-Route.
- `apps/web/src/state/DeadlinesStore.tsx` ist noch `localStorage`-basiert und fällt bei `replaceDeadlines()`/`resetDeadlines()` auf Seed-Daten zurück.
- `apps/web/src/components/ServerStateSync.tsx` behandelt `deadlines` weiterhin als Snapshot-Laufzeitquelle.
- `apps/web/src/state/importExport/exportPayload.ts` exportiert `deadlines` derzeit noch direkt aus `localStorage`.
- `GET /api/deadlines` liefert lokal aktuell `404`.
- Fokus der aktuellen Umsetzung ist ausschließlich Phase 5:
- `deadlines` werden serverseitig in PostgreSQL zur einzigen Source of Truth.
- `taskState` und `tasks` bleiben in dieser Phase außerhalb der serverseitigen Migration, abgesehen von minimalen Anschlussanpassungen.
- Laufzeitregel für Phase 5:
- Seed-Fristen aus `apps/web/src/data/deadlines.ts` bleiben nur noch für explizite Admin-Reset-/Demo-/Rollback-Helfer erlaubt, nicht mehr als stiller Fallback beim normalen Start oder bei fehlgeschlagenem Reload.

## 2e. Verifizierter Stand 2026-04-16 vor Phase 6
- Pflicht-Basisprüfung für Phase 6 ist auf dem realen Repository-Stand erfolgreich:
- `pg_isready -h localhost -p 5433`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npx prisma db push --skip-generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- `cd apps/api && npm run start`
- `cd apps/web && npm run dev -- --host 127.0.0.1 --port 5173`
- Login gegen die lokale PostgreSQL-Entwicklungsdatenbank funktioniert mit den in `apps/api/.env` hinterlegten Admin-Credentials.
- Die bereits migrierten Endpunkte funktionieren lokal:
- `GET /api/auth/me`
- `GET /api/scopes`
- `GET /api/authorities`
- `GET /api/projects`
- `GET /api/legal-docs`
- `GET /api/obligations`
- `GET /api/deadlines`
- Phase 5 ist im aktuellen Code-Stand abgeschlossen:
- `apps/api/prisma/schema.prisma` enthält `Deadline`.
- `apps/api/src/app.ts` mountet `createDeadlinesRouter`.
- `apps/web/src/state/DeadlinesStore.tsx` lädt/schreibt `deadlines` über die API und löscht den alten Storage-Key aktiv.
- `apps/web/src/components/ServerStateSync.tsx` behandelt `deadlines` nicht mehr als Snapshot-Laufzeitquelle.
- Phase 6 ist im aktuellen Code-Stand noch nicht umgesetzt:
- `apps/api/prisma/schema.prisma` enthält noch kein `TaskStateEntry`-Modell.
- `apps/api/src/app.ts` mountet noch keine `task-state`-Route.
- `apps/web/src/state/TaskStateStore.tsx` ist noch `localStorage`-basiert.
- `apps/web/src/components/ServerStateSync.tsx` behandelt aktuell nur noch `taskState` als aktive Snapshot-Laufzeitquelle.
- `apps/web/src/state/importExport/exportPayload.ts` exportiert `taskState` derzeit noch direkt aus `localStorage`.
- `GET /api/state` liefert lokal weiterhin `taskState`, `GET /api/task-state` liefert aktuell `404`.
- Fokus der aktuellen Umsetzung ist ausschließlich Phase 6:
- `taskState` wird serverseitig in PostgreSQL zur einzigen Source of Truth.
- `TasksStore` bleibt eine abgeleitete Read-Projection aus `obligations`, `deadlines` und `taskState`.
- Es wird keine separate `Task`-Tabelle eingeführt, solange der bestehende `taskState`-Ansatz serverseitig tragfähig bleibt.

## 2f. Abschlussstand 2026-04-16 nach Konsolidierungs- und Review-Lauf
- Pflicht-Abschlussprüfung für den Stand nach Phase 6 ist erfolgreich:
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npx prisma db push --skip-generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- Technische Laufzeitprüfung gegen die lokal gestartete API ist erfolgreich für:
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/scopes`
- `GET /api/authorities`
- `GET /api/projects`
- `GET /api/legal-docs`
- `GET /api/obligations`
- `GET /api/deadlines`
- `GET /api/task-state`
- Aktive Snapshot-Laufzeitpfade sind entfernt:
- `apps/web/src/components/ServerStateSync.tsx` ist entfernt.
- `apps/web/src/api/state.ts` ist entfernt.
- `apps/api/src/routes/state.ts` ist entfernt und in `apps/api/src/app.ts` nicht mehr gemountet.
- `taskState` hat keine implizite Runtime-Backfill-Abhängigkeit zu `PortalSnapshot` mehr; die Fachdomäne liest nur noch `TaskStateEntry`.
- Verbleibende Snapshot-Nutzung ist nur noch explizit administrativ/migrationsbezogen:
- `PortalSnapshot` bleibt vorerst im Prisma-Schema erhalten.
- Die Domänenrouter für `authorities`, `scopes`, `projects`, `legalDocs`, `obligations` und `deadlines` behalten nur explizite `backfill-from-snapshot`-/`rollback-to-snapshot`-Hilfspfade für dokumentierte Migration/Rollback-Fälle.
- Verbleibende Local-Storage-Nutzung für bereits migrierte Fachdomänen ist nicht mehr aktive Laufzeitquelle:
- `AuthoritiesStore` und `ScopesStore` starten nicht mehr mit Seed-Daten und fallen bei Reload-Fehlern nicht mehr auf Seeds zurück.
- Export-/Recovery-Pfade lesen serverseitig migrierte Fachdomänen nicht mehr aus `localStorage`; sie verwenden API-Lesewege und fallen nur noch auf leere Werte zurück, wenn die API nicht erreichbar ist.
- Legacy-Storage-Keys bleiben nur noch zum expliziten Aufräumen alter Browserdaten erhalten.

## 2g. Stabilisierungslauf 2026-04-16 nach Review-Blockern
- Dies ist keine neue Migrationsphase und kein Architekturwechsel.
- Ziel dieses Laufs ist ausschließlich die Behebung der im Review identifizierten Rollout-Blocker vor einem produktionsnahen Rollout.
- Zulässiger Umfang:
- `TaskState`-Backfill/Merge beim ersten Start nach der Umstellung absichern.
- Recovery-Export bei fehlenden serverseitigen Domänen hart fehlschlagen lassen.
- Projekt-Replace-Importe gegen stille Kaskadenlöschungen absichern.
- Reset-/Demo-/Import-Reihenfolgen in `AdminPage` an die neuen FK-Abhängigkeiten anpassen.
- `DeadlineModal` auf sichere asynchrone Save-Fertigstellung bringen.
- Nicht-Ziele dieses Laufs:
- Keine neue Phase starten.
- Keine weitere Snapshot-Bereinigung über die fünf Review-Punkte hinaus.
- Keine neuen Features, keine UX-Neugestaltung, keine zusätzlichen Dependencies.

## 2h. Fachliche Nachpflege 2026-04-17 vor Live-Rollout
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich die fachliche Vervollständigung der Ansprechpartner-Verwaltung im Admin-Bereich auf Basis der bereits serverseitig migrierten Domäne `authorities`.
- `AuthorityContact` wird additiv um `firstName`, `lastName`, `mobile`, `notes`, `department` und `isPrimary` erweitert.
- `name` bleibt im Modell, API-Shape und Frontend erhalten und wird, wenn `firstName` und/oder `lastName` gepflegt sind, kompatibel daraus abgeleitet.
- Bestehende Listen, Selektoren und Referenzen auf `contact.name` bleiben stabil; alte Datensätze mit nur `name` bleiben gültig und editierbar.
- Quelle der Wahrheit bleibt unverändert API + PostgreSQL; es gibt keine Rückkehr zu `localStorage` oder Snapshot für diese Domäne.

## 2i. Stabilisierungslauf 2026-04-17 zu den aktuellen Review-Blockern
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich die Behebung der drei aktuellen Rollout-Blocker aus dem Review.
- Zulässiger Umfang:
- lokale/testnahe Startpfade, Compose und API-Defaults auf PostgreSQL harmonisieren; keine SQLite- oder `file:`-Fallbacks als implizite Standardpfade belassen.
- den API-Container gegen leere PostgreSQL-Datenbanken wieder selbst bootstrap-fähig machen, mit dem bestehenden Repo-Übergangsworkflow `prisma generate` + `prisma db push` + idempotentem Seed; kein blindes Erzwingen von `prisma migrate deploy`.
- Scope-/Authority-Bulk-Replace- und Bulk-Delete-Pfade sowie den Admin-Import so absichern, dass partielle Imports bei bereits vorhandenen abhängigen Projekten/Downstream-Daten sauber blockiert werden statt FK-Fehler oder stille Löschungen auszulösen.
- Nicht-Ziele dieses Laufs:
- keine neue Domain-Migration beginnen.
- keine zusätzliche Snapshot-Bereinigung außerhalb dieser drei Blocker.
- keine UX-Neugestaltung, keine neuen Dependencies, keine Rückkehr zu Browser- oder Snapshot-Persistenz für bereits migrierte Domänen.

## 2j. Pre-Go-Live Admin-Ausbau 2026-04-17 fuer Behoerden
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich ein klarer, sichtbarer Admin-Einstieg fuer die bereits serverseitig persistierte Domäne `authorities`.
- Verifizierter Ist-Stand vor Umsetzung:
- `Authority` und `AuthorityContact` sind bereits in PostgreSQL + API + `AuthoritiesStore` serverseitig verdrahtet.
- `AuthorityContact` enthaelt bereits `name`, `firstName`, `lastName`, `roleTitle`, `department`, `email`, `phone`, `mobile`, `notes` und `isPrimary`.
- `name` bleibt im API-Shape und Frontend erhalten und wird in Route + Store bereits kompatibel aus `firstName`/`lastName` abgeleitet, wenn diese gepflegt sind.
- Zulässiger Umfang:
- Admin-Subnavigation um einen Tab `Behoerden` ergaenzen, direkt neben `Externe Firmen`.
- dedizierte Admin-Seite fuer Behoerden + Ansprechpartner anlegen, ohne zweite Hauptnavigation fuer Ansprechpartner.
- bestehende API-/Store-/Auth-Strukturen wiederverwenden; keine Rueckkehr zu `localStorage` oder Snapshot.
- Nicht-Ziele:
- kein neuer Persistenzlayer, kein neuer Store, kein Routing- oder UI-Redesign ausserhalb des Admin-Bereichs.
- keine Aenderungen an Projekten, Rechtsdokumenten oder anderen Domänen ausser minimaler Rueckwaertskompatibilitaetswahrung.

## 2k. Stabilisierungslauf 2026-04-18 vor dem Live-Rollout
- Dies ist keine neue Persistenz- oder Mobile-Phase.
- Ziel dieses Laufs ist ausschließlich die Behebung von zwei aktuellen Review-Befunden:
- `apps/api/src/bootstrap.ts` gegen parallele Container-Starts auf leerer PostgreSQL-DB idempotent und race-sicher machen, ohne bestehende mutable Admin-/User-Daten zu überschreiben.
- Scope-Bulk-Replace und Scope-Bulk-Delete in `apps/api/src/routes/scopes.ts` nur noch bei echten Scope-Abhängigkeiten blockieren, nicht wegen isolierter `Deadline`- oder `TaskStateEntry`-Reste.
- Zulässiger Umfang:
- minimale Anpassungen in Bootstrap, Container-Startskript und Scope-Blockerlogik.
- keine neue Bootstrap-Architektur, keine neuen Dependencies, keine neuen Persistenzpfade.
- Mobile-Welle-1-Änderungen bleiben unangetastet; dieser Lauf darf dort keine Regression einführen.
- Nicht-Ziele:
- keine neue Domain-Migration beginnen.
- keine weitere Snapshot-Bereinigung außerhalb dieser beiden Review-Punkte.
- keine UX-Änderungen, keine zusätzlichen Admin- oder Import-Features.

## 2l. Obligation-Intervallfix 2026-04-18 vor dem Live-Rollout
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich ein kleiner fachlicher/UI-Fix für die bereits serverseitig migrierte Domäne `obligations`.
- Verifizierter Ist-Stand vor Umsetzung:
- `intervalUnit` ist in PostgreSQL bereits als freies `String?` modelliert; die technische Einschränkung liegt aktuell in API-Normalisierung, Frontend-Typen, Modal-Auswahl, Detailanzeige und der obligation-basierten Task-Ableitung.
- In der UI für `Auflage erstellen` / `Auflage bearbeiten` sind aktuell nur `MONTH` und `YEAR` auswählbar.
- Zulässiger Umfang:
- erlaubte Intervall-Einheiten additiv auf `DAY`, `WEEK`, `MONTH`, `QUARTER`, `YEAR` erweitern.
- bestehende Semantik für `MONTH` und `YEAR` unverändert beibehalten.
- obligation-basierte Termin-/Task-Ableitung additiv für `DAY`, `WEEK` und `QUARTER` erweitern.
- minimale Label-Ergänzungen für `Tag`, `Woche` und `Quartal`.
- Nicht-Ziele:
- keine Änderung an `scheduleType`.
- keine neue Persistenz- oder Snapshot-Logik.
- keine Änderungen an `deadlines`, Auth, Permissions, Admin-Import/Reset oder anderer Fach-UX außerhalb der betroffenen Auflagenfelder und Anzeigen.

## 2m. Review-Fixlauf 2026-04-18 vor dem Live-Rollout
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich die Behebung der aktuellen Review-Findings ohne UX-Neugestaltung.
- Zulässiger Umfang:
- die Legacy-Admin-Werkzeuge in `AdminPage` wieder erreichbar machen, ohne die neuen Admin-Unterseiten für Benutzer, Rollen, Externe Firmen und Behörden zurückzubauen.
- UI-Vorabblocker für Scope-Importe von Authority-/Downstream-Blockern trennen und exakt an die bestehenden API-Regeln angleichen.
- Container-Startup auf migrations-first umstellen und für bereits ad hoc synchronisierte Umgebungen einen sauberen Baseline-/History-Pfad herstellen, damit künftige `prisma migrate deploy`-Rollouts nicht an fehlender `_prisma_migrations`-Historie scheitern.
- Nicht-Ziele:
- keine Änderung an Fach-Workflows außerhalb von Admin-Routing, Admin-Importvalidierung und API-Startup.
- keine neue Domain-Migration, keine neuen Dependencies, keine Umgestaltung der Admin-UX.

## 2n. Facherweiterung 2026-04-18 Phase C1a Projektstatus
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich die additive Einführung eines fachlichen Projektstatus auf der bereits serverseitig persistierten Domäne `projects`.
- Verbindliche Produktregel:
- `isArchived` und `archivedAt` bleiben unverändert die einzige Archivierungslogik.
- `Archiviert` wird nicht als Projektstatus eingeführt.
- Zulässiger Umfang:
- `Project` in Prisma, API, Store, Import/Export und bestehender Projekt-UI minimal-invasiv um ein fachliches Statusfeld erweitern.
- erlaubte Statuswerte in C1a: `DRAFT`, `INTERNAL_REVIEW`, `SUBMISSION_PREPARATION`, `UVP_PREPARATION`, `SUBMITTED`, `ADDITIONAL_INFORMATION_REQUEST`, `APPROVED`, `IN_IMPLEMENTATION`.
- Legacy-Bestände ohne Status bleiben fachlich neutral und werden als "nicht gesetzt" behandelt; neue Projekte erhalten `DRAFT`.
- Projektliste, Projektdetail und Projekt-Modal zeigen den Status; optionale Status-Filter sind nur zulässig, wenn sie ohne UX-Umbau additiv bleiben.
- Import/Export, Demo- und Reset-Flows für Projekte bleiben kompatibel und führen das Feld mit.
- Nicht-Ziele:
- keine Checklisten-Engine, keine Profil-/Modul-Logik, keine UVP-Speziallogik, keine Dokumentpflichtlogik, keine Aufgaben-/Fristen-Automatik, keine neue API-Architektur.

## 2o. Facherweiterung 2026-04-18 Phase C1b Projekteinreichtyp
- Dies ist keine neue Persistenzphase.
- Ziel dieses Laufs ist ausschließlich die additive Einführung eines einzelnen fachlichen Einreichtyps auf der bereits serverseitig persistierten Domäne `projects`.
- Verbindliche Produktregel:
- `Project.status` aus C1a bleibt unverändert der fachliche Bearbeitungs- und Verfahrensstatus.
- `Project.submissionType` ist ein davon getrenntes skalare Fachattribut mit genau einem Wert pro Projekt in Version 1.
- `isArchived` und `archivedAt` bleiben unverändert die einzige Archivierungslogik; Archivierung wird nicht aus `status` oder `submissionType` abgeleitet.
- Zulässiger Umfang:
- `Project` in Prisma, API, Store, Import/Export und bestehender Projekt-UI minimal-invasiv um `submissionType` erweitern.
- erlaubte Werte in C1b: `GEWERBE`, `AWG`, `UVP_UVE`.
- Legacy-Bestände ohne Einreichtyp bleiben fachlich neutral und werden als "nicht gesetzt" behandelt.
- Neue Projekte erhalten keinen stillen Default; der Einreichtyp wird im bestehenden Projekt-Modal bewusst gewählt.
- Projektliste, Projektdetail und Projekt-Modal zeigen den Einreichtyp; ein additiver Filter ist nur zulässig, wenn er ohne UX-Umbau bleibt.
- Import/Export, Demo- und Reset-Flows für Projekte bleiben kompatibel und führen das Feld mit.
- Nicht-Ziele:
- kein Mehrfachprofil-System.
- keine Checklisten-Engine.
- keine Dokumentpflicht-, Aufgaben-, Fristen- oder Statusautomatik aus dem Einreichtyp.
- keine AWG-/UVP-spezifischen Vorlagen oder Zusatzmodule in diesem Lauf.

## 2p. Remediation-Lauf 2026-04-19 vor dem Azure-Rollout
- Dies ist keine neue Persistenz-, Mobile- oder Help-Phase.
- Ziel dieses Laufs ist ausschließlich die Behebung der aktuellen P1/P2-Review-Blocker vor einem Azure-Rollout.
- Zulässiger Umfang:
- Bootstrap/Seed/Compose-/Beispielkonfiguration gegen bekannte Default-Credentials absichern; leere oder Platzhalter-Credentials dürfen keinen automatischen Initial-Admin erzeugen.
- `project-checklists`-Bulk-Importe von einem globalen Tabellen-Replace auf projektbezogenes Replace umstellen; destruktive Voll-Löschungen nur noch über einen expliziten Delete-All-Pfad ausführen.
- Recovery-Export für `users` vollständig serverseitig lesen; kein `localStorage`-Fallback mehr.
- generischen `users`-Import nicht mehr nur im React-State anwenden; für diesen Lauf wird der Block explizit als server-managed ignoriert statt still lokal überschrieben.
- `TaskStateStore` bei `/api/task-state`- oder Legacy-Reconcile-Fehlern fail-closed betreiben; kein Wiederbeleben alter `localStorage`-/Snapshot-Daten.
- `ExternalParticipantModal` nur bei bestätigtem Persist-Erfolg schließen.
- Nicht-Ziele:
- keine neue Persistenzmigration, keine Schema-Erweiterung, keine neuen Dependencies.
- keine UX-Neugestaltung, keine zusätzlichen Admin- oder Recovery-Features.
- kein echter serverseitiger User-Restore über generische Importdateien in diesem Lauf; dafür wäre ein eigener, gesonderter Entwurf nötig.

## 2q. Gezielter Review-Fixlauf 2026-04-19 fuer drei Release-Blocker
- Dies ist keine neue Persistenzphase und keine neue Feature-Phase.
- Ziel dieses Laufs ist ausschliesslich die Behebung von drei konkret benannten Review-Findings.
- Zulaessiger Umfang:
- `ADMIN_PASSWORD=ChangeMe123!` in Bootstrap- und Seed-Pfaden unabhaengig von `ADMIN_EMAIL` blockieren; fehlende oder Platzhalter-Credentials duerfen keinen Initial-Admin erzeugen.
- den Admin-Import fuer `projectChecklists` so korrigieren, dass `projectChecklists` nur dann unveraendert bleibt, wenn der Block fehlt; ein explizites `projectChecklists: []` loescht Checklisten bewusst ueber den vorhandenen Delete-All-Pfad; nicht-leere Arrays bleiben projektbezogene Replaces.
- Recovery- und generische Exportpfade von `/users` und `/users/lookup` entkoppeln, solange generische Imports den Benutzerblock bewusst ignorieren; User-Daten werden dabei nicht als wiederherstellbarer Teil des Exports ausgegeben.
- Nicht-Ziele:
- keine weiteren Review-Fixes, keine neue Import-/Recovery-Architektur, keine UX-Neugestaltung.
- keine neuen Dependencies, keine Rueckkehr zu localStorage- oder Snapshot-Pfaden fuer migrierte Domänen.

## 2r. Gezielter Review-Fixlauf 2026-04-19 fuer Rollen-/Permission-Handling und Admin-Fehlermeldungen
- Dies ist keine neue Persistenzphase, keine neue Feature-Phase und keine neue Rollenarchitektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung von drei klar abgegrenzten Review-Findings.
- Zulaessiger Umfang:
- `authorities.manage` muss serverseitig Leserechte fuer `GET /authorities` wirksam einschliessen; `authorities.view` darf fuer bestehende Custom Roles beim Bearbeiten nicht verloren gehen.
- Admin-Unterbereichsrechte duerfen nicht ohne `admin.access` gespeichert werden; betroffen sind nur echte Admin-Subsection-Permissions, keine allgemeinen Lookup-/Read-Permissions wie `authorities.view`.
- 409-Konflikte in der Admin-Benutzerverwaltung duerfen nicht pauschal als E-Mail-Konflikt angezeigt werden; E-Mail-Konflikte bleiben spezifisch, andere Konflikte nutzen serverseitige Message oder einen passenden kontextbezogenen Fallback.
- Nicht-Ziele:
- keine View-only-Implementierung fuer `AdminAuthoritiesPage`.
- keine neuen Berechtigungen, keine neue Error-Handling-Architektur, keine UX-Neugestaltung.
- keine Aenderungen ausserhalb der betroffenen Rollen-/Permission- und Admin-Fehlermeldungs-Pfade.

## 2s. Gezielter Review-Fixlauf 2026-04-20 fuer Notification-Admin ATTENTION und race-sichere Admin-Transitions
- Dies ist keine neue Persistenzphase, keine neue Feature-Phase und keine PowerAutomate-Erweiterung.
- Ziel dieses Laufs ist ausschliesslich die Behebung von zwei Review-Findings in der bestehenden Notification-Admin-Logik.
- Zulaessiger Umfang:
- der ATTENTION-Filter in `apps/api/src/adminNotifications.ts` darf nur noch actionable/problematische Eintraege enthalten.
- `FAILED` und `RETRY` bleiben in ATTENTION; `CLAIMED` nur dann, wenn `claimedAt` gemaess bestehender Lease-Konfiguration stale ist.
- frische `CLAIMED`-Eintraege duerfen im ATTENTION-Filter nicht mehr erscheinen.
- `retryAdminNotification` und `cancelAdminNotification` duerfen keine Worker-Claims mehr durch blinde Updates nach `id` ueberschreiben.
- fuer Retry/Cancel wird derselbe erlaubte Status-/Claim-Zustand beim Schreiben per bedingtem Update abgesichert; bei zwischenzeitlicher Worker-Uebernahme oder Statusaenderung wird ein sauberer Konflikt zurueckgegeben.
- Lease-/Stale-Definition bleibt an `config.notificationClaimLeaseSeconds` gebunden; keine neue Magic Number und keine Frontend-Gegensteuerung fuer ATTENTION.
- Nicht-Ziele:
- keine neue Notification-Funktion, keine Dispatcher- oder Locking-Neuarchitektur.
- keine Aenderungen an PowerAutomate, E-Mail-Templates oder der Admin-UI ausser der bereits serverseitig korrigierten ATTENTION-Semantik.
- keine Prisma-Schema- oder Persistenzaenderung ausserhalb der bestehenden Notification-Admin-Logik und ihrer Tests.

## 2t. Remediation-Lauf 2026-04-23 fuer aktuelle Review-Blocker und Rest-Risiken
- Dies ist keine neue Persistenzphase und keine neue Feature-Phase.
- Ziel dieses Laufs ist ausschliesslich die minimal-invasive Behebung aktueller Review-Findings vor einem erneuten Release-Review.
- Zulaessiger Umfang:
- Produktionsruntime fail-closed gegen fehlendes oder Platzhalter-`SESSION_SECRET` sowie gegen `COOKIE_SECURE=false` unter `NODE_ENV=production` absichern; Compose- und Beispielkonfiguration daran angleichen.
- `migrationBootstrap` auf das aktive `Project.submissionType`-Modell ausrichten; obsolete `SubmissionProfile`-/`ProjectSubmissionProfileAssignment`-Objekte duerfen fuer aktuelle no-history-Baselines nicht mehr Voraussetzung sein.
- nicht-atomare, destruktive Multi-Domain-Aktionen in der Admin-Datenverwaltung (`Import`, `Reset`, `Demo-Replace`) bis zu einem serverseitig orchestrierten Recovery-Pfad fail-closed sperren statt weiter als sicherer Gesamt-Recovery-Mechanismus zu erscheinen.
- generischen Export und Recovery-Kommunikation ehrlich als Teil-Export mit begrenztem Scope dokumentieren; kein vollstaendiges Restore/Disaster-Recovery suggerieren.
- Web-Doku (`apps/web/README.md`, `apps/web/docs/DATA_CONTRACT.md`) auf den realen serverseitigen Betriebsmodus aktualisieren.
- Passwort-Reset-Token pro Benutzer so serialisieren, dass keine gleichzeitigen aktiven Tokens mit identischem `createdAt` als Zeitanker entstehen.
- lokale Projektchecklisten-Historie mit dem echten eingeloggten Benutzer statt `Demo User` beschriften.
- Nicht-Ziele:
- keine neue Import-/Restore-Architektur.
- keine Azure-Deploy-Arbeit.
- keine neue Snapshot- oder `localStorage`-Source-of-Truth fuer migrierte Domänen.
- keine neuen Dependencies und keine UX-Neugestaltung ausser klaren Sicherheits-/Scope-Hinweisen und fail-closed Sperren.

## 2u. Remediation-Lauf 2026-04-24 fuer die zwei verbleibenden P1-Rollout-Blocker
- Dies ist keine neue Persistenzphase, keine neue Feature-Phase und keine Azure-Arbeit.
- Ziel dieses Laufs ist ausschliesslich die minimal-invasive Behebung der zwei verbleibenden P1-Findings aus dem finalen Gesamt-Review.
- Zulaessiger Umfang:
- Produktions-Linkbasen fuer Reset-, Notification- und sonstige Portal-Links fail-closed zentral in `loadConfig()` haerten.
- `NOTIFICATION_BASE_URL` oder `APP_ORIGIN` muessen unter `NODE_ENV=production` explizit gesetzt und als absolute non-loopback-HTTPS-URL gueltig sein.
- lokale Entwicklung und die dokumentierte lokale Compose-HTTP-Umgebung mit `localhost` bleiben funktionsfaehig.
- serverseitige Legacy-Recovery-/Snapshot-/Bulk-Replace-Endpunkte fuer bereits migrierte Domänen standardmaessig fail-closed blockieren.
- Blockierung gilt fuer `scopes`, `authorities`, `projects`, `projectChecklists`, `legalDocs`, `obligations`, `deadlines` und `taskState`; normale Fach-CRUDs und ungefaehrliche Wartungsaktionen bleiben unberuehrt.
- Freischaltung solcher Legacy-Endpunkte nur noch ueber ein explizites, standardmaessig deaktiviertes Runtime-Flag `ENABLE_LEGACY_RECOVERY_ENDPOINTS=true`.
- Nicht-Ziele:
- keine neuen Recovery-Workflows.
- keine Rueckkehr zu Snapshot oder `localStorage` als Source of Truth.
- keine PowerAutomate-Flow-Aenderungen, keine neuen Dependencies und keine UX-Neugestaltung ausser bestehender Sperrkommunikation.

## 2v. Gezielter Pflicht-Fixlauf 2026-04-30 fuer externe Firmen, Admin-Passwortsetzen und Auflagen-Loeschen
- Dies ist kein Azure-Lauf, keine neue Persistenzphase, keine Rollenarchitektur und keine UI-Neugestaltung.
- Externe Firmen bleiben serverseitig in PostgreSQL und im vorhandenen Admin-Bereich. `admin.access + externalOrgs.view` liest, `admin.access + externalOrgs.manage` legt an, bearbeitet, archiviert und stellt wieder her. Der fachliche Name ist Pflicht; der technische Typ bleibt gespeichert und wird beim Fehlen kontrolliert mit `Firma` vorbelegt.
- Die Benutzerverwaltung nutzt den bestehenden Admin-Reset-Endpunkt weiter. Der direkte Passwort-Setz-Modus wird als sichtbarer Standard verwendet, ohne Link-, Manual- oder Auto-Modus zu entfernen.
- Auflagen bekommen einen einzelnen destruktiven Delete-Pfad ohne Bulk- oder Recovery-Reaktivierung. DELETE ist fail-closed: Abhaengige TaskState-/Evidence-, Dokument- oder Kommentarspuren blockieren mit 409; Archivieren bleibt dann der sichere Fachweg.
- Frontend-Stores bleiben API-backed. Es gibt keine Rueckkehr zu localStorage oder Snapshot als Source of Truth.
- Pflicht-Verifikation:
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- `git diff --check`
- falls PostgreSQL lokal erreichbar ist: `cd apps/api && npx prisma db push --skip-generate` und `cd apps/api && npm test`

## 2w. P1-Review-Fixlauf 2026-04-30 fuer Auflagen-Safe-Delete
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine neue Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich die Nachschaerfung von Auflagen-Hard-Delete:
- `DELETE /obligations/:id` verlangt mindestens die destruktive Permission `obligations.archive`; `obligations.edit` reicht nur fuer normales Bearbeiten.
- UI und API verwenden dieselbe Delete-Berechtigung; Edit-Only-Rollen sehen keinen Hard-Delete und erhalten serverseitig 403.
- Die Dependency-Pruefung fuer TaskState-/Evidence-, Dokument- und Kommentarspuren bleibt zusaetzlich aktiv und blockiert mit 409.
- Legacy-/Bulk-/Snapshot-Pfade fuer Auflagen bleiben default-off fail-closed und werden zusaetzlich direkt in den Auflagen-Handlern gegen Guard-Bypass abgesichert.
- Nicht-Ziele:
- keine neue `obligations.delete` Permission, keine Bulk-Safe-Delete-Orchestrierung und keine Reaktivierung alter Recovery-Pfade.

## 2x. P1-Fixlauf 2026-05-02 fuer Auflagen-Safe-Delete in Legacy-/Bulk-/Recovery-Pfaden
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine neue Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich, dass `ENABLE_LEGACY_RECOVERY_ENDPOINTS=true` die Safe-Delete-Regeln fuer Auflagen nicht umgehen kann.
- Zulässiger Umfang:
- `bulk-delete`, `bulk-replace`, `backfill-from-snapshot` und `rollback-to-snapshot` der Auflagen pruefen vor der Operation alle bestehenden Auflagen gegen dieselben blockierenden Abhaengigkeiten wie der Einzel-Delete.
- Blocker bleiben TaskState-/Evidence-Spuren, Dokumente und Kommentare; bei Blockern wird mit `409` und ohne Teil-Loeschung abgebrochen.
- Wenn keine Blocker existieren, bleiben die explizit freigeschalteten Wartungspfade im bisherigen Umfang nutzbar.
- Nicht-Ziele:
- keine neuen Auflagen-Workflows, keine UI-Aenderungen, keine neuen Dependencies, keine Azure-Aenderungen und keine Massencascade.

## 2y. Gezielter Dokument-Storage-/Repair-Fixlauf 2026-05-04
- Dies ist keine neue Persistenzphase, keine Azure-Arbeit und keine Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich, dass serverseitige Dokumentdateien dauerhaft aus dem konfigurierten Upload-Root gelesen und geschrieben werden und defekte Einzeleintraege sicher repariert oder entfernt werden koennen.
- `UPLOAD_DIR` ist der bevorzugte Upload-Root; `DOCUMENTS_STORAGE_DIR` bleibt als Kompatibilitaetsalias nutzbar. In Produktion faellt der Upload-Root ohne explizite Konfiguration sicher auf `/data/uploads` zurueck.
- Neue Dokumente speichern einen relativen Storage-Key unterhalb des Upload-Roots. Download, Preview, Delete und Replace loesen denselben Key gegen denselben Upload-Root auf.
- Legacy-Storage-Keys werden nur sicher unterhalb des Upload-Roots gelesen; absolute Pfade werden nur akzeptiert, wenn sie nach Normalisierung innerhalb des Upload-Roots liegen.
- Fehlende Dateien liefern einen maschinenlesbaren `FILE_MISSING`-Fehler. Fehlende Metadaten liefern `DOCUMENT_NOT_FOUND`.
- Einzel-Delete archiviert den Dokumenteintrag und loescht die Datei nur, wenn sie sicher innerhalb des Upload-Roots liegt. Fehlende Dateien blockieren die Metadatenbereinigung nicht.
- Datei-Replace fuer vorhandene Dokumenteintraege prueft dieselben ownerType-/Projekt-Schreibrechte wie Upload, schreibt die neue Datei sicher unterhalb des Upload-Roots und entfernt die alte Datei nur sicher.
- `TASK_EVIDENCE` bleibt fuer direkte Delete-/Replace-Aktionen fail-closed, damit Pflichtnachweise nicht still inkonsistent werden.
- Nicht-Ziele:
- keine Bulk-Loeschung, kein Bulk-Repair, kein DB-Script, kein Diagnose-Endpunkt, keine Snapshot-/Recovery-Reaktivierung, keine RBAC-Lockerung und keine neuen Dependencies.

## 2z. P2-Fixlauf 2026-05-04 fuer Dokument-Storage-Edge-Cases
- Dies ist kein neuer Dokument-Featurelauf, keine Azure-Arbeit und keine Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der drei P2-Review-Findings zum Dokument-Storage.
- Neue Storage-Keys duerfen keinen langen Original-Dateinamen mehr als Pfadkomponente verwenden; Original-Dateinamen bleiben nur in den Dokument-Metadaten und im Download-Header erhalten.
- `TASK_EVIDENCE` Delete/Replace prueft zuerst die erforderlichen ownerType-/Projekt-Schreibrechte und gibt erst danach fuer berechtigte Writer die fachliche 409-Blockade zurueck.
- Datei-Replace schreibt immer auf einen neuen eindeutigen Storage-Key und aktualisiert die DB erst nach erfolgreichem File-Write; alte Dateien werden erst nach erfolgreichem DB-Update geloescht.
- Nicht-Ziele:
- keine UI-Neugestaltung, keine neue Permission, keine TASK_EVIDENCE-Lockerung, keine Bulk-Operationen, keine neuen Dependencies und keine Azure-Aenderungen.

## 2za. P2-Fixlauf 2026-05-04 fuer Dokument-Delete-Reihenfolge
- Dies ist kein neuer Dokument-Featurelauf, keine Azure-Arbeit und keine Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung des P2-Review-Findings zum Dokument-Delete-Sicherheitsfluss.
- `DELETE /documents/:id` archiviert den Dokumenteintrag zuerst serverseitig und entfernt die physische Datei erst danach best effort.
- Wenn die DB-Archivierung fehlschlaegt, bleibt die Datei unangetastet und der aktive Dokumenteintrag zeigt weiter auf vorhandenen Inhalt.
- Wenn File-Cleanup nach erfolgreicher Archivierung fehlschlaegt, bleibt der Delete serverseitig wirksam; die Datei kann als orphan im Storage verbleiben.
- Nicht-Ziele:
- keine Upload-/Replace-Aenderung, keine neue Permission, keine TASK_EVIDENCE-Lockerung, keine Bulk-Operationen, keine neuen Dependencies und keine Azure-Aenderungen.

## 2zb. P2-Fixlauf 2026-05-04 fuer Dokument-Storage-Kompatibilitaet und Replace-Cleanup
- Dies ist kein neuer Dokument-Featurelauf, keine Azure-Arbeit und keine Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der zwei P2-Review-Findings zu Legacy-Storage-Aufloesung und Replace-Cleanup.
- `UPLOAD_DIR` bleibt der neue Upload-Root. `DOCUMENTS_STORAGE_DIR` wird zusaetzlich als Legacy-Root fuer alte relative Storage-Layouts erhalten.
- Gespeicherte Dokumentpfade werden als sichere Kandidaten aufgeloest: aktuelles Upload-Layout, Legacy-Root exakt relativ zum gespeicherten `storagePath`, danach bestehende stripped-`uploads/`-Kompatibilitaet.
- Alte Rows wie `uploads/<id>` bleiben lesbar, wenn die Datei im Legacy-Layout unter `<DOCUMENTS_STORAGE_DIR>/uploads/<id>` liegt.
- Delete archiviert weiterhin zuerst DB-seitig und bereinigt danach best effort alle sicher zuordenbaren existierenden Storage-Kandidaten.
- Replace meldet nach erfolgreichem DB-Update Erfolg, auch wenn die alte Datei danach nicht bereinigt werden kann; dieser Cleanup bleibt best effort.
- Nicht-Ziele:
- keine UI-Aenderung, keine neue Permission, keine RBAC-Lockerung, keine Bulk-Operationen, keine neuen Dependencies und keine Azure-Aenderungen.

## 2zc. Gezielter P1/P2-Fixlauf 2026-05-04 fuer Dokument-Storage-Cleanup
- Dies ist keine neue Feature-Phase, keine Azure-Arbeit und keine Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich die Behebung der Review-Findings zu ueberlappenden Legacy-Storage-Kandidaten und Delete-Post-Commit-Fehlern.
- Download, Preview, Delete und Replace verwenden dieselbe sichere Candidate-Resolution, bei der `DOCUMENTS_STORAGE_DIR/uploads/<key>` fuer Legacy-Keys vor stripped `UPLOAD_DIR/<key>` gewinnt.
- Delete und Replace loeschen nach erfolgreichem DB-Commit nur noch die tatsaechlich aufgeloeste alte Datei, niemals pauschal alle Kompatibilitaetskandidaten.
- Fehlende Dateien blockieren die Metadatenbereinigung nicht; invalid oder nicht vorhandene Storage-Pfade fuehren zu keinem File-Unlink.
- Audit- und Cleanup-Fehler nach erfolgreichem Delete-Archivieren bleiben best effort und duerfen keinen Client-500 mehr ausloesen.
- Nicht-Ziele:
- keine UI-Aenderung, keine neue Permission, keine RBAC-Lockerung, keine Bulk-/Recovery-Pfade, keine neuen Dependencies und keine Azure-Aenderungen.

## 2zd. Gezielter UI-/Dokument-Fixlauf 2026-05-04 fuer Altbescheide
- Dies ist keine neue Feature-Phase, keine Persistenzphase, keine Azure-Arbeit und keine Recovery-Architektur.
- Ziel dieses Laufs ist ausschliesslich, die bereits vorhandene sichere Document-API fuer `LEGACY_DECISION` in der Altbescheid-UI vollstaendig sichtbar zu verdrahten.
- Beim Anlegen eines Altbescheids kann optional eine Datei ausgewaehlt werden; nach erfolgreichem LegacyDecision-Create wird sie ueber `POST /documents` mit `ownerType=LEGACY_DECISION` und `ownerId=<LegacyDecision-ID>` hochgeladen.
- Beim Bearbeiten und Anzeigen eines Altbescheids wird die bestehende `DocumentsPanel`-Verwaltung verwendet: Dateiname, Vorschau, Download, Datei ersetzen und Dokumenteintrag entfernen.
- `FILE_MISSING` wird UI-seitig als `Datei fehlt` markiert; berechtigte Nutzer koennen die Datei ersetzen oder den defekten Dokumenteintrag entfernen.
- `DOCUMENT_NOT_FOUND` aktualisiert die Dokumentliste, ohne alte Bulk-/Recovery-Pfade oder direkte LegacyDecision-Dateispeicherung zu reaktivieren.
- Serverseitige Document-RBAC-Regeln bleiben finale Autoritaet: Lesen und Schreiben laufen weiter ueber ownerType-/Projekt-Kontext und die bestehenden LegalDoc-/Projekt-Rechte.
- Nicht-Ziele:
- keine Prisma-Schema-Aenderung, keine neue Storage-Architektur, keine neuen Dependencies, keine RBAC-Lockerung, keine Azure-Aenderung und keine Reaktivierung alter Bulk-/Recovery-Pfade.

## 2ze. Facherweiterung 2026-05-08 fuer Projekt- und Rechtsdokument-Beschreibungen
- Dies ist eine additive Erweiterung bereits serverseitig persistierter Domaenen, keine neue Persistenzphase, keine Azure-Arbeit und keine Workflow-Neugestaltung.
- Ziel:
- Projekte erhalten ein langes Feld `detailedDescription`.
- Rechtsdokumente erhalten lange Felder `detailedDescription` und `contentSummary`.
- Listenendpunkte bleiben payload-arm; Langtexte werden fuer Detail-, Edit- und Recovery-Export-Pfade ueber Detaildaten geladen.
- Aktueller Stand:
- `Project` und `LegalDocument` sind bereits API-backed und PostgreSQL ist fuer diese Domaenen Source of Truth.
- Rechtsdokument-Unterlagen laufen ueber die stabile Document-API; neue Browser-only Attachments duerfen nicht entstehen.
- Risiken:
- Listenpayloads duerfen durch Langtexte nicht wieder gross werden.
- Create/Edit-Modals duerfen Uploads erst nach erfolgreichem Entity-Persist finalisieren und keine verwaisten Browser-only Dateianhaenge erzeugen.
- Rechtsdokument-Projektreferenzen muessen auch in Detail- und Exportpfaden stabil auf das echte `projectId` zeigen.
- Datenmodell:
- Additive PostgreSQL-Spalten: `Project.detailedDescription`, `LegalDocument.detailedDescription`, `LegalDocument.contentSummary`, jeweils nullable `TEXT`.
- Keine neuen Stammdatentabellen, keine Checklisten-, Einreichtyp- oder Rechtsmaterien-Modelle.
- API:
- Projekt- und Rechtsdokument-Create/Edit akzeptieren die neuen Felder.
- Listenendpunkte liefern kompakte DTOs ohne vollstaendige Langtexte.
- Detailendpunkte liefern vollstaendige Langtexte und korrigierte Projektzuordnung.
- Dokumente bleiben ueber `/documents` mit `ownerType=PROJECT` oder `ownerType=LEGAL_DOC` angebunden.
- Frontend:
- Bestehende Detail- und Edit-Flows zeigen und speichern die neuen Langtextfelder, ohne Navigation, Labels oder Workflows umzubauen.
- LegalDoc-Create/Edit verwendet einen abgesicherten Upload-Flow ueber die Document-API und blockiert neue Browser-only Attachments.
- Recovery-Export laedt Detaildaten fuer vollstaendige Langtexte mit begrenzter paralleler Detailrequest-Anzahl.
- Snapshot-/Recovery-Strategie:
- Keine Rueckkehr zu Snapshot oder `localStorage` als Source of Truth fuer Projekte oder Rechtsdokumente.
- Der Export bleibt ein servergestuetzter Teil-Export; Langtexte werden vollstaendig aufgenommen, aber kein vollstaendiger Disaster-Recovery-Restore suggeriert.
- Lokale Testplanung:
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- `cd apps/api && npm test`, sofern die lokale PostgreSQL-Testdatenbank erreichbar ist.
- Manuelle Checks:
- Projekt mit langer Beschreibung anlegen, neu laden, in Inkognito oeffnen und bearbeiten.
- Rechtsdokument mit Detailbeschreibung, Zusammenfassung und Datei anlegen; Detailseite, Bearbeiten, Download/Vorschau und Projektreferenz pruefen.
- Listen pruefen, dass sie ohne Detail-Langtexte laden und Detailansichten die Langtexte nachladen.
- Recovery-Export erzeugen und pruefen, dass Projekt- und Rechtsdokument-Langtexte enthalten sind.
- Azure-Rollout:
- Keine Azure-Aenderungen in diesem Lauf.
- Fuer spaeteren Rollout nur additive Migration deployen, danach API- und Web-Image normal ausrollen.
- Rollback-Idee:
- Bei UI-/API-Problem vorherige App-Version deployen; die nullable Spalten koennen liegen bleiben.
- Bei Datenproblem Langtexte vor DB-Rollback exportieren, weil ein Drop der Spalten die neuen Inhalte entfernen wuerde.

## 2zf. Feature-Plan 2026-05-13 fuer Dokument-Kategorien und Dokument-Freigaben
- Ziel:
- Dokumente koennen kategorisiert werden, Uploader-Metadaten bleiben sichtbar, sichere Office-Dateien wie Word/Excel werden zusaetzlich unterstuetzt, Dokumente koennen eine Freigabe benoetigen, der Freigabestatus wird per Ampel angezeigt und berechtigte Benutzer koennen freigeben oder ablehnen.
- Grundlage bleibt die bestehende serverseitige Document API fuer Projekt-Unterlagen und weitere vorhandene `ownerType`-basierte Unterlagen; es wird keine neue Browser-only Attachment-Quelle eingefuehrt.
- Scope:
- In Scope sind Kategorie-Metadaten, ApprovalRequired/ApprovalStatus, Approval Request, Approve, Reject bzw. Aenderungen erforderlich, Uploader-Anzeige, Dateityp-Validierung, UI-Erweiterungen im `DocumentsPanel`, i18n/help sowie die ehrliche Recovery-/Export-/Import-Kommunikation.
- Out of Scope sind Checklisten, §82b-Logik, Rechtsmaterien-/Einreichtyp-Stammdaten, Azure-Arbeit, verpflichtende Benachrichtigungen, Mehrfach-Approver-Workflows und Office-Inline-Vorschau ohne sichere Vorschau-Infrastruktur.
- Datenmodell:
- `Document` erhaelt additive Felder `category` mit sicherem Default `OTHER` und `fileVersion` mit Default `1`; bestehende Dokumente bleiben dadurch lesbar und nicht freigabepflichtig.
- Freigaben werden ueber `DocumentApprovalRequest` pro Dokument/Dateiversion und `DocumentApprovalEvent` fuer die Historie modelliert; Statuswerte bleiben API-validierte Strings wie `PENDING`, `APPROVED`, `REJECTED`, `CHANGES_REQUESTED` und `CANCELLED`.
- `createdByUserId` bleibt die Uploader-Referenz; DTOs liefern daraus `createdByLabel`, ohne zusaetzliche Browserdaten als Quelle zu nutzen.
- Prisma-Migration und `migrationBootstrap` muessen die neuen Felder, Tabellen, Indizes und Foreign Keys pruefen; No-history- und Partial-Schema-Zustaende muessen fail-closed statt mit konkurrierenden Quellen starten.
- Storage / Document API:
- PostgreSQL plus geschuetzte Document API bleiben Source of Truth fuer Metadaten; Dateibytes werden weiter ausschliesslich ueber den konfigurierten Upload-Root und sichere relative Storage-Keys abgelegt.
- Es entstehen keine Dateimetadaten ohne Bytes im regulaeren Upload-Flow, keine oeffentlichen Links, keine geteilten Storage-Pfade und keine Rueckkehr zu Browser-only Attachments.
- Preview/Download laufen weiter ueber die geschuetzte API; PDF und sichere Rasterbilder duerfen inline angezeigt werden, Office/CSV/TXT werden heruntergeladen.
- `FILE_MISSING` bleibt maschinenlesbar und blockiert Preview/Download, aber nicht die sichere Metadatenbereinigung durch berechtigte Nutzer.
- Replace nach Freigabe erhoeht die Dateiversion; eine alte Entscheidung gilt nicht automatisch fuer die neue Datei, stattdessen wird bei vorheriger Freigabepflicht eine neue Pending-Freigabe angelegt.
- RBAC / externe Nutzer:
- Kategorien setzen, Freigabe anfordern, Upload und Metadatenpflege nutzen die bestehenden ownerType-/ownerId-Schreibrechte und den darunterliegenden ProjectAccess-/Domain-Write-Scope.
- Freigabeentscheidungen duerfen nur definierte interne Approver oder Benutzer mit bestehendem owner write permission treffen; Backend-Pruefungen bleiben finale Autoritaet und UI-Aktionen duerfen nur als Komfort-Gating dienen.
- Preview/Download brauchen die bestehenden owner read permissions und den passenden Projekt-/LegalDoc-/Deadline-/Task-Kontext; Replace/Delete bleiben an bestehende Manage-Regeln gebunden, `TASK_EVIDENCE` bleibt fuer direkte Replace/Delete fail-closed.
- Externe Benutzer bleiben in diesem Lauf fuer Document-Endpunkte fail-closed; ein spaeteres scoped External-User-Dokumentmodell waere ein eigener Plan und keine implizite RBAC-Lockerung.
- Recovery / Export / Import:
- Der generische Export bleibt ein Teil-Export und enthaelt keine Datei-Inhalte; wenn Dokumente spaeter als Metadaten exportiert werden, muessen Kategorie und Freigabefelder bzw. Approval-Tabellen mit sicheren Defaults beruecksichtigt werden.
- Alte Exporte ohne Kategorie/Freigabe duerfen nicht scheitern; bestehende DB-Dokumente bekommen Defaults ueber die Migration.
- Gesperrte Recovery-, Import-, Reset- oder Snapshot-Pfade werden nicht reaktiviert; es duerfen keine Datenverlustpfade entstehen und kein vollstaendiger Disaster-Recovery-Restore suggeriert werden.
- Tests:
- Pflichtchecks sind `cd apps/api && npx prisma validate`, `npx prisma generate`, `node scripts/assert-prisma-client.mjs`, `npx prisma db push --skip-generate`, `npm run build`, `npm test`, `cd apps/web && npm run build`, `git diff --check`, `docker compose config` und `sh -n apps/api/start-container.sh`.
- API-Tests muessen Upload mit Kategorie, Upload mit `approvalRequired=false/true`, Approval Request, Approve, Reject/Aenderungen erforderlich, parallele Freigabeentscheidungen, Replace nach Freigabe, fehlende Rechte mit 403, externe User fail-closed/scoped, Dateityp-Allowlist und `FILE_MISSING` abdecken.
- MigrationBootstrap-Tests muessen neue Tabellen/Felder als Bestandteil des aktuellen Baselines erkennen; Export-/Import-Checks muessen Defaults und ausgelassene Dokumentdateien dokumentieren.
- Risiken:
- Approval-Decision-Races duerfen keine zweite Entscheidung und kein zweites Decision-Event schreiben; Statuswechsel muessen atomar gegen `status=PENDING` geschuetzt werden.
- Weitere Risiken sind ungewollte RBAC-Lockerung, externe User als zukuenftige Approver, Office-MIME-Abweichungen, Replace nach Freigabe, Recovery-/Import-Erwartungen, mobile UI-Dichte und Mehrfach-Approver als spaetere Folgephase.

## 3. Ist-Zustand
- Browser-persistiert fachlich aktiv ist aktuell nur noch `taskState`; zusätzliche UI-/Recovery-Daten liegen weiterhin via `apps/web/src/state/persistence.ts` lokal.
- `ScopesStore`, `AuthoritiesStore`, `ProjectsStore`, `LegalDocsStore`, `ObligationsStore` und `DeadlinesStore` sind bereits API-backed und löschen ihre alten Domänen-Storage-Keys aktiv.
- `apps/web/src/components/ServerStateSync.tsx` repliziert aktuell nur noch `taskState` nach `/api/state`; der Server speichert diesen Rest weiterhin monolithisch in `PortalSnapshot.payload`.
- Bereits echte serverseitige Persistenz existiert für Auth/Sessions/MFA, Admin-Users, Roles, ExternalOrgs, Documents und Comments.
- `TasksStore` ist aktuell nur eine abgeleitete Read-Projection aus `Obligations`, `Deadlines`, `LegalDocs`, `Projects`, `Scopes` und `TaskState`; es gibt keine eigene Task-Tabelle.
- Bekannte Probleme:
- Für obligation-basierte Task-Instanzen existieren aktuell noch konkurrierende Ebenen: `localStorage` und `PortalSnapshot`.
- `PortalSnapshot` ist global (`scopeKey=default`) und überschreibt immer den gesamten Payload statt einzelner Domänen.
- Import/Reset/Demo in `AdminPage` behandeln `taskState` noch nicht serverseitig und würden ohne Anpassung inkonsistent.
- `ErrorBoundary`-Export/Reset liest `taskState` heute noch direkt aus `localStorage` statt aus der serverseitigen Quelle.
- Lokale Doku/Compose/Test-Hilfen verweisen teils noch auf SQLite/Test-DB-Altpfade, obwohl Prisma bereits auf PostgreSQL steht.

## 4. Zielarchitektur
- Backend:
- Prisma-Modelle pro Fachdomäne mit echten Primärschlüsseln, FKs, `isArchived`, `createdAt`, `updatedAt` und dort, wo heute vorhanden, `archivedAt`.
- Additive Express-Route-Module unter `apps/api/src/routes/` je Domäne; `apps/api/src/app.ts` mountet sie nur.
- Explizite One-shot-Backfill- und Rollback-Mappings je Phase zwischen `PortalSnapshot.payload.<domain>` und dem neuen Tabellenmodell. Keine dauerhafte Dual-Write-Synchronisierung.
- Frontend:
- Bestehende Provider (`ScopesStore`, `AuthoritiesStore`, `ProjectsStore`, `LegalDocsStore`, `ObligationsStore`, `DeadlinesStore`, `TaskStateStore`) bleiben als UI-Fassade erhalten.
- Für migrierte Domänen hydratisieren Provider per API, cachen nur im React-State und schreiben nicht mehr in `localStorage`.
- Methodennamen und Entity-Shapes bleiben möglichst gleich. CRUD-Methoden der migrierten Stores werden dort, wo eine ID aus dem Server benötigt wird, auf `Promise`-basierte Aufrufe umgestellt.
- Relational vs. JSON/JSONB:
- Voll relational in Phase 1: `Company`, `Site`, `Facility`, `Authority`, `AuthorityContact`.
- Überwiegend relational mit gezieltem JSONB-Übergang: `Project.attachments`, `Project.externalParticipants`, `Project.internalParticipants`, `Project.dependsOnProjectIds`, `Project.referenceLegalDocIds`.
- JSONB-Übergang in `LegalDocument.attachments`, `LegalDocument.aiExtraction`, `LegalDocument.scopeOverride`.
- JSONB-Übergang in `Obligation.evidenceRequirements`.
- JSONB-Übergang in `Deadline.evidence`.
- JSONB-Übergang in `TaskStateEntry.evidence`.
- Keine konkurrierenden Sources of Truth:
- Sobald eine Domäne migriert ist, wird sie aus `ServerStateSync` entfernt.
- Ihr `localStorage`-Key wird für den regulären Lauf nicht mehr gelesen oder geschrieben.
- `PortalSnapshot` bleibt nur noch für nicht migrierte Domänen bestehen.
- Backfill und Rollback erfolgen ausschließlich explizit per Script/Endpoint, nie implizit zur Laufzeit.

## 5. Phasenplan

### Phase 1: Behörden + Ansprechpartner + Scopes
- Ziel:
- Behörden, Ansprechpartner, Firmen, Standorte und Anlagen werden serverseitig relational gespeichert und browserübergreifend haltbar.
- Betroffene Domänen:
- `authorities`, `authorityContacts`, `companies`, `sites`, `facilities`.
- Betroffene Dateien/Verzeichnisse:
- `apps/api/prisma/schema.prisma`
- `apps/api/src/app.ts`, `apps/api/src/routes/`
- `apps/web/src/state/AuthoritiesStore.tsx`, `apps/web/src/state/ScopesStore.tsx`
- `apps/web/src/pages/AdminPage.tsx`, `apps/web/src/pages/ScopesPage.tsx`
- `apps/web/src/components/ScopeInlineCreateModal.tsx`, `apps/web/src/components/ProjectModal.tsx`, `apps/web/src/components/LegalDocModal.tsx`, `apps/web/src/components/AiAnalysisReviewModal.tsx`
- `apps/web/src/components/ServerStateSync.tsx`
- Prisma-/Datenmodell:
- Neue Modelle `Company`, `Site`, `Facility`, `Authority`, `AuthorityContact`.
- FKs: `Site.companyId`, `Facility.companyId`, `Facility.siteId`, `AuthorityContact.authorityId`.
- Unique Constraints für Namen im jeweiligen Scope nur soweit heute technisch nötig; fachliche Labels bleiben unverändert.
- `isArchived`, `createdAt`, `updatedAt` überall. Keine Soft-Delete-Umbenennung.
- API-Endpunkte:
- Lesend für alle authentifizierten Nutzer: Listen- und Detail-Endpunkte für Scopes und Authorities.
- Schreibend gemäß bestehender UI-Berechtigungen: Create, Update, Archive, Restore.
- Admin-/Migration-Helfer: `bulk-replace` und `bulk-delete` für `scopes` und `authorities`, damit Import/Reset/Demo ohne UX-Änderung weiter funktionieren.
- Frontend-Stores/Komponenten:
- `AuthoritiesStore` und `ScopesStore` werden API-backed und verlieren `localStorage`-Persistenz.
- Methodennamen bleiben gleich; Aufrufe mit Server-ID-Bedarf werden `async`.
- Alle Inline-Create- und Admin-Dialoge behalten identische Formulare und Texte.
- Snapshot-/ServerStateSync:
- `authorities` und `scopes` aus `ServerStateSync.snapshot` entfernen.
- One-shot-Backfill von `PortalSnapshot.payload.authorities` und `.scopes` in neue Tabellen.
- Lokaler `STORAGE_KEYS.authorities` und `STORAGE_KEYS.scopes` nicht mehr im Regelbetrieb verwenden.
- Migrationsrisiken:
- Downstream-Referenzen in Projekten/LegalDocs auf alte lokale IDs müssen unverändert übernommen werden.
- Inline-Create-Flows dürfen keine Race Conditions durch neue asynchrone Store-Methoden bekommen.
- Import/Reset/Demo in `AdminPage` müssen dieselbe Wirkung jetzt serverseitig erzielen.
- Abnahmekriterien:
- Create/Update/Archive/Restore für Authority, Contact, Company, Site, Facility funktioniert unverändert.
- Reload, Inkognito, zweiter Browser und API-Neustart zeigen identische Daten.
- `PortalSnapshot` enthält diese Domänen nicht mehr als Laufzeitquelle.

### Phase 2: Projekte
- Ziel:
- Projekte werden serverseitig gespeichert, inklusive Scope- und Authority-Referenzen.
- Betroffene Domänen:
- `projects`.
- Betroffene Dateien/Verzeichnisse:
- `apps/api/prisma/schema.prisma`
- `apps/api/src/routes/`, `apps/api/src/app.ts`
- `apps/web/src/state/ProjectsStore.tsx`, `apps/web/src/state/projectRelations.ts`
- `apps/web/src/pages/ProjectsPage.tsx`, `apps/web/src/pages/ProjectDetailPage.tsx`
- `apps/web/src/components/ProjectModal.tsx`, `apps/web/src/components/ExternalParticipantModal.tsx`
- `apps/web/src/components/ServerStateSync.tsx`
- Prisma-/Datenmodell:
- Neues Modell `Project` mit relationalen FKs auf `Company`, `Site`, `Facility`, `Authority`, `AuthorityContact`, `User`.
- Übergangsweise JSONB für `attachments`, `externalParticipants`, `internalParticipants`, `participantUserIds`, `dependsOnProjectIds`, `referenceLegalDocIds`.
- API-Endpunkte:
- CRUD plus Archive/Restore.
- Read-Endpunkte für Projektlisten und Projektdetails.
- Admin-/Migration-Helfer: `bulk-replace` und `bulk-delete`.
- Frontend-Stores/Komponenten:
- `ProjectsStore` wird API-backed. Sanitizing von Relations bleibt im Store erhalten.
- `ProjectModal` und Projektlisten bleiben gleich, warten aber auf serverseitige Antworten.
- Snapshot-/ServerStateSync:
- `projects` aus Snapshot entfernen.
- One-shot-Backfill aus `PortalSnapshot.payload.projects`.
- Migrationsrisiken:
- Relations zu noch nicht serverseitigen LegalDocs bleiben nur ID-basiert bestehen.
- Projekt-Referenzlisten in JSONB müssen unverändert roundtrip-fähig bleiben.
- Abnahmekriterien:
- Projektanlage, Bearbeitung, Archivierung, Teilnehmer- und Attachment-Metadaten bleiben unverändert nutzbar.
- Projektabhängigkeiten bleiben nach Reload/Inkognito/API-Neustart konsistent.
- Keine Projektänderung landet mehr im Snapshot.

### Phase 3: Rechtsdokumente
- Ziel:
- Rechtsdokumente werden serverseitig gespeichert und referenzieren Projekte serverseitig.
- Betroffene Domänen:
- `legalDocs`.
- Betroffene Dateien/Verzeichnisse:
- `apps/api/prisma/schema.prisma`
- `apps/api/src/routes/`, `apps/api/src/app.ts`
- `apps/web/src/state/LegalDocsStore.tsx`
- `apps/web/src/pages/LegalDocsPage.tsx`, `apps/web/src/pages/LegalDocPage.tsx`
- `apps/web/src/components/LegalDocModal.tsx`, `apps/web/src/components/AiAnalysisReviewModal.tsx`
- `apps/web/src/components/ServerStateSync.tsx`
- Prisma-/Datenmodell:
- Neues Modell `LegalDocument` mit FK zu `Project`, optionalen FKs zu `Authority` und `AuthorityContact`.
- JSONB für `attachments`, `aiExtraction`, `scopeOverride`.
- API-Endpunkte:
- CRUD plus Archive/Restore.
- Optionales Server-Mapping für AI-Review-accept ohne UI-Änderung.
- Admin-/Migration-Helfer: `bulk-replace` und `bulk-delete`.
- Frontend-Stores/Komponenten:
- `LegalDocsStore` wird API-backed.
- `LegalDocModal` behält AI-Review-Flow, Scope-Override und Inline-Authority/Contact-Anlage bei.
- Snapshot-/ServerStateSync:
- `legalDocs` aus Snapshot entfernen.
- One-shot-Backfill aus `PortalSnapshot.payload.legalDocs`.
- Migrationsrisiken:
- AI-Extraction-Objekte und Attachment-Metadaten dürfen semantisch nicht verändert werden.
- `scopeOverride` muss exakt dieselbe Auflösung wie heute liefern.
- Abnahmekriterien:
- Dokument anlegen, bearbeiten, archivieren, Scope-Override, AI-accept und Referenzen zu Projekt/Authority bleiben unverändert.
- Rechtsdokumente sind nach Reload, Inkognito und Neustart stabil.

### Phase 4: Auflagen
- Ziel:
- Auflagen werden serverseitig gespeichert und hängen an serverseitigen Rechtsdokumenten.
- Betroffene Domänen:
- `obligations`.
- Betroffene Dateien/Verzeichnisse:
- `apps/api/prisma/schema.prisma`
- `apps/api/src/routes/`, `apps/api/src/app.ts`
- `apps/web/src/state/ObligationsStore.tsx`
- `apps/web/src/pages/ObligationsPage.tsx`, `apps/web/src/pages/ObligationDetailPage.tsx`
- `apps/web/src/components/ObligationModal.tsx`
- `apps/web/src/state/TasksStore.tsx` nur lesend für Ableitung
- `apps/web/src/components/ServerStateSync.tsx`
- Prisma-/Datenmodell:
- Neues Modell `Obligation` mit FK zu `LegalDocument`, optionalen FKs zu `User`.
- JSONB für `evidenceRequirements`.
- API-Endpunkte:
- CRUD plus Archive/Restore.
- Admin-/Migration-Helfer: `bulk-replace` und `bulk-delete`.
- Frontend-Stores/Komponenten:
- `ObligationsStore` wird API-backed.
- `TasksStore` bleibt weiter eine reine Ableitung aus `obligations` und `deadlines`.
- Snapshot-/ServerStateSync:
- `obligations` aus Snapshot entfernen.
- One-shot-Backfill aus `PortalSnapshot.payload.obligations`.
- Migrationsrisiken:
- Wiederkehrende Terminlogik darf nicht durch Serverpersistenz kippen.
- Evidence-Anforderungen müssen unverändert in Tasks/Completion-Modal ankommen.
- Abnahmekriterien:
- Einmalige und wiederkehrende Auflagen erzeugen dieselben Task-Seeds wie vorher.
- Owner/Deputy/Reminder/Evidence-Anforderungen bleiben unverändert.

### Phase 5: Fristen
- Ziel:
- Fristen werden serverseitig gespeichert, inklusive Abschlussstatus und Evidence-Metadaten.
- Betroffene Domänen:
- `deadlines`.
- Betroffene Dateien/Verzeichnisse:
- `apps/api/prisma/schema.prisma`
- `apps/api/src/routes/`, `apps/api/src/app.ts`
- `apps/web/src/state/DeadlinesStore.tsx`
- `apps/web/src/pages/DeadlinesPage.tsx`, `apps/web/src/pages/DeadlineDetailPage.tsx`
- `apps/web/src/components/DeadlineModal.tsx`
- `apps/web/src/state/TasksStore.tsx` nur lesend für Ableitung
- `apps/web/src/components/ServerStateSync.tsx`
- Prisma-/Datenmodell:
- Neues Modell `Deadline` mit optionalen FKs zu `Project`, `LegalDocument`, `Authority`, `User`.
- JSONB für `evidence`.
- API-Endpunkte:
- CRUD plus Archive/Restore.
- Spezifische Status-/Complete-/Reopen-Endpunkte, wenn das den bestehenden Store klarer abbildet.
- Admin-/Migration-Helfer: `bulk-replace` und `bulk-delete`.
- Frontend-Stores/Komponenten:
- `DeadlinesStore` wird API-backed.
- Detail- und Listenansichten bleiben identisch.
- Snapshot-/ServerStateSync:
- `deadlines` aus Snapshot entfernen.
- One-shot-Backfill aus `PortalSnapshot.payload.deadlines`.
- Migrationsrisiken:
- Evidence-Metadaten dürfen trotz verbleibender IndexedDB-Dateien nicht inkonsistent werden.
- Deadline-Task-Status in `TasksStore` muss exakt dem Deadline-State folgen.
- Abnahmekriterien:
- Deadline anlegen, bearbeiten, erledigen, mit Evidence abschließen, wieder öffnen, archivieren und wiederherstellen bleibt identisch.
- Status `OPEN/DONE/OVERDUE` verhält sich nach Reload und Neustart unverändert.

### Phase 6: Task-State / Aufgaben
- Ziel:
- Persistenter Task-State für obligation-basierte Task-Instanzen wird serverseitig gespeichert. Aufgabenansichten bleiben eine abgeleitete Read-Projection.
- Betroffene Domänen:
- `taskState` und die serverseitige Aufgabenableitung.
- Betroffene Dateien/Verzeichnisse:
- `apps/api/prisma/schema.prisma`
- `apps/api/src/routes/`, `apps/api/src/app.ts`
- `apps/web/src/state/TaskStateStore.tsx`, `apps/web/src/state/TasksStore.tsx`
- `apps/web/src/pages/TasksPage.tsx`, `apps/web/src/pages/TaskDetailPage.tsx`, Reporting-/Dashboard-Seiten mit Task-Read-Model
- `apps/web/src/components/TaskCompleteModal.tsx`, `apps/web/src/components/EvidenceListModal.tsx`
- `apps/web/src/components/ServerStateSync.tsx`
- Prisma-/Datenmodell:
- Neues Modell `TaskStateEntry` mit `taskInstanceId` als Business-Key, `status`, `completedAt`, `completedByUserId`, `completedByLabel`, `updatedAt`, JSONB `evidence`.
- Keine separate `Task`-Tabelle. Aufgaben bleiben aus `Obligations`, `Deadlines` und `TaskStateEntry` ableitbar.
- API-Endpunkte:
- Read/replace für Task-State und Mutationsendpunkte für `set-status`, `mark-done`, `add-evidence`, `reopen`, `cleanup-old`.
- Optionaler read-only `/tasks`-Projection-Endpunkt nur dann, wenn die bestehende UI ohne größere Umbauten davon profitiert.
- Frontend-Stores/Komponenten:
- `TaskStateStore` wird API-backed.
- `TasksStore` bleibt im Interface gleich, liest aber seinen persistenten Teil aus dem serverseitigen `TaskStateStore`.
- Snapshot-/ServerStateSync:
- `taskState` aus Snapshot entfernen.
- One-shot-Backfill aus `PortalSnapshot.payload.taskState`.
- Migrationsrisiken:
- Obligation-Task-Instanz-IDs müssen exakt stabil bleiben; sonst gehen bestehende Zustände verloren.
- Evidence-Dateimetadaten werden serverseitig, Binärinhalte bleiben zunächst in IndexedDB. Fehlende Inhalte müssen weiterhin als `storage: none` behandelbar sein.
- Abnahmekriterien:
- Pflicht- und Wiederholungstasks behalten nach Reload/Inkognito/API-Neustart ihren Status.
- Task-Abschluss mit Evidence bleibt funktional identisch.
- Reports, Dashboard und Task-Listen zeigen dieselben Aufgaben wie vorher.

### Phase 7: Snapshot-Abschluss / Aufräumen
- Ziel:
- Snapshot-Transport und generische Domänenpersistenz werden entfernt, nachdem alle Ziel-Domänen serverseitig laufen.
- Betroffene Domänen:
- `PortalSnapshot`, `ServerStateSync`, Domänen-`localStorage`-Keys.
- Betroffene Dateien/Verzeichnisse:

## Anhang: Runtime-Hotfix 2026-04-15
- Ziel:
- Lokalen Web-Startfehler `useAuth must be used within AuthProvider` ohne Funktions- oder UX-Änderung beheben.
- Ist-Zustand:
- `ScopesProvider` und `AuthoritiesProvider` verwenden `useAuth()`, wurden in `apps/web/src/App.tsx` aber außerhalb des `AuthProvider` gerendert.
- Risiko:
- Bei unveränderter Reihenfolge crasht die App bereits beim Initial-Render, bevor Seitenlogik oder API-Antworten relevant werden.
- Geplanter Fix:
- `AuthProvider` in `apps/web/src/App.tsx` so nach außen ziehen, dass `ScopesProvider`, `AuthoritiesProvider` sowie die bereits auth-abhängigen `RolesProvider`, `ExternalOrgsProvider` und `UsersProvider` innerhalb des Auth-Kontexts laufen.
- Nicht-Ziel:
- Keine Änderung an Fachlogik, API, Snapshot-Verhalten, ServerStateSync-Logik oder Routing.
- Lokaler Test:
- `cd apps/web && npm run build`
- Manueller Browser-Check: App neu laden, Login-Seite öffnen, geschützte Route öffnen, Scopes/Admin laden.
- `apps/api/prisma/schema.prisma`
- `apps/api/src/routes/state.ts`, `apps/api/src/app.ts`
- `apps/web/src/components/ServerStateSync.tsx`
- `apps/web/src/state/persistence.ts`, `apps/web/src/state/importExport/exportPayload.ts`
- `apps/web/src/components/ErrorBoundary.tsx`
- Prisma-/Datenmodell:
- `PortalSnapshot` erst entfernen, wenn Rollback-Fenster für die letzte Live-Phase abgelaufen ist.
- API-Endpunkte:
- `/api/state` entfällt nach Abschluss und nach dokumentierter Abschaltprüfung.
- Export-/Recovery-Helfer werden auf echte Domainquellen umgestellt.
- Frontend-Stores/Komponenten:
- Entfernen der Domänen-`STORAGE_KEYS` für migrierte Domänen.
- `ErrorBoundary`-Recovery und Reset lesen nicht mehr aus alten Domänen-Keys.
- Snapshot-/ServerStateSync:
- `ServerStateSync` komplett entfernen.
- Keine Domänendaten mehr im generischen Snapshot.
- Migrationsrisiken:
- Recovery-/Export-Pfade dürfen nach Entfernen des Snapshots nicht lückenhaft werden.
- Rollback nach Snapshot-Entfernung braucht expliziten Abschluss des Rollback-Fensters.
- Abnahmekriterien:
- Keine Ziel-Domäne nutzt im Regelbetrieb noch `localStorage` oder `/api/state`.
- Vollständige App-Funktion bleibt ohne Snapshot erhalten.

## 6. Teststrategie pro Phase
- Automatische lokale Checks:
- Prisma format/validate/generate für jede Schemaänderung.
- API-TypeScript-Build nach jeder API-/Prisma-Anpassung.
- Web-TypeScript-/Vite-Build nach jeder Store-/Komponenten-Anpassung.
- Domänenspezifische API-Tests für CRUD, Archive/Restore, Bulk-Replace/Bulk-Delete und Backfill-Mapping.
- Store-nahe Tests dort, wo ID-Stabilität oder Mapping kritisch ist, insbesondere `projectRelations`, `TasksStore`-Ableitung und `TaskState`-Instanz-IDs.
- Manuelle Browser-Tests pro Phase:
- Create, Edit, Archive, Restore des migrierten Domänenobjekts.
- Öffnen aller betroffenen Listen-, Detail- und Modal-Views.
- Import/Demo/Reset im Admin-Bereich für die migrierte Domäne.
- Persistenz-Pflichttests:
- Normaler Reload derselben Sitzung.
- Neues Inkognito-Fenster mit demselben Benutzer.
- Zweiter Browser bzw. zweites Profil parallel.
- API-Neustart bei laufendem Frontend.
- Nach Phase 1 zusätzlich: Scope-/Authority-Referenzen in Projekt- und LegalDoc-Modals.
- Nach Phase 6 zusätzlich: Task abschließen, Evidence hinzufügen, wieder öffnen, Report/Dashboard querprüfen.

## 7. Lokale Entwickler-Checks
- Nach jeder Phase mindestens:
- Repository-Root: keine neuen Secrets oder Dumps in Git.
- `cd apps/api && npx prisma format`
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`
- Bei Schemaänderung zusätzlich:
- `cd apps/api && npm run migrate:dev -- --name <phase_name>`
- Falls die Test-Harness in der Phase auf PostgreSQL harmonisiert ist: `cd apps/api && npm test`
- Für lokale DB-Schritte:
- Nur gegen lokale PostgreSQL-Instanz arbeiten.
- README, `.env.example`, Compose und Test-Harness in Phase 1 an PostgreSQL angleichen, ohne Live-Umgebung zu berühren.

## 8. Rollout-Strategie für Azure / Live
- Reihenfolge je Phase:
- Lokale Umsetzung und vollständige lokale Verifikation.
- Logisches Backup des relevanten DB-Zustands plus Export des betreffenden Snapshot-Domain-Slices.
- Additive Prisma-Migration auf Azure PostgreSQL.
- Backend-Image bauen und deployen.
- Web-Image bauen und deployen.
- Smoke-Test der migrierten Domäne mit produktionsnahen Rollen.
- Nach Deploy prüfen:
- Listen laden korrekt.
- Create/Edit/Archive/Restore funktioniert.
- Reload, neuer Browser und API-Restart verlieren keine Daten.
- Snapshot-Endpunkt bzw. Snapshot-Payload enthält den migrierten Slice nicht mehr.
- Risiken beim Rollout:
- Alte App-Version erwartet Snapshot-Daten, neue Version schreibt DB-Daten.
- Schema ist PostgreSQL, aber lokale/Compose/Test-Pfade sind noch nicht vollständig harmonisiert.
- Import/Reset/Demo könnte ohne Bulk-Endpoints serverseitige Daten sonst nicht mehr erfassen.

## 9. Rollback-Strategie
- Grundsatz:
- Jede Phase liefert vor Live-Gang ein explizites Paar aus `backfill-to-db` und `rollback-to-snapshot` für genau diese Domäne.
- Rollback-Reihenfolge je Phase:
- Vorherige Backend-/Web-Version wieder deployen.
- Wenn die alte Version noch Snapshot als Source of Truth braucht, den betroffenen Domain-Slice einmalig aus den neuen Tabellen zurück in `PortalSnapshot.payload` schreiben.
- Falls nötig, DB aus Backup auf Stand vor der Phase zurücksetzen. Additive Tabellen dürfen sonst liegen bleiben.
- Relevante Artefakte:
- Prisma-Migration der Phase.
- App-Commit/Tag der Phase.
- Domain-spezifisches Backfill-/Rollback-Script.
- Export/Backup des Snapshot-Slices vor Live-Deploy.
- Wichtige Regel:
- Kein dauerhafter Dual-Write für Rollback-Zwecke. Nur explizites einmaliges Zurückschreiben im Rollback-Fall.

## 10. Offene Fragen / Annahmen
- Fest angenommener Datenscope:
- Die neue Domänenpersistenz ist global geteilt und nicht pro Benutzer oder Organisation partitioniert. Das entspricht dem aktuellen `PortalSnapshot`-Verhalten.
- Fest angenommener Umgang mit Evidence:
- In Phase 6 werden Task-/Deadline-State und Evidence-Metadaten serverseitig persistiert. Binäre Dateiinhalte bleiben zunächst in IndexedDB.
- Weitere Annahmen:
- Die bestehenden Entity-IDs aus Browser/Snapshot werden beim Backfill übernommen, damit Upstream-/Downstream-Referenzen stabil bleiben.
- Berechtigungen sollen fachlich gleich bleiben. Die API spiegelt die heutigen UI-Aktionen statt neue Rollenlogik einzuführen.
- Safe Mode und Demo-/Seed-Daten bleiben als Entwicklungs-/Recovery-Werkzeuge erhalten, aber nicht als reguläre Persistenzquelle für migrierte Domänen.
- Falls die bestehende API-Test-Harness wegen SQLite/PostgreSQL-Mismatch nicht tragfähig ist, wird sie in Phase 1 vor den eigentlichen Domänen-Tests auf lokale PostgreSQL-Nutzung umgestellt.

## 11. Runtime-Fixlauf 2026-04-18 fuer lokalen Portalstart
- Dies ist keine neue Persistenzphase, keine neue Mobile-Phase und kein neues Feature.
- Ziel dieses Laufs ist ausschliesslich die minimal-invasive Behebung eines aktuellen Frontend-Laufzeitfehlers, durch den das Portal lokal in die ErrorBoundary faellt.
- Verifizierter Ist-Zustand vor Umsetzung:
- Das Portal startet lokal nicht stabil; mindestens `/compliance/projects` faellt im Browser in die ErrorBoundary.
- In der juengeren Vergangenheit gab es Aenderungen an `apps/web/src/App.tsx`, Admin-Routen, `packages/ui/src/components/AppShell.tsx`, `packages/ui/src/components/DataTable.tsx`, `packages/ui/src/components/Modal.tsx` sowie an globalen responsiven Styles.
- Bereits migrierte serverseitige Domänen duerfen durch diesen Lauf weder fachlich noch in ihrer Source-of-Truth-Regel destabilisiert werden.
- Zulaessiger Umfang:
- echte Runtime-Reproduktion lokal gegen laufende API/Web-App.
- gezielte Analyse von `App.tsx`, `ProjectsPage`, `ProjectModal`, `DataTable`, `AppShell`, `Modal`, `app.css` sowie direkt beteiligten Stores/Hooks.
- minimaler Fix genau der absturzverursachenden Stelle, einschliesslich kleiner Anschlusskorrekturen nur soweit noetig, damit das Portal wieder normal laedt.
- Nicht-Ziele:
- keine neue Persistenzarbeit, kein Snapshot- oder localStorage-Rueckfall fuer migrierte Domänen.
- keine neue Mobile-Welle, keine UX-Neugestaltung, keine neuen Dependencies.
- keine dauerhaften Debug-Logs oder sonstiger Cleanup ausserhalb des benoetigten Fixbereichs.
- Pflicht-Verifikation:
- `cd apps/web && npm run build`
- falls der Fix API-bezogen anschlaegt zusaetzlich `cd apps/api && npm run build`
- manueller lokaler Browser-Smoke fuer `/compliance/dashboard`, `/compliance/projects`, `/compliance/legal-docs`, `/compliance/tasks`, `/compliance/deadlines` und `/admin` oder `/compliance/admin`.

## 12. Review-Fixlauf 2026-04-19 fuer Admin-Reset und Behoerden-Leserechte
- Dies ist keine neue Persistenzphase, keine neue Rollenarchitektur und kein neues Feature-Paket.
- Ziel dieses Laufs ist ausschliesslich die Behebung von zwei Review-Findings:
- der Admin-Reset-Endpunkt und das bestehende Admin-Reset-Modal muessen Legacy-Modi (`link`, `manual`, `auto`) weiterhin unterstuetzen; die neue direkte Passwortsetzung bleibt additiv.
- `authorities.view` muss im Admin-UI als Leserecht fuer `Admin > Behoerden` respektiert werden, waehrend Schreibaktionen weiter `authorities.manage` brauchen.
- Verifizierter Ist-Zustand vor Umsetzung:
- `apps/api/src/app.ts` verlangt im Admin-Reset aktuell immer `newPassword` und invalidiert damit die alten Reset-Varianten.
- `apps/web/src/pages/AdminUsersPage.tsx` bildet aktuell nur den neuen Direct-Set-Flow ab.
- `apps/web/src/state/AuthorizationStore.tsx` koppelt `canViewAuthoritiesAdmin` derzeit faelschlich an `authorities.manage`.
- `apps/web/src/pages/AdminAuthoritiesPage.tsx` zeigt Schreibaktionen aktuell ohne getrennte View-/Manage-Grenze an.
- Zulaessiger Umfang:
- nur die betroffenen Stellen in API, Admin-Users-UI/API-Client/Store, AuthorizationStore und Admin-Authorities-UI.
- bestehende Audit-, Passwort-Policy-, Session-Revoke- und Rollenlogik nur soweit anpassen, wie fuer die beiden Findings notwendig.
- API- und Build-Verifikation fuer `apps/api` und `apps/web`; Tests nur im vorhandenen Stil und nur fuer diese Findings erweitern.
- Nicht-Ziele:
- keine neue E-Mail- oder PowerAutomate-Implementierung.
- keine neue Rechtearchitektur, keine Hilfe-/Checklist-/C2-Arbeiten, keine weiteren Admin- oder Persistenzthemen.

## 12a. Review-Follow-up 2026-04-19 fuer assignable `authorities.view`
- Dies ist weiterhin kein neuer Feature- oder Rollenarchitektur-Lauf.
- Ziel dieses Mini-Fixlaufs ist ausschliesslich, `authorities.view` im normalen Custom-Role-Workflow wieder vergebbar zu machen.
- Zulässiger Umfang:
- nur Permission-Katalog-/Filterlogik des Role-Editors sowie direkte API-Tests fuer Create/Update von Custom Roles.
- Nicht-Ziele:
- keine weiteren Rechteaenderungen ausser der Wiederfreigabe von `authorities.view` im vorhandenen Admin-Rollenworkflow.

## 13. P0 Performance-/Stability-Fixlauf 2026-05-18 fuer Projekt-Detail und Projekt-Unterlagen
- Dies ist keine neue Persistenzphase, keine Dashboard-Optimierung, keine Admin-Rollen-Optimierung und keine Azure-/Nginx-/Static-Asset-Aenderung.
- Ziel ist ausschliesslich, echte 240s-/504-Stalls und doppelte Requests beim Oeffnen von `/compliance/projects/:projectId` zu beseitigen.
- Betroffene P0-Pfade:
- `GET /api/projects/:projectId`
- `GET /api/documents?ownerType=PROJECT&ownerId=:projectId`
- Geplanter Frontend-Umfang:
- `ProjectsStore` erhaelt eine In-flight-Promise-Map pro `projectId`, Detail-Cache-Vermeidung fuer nicht-stale Details und Schutz vor stale response overwrites.
- `DocumentsStore` wird als ownerKey-basierter Store (`ownerType:ownerId`) eingefuehrt; parallele Listen-Loads deduplizieren, Mutationen aktualisieren nur den betroffenen ownerKey.
- `ProjectDetailPage` kontrolliert den initialen Detail-Load selbst und laedt Tabs nur lazy, wenn sie sichtbar werden.
- `DocumentsPanel` nutzt den ownerKey-Store, startet Preview/Download nur auf Klick und ersetzt lokale reloadAll-artige Refreshes durch ownerKey-Updates.
- `routeLoading` unterdrueckt auf Projekt-Detailrouten globale Domain-Autoloads, die fuer den ersten sichtbaren Render nicht noetig sind, und bleibt bei `/administrator` sowie `/compliance/administrator` fail-closed gegen falsche Admin-Erkennung.
- Geplanter Backend-Umfang:
- `GET /projects/:id` vermeidet doppelte ProjectAccess-Pruefung und bleibt bei minimalem Detail-DTO ohne Dokumentlisten oder Storage-Pruefungen.
- `GET /documents` nutzt den vorhandenen `Document(ownerType, ownerId)`-Index, vermeidet Datei-Existenzpruefungen im Listenpfad und selektiert nur DTO-relevante Felder.
- Security-/RBAC-Regeln:
- Backend bleibt finale Autoritaet; keine Permission-Checks werden entfernt.
- Externe User bleiben fuer Document-Endpunkte gesperrt.
- Dedupe gilt nur im aktuellen Browser-/User-Kontext; keine useruebergreifenden Caches.
- Keine sensiblen Logs, keine Payload-/Cookie-/Authorization-Header-Logs, keine Secrets im Diff.
- Pflicht-Verifikation:
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && node scripts/assert-prisma-client.mjs`
- `cd apps/api && npm run build`
- `cd apps/api && npm test`
- `cd apps/web && npm run build`
- falls vorhanden: `cd apps/web && npm test -- --run`
- `git diff --check`
- `docker compose config`
- `sh -n apps/api/start-container.sh`
- falls lokale DB erreichbar: `cd apps/api && npx prisma db push --skip-generate`

## 13a. Review-Blocker-Fixlauf 2026-05-18 fuer Phase-1 Projekt-Detail-Stabilisierung
- Dies ist keine neue Persistenzphase, keine Phase-2-Arbeit, keine Dashboard-Optimierung, keine Admin-Rollen-/Authorities-Optimierung und keine Azure-/Nginx-/Static-Asset-Aenderung.
- Ziel ist ausschliesslich die Behebung der drei Review-Blocker aus Phase 1, ohne die Performance-Ziele aus Abschnitt 13 zurueckzudrehen.
- Blocker 1: Projekt-Detail-Aktionen duerfen auf Direct Loads nicht mit leer unterdrueckten Stores arbeiten.
- Geplanter Fix: `routeLoading` laedt weiterhin nicht blind alle Domain-Stores auf Projekt-Detailrouten. Stattdessen laden die sichtbaren Aktionen ihre benoetigten Daten gezielt:
- Projekt-Edit oeffnet erst nach `ensureProject`, `reloadProjects`, `reloadLegalDocs` und `reloadProcedureMasterData`, damit Submission-Type-, Relation- und Legal-Reference-Optionen verfuegbar sind.
- Projekt-Archivierung oeffnet mit explizitem Loading-/Fehlerzustand fuer Child Counts und laedt `legalDocs`, `obligations` und `deadlines` gezielt vor Cascade-Bewertung. Unloaded wird nicht als 0 interpretiert.
- Blocker 2: External-Orgs-Lookup darf auf Projekt-Detailrouten nur im Eager-Load unterdrueckt werden.
- Geplanter Fix: Route-Guard gilt nur fuer Auto-Load. Explizite `reloadExternalOrgs()`-Aufrufe aus Tabs/Modals laden weiter, bleiben aber durch die bestehenden Berechtigungen begrenzt.
- Blocker 3: Document-Mutations duerfen partielle Upload-/Replace-/Delete-Ergebnisse nicht als volle Owner-Liste markieren.
- Geplanter Fix: Nur erfolgreiche Full-List-Loads setzen `loaded=true`. Partielle Mutationen aktualisieren den betroffenen ownerKey sichtbar, halten ungeladene Owner ungeladen/invalidated und werden mit laufenden Full-List-Responses gemerged.
- Security-/RBAC-Regeln:
- Backend bleibt finale Autoritaet; keine Permission-Checks werden entfernt.
- External-Orgs-Lookup umgeht keine Berechtigungen; die bestehende Admin-/ExternalOrg-Permission-Grenze bleibt bestehen.
- Document ownerType/ownerId-Scoping bleibt ownerKey-basiert und browser-/userlokal.
- Keine sensiblen Logs, keine Payload-/Cookie-/Authorization-Header-Logs, keine Secrets im Diff.
- Pflicht-Verifikation:
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && node scripts/assert-prisma-client.mjs`
- `cd apps/api && npm run build`
- `cd apps/api && npm test`
- `cd apps/web && npm run build`
- falls vorhanden: `cd apps/web && npm test -- --run`
- `git diff --check`
- `docker compose config`
- `sh -n apps/api/start-container.sh`
- falls lokale DB erreichbar: `cd apps/api && npx prisma db push --skip-generate`

## 13b. Review-Blocker-Fixlauf 2026-05-19 fuer Auth-Hydration-Races in Phase 1
- Dies ist keine neue Persistenzphase, keine Phase-2-Arbeit, keine Dashboard-Optimierung, keine Admin-Rollen-/Authorities-Optimierung und keine Azure-/Nginx-/Static-Asset-Aenderung.
- Ziel ist ausschliesslich die Behebung der zweiten Review-Rueckmeldung zu direkten Project-Detail- und DocumentPanel-Cold-Starts.
- Root Cause:
- `ProjectsStore` und `DocumentsStore` haben authUser-abhaengige passive Effects genutzt, um Sequenz-/In-flight-Maps und Store-Eintraege zu leeren.
- Bei einem direkten geschuetzten Route-Load kann ein Child-Effect bereits `ensureProject()` oder `ensureDocuments()` starten, bevor der Parent-/Store-Effect diese Maps leert.
- Die erfolgreiche Response wurde danach faelschlich als stale behandelt und nicht in den Store uebernommen.
- Geplanter Frontend-Fix:
- Request-Reihenfolge pro `projectId` bzw. `ownerKey` wird von Auth-/Session-Invalidierung getrennt.
- Ein auth-scoped Request-Helper verwaltet `generation` und `userId`.
- Initiale Hydration `null -> user` invalidiert keine legitimen Requests.
- Echter Logout oder User-Wechsel erhoeht die Generation, leert benutzerspezifischen Store-Zustand und verhindert, dass alte Responses in die neue Session schreiben.
- In-flight-Dedupe-Keys enthalten Auth-Generation und User-ID, bleiben aber innerhalb derselben Session pro `projectId` bzw. `ownerKey` dedupliziert.
- Eine fehlende latest-seq bedeutet nicht automatisch stale; angewendet wird, wenn die Auth-Generation passt und kein neuerer Request fuer denselben Key bekannt ist.
- Nicht-Ziele:
- keine Backend-Aenderungen, keine Permission-/RBAC-Aenderungen, kein globales reloadAll, keine Ruecknahme der lazy Project-Detail-Loads.
- Vorherige Phase-1-Fixes bleiben erhalten:
- Project-Edit und Archive-Dialog laden aktive Aktionsdaten gezielt.
- ExternalOrgs explicit/lazy lookup bleibt auf Projekt-Detail moeglich.
- Document partial mutations setzen nie faelschlich `loaded=true`, wenn keine Full-List geladen wurde.
- Security-/RBAC-Regeln:
- Backend bleibt finale Autoritaet; keine Permission-Checks werden entfernt.
- Keine useruebergreifenden Caches; alte User-Responses duerfen nicht in neue Sessions schreiben.
- Keine sensiblen Logs, keine Payload-/Cookie-/Authorization-Header-Logs, keine Secrets im Diff.
- Pflicht-Verifikation:
- `cd apps/api && npx prisma validate`
- `cd apps/api && npx prisma generate`
- `cd apps/api && node scripts/assert-prisma-client.mjs`
- `cd apps/api && npm run build`
- `cd apps/api && npm test`
- `cd apps/web && npm run build`
- falls vorhanden: `cd apps/web && npm test -- --run`
- `git diff --check`
- `docker compose config`
- `sh -n apps/api/start-container.sh`
- falls lokale DB erreichbar: `cd apps/api && npx prisma db push --skip-generate`

## 13c. Gezielter P2-Fixlauf 2026-05-19 fuer DocumentsStore Mutation-Replay
- Dies ist keine neue Persistenzphase, keine Phase-2-Arbeit, keine Backend-, RBAC-, Azure-, Nginx- oder Static-Asset-Aenderung.
- Ziel ist ausschliesslich die Behebung des verbleibenden DocumentsStore-P2, bei dem alte lokale Dokument-Mutationen beim naechsten Full-Refresh ueber die frische Serverliste gelegt werden konnten.
- Geplanter Frontend-Fix:
- Full-List-Requests fuer `GET /api/documents?ownerType=...&ownerId=...` erhalten eine ownerKey-lokale `loadId`.
- Lokale erfolgreiche Upload-/Replace-/Copy-/Delete-Mutationen werden nur fuer bereits pending Full-List-Loads desselben ownerKey als one-shot Replay vorgemerkt.
- Die passende Full-List-Response konsumiert nur Replays fuer ihre eigene `loadId`; danach werden diese Replays geloescht.
- Spaetere Full-Refreshes erhalten neue `loadId`s und uebernehmen wieder die Serverliste als Source of Truth, ohne alte lokale Upsert- oder Delete-Ergebnisse erneut anzuwenden.
- Vorherige Phase-1-Fixes bleiben erhalten:
- Auth-Hydration darf Direct Loads nicht invalidieren.
- Logout/User-Wechsel leert benutzerspezifische Dokument- und Replay-Zustaende.
- Request-Deduping bleibt auth-scope- und ownerKey-basiert.
- Partielle Mutationen setzen `loaded` nie faelschlich auf `true`.
- Uploads waehrend pending Full-Load bleiben sichtbar und werden genau fuer diese alte Response gemerged.
- Pflicht-Verifikation bleibt wie in Abschnitt 13b; zusaetzlich werden die DocumentsStore-Tests fuer loaded-owner Refresh, pending one-shot Replay, failed/unloaded Owner und Replay-Cleanup erweitert.

## 13d. Gezielter P1-Fixlauf 2026-05-19 fuer DocumentsStore Mutation-Auth-Scope
- Dies ist keine neue Persistenzphase, keine Phase-2-Arbeit, keine Backend-, RBAC-, Azure-, Nginx-, Static-Asset-, Dashboard- oder Admin-Optimierung.
- Ziel ist ausschliesslich, erfolgreiche Dokument-Mutation-Responses aus alten Auth-Sessions daran zu hindern, den aktuellen DocumentsStore oder pending Mutation-Replays zu veraendern.
- Geplanter Frontend-Fix:
- Upload-/Replace-/Delete- sowie Metadaten-/Approval-Mutationen erfassen beim Requeststart den aktuellen Auth-Scope und ownerKey.
- Mutation-Success-Callbacks duerfen `recordOwnerMutation`, `setOwnerEntry`, lokale Upserts/Removes, Invalidierungen, Refreshes und UI-Erfolgsmeldungen nur ausfuehren, wenn Auth-Generation und User-ID noch passen.
- Pending Replay wird zusaetzlich pro pending Full-Load mit Auth-Scope markiert; User-A-Mutationen koennen nicht in User-B-Full-Loads desselben ownerKey replayed werden.
- Auth cleanup leert weiterhin Entries, In-flight-Maps, Mutation-Versionen und Replay-State.
- Vorherige Phase-1-Fixes bleiben erhalten:
- Full-List-Responses bleiben auth-scoped.
- Initiale Auth-Hydration `null -> user` invalidiert legitime Direct Loads nicht.
- OwnerKey-Dedupe bleibt innerhalb derselben Auth-Session wirksam.
- Partielle Mutationen setzen `loaded` nicht faelschlich auf `true`.
- Spaetere Full-Refreshes verwenden wieder die Serverliste als Source of Truth.

## 13e. Gezielter P2-Fixlauf 2026-05-20 fuer Preview-Missing Mutation-Scope
- Dies ist keine neue Persistenzphase, keine Phase-2-Arbeit, keine Backend-, RBAC-, Azure-, Nginx-, Static-Asset-, Dashboard- oder Admin-Optimierung.
- Ziel ist ausschliesslich, den Preview-Fehlerpfad fuer `FILE_MISSING` und `DOCUMENT_NOT_FOUND` wieder mit dem beim Preview-Requeststart erfassten Dokument-Mutation-Scope zu verbinden.
- Geplanter Frontend-Fix:
- `DocumentPreviewModal` erfasst beim Start des Preview-Blob-Requests einen `DocumentsMutationScope` ueber den aufrufenden `DocumentsPanel`-Owner-Kontext.
- `FILE_MISSING`- und `DOCUMENT_NOT_FOUND`-Callbacks erhalten diesen captured Scope typisiert als Pflichtargument, sodass dieselbe Session defekte Dateien wieder markieren bzw. fehlende Dokumenteintraege entfernen/invalidieren kann.
- Alte Preview-Responses aus frueheren Auth-Sessions bleiben durch `canApplyDocumentsMutationScope` wirkungslos und duerfen keine User-B-Owner, Replays oder lokalen Dokumentlisten veraendern.
- Vorherige Phase-1-Fixes bleiben erhalten:
- Upload-/Replace-/Delete-/Metadaten-/Approval-Mutationen bleiben auth-scoped.
- Pending Replay bleibt ownerKey- und Auth-Scope-basiert, one-shot pro pending Full-Load und wird bei Cleanup geloescht.
- Full-Refreshes verwenden spaeter wieder die Serverliste als Source of Truth.
- Initiale Auth-Hydration `null -> user` invalidiert legitime Direct Loads nicht.
- Request-Deduping bleibt ownerKey- und Auth-Scope-basiert.

## 13f. Phase 3 2026-05-20: Dashboard Initial Load Summary
- Ziel ist ausschliesslich die Dashboard-Initial-Load-Optimierung auf Branch `perf/portal-load-stability`.
- Nicht-Ziele: keine Admin-Rollen-/Authorities-Optimierung, keine Static-Asset-/Nginx-/Vite-/Docker-/Azure-Aenderungen, keine ProjectDetail- oder DocumentsStore-Grundlogik-Aenderungen, keine neuen Fachfeatures.
- Backend-Plan:
- Neuer `GET /api/dashboard/summary` Endpoint mit Auth und `dashboard.view`.
- Interne User erhalten nur RBAC- und ProjectAccess-gescopte Aggregates; externe User bleiben fail-closed und erhalten keine breiten Fachdomain-Daten.
- Summary enthaelt Counts und kleine Top-Listen, aber keine vollstaendigen Projekt-/Dokument-/User-/Authorities-/Scopes-/Admin-Lookup-Listen.
- Keine Langtexte, Dokumentlisten, Storage-Pfade, Download-/Preview-Daten oder sensiblen Debugdaten im Payload.
- Frontend-Plan:
- Dashboard rendert Kacheln, ueberfaellige Aufgaben und Top-Benachrichtigungen aus `dashboard/summary`.
- Dashboard initialisiert keine globalen Fachstores und keine Admin-Lookups.
- Domain-Details werden erst auf den jeweiligen Detail-/Listenrouten geladen.
- Route-Loading-Plan:
- Dashboard-Routen `/`, `/dashboard`, `/compliance`, `/compliance/dashboard` unterdruecken Domain-Store-Autoloads.
- Roles- und ExternalOrgs-Lookups werden auf Dashboard-Routen nicht eager geladen.
- Bestehende ProjectDetail- und Admin-Lookalike-Regeln bleiben unveraendert.
- Test-/Review-Fokus:
- Keine N+1 Dokument-Requests, keine `documents?ownerType=...` Einzelrequests, keine vollstaendigen Domainlisten fuer Kachel-Counts.
- RBAC/ProjectAccess serverseitig korrekt, externe User ohne breite Daten, Summary-Payload klein.
- Phase-1 ProjectDetail/DocumentsStore- und Phase-2 Static-Asset-Verhalten nicht regressieren.

## 13g. Phase-3 Review-Blocker-Fixlauf 2026-05-20
- Dies ist keine neue Phase, keine Phase-4-Admin-Optimierung und keine Azure-/Nginx-/Static-Asset-Aenderung.
- Ziel ist ausschliesslich die Behebung der drei aktuellen P2-Review-Blocker im Dashboard-Summary-Endpoint.
- Geplanter Backend-Fix:
- `today` fuer `/api/dashboard/summary` wird aus der konfigurierten Anwendungszeitzone abgeleitet, nicht aus der Host-Prozesszeitzone.
- Obligation-seitige Summary-Arbeit wird auf kleine, datumsrelevante Kandidaten-Slices begrenzt; Recurrence-Expansion laeuft nur noch fuer diese Kandidaten und innerhalb der Summary-Fenster.
- Scope-Overrides von Rechtsdokumenten werden vor dem Rendern der Dashboard-Labels gegen Firmen-/Standort-/Anlagen-Namen aufgeloest; IDs bleiben nur Fallback fuer inkonsistente Altdaten.
- Nicht-Ziele:
- keine UI-Neugestaltung, keine neuen Dashboard-Kacheln, keine Admin-Rollen-/Authorities-Optimierung, keine Phase-4-Arbeit, keine Deployment-Aenderungen.
- Pflicht-Verifikation fuer diesen Fixlauf:
- `cd apps/api && npm test`
- `cd apps/api && npm run build`
- `cd apps/web && npm run build`

## 13h. Phase-3 P2 Review-Fix 2026-05-20 fuer Dashboard-Aggregate und Reminder-Kandidaten
- Ziel ist ausschliesslich die Behebung der zwei verbleibenden P2-Blocker im Dashboard-Summary-Endpoint auf Branch `perf/portal-load-stability`.
- Obligation-Aggregates duerfen nicht mehr aus gekappten Anzeige-Kandidaten berechnet werden. Vollstaendige Counts fuer `openTasks`, `overdueTasks`, `tasksDueSoon` und `completionRatePercent` werden separat ueber den serverseitigen RBAC-/ProjectAccess-Scope berechnet.
- Gekappte Obligation-Kandidaten bleiben nur fuer Top-Listen und Notifications erlaubt; sie werden nach fachlicher Datumsrelevanz geladen und nie als Gesamtbestand interpretiert.
- Wiederkehrende Auflagen werden fuer Aggregates nur im Dashboard-Fenster expandiert; alte einmalige Overdues werden vollstaendig per DB-Aggregat gezaehlt.
- Deadline-Reminder-Kandidaten werden bereits in der Query auf heutige Trigger eingeschraenkt. `emailReminderDaysBefore=0` bleibt gueltig; fehlende Werte nutzen den bestehenden Default von 7 Tagen.
- Nicht-Ziele: keine Phase-4-Admin-Optimierung, keine Frontend-/Store-/Static-Asset-/Docker-/Azure-Aenderungen, keine RBAC-Lockerung und keine neuen Fachfeatures.

## 13i. Phase-3 Re-Review-Fix 2026-05-20 fuer Recurrence-Aggregate und ONCE_THEN_RECURRING-Candidates
- Dies ist kein neuer Optimierungs- oder Featurelauf, sondern ausschliesslich die Nachschaerfung der zwei verbleibenden Review-Findings im Dashboard-Summary-Endpoint.
- Wiederkehrende Auflagen-Aggregates werden rechnerisch ueber Recurrence-Regeln und vorhandene `TaskStateEntry`-Rows berechnet; es werden keine vollstaendigen Occurrence-Arrays und keine synthetischen TaskState-ID-Listen fuer alle Vorkommen mehr erzeugt.
- `DAY` und `WEEK` nutzen date-only Differenz/Division; `MONTH`, `QUARTER` und `YEAR` bleiben kalenderkompatibel und iterieren nur ueber Intervallschritte.
- `DONE`-TaskStates werden nur aus vorhandenen Rows im Summary-Fenster gelesen und gegen die Recurrence-Regel validiert, bevor sie Counts und `completionRatePercent` beeinflussen.
- Initiale `ONCE_THEN_RECURRING`-Occurrences bleiben vom recurring Serienanteil getrennt; ended initial overdues werden in den Anzeige-Kandidaten beruecksichtigt, ohne doppelte Anzeige derselben Auflage im selben Listenbereich.
- Nicht-Ziele bleiben unveraendert: keine Phase-4-Admin-Optimierung, keine Frontend-/Store-/Static-Asset-/Docker-/Azure-Aenderungen, keine RBAC-Lockerung und keine neuen Fachfeatures.

## 13j. Phase-3 Review-Fix 2026-05-20 fuer bounded Dashboard-Display-Candidates
- Ziel ist ausschliesslich die Behebung der zwei verbleibenden Review-Findings im Anzeige-Pfad von `GET /api/dashboard/summary`.
- Display-Candidates fuer Overdue und Reminder werden getrennt von Aggregates gesammelt; Aggregates bleiben die vollstaendige, RBAC-gescopte Count-Quelle.
- Wiederkehrende Display-Occurrences werden bounded erzeugt: pro Obligation nur der naechste listenrelevante Candidate, bei `DONE` kontrolliert weiter bis zum naechsten offenen Candidate oder bis zum Guard.
- Der Anzeige-Pfad baut keine synthetischen TaskState-ID-Listen fuer alle moeglichen Occurrences im Fenster mehr; TaskState-Abfragen bleiben auf bounded Candidates bzw. vorhandene DONE-Rows begrenzt.
- Einmalige und initiale `ONCE_THEN_RECURRING`-Overdues filtern `DONE` per Anti-Join vor dem finalen Take, sodass alte erledigte Eintraege keine Anzeige-Slots blockieren.
- Nicht-Ziele bleiben unveraendert: keine Phase-4-Admin-Optimierung, keine Frontend-/Store-/Static-Asset-/Docker-/Azure-Aenderungen, keine RBAC-Lockerung und keine neuen Fachfeatures.

## 13k. Phase-3 P2 Review-Fix 2026-05-20 fuer Recurring-Aggregate und Deadline-DateOnly
- Ziel ist ausschliesslich die Behebung der zwei verbleibenden P2-Blocker im Dashboard-Summary-Endpoint.
- Wiederkehrende Auflagen-Aggregates werden per keyset Chunks nach `Obligation.id` berechnet; Chunking begrenzt nur Speicher und Query-Groesse, nicht die fachlichen Counts.
- DONE-TaskState-Rows fuer recurring obligations werden nur pro Chunk und nur im relevanten Summary-Fenster geladen und gegen die Recurrence-Regel validiert.
- Deadline-Reminder normalisieren DateOnly-Werte in einer sicheren CASE/CTE-Schicht; ungueltige Legacy-/Import-Werte werden uebersprungen statt den Summary-Endpoint abbrechen zu koennen.
- Nicht-Ziele bleiben unveraendert: keine Phase-4-Admin-Optimierung, keine Frontend-/Store-/Static-Asset-/Docker-/Azure-Aenderungen, keine RBAC-Lockerung, kein Commit und kein Push.
