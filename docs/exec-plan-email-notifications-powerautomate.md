# Exec Plan: E-Mail-Benachrichtigungen mit Power Automate

## Summary
- Diese Fassung ersetzt die bisherige Plan-Skizze und richtet den Plan an dem verifizierten Ist-Stand im Repository aus.
- Verifizierter Ist-Stand am 20.04.2026:
  - `apps/api/prisma/schema.prisma` enthaelt bereits `NotificationOutbox` und `PasswordResetToken`.
  - `apps/api/src/notifications.ts` enthaelt bereits Outbox-Erzeugung, Power-Automate-Dispatch, Retry/Claiming, Reset-Link-Sonderfall sowie Deadline-Events.
  - `apps/api/src/notificationDispatch.ts` und `npm run notifications:dispatch` existieren bereits als One-shot-Dispatcher.
  - `apps/api/src/app.ts` nutzt bereits serverseitige Reset-Link-Erzeugung fuer `forgot-password`, Admin-Reset im Link-Modus und User-Einladung im Link-Modus.
  - `apps/api/src/routes/deadlines.ts` erzeugt bereits Zuweisungs-Benachrichtigungen nach erfolgreicher Persistenz.
  - `apps/web/src/pages/AdminUsersPage.tsx` und `apps/web/src/pages/ResetPasswordPage.tsx` unterstuetzen den Reset-Link-Fluss bereits.
  - `apps/web/src/state/NotificationsStore.tsx` und `apps/web/src/pages/NotificationsPage.tsx` sind weiterhin browser-lokale In-App-Reminder und nicht Teil der serverseitigen Mail-Outbox.
- Verifikation:
  - `cd apps/api && npm test` ist gruen.
  - `cd apps/api && npm run build` ist gruen.
  - `cd apps/web && npm run build` ist gruen.
- Nachpflege fuer den Remediation-Lauf 24.04.2026:
  - Produktions-Linkbasen fuer Reset- und Notification-Links werden fail-closed in `loadConfig()` validiert.
  - Unter `NODE_ENV=production` muessen `NOTIFICATION_BASE_URL` oder `APP_ORIGIN` explizit gesetzt sein und als absolute non-loopback-HTTPS-URL gueltig sein.
  - `localhost`, `127.0.0.1` und `::1` bleiben nur fuer lokale Entwicklung bzw. lokalen Compose-Betrieb erlaubt.
- Konsequenz fuer diesen Plan:
  - Phase E1 ist in dieser Repo-Lage kein Greenfield-Bau mehr, sondern Abschluss-, Haertungs- und Rollout-Plan fuer bereits vorhandene Serverbausteine.
  - Phase E2 bleibt der geplante Ausbau fuer Admin-/Systemsicht, Komfort und zusaetzliche Ereignisse.

## 1. Zielbild
- Das Portal erzeugt fachlich relevante E-Mail-Benachrichtigungen serverseitig, speichert ihren Zustellzustand serverseitig in PostgreSQL und bleibt die fachliche Source of Truth.
- Power Automate ist nur die Versandkomponente. Empfaengerlogik, Idempotenz, Links, Retry, Fehlerbewertung und Audit bleiben im Portal-Backend.
- Nicht Ziel ist direkter Versand aus dem Frontend, lokale Mail-Persistenz, ein Browser-Aufruf von Webhooks oder eine neue App-/Offline-Architektur.
- Das Frontend darf Power Automate nicht direkt aufrufen, weil Webhook-URL und Secret sonst im Browser offengelegt wuerden, Mehrfachversand nicht sauber kontrollierbar waere und der Backend-Status nicht massgeblich bliebe.
- Passwort-Reset-Mails enthalten sichere Einmal-Links statt Klartextpasswoerter, weil E-Mail kein sicherer Secret-Kanal ist, Placeholder-/Default-Passwoerter vermieden werden muessen und der bestehende Self-Service-Flow unter `/reset-password` bereits vorhanden ist.

## 2. Zwei-Phasen-Plan

### Phase E1: NotificationOutbox + PowerAutomate MVP + Passwort-Reset-Link
- Ziel: den bereits vorhandenen serverseitigen Mailpfad fachlich und operativ als belastbares MVP festziehen, ohne UX-Redesign oder Frontend-Persistenz.
- Funktionsumfang:
  - `PASSWORD_RESET_LINK` fuer Self-Service-Reset, Admin-Reset im Link-Modus und Initialzugang im Link-Modus.
  - `DEADLINE_DUE_SOON` auf Basis echter `Deadline`-Datensaetze.
  - `DEADLINE_OVERDUE` auf Basis echter `Deadline`-Datensaetze.
  - `ASSIGNMENT_ASSIGNED` nur fuer Deadline-Owner/Deputy-Aenderungen, nicht fuer alle abgeleiteten Tasks.
- Betroffene Backend-Bereiche:
  - `apps/api/prisma/schema.prisma`
  - `apps/api/src/notifications.ts`
  - `apps/api/src/notificationDispatch.ts`
  - `apps/api/src/app.ts`
  - `apps/api/src/routes/deadlines.ts`
  - `apps/api/src/config.ts`
