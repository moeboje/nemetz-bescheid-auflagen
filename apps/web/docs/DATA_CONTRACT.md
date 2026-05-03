# DATA_CONTRACT

## Ziel

Dieser Vertrag beschreibt den aktuellen fachlichen Datenstand des Web-Clients gegen die aktive API. Fuer migrierte Fachdomänen ist die API plus PostgreSQL die Source of Truth.

## Fachdomänen im aktiven Web-Modell

- `Scopes`
  - `companies[]`: `id`, `name`, `shortName?`, `isArchived`, `createdAt`, `updatedAt`
  - `sites[]`: `id`, `companyId`, `name`, `isArchived`, `createdAt`, `updatedAt`
  - `facilities[]`: `id`, `companyId`, `siteId`, `name`, `type?`, `isArchived`, `createdAt`, `updatedAt`
- `Authorities`
  - `authorities[]`: `id`, `name`, `shortName?`, `isArchived`, `createdAt?`, `updatedAt?`
  - `contacts[]`: `id`, `authorityId`, `name`, `firstName?`, `lastName?`, `email?`, `phone?`, `mobile?`, `roleTitle?`, `department?`, `notes?`, `isPrimary`, `isArchived`, `createdAt?`, `updatedAt?`
- `Projects`
  - `id`, `title`, `status?`, `submissionType?`, `shortDescription?`, `authorityRef?`
  - `companyId`, `siteId?`, `facilityId?`
  - `authorityId?`, `authorityContactId?`
  - `ownerUserId?`, `deputyUserId?`
  - `internalParticipants[]`, `participantUserIds[]`, `externalParticipants[]`
  - `attachments[]`, `dependsOnProjectIds[]`, `referenceLegalDocIds[]`
  - `currentUserAccessRole?`, `currentUserAccessSource?` sind serverseitige, nutzerspezifische Lesemetadaten.
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `ProjectAccess`
  - `id`, `projectId`, `userId`, `accessRole`, `note?`, `grantedByUserId?`, `createdAt`, `updatedAt`
  - `accessRole`: `PROJECT_VIEWER`, `PROJECT_EDITOR`, `EXTERNAL_PROJECT_VIEWER`, `EXTERNAL_EXECUTOR`
  - `source`: `EXPLICIT`, `GLOBAL`, `IMPLICIT_OWNER`, `IMPLICIT_DEPUTY`, `IMPLICIT_PARTICIPANT`
  - ProjectAccess ist eine Admin-/Projektverwaltungsressource und ersetzt keine globalen Fachrechte fuer Schreibzugriffe.
- `ProjectChecklists`
  - `id`, `projectId`, `createdAt`, `updatedAt`
  - `sections[]`: `id`, `title`, `description?`, `sortOrder`, `createdAt`, `updatedAt`
  - `sections[].items[]`: `id`, `title`, `description?`, `status`, `sortOrder`, `createdAt`, `updatedAt`
- `LegalDocs`
  - `id`, `projectId`, `type`, `title`, `shortDescription?`, `reference?`, `issuedAt?`
  - `authorityId?`, `authorityContactId?`
  - `attachments[]`, `aiExtraction?`, `scopeOverride?`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `LegacyDecisions`
  - `id`, `projectId`, `title`, `fileNumber?`
  - `authorityId?`, `authorityName?`
  - `issuedAt?`, `validFrom?`, `validUntil?`
  - `legacyStatus`: `ARCHIVE_ONLY`, `HISTORICALLY_RELEVANT`, `PARTIALLY_RELEVANT`, `NEEDS_REVIEW`, `SUPERSEDED`, `CONVERTED`
  - `reviewStatus`: `NOT_REVIEWED`, `IN_REVIEW`, `REVIEWED`
  - `relevanceNote?`, `reviewedAt?`, `reviewedByUserId?`
  - `linkedLegalDocId?`, `supersededByLegalDocId?`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
  - Altbescheide erzeugen keine aktiven Auflagen, Fristen oder Tasks automatisch.