- Betroffene Frontend-Bereiche:
  - `apps/web/src/pages/AdminUsersPage.tsx` bleibt der Ausloeser fuer Admin-Reset und Einladung.
  - `apps/web/src/pages/ResetPasswordPage.tsx` bleibt das Ziel fuer den Einmal-Link.
  - `apps/web/src/state/NotificationsStore.tsx` und `apps/web/src/pages/NotificationsPage.tsx` werden in E1 bewusst nicht als Mail-Historie wiederverwendet.
- Datenmodell:
  - eine `NotificationOutbox`-Zeile pro fachlichem Ereignis und pro Empfaenger.
  - `PasswordResetToken` bleibt das Reset-Token-Modell.
  - kein separates `NotificationRecipient`-Tabellenmodell in E1; der Empfaenger bleibt logisch, aber in der Outbox denormalisiert.
- API-/Service-Konzept:
  - `NotificationService` als fachliche Erzeugungsschicht in `notifications.ts`, code-first statt DB-Templates.
  - `PortalLinkService` als zentrale Link-Bildung fuer `/reset-password` und `/compliance/*`.
  - `PasswordResetTokenService` als vorhandene Token-Erzeugungs-/Prueflogik auf Basis von `PasswordResetToken`.
- Worker-/Dispatcher-Konzept:
  - fuer normale Benachrichtigungen One-shot-Dispatcher per `npm run notifications:dispatch`.
  - fuer Passwort-Reset-Link-Mails synchroner Sofortversand im API-Request mit Outbox-Protokoll, weil der Klartext-Token nicht asynchron gespeichert werden darf.
- PowerAutomate-Payload:
  - Backend liefert bereits fertige fachliche Felder wie `subject`, `title`, `message`, `link`, `severity`, `entity`, `project`, `expiresAt`.
  - Power Automate rendert und sendet nur.
- Passwort-Reset-Link-Prozess:
  - Token serverseitig erzeugen, nur gehasht speichern, alte offene Tokens invalidieren, Outbox-Eintrag anlegen, Link sofort zustellen, bei Versandfehler Token sofort unbrauchbar machen.
- Sicherheitskonzept:
  - kein Klartext-Passwort, kein Token-Hash, kein Secret in Outbox oder Power-Automate-Payload.
  - Webhook-URL und Secret nur serverseitig.
  - Shared-Secret-Header in E1, optional haertere Authentisierung spaeter.
- Tests:
  - bestehende Auth-, Admin- und Notification-Tests beibehalten und als Mindestschutz definieren.
  - Build- und Mock-Webhook-Pruefungen Bestandteil jedes E1-Laufs.
- Abnahmekriterien:
  - Reset-Link ist einmalig, zeitlich begrenzt, gehasht gespeichert und produktiv nie als Debug-Ausgabe offengelegt.
  - Due-soon, overdue und assignment werden serverseitig erzeugt, idempotent dispatcht und in DB/Audit nachvollzogen.
  - Kein Mailversand laeuft aus dem Frontend.

### Phase E2: Verwaltung, Komfort und Ausbau
- Ziel: operative Transparenz, Admin-/Systembedienbarkeit und fachlicher Ausbau ohne Destabilisierung des E1-Kerns.
- Versandhistorie:
  - neue Admin-/Systemansicht auf `NotificationOutbox` mit Filtern nach Status, Eventtyp, Empfaenger, Entity und Zeitraum.
- Retry im Admin-/Systembereich:
  - manuelles Requeue fehlgeschlagener Eintraege; kein Direktversand aus der UI.
- Benachrichtigungseinstellungen:
  - globale und spaeter benutzerbezogene Aktivierung/Deaktivierung pro Eventtyp.
- Zusaetzliche Benachrichtigungstypen:
  - taegliche Sammelmail
  - Wochenuebersicht
  - Eskalation an Stellvertreter
  - Projektstatuswechsel
  - Submission-/Checklist-Bezug
  - neue Auflage
  - Ergaenzungsauftrag offen
  - fehlgeschlagene oder blockierte Aufgaben
- Sammelmails / Digest:
  - serverseitige Aggregation mit eigenem Eventtyp und eigener Idempotenz.
- Eskalationen:
  - zusaetzliche Regeln fuer Deputy und zeitabhaengige Wiederholungen.
- Bessere Templates:
  - sauberere Template-Schicht, optional spaeter administrierbar.
- Reporting / Monitoring:
  - Queue-Health, Fehlerraten, Audit-/Provider-Referenzen und Cleanup-Routinen.
- Abnahmekriterien:
  - Outbox-Historie, Retry und Settings sind im Admin-/Systembereich bedienbar.
  - zusaetzliche Eventtypen bleiben serverseitig idempotent.
  - E1-Flows bleiben unveraendert stabil.

## 3. Architektur
- `NotificationOutbox`: serverseitige Versandwarteschlange mit einem Datensatz pro Empfaenger und Status-Fortschritt.
- `NotificationService`: zentrale fachliche Erzeugung von Subject, Body, Severity, Deep Link, Entity-Kontext und `idempotencyKey`.
- `NotificationDispatcher / Worker`: One-shot-Dispatch, atomisches Claiming, Retry-/Fail-/Cancel-Entscheidung und Power-Automate-HTTP-Call.
- `Power Automate HTTP Flow`: externer Versandpfad, der nur transportiert und kein Business Ownership uebernimmt.
- `Retry-/Fehlerlogik`: retrybar bei Timeout, Netzwerkfehler, 5xx und 429; terminal bei 4xx, Konfigurationsfehlern und ungueltigen Empfaengern.
- `Idempotenz`: eindeutige `idempotencyKey`s pro fachlicher Mail, keine doppelte Outbox-Erzeugung, kein doppelter Versand bei Parallel-Dispatch.
- `Logging/Audit`: `AuditLog` fuer Passwortreset-/Einladungsaktionen, strukturierte Notification-Logs fuer Dispatch-Fortschritt.
- `Statusmodell`: `PENDING`, `CLAIMED`, `SENT`, `RETRY`, `FAILED`, `CANCELLED`.
- Schutz gegen Mehrfachversand: Unique-Key auf `idempotencyKey`, atomisches DB-Claiming, Update nur bei passendem `claimToken`.
- Schutz gegen parallele Worker / mehrere Replicas: kein In-Memory-Scheduler; Claiming ueber PostgreSQL mit `FOR UPDATE SKIP LOCKED`; stale Claims werden neu claimbar.
- Direkte Portal-Links: zentraler Link-Builder statt harter String-Zusammenbau in einzelnen Domains.
- Passwort-Reset-Token-Service: Wiederverwendung des bestehenden `PasswordResetToken`-Modells mit Hash-only-Speicherung.

### Bewertung Dispatcher-Varianten fuer E1
- API-interner Scheduler: nicht empfohlen, weil Web-Replica-Lebenszyklus, Mehrfachstart und Azure-Multi-Replica-Rennen unnoetig riskant sind.
- Eigener Worker-Command: empfohlen, weil der bestehende One-shot-Ansatz bereits vorhanden ist und sich lokal wie produktiv klar betreiben laesst.
- Azure Container Apps Job: empfohlene Hosting-Form fuer den Worker-Command in Azure, weil getrennt vom Web-Traffic und planbar.
- Manuell oder zeitgesteuert aufrufbarer Dispatcher: sinnvoll als lokaler/operatorischer Pfad, aber nicht als oeffentlicher HTTP-Endpunkt.
- Klare E1-Empfehlung: One-shot-Worker-Command im API-Codebestand, produktiv ueber Azure Container Apps Job, lokal manuell oder zeitgesteuert aufrufbar.

## 4. Fachliches Benachrichtigungsmodell
- `NotificationEvent`: fachliches Ereignis im Code, nicht zwingend eigene DB-Tabelle in E1.
- `NotificationOutboxEntry`: persistierter, zustellbarer Eintrag fuer genau einen Empfaenger.
- `NotificationRecipient`: logisches Modell aus `recipientUserId`, `recipientEmail`, `recipientName`; keine separate Tabelle in E1.
- `NotificationStatus`: `PENDING | CLAIMED | SENT | RETRY | FAILED | CANCELLED`.
- `NotificationTemplate`: in E1 code-first Formatter pro `eventType`; keine Template-DB.
- `NotificationPayload`: JSON mit `title`, `message`, `link`, `severity`, `entity`, optional `project`, optional `expiresAt`.
- `Retry / Attempt / Failure Reason`: `attemptCount`, `lastAttemptAt`, `lastError`, optional `providerReference`.
- Entity-Bezug: `USER`, `DEADLINE`, `TASK`, `PROJECT`, `LEGAL_DOC`, `OBLIGATION`.
- Link ins Portal: immer ueber die kanonische Base URL plus fachliche Route.
- Severity: `INFO` fuer Reset und Assignment, `WARNING` fuer due soon, `CRITICAL` fuer overdue.
- `scheduledFor`: geplanter Versandzeitpunkt.
- `sentAt`: tatsaechlicher Versandzeitpunkt.
- `lastError`: letzte terminale oder retrybare Fehlermeldung.
- `idempotencyKey`: fachlicher Duplicate-Schutz.

## 5. Datenmodell / Prisma-Konzept

### A. NotificationOutbox
- Felder:
  - `id`
  - `eventType`
  - `entityType`
  - `entityId`
  - `recipientUserId`
  - `recipientEmail`
  - `recipientName`
  - `subject`
  - `payloadJson`
  - `status`
  - `scheduledFor`
  - `claimedAt`
  - `claimToken`
  - `sentAt`
  - `attemptCount`
  - `lastAttemptAt`
  - `lastError`
  - `providerReference`
  - `idempotencyKey`
  - `createdAt`
  - `updatedAt`
- Sinnvolle Indizes:
  - `@@unique([idempotencyKey])`
  - `@@index([status, scheduledFor])`
  - `@@index([claimedAt])`
  - `@@index([recipientUserId, createdAt])`
  - `@@index([entityType, entityId])`
- Statuswerte:
  - `PENDING`
  - `CLAIMED`
  - `SENT`
  - `RETRY`
  - `FAILED`
  - `CANCELLED`
- Aufbewahrung / Cleanup:
  - `SENT` und `CANCELLED` z. B. 180 Tage.
  - `FAILED` mindestens bis operativer Review oder 180 Tage.
- Datenschutz:
  - `payloadJson` enthaelt nur Mail-Rendering-Kontext, keine Passwoerter, keine Token-Hashes, keine Secrets.

### B. PasswordResetToken oder bestehendes Token-Modell
- Bereits vorhanden:
  - `id`
  - `userId`
  - `tokenHash`
  - `expiresAt`
  - `usedAt`
  - `createdAt`