- `Obligations`
  - `id`, `legalDocId`, `title`, `infoTextLong?`, `level`
  - `scheduleType`, `firstDueDate?`, `intervalUnit?`, `intervalValue?`
  - `ownerUserId?`, `deputyUserId?`, `criticality?`
  - `emailReminderEnabled`, `emailReminderDaysBefore?`
  - `origin?`, `sourceSuggestionId?`, `sourceRunId?`
  - `evidenceRequirements?`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `Deadlines`
  - `id`, `title`, `description?`, `dueDate`, `status`
  - `projectId?`, `legalDocId?`, `authorityId?`
  - `ownerUserId?`, `deputyUserId?`
  - `emailReminderEnabled`, `emailReminderDaysBefore?`
  - `completedAt?`, `completedByUserId?`, `completedByLabel?`, `evidence?[]`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `TaskState`
  - `Record<taskInstanceId, { status, completedAt?, completedByUserId?, completedByLabel?, evidence?[], updatedAt, createdAt? }>`
- `LocalAuditLog`
  - browserlokale UI-Historie: `id`, `at`, `actorLabel`, `entityType`, `entityId`, `action`, `summary`
- `LocalInAppNotifications`
  - browserlokale In-App-Reminder: `id`, `type`, `title`, `body?`, `entityType?`, `entityId?`, `taskInstanceId?`, `dueDate?`, `createdAt`, `dismissedAt?`, `snoozedUntil?`

## Wichtige Abgrenzungen

- `Project.status` und `Project.submissionType` sind getrennte Felder.
- Projekt-Checklisten sind eigene serverseitige Projekt-Subressourcen.
- Projektzugriff wird serverseitig durch globale Rechte, implizite Projektrollen und explizite `ProjectAccess`-Eintraege begrenzt. Clientseitige Filter sind nur Komfort.
- Dokumentzugriff ist an `ownerType`, `ownerId` und den darunterliegenden Projektkontext gebunden. Gueltige Owner-Typen sind `PROJECT`, `LEGAL_DOC`, `OBLIGATION`, `DEADLINE`, `TASK_EVIDENCE` und `LEGACY_DECISION`.
- Serverseitige E-Mail-Benachrichtigungen laufen ueber `NotificationOutbox`; sie sind nicht identisch mit den browserlokalen In-App-Notifications.
- Benutzer, Rollen, externe Firmen, globale Security Settings, Notification Settings, ProjectAccess-Verwaltung und serverseitige Notification-Outbox-/Versandhistorie sind server-managed Admin-Domänen und kein Teil des generischen JSON-Exports.

## Generischer Export-Payload

Der generische Export ist ein Teil-Export fuer Recovery/Analyse, kein vollstaendiges Restore- oder Disaster-Recovery-Format.

```json
{
  "version": 1,
  "exportedAt": "2026-04-23T00:00:00.000Z",
  "app": {
    "name": "Nemetz Bescheid-Auflagen",
    "buildLabel": "local"
  },
  "meta": {
    "warnings": [
      "This JSON export is only a partial recovery artifact.",
      "Users, roles, external organizations, security settings, notification settings and notification outbox history are intentionally omitted."
    ],
    "omittedDomains": [
      "users",
      "roles",
      "externalOrgs",
      "securitySettings",
      "notificationSettings",
      "notificationOutbox"
    ]
  },
  "data": {
    "scopes": { "companies": [], "sites": [], "facilities": [] },
    "authorities": { "authorities": [], "contacts": [] },
    "projects": [],
    "projectChecklists": [],
    "legalDocs": [],
    "legacyDecisions": [],
    "obligations": [],
    "deadlines": [],
    "taskState": {},
    "auditLog": [],
    "notifications": [],
    "featureFlagsSnapshot": {}
  }
}
```

## Import / Recovery Grenzen

- Der generische Gesamt-Import ist derzeit gesperrt, weil mehrere serverseitige Domänen sonst nicht atomar ersetzt wuerden.
- Altbescheide sind im Teil-Export enthalten, wenn die API sie im aktuellen serverseitigen Zugriffsscope liefert. Der generische Import stellt sie nicht wieder her.
- Datei-Metadaten koennen exportiert werden; lokale Datei-Inhalte muessen nach einem Import ggf. neu hochgeladen werden.
- Der ErrorBoundary-Reset betrifft nur lokale Browserdaten zur Fehlerisolierung.

## Versioning

- Export und lokale UI-Persistenz bleiben versioniert ueber `version`.
- Import-Validation liegt in `src/state/importExport/validateImport.ts`.
- Fuer migrierte Fachdomänen ersetzt Versionierung keine serverseitige Migrations- oder Restore-Strategie.