- E1-Empfehlung:
  - bestehendes Modell unveraendert weiterverwenden und nicht vorschnell erweitern.
- Konzeptionelle spaetere Felder nur bei echtem Bedarf:
  - `purpose`
  - `createdByUserId`
  - `deliveryNotificationId`
- Begruendung:
  - Ursprung und Delivery lassen sich in E1 bereits ueber Endpunkt-Kontext, AuditLog und NotificationOutbox nachvollziehen.
- Zusatzaussagen:
  - Reset-Token nie im Klartext speichern.
  - alte offene Tokens vor neuer Ausgabe invalidieren.
  - verwendete/abgelaufene Tokens regelmaessig loeschen.

## 6. Passwort-Reset-Link-Prozess

### A. Admin-Aktion
- Admin oeffnet Benutzerverwaltung.
- Admin klickt `Reset-Link senden`.
- API prueft Berechtigung, Zieluser, Archivstatus, E-Mail und `allowExternalUsers`.
- API invalidiert offene Reset-Tokens des Zielusers.
- API erzeugt neuen sicheren Token.
- API legt `PasswordResetToken` und `NotificationOutbox` innerhalb derselben fachlichen Aktion an.
- Power Automate verschickt die E-Mail sofort.

### B. Reset-Link
- Link basiert auf `NOTIFICATION_BASE_URL`, lokal notfalls `APP_ORIGIN`.
- Beispiel:
  - `https://portal.example.at/reset-password?token=...`
- Link fuehrt ins Portal.
- Token ist einmalig, zeitlich begrenzt, nur gehasht gespeichert und wird nicht geloggt.

### C. Benutzerfluss
- Benutzer oeffnet Link.
- Portal zeigt vorhandene Reset-Seite.
- API prueft `tokenHash`, `usedAt`, `expiresAt`, Archivstatus und Passwort-Policy.
- Benutzer setzt neues Passwort.
- Placeholder-Passwoerter und Policy-Verstoesse werden serverseitig abgewiesen.
- Token wird verbraucht.
- `mustChangePassword` wird aufgehoben.
- Aktive Sessions werden widerrufen.

### D. Sicherheitsregeln
- Kein Reset fuer archivierte User.
- Kein Reset-Link an Benutzer ohne gueltige E-Mail-Adresse.
- Keine Passwort-Hashes oder Secrets im Payload.
- Kein Passwort im NotificationOutbox-Payload.
- Audit-Events bleiben Pflicht.
- Rate Limiting fuer Self-Service-Forgot-Password bleibt aktiv.
- TTL-Empfehlung: `120` Minuten.
- Begruendung: kurz genug fuer Sicherheitszwecke, lang genug fuer reale Postlaufzeit und Nutzerreaktion.

### E. Bestehende Reset-Modi
- `link`, `manual`, `auto`, `direct` bleiben getrennt, um keine Admin-Regression auszulosen.
- E-Mail-Link-Modus wird die bevorzugte Zukunftsvariante.
- `direct` bleibt fuer explizite Admin-Sonderfaelle, aber ohne Mailversand.
- Wichtiger E1-Default:
  - Reset-Link-Mails werden synchron dispatcht und nicht asynchron retried.
  - Wenn die Zustellung fehlschlaegt, wird der frisch erzeugte Token sofort invalidiert und der Vorgang muss neu ausgelost werden.

## 7. Portal-Links in anderen E-Mails
- Passwort-Reset:
  - `/reset-password?token=...`
- Deadline due soon:
  - `/compliance/deadlines/:id`
- Deadline overdue:
  - `/compliance/deadlines/:id`
- Task related spaeter:
  - `/compliance/tasks/:id` nur dann, wenn das Task-Ziel fachlich stabil und ausreichend kontextreich ist.
- Project related:
  - `/compliance/projects/:id`
- LegalDoc related:
  - `/compliance/legal-docs/:id`
- Obligation related:
  - `/compliance/obligations/:id`
- Env-Variable fuer die Base URL:
  - `NOTIFICATION_BASE_URL`
- Umgang mit falscher/missing Base URL:
  - fehlende oder ungueltige Base URL ist ein terminaler Konfigurationsfehler.
  - in Produktion nur absolute HTTPS-URLs; `localhost`, `127.0.0.1` und `::1` sind dort nicht erlaubt.
- Dry-Run:
  - Links werden auch im Dry-Run erzeugt.
- `/compliance`-Prefix:
  - zentral im Link-Service definieren; keine verteilte String-Logik in einzelnen Event-Erzeugern.

## 8. MVP-Benachrichtigungen fuer Phase E1

### A. Passwort zuruecksetzen / Initialzugang
- Trigger:
  - `POST /auth/password/forgot`
  - `POST /admin/users/:id/reset-password` mit `passwordMode=link`
  - User-Erstellung mit `passwordMode=link`
- Empfaenger:
  - Zieluser
- Betreff:
  - `Passwort fuer das Nemetz Portal zuruecksetzen`
- Payload:
  - Titel, Nachricht, `expiresAt`, User-Entity
- Link ins Portal:
  - `/reset-password?token=...`
- Token-Erzeugung:
  - serverseitig, kryptographisch zufaellig, nur gehasht gespeichert
- Gueltigkeit:
  - 120 Minuten
- Doppelversand-Schutz:
  - alte offene Tokens werden invalidiert; jeder neue Request ist bewusst ein neuer Vorgang
- Umgang mit alten Tokens:
  - alle offenen Tokens des Users vor Neuausgabe entwerten
- Audit:
  - `RESET_REQUEST`, `USER_PASSWORD_RESET_REQUESTED_BY_ADMIN`, `USER_INVITED`, `RESET_CONFIRM`

### B. Frist bald faellig
- Trigger:
  - Dispatcher-Generator scannt aktive Deadlines
- Empfaenger:
  - Owner, optional Deputy, dedupliziert
- Betreff:
  - `Frist bald faellig: {title}`
- Payload:
  - `WARNING`, Due-Date-Hinweis, Deadline-/Projekt-Kontext
- Link ins Portal:
  - `/compliance/deadlines/:id`
- Wann wird sie geplant:
  - exakt am Tag `dueDate - emailReminderDaysBefore`, nur wenn `emailReminderEnabled=true`
- Wie wird Doppelversand verhindert:
  - deterministischer `idempotencyKey`
- Welche Vorwarnzeiten sollen unterstuetzt werden:
  - E1 stuetzt die bestehenden Felder `emailReminderEnabled` und `emailReminderDaysBefore`; Default 7 Tage
- Zusammenhang mit bestehenden Feldern:
  - `emailReminderEnabled` aktiviert/deaktiviert due-soon
  - `emailReminderDaysBefore` steuert den Vorwarnabstand

### C. Frist ueberfaellig
- Trigger:
  - Generator scannt aktive Deadlines mit `dueDate < today` und `status != DONE`
- Empfaenger:
  - Owner, optional Deputy, dedupliziert
- Betreff:
  - `Frist ueberfaellig: {title}`
- Payload:
  - `CRITICAL`, Overdue-Hinweis, Deadline-/Projekt-Kontext
- Link ins Portal:
  - `/compliance/deadlines/:id`
- Wiederholungslogik:
  - E1 bewusst nur einmal pro `deadlineId + recipient + dueDate`
- Doppelversand-Schutz:
  - deterministischer `idempotencyKey`
- Abgrenzung zu erledigten Fristen:
  - erledigte oder archivierte Deadlines werden nicht mehr versendet

### D. Aufgabe / Frist zugewiesen
- E1-Scope:
  - nur Deadline-Owner-/Deputy-Zuweisung, nicht allgemeine derived Tasks
- Trigger:
  - nach erfolgreicher Persistenz einer neuen oder geaenderten Deadline-Verantwortlichkeit
- Empfaenger:
  - neuer Owner oder neuer Deputy
- Betreff:
  - `Neue Zuweisung: {title}`
- Payload:
  - `INFO`, rollenabhaengiger Text, Deadline-/Projekt-Kontext
- Link ins Portal:
  - `/compliance/deadlines/:id`
- Wann wird gesendet:
  - nur bei tatsaechlichem Wechsel gegenueber dem vorherigen Zustand
- Wie wird vermieden, dass bei jedem Speichern dieselbe Mail erneut gesendet wird:
  - Vergleich alt/neu plus `idempotencyKey` auf Basis von Deadline, Rolle, Empfaenger und `updatedAt`

## 9. Empfaengerlogik
- `recipientUserId` wird aus echten `User`-Referenzen wie `ownerUserId`, `deputyUserId` oder dem Zieluser des Passwortresets abgeleitet.
- `ownerUserId` und `deputyUserId` werden separat geprueft, aber per User-ID dedupliziert.
- Stellvertreter-Eskalation ist E2.
- Fehlende E-Mail:
  - kein Versand
  - bei Admin-Reset klare API-Fehlermeldung
- Archivierter User:
  - kein Versand
- Externe User:
  - nur bei gueltiger E-Mail, aktivem User und `allowExternalUsers=true`
  - sonst Ablehnung oder `CANCELLED` je nach Eventtyp
- Mehrere Empfaenger:
  - immer einzelne Outbox-Zeilen pro Empfaenger
  - kein Sammel-`to[]`-Payload in E1
- Doppelte Empfaenger:
  - Dedupe nach `userId`, nicht nur nach E-Mail
- Passwort-Reset bei externen Benutzern:
  - nur wenn externe Nutzer generell erlaubt sind; sonst blockieren

## 10. Power Automate Integration
- Power-Automate-Flow:
  - HTTP-triggered Flow
  - Header:
    - `Content-Type`
    - `X-Notification-Secret`
    - optional `X-Notification-Id`
  - Body:
    - fertige fachliche JSON-Payload aus dem Portal
- Flow-Schritte fuer E1:
  - Request entgegennehmen
  - Shared Secret pruefen
  - Pflichtfelder validieren
  - E-Mail-Content aus Payload zusammensetzen
  - Mail senden
  - JSON-Antwort mit `ok`, `flowRunId`, optional `messageId` zurueckgeben
- Antwortschema:
  - Erfolg:
    - `200 { "ok": true, "flowRunId": "...", "messageId": "..." }`
  - Fachlicher Fehler:
    - `400/422` mit `message`
  - temporaerer Provider-/Umgebungsfehler:
    - `429/500/503` mit `message`
- Fehlerverhalten:
  - 4xx => `FAILED`
  - 429/5xx/Timeout/Netzwerk => `RETRY`
  - Reset-Link-Sonderfall => kein Retry, sondern `FAILED` plus Token-Invalidierung
- Timeout-Verhalten:
  - Backend-Timeout ueber `NOTIFICATION_DISPATCH_TIMEOUT_MS`
- Retry-Verhalten:
  - ueber Dispatcher-Backoff fuer normale Events
- Was im Power-Automate-Flow konfiguriert werden muss:
  - HTTP Trigger
  - Shared-Secret-Pruefung
  - Mail-Absender
  - Template-/Layout-Zusammensetzung
  - strukturierte JSON-Antwort
- Welche Backend-Env-Variablen noetig sind:
  - `POWER_AUTOMATE_NOTIFICATION_WEBHOOK_URL`
  - `POWER_AUTOMATE_NOTIFICATION_SECRET`
  - `NOTIFICATION_DISPATCH_ENABLED`
  - `NOTIFICATION_DRY_RUN`
  - `NOTIFICATION_BASE_URL`
  - `NOTIFICATION_FROM_LABEL`
  - `NOTIFICATION_MAX_ATTEMPTS`
  - `NOTIFICATION_DISPATCH_BATCH_SIZE`
  - `NOTIFICATION_DISPATCH_TIMEOUT_MS`
  - `NOTIFICATION_CLAIM_LEASE_SECONDS`
  - `NOTIFICATION_TIMEZONE`
  - `PASSWORD_RESET_TOKEN_TTL_MINUTES`

## 11. PowerAutomate-Payload

### Beispiel normale Benachrichtigung
```json
{
  "notificationId": "notf_123",
  "eventType": "DEADLINE_DUE_SOON",
  "recipient": {
    "email": "user@example.at",
    "displayName": "Max Mustermann"
  },
  "subject": "Frist bald faellig: Emissionsmessung 2026",
  "title": "Frist bald faellig",
  "message": "Die Frist \"Emissionsmessung 2026\" ist am 26.04.2026 faellig.",
  "link": "https://portal.example.at/compliance/deadlines/dl_123",
  "severity": "WARNING",
  "entity": {
    "type": "DEADLINE",
    "id": "dl_123",
    "label": "Emissionsmessung 2026"
  },
  "project": {
    "id": "pr_123",
    "title": "Projekt Wien Nord"
  },
  "createdAt": "2026-04-19T08:00:00.000Z",
  "fromLabel": "Nemetz Portal"
}
```

### Beispiel Passwort-Reset-Mail
```json
{
  "notificationId": "notf_456",
  "eventType": "PASSWORD_RESET_LINK",
  "recipient": {
    "email": "user@example.at",
    "displayName": "Max Mustermann"
  },
  "subject": "Passwort fuer das Nemetz Portal zuruecksetzen",
  "title": "Passwort zuruecksetzen",
  "message": "Du kannst ueber den folgenden Link ein neues Passwort vergeben.",
  "link": "https://portal.example.at/reset-password?token=RAW_TOKEN_ONLY_IN_LINK",
  "expiresAt": "2026-04-19T10:00:00.000Z",
  "severity": "INFO",
  "entity": {
    "type": "USER",
    "id": "usr_123",
    "label": "Max Mustermann"
  },
  "createdAt": "2026-04-19T08:00:00.000Z",
  "fromLabel": "Nemetz Portal"
}
```

- Kein Passwort im Payload.
- Kein `tokenHash` im Payload.
- Nur der Reset-Link enthaelt den Klartext-Token.
- Der Klartext-Token wird nicht gespeichert.

## 12. Sicherheitskonzept
- Webhook-URL niemals im Frontend.
- Secret nur serverseitig.
- Mindestschutz E1: Shared Secret im Header; optional spaeter HMAC oder staerker authentifizierter Trigger.
- Keine Passwort-Hashes, Tokens oder Secrets im Payload.
- Keine unnoetigen personenbezogenen Daten im Payload; nur das, was fuer Zustellung und Mailtext benoetigt wird.
- Umgang mit fehlenden/ungueltigen Empfaenger-E-Mails:
  - Reset-Link => Request ablehnen
  - normale Queue-Events => `CANCELLED` oder `FAILED`, je nach fachlicher Erwartung
- Logging:
  - keine Klartext-Tokens in Logs
  - Fehlertexte kuerzen und entpersonalisieren, soweit praktikabel
- Reset-Token-Sicherheit:
  - SHA-256-Hash in DB
  - Einmalverwendung
  - Invalidierung offener Tokens vor Neuausgabe
  - HTTPS-only Links in Produktion
- Wichtiger offener E1-Sicherheitsaspekt:
  - Power-Automate-Run-History kann den Request-Body mitsamt Reset-Link speichern.
  - Vor Produktion muss entschieden werden, ob diese Sichtbarkeit organisatorisch akzeptabel ist oder ob der Flow so gebaut wird, dass Request-Inputs/Logs minimal sichtbar bleiben.

## 13. Worker-/Dispatcher-Konzept
- Auswahl offener Notifications:
  - `PENDING` oder `RETRY` mit `scheduledFor <= now`
  - stale `CLAIMED` nach Lease-Ablauf
  - `PASSWORD_RESET_LINK` ist vom regulaeren Queue-Claiming ausgeschlossen
- Claiming:
  - atomisch in PostgreSQL mit `FOR UPDATE SKIP LOCKED`
  - `status -> CLAIMED`, `claimToken`, `claimedAt`, `lastAttemptAt`, `attemptCount + 1`
- Statusuebergaenge:
  - `PENDING -> CLAIMED -> SENT`
  - `PENDING/RETRY -> CLAIMED -> RETRY`
  - `PENDING/RETRY -> CLAIMED -> FAILED`
  - `PENDING/RETRY -> CLAIMED -> CANCELLED`
- Retry-Berechnung:
  - feste Backoff-Tabelle, z. B. 1, 5, 15, 60, 360 Minuten
  - `NOTIFICATION_MAX_ATTEMPTS` als Deckel
- Idempotenz:
  - Erzeugung ueber `idempotencyKey`
  - Dispatch-Schutz ueber Claim-Token und bedingte Finalisierung
- Abgebrochener Worker:
  - stale `CLAIMED` wird nach Lease-Ablauf neu claimbar
- DB-Locking / atomare UPDATE-Claims:
  - notwendig und in E1 klar empfohlen
  - keine In-Memory- oder Pod-lokalen Claims
- Passwort-Reset-Sonderfall:
  - stale Reset-Eintraege werden als `FAILED` markiert
  - neue Zustellung nur durch neues Reset-Ausloesen

## 14. Backend-Integration mit bestehenden Domaenen
- Admin Users / Passwortreset:
  - bestehender Endpunkt `POST /api/admin/users/:id/reset-password` bleibt der Trigger.
- PasswordResetToken:
  - vorhandenes Modell und vorhandene Prueflogik bleiben der Reset-Kern.
- Auth / Login / Passwortwechsel:
  - vorhandener Self-Service-Reset unter `/auth/password/forgot` und `/auth/password/reset` bleibt.
- Deadlines API:
  - due soon / overdue Generator liest echte `Deadline`-Rows.
  - assignment enqueued nur nach erfolgreicher Deadline-Persistenz.
- Tasks / TaskState:
  - `TasksStore` bleibt Read-Projektion.
  - keine E1-Mail direkt an derived Task-Aenderungen koppeln.
- Users:
  - `allowExternalUsers`, `isArchived`, `mustChangePassword`, `lastPasswordResetAt` bleiben zentrale Regeln.
- Projects / LegalDocs / Obligations:
  - in E1 nur als Entity-/Link-Kontext relevant, nicht als neue Triggerquelle.
- Wichtige Integrationsregel:
  - Benachrichtigung nur nach erfolgreicher fachlicher Persistenz erzeugen.
  - keine Mailerzeugung, wenn die zugrunde liegende Aenderung scheitert.
  - Passwort-Reset-Link erst nach erfolgreicher Token-Erzeugung und Outbox-Erstellung nutzen.

## 15. UI-/Admin-/Systembereich

### Phase E1
- Keine Versandhistorie-UI.
- Bestehender Admin-User-Bereich bleibt der Ausloeser fuer Reset-Link und Einladung.
- Link-Modus soll in Text und Label klar als bevorzugte sichere Variante erklaert werden.
- Fehlende Empfaenger-E-Mail oder geblockte externe User werden als klare Admin-Fehler angezeigt.
- Produktionsnah reicht technische Nachvollziehbarkeit ueber DB, Audit und Logs.
- Bestehende browser-lokale `NotificationsPage` bleibt unangetastet und wird nicht zur Mail-Historie umgedeutet.

### Phase E2
- Versandhistorie im Admin-/Systembereich.
- Fehlgeschlagene Benachrichtigungen sichtbar.
- Manuell erneut senden per Requeue.
- Globale und spaeter benutzerbezogene Settings.
- Digest-/Sammelmail-Einstellungen.

## 16. Tests

### Konkrete E1-Tests
- `NotificationOutbox`-Erzeugung pro Eventtyp
- Passwort-Reset-Link-Erzeugung
- Token wird nur gehasht gespeichert
- Token-TTL
- Token genau einmal verwendbar
- ungueltiger/abgelaufener Token
- Passwort-Policy und Placeholder-Blockierung
- `DEADLINE_DUE_SOON`
- `DEADLINE_OVERDUE`
- `ASSIGNMENT_ASSIGNED`
- Duplicate Prevention
- Retry bei Power-Automate-Fehler
- Dry-Run
- fehlende Empfaenger-E-Mail
- archivierter User
- paralleler Dispatcher
- `prisma validate`
- `prisma generate`
- API-Build
- Web-Build
- lokaler Mock fuer Power Automate

### Manuelle End-to-End-Tests
- Power-Automate-Testflow ausloesen
- Admin sendet Reset-Link
- E-Mail kommt an
- Link oeffnet Portal
- Passwort setzen
- Login funktioniert
- Token kann nicht erneut verwendet werden
- Testdeadline anlegen
- Outbox-Eintrag pruefen
- Dispatcher laufen lassen
- E-Mail erhalten
- Status `SENT` pruefen
- Fehlerfall provozieren
- `RETRY`/`FAILED` pruefen

### Bereits verifiziert in der aktuellen Repo-Lage
- API-Testlauf gruen
- API-Build gruen
- Web-Build gruen

## 17. Rollout
- Lokal:
  - `.env` mit Test-Webhook, Secret und Base URL setzen
  - `NOTIFICATION_DRY_RUN=true` fuer reine Queue-, Link- und Statuspruefung
  - `npm run notifications:dispatch` lokal gegen Testdaten ausfuehren
- Power-Automate-Testflow:
  - separater Test-Flow mit kontrolliertem Absender und Testempfaengern
  - Header-/Secret-Validierung pruefen
- Azure Secrets:
  - Webhook-URL
  - Secret
  - Base URL
  - Dispatch-Flags
  - TTL-/Retry-/Lease-Konfiguration
- Live-Dry-Run:
  - Outbox-Generierung aktivieren
  - Dispatcher nur in kontrollierter Testumgebung oder mit Testempfaengern
  - wichtige Nuance: bei `NOTIFICATION_DRY_RUN=true` funktionieren Reset-Link-Mails fachlich nicht als echter Benutzerfluss; Self-Service-Reset und Link-Einladungen erst nach echtem Versand freigeben
- Aktivierung:
  - `NOTIFICATION_DISPATCH_ENABLED=true`
  - `NOTIFICATION_DRY_RUN=false`
  - Azure Container Apps Job aktivieren
- Monitoring:
  - Job-Ausfuehrungen
  - Outbox-Counts nach Status
  - Fehlerraten
  - auffaellige Haeufung von `FAILED`/`RETRY`
- Rueckfallstrategie:
  - Dispatch per Env sofort abschaltbar
  - ACA Job sofort deaktivierbar
  - Link-Modus im Admin bis zur Stabilisierung notfalls wieder intern sperrbar, ohne Auth-/User-Logik zurueckzubauen

## 18. Risiken / offene Fragen
- PowerAutomate-Lizenz und Connector-Verfuegbarkeit
- Authentifizierung des HTTP-Triggers
- Mail-Absender und Branding
- Empfaengerlogik fuer externe User
- Einzelmail vs. Digest
- Zeitzonen und Tagesgrenzen bei date-only Deadlines
- Mehrfachversand bei Timeout nach bereits angenommener Provider-Anfrage
- API-Ausfall
- PowerAutomate-Ausfall
- Datenschutz und Payload-Minimierung
- archivierte User / externe User
- mehrere Container-Replicas
- fehlende oder falsche `NOTIFICATION_BASE_URL`
- Reset-Token in URL und Browser-Historie
- Power-Automate-Run-History mit Reset-Link im Request-Body
- Reset-Link-Phishing-Risiko
- wer Passwort-Reset ausloesen darf
- ob die browser-lokale `NotificationsPage` langfristig getrennt bleibt oder spaeter klar umbenannt/abgeloest werden soll
- ob `PasswordResetToken` in E2 um `purpose` oder `createdByUserId` ergaenzt werden soll

## 19. MVP-Empfehlung
- Was ist die kleinste sinnvolle Phase-E1-Version:
  - bestehende `NotificationOutbox`
  - bestehender `NotificationDispatcher`
  - bestehender Power-Automate-Client
  - bestehender sicherer Reset-Link-Flow
  - bestehende Deadline-due-soon / overdue / assignment Events
  - dazu nur operative Haertung, Rollout-Wiring und Dokumentation, keine Neuarchitektur
- Welche Benachrichtigungen zuerst:
  - Passwort-Reset / Initialzugang
  - Deadline due soon
  - Deadline overdue
  - Deadline assignment
- API-interner Scheduler oder Worker/Container Apps Job:
  - klare Empfehlung: kein API-interner Scheduler
  - One-shot-Worker-Command plus Azure Container Apps Job
- Welche Env-Variablen sind Pflicht:
  - `POWER_AUTOMATE_NOTIFICATION_WEBHOOK_URL`
  - `POWER_AUTOMATE_NOTIFICATION_SECRET`
  - `NOTIFICATION_DISPATCH_ENABLED`
  - `NOTIFICATION_DRY_RUN`
  - `NOTIFICATION_BASE_URL`
  - `NOTIFICATION_FROM_LABEL`
  - `NOTIFICATION_MAX_ATTEMPTS`
  - `NOTIFICATION_DISPATCH_BATCH_SIZE`
  - `NOTIFICATION_DISPATCH_TIMEOUT_MS`
  - `NOTIFICATION_CLAIM_LEASE_SECONDS`
  - `NOTIFICATION_TIMEZONE`
  - `PASSWORD_RESET_TOKEN_TTL_MINUTES`
- Welche Power-Automate-Flow-Schritte sind noetig:
  - HTTP trigger
  - secret validation
  - payload validation
  - mail composition
  - mail send
  - JSON response with provider reference
- Wie soll der Passwort-Reset-Link-Prozess im MVP aussehen:
  - vorhandenes Token-Modell wiederverwenden
  - alte Tokens invalidieren
  - neuen Token nur gehasht speichern
  - Outbox-Eintrag anlegen
  - Link synchron zustellen
  - bei Zustellfehler Token sofort unbrauchbar machen
- Welche Funktionen kommen bewusst erst in Phase E2:
  - Outbox-/Versandhistorie-UI
  - Retry-UI
  - Settings
  - Digest-/Sammelmails
  - Stellvertreter-Eskalationen
  - zusaetzliche Eventtypen fuer Project/LegalDoc/Obligation/Checklists
  - Template-Verwaltung
  - Cleanup-/Monitoring-Komfort
