# DATA_CONTRACT

## Entities

- `Scopes`
  - `companies[]`: `id`, `name`, `shortName?`, `isArchived`, `createdAt`, `updatedAt`
  - `sites[]`: `id`, `companyId`, `name`, `isArchived`, `createdAt`, `updatedAt`
  - `facilities[]`: `id`, `companyId`, `siteId`, `name`, `type?`, `isArchived`, `createdAt`, `updatedAt`
- `Authorities`
  - `authorities[]`: `id`, `name`, `shortName?`, `isArchived`, `createdAt?`, `updatedAt?`
  - `contacts[]`: `id`, `authorityId`, `name`, `email?`, `phone?`, `roleTitle?`, `isArchived`, `createdAt?`, `updatedAt?`
- `Projects`
  - `id`, `title`, `shortDescription?`, `authorityRef?`
  - `companyId`, `siteId?`, `facilityId?`
  - `authorityId?`, `authorityContactId?`
  - `ownerUserId?`, `deputyUserId?`, `internalParticipants[]`, `participantUserIds[]`
  - `externalParticipants[]`, `attachments[]`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `LegalDocs`
  - `id`, `projectId`, `type`, `title`, `shortDescription?`, `reference?`, `issuedAt?`
  - `attachments[]`, `aiExtraction?`, `scopeOverride?`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `Obligations`
  - `id`, `legalDocId`, `title`, `infoTextLong?`, `level`
  - `scheduleType`, `firstDueDate?`, `intervalUnit?`, `intervalValue?`
  - `ownerUserId?`, `deputyUserId?`, `criticality?`
  - `emailReminderEnabled`, `emailReminderDaysBefore?`
  - `origin?`, `sourceSuggestionId?`, `sourceRunId?`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `Deadlines`
  - `id`, `title`, `description?`, `dueDate`, `status`
  - `projectId?`, `legalDocId?`, `authorityId?`
  - `ownerUserId?`, `deputyUserId?`
  - `emailReminderEnabled`, `emailReminderDaysBefore?`
  - `completedAt?`, `completedByUserId?`, `evidence?[]`
  - `isArchived`, `archivedAt?`, `createdAt`, `updatedAt`
- `TaskState`
  - `Record<taskInstanceId, { status, completedAt?, completedByUserId?, completedByLabel?, evidence?[], updatedAt }>`
- `Evidence`
  - `id`, `note?`, `outcome?`, `attachments[]`, `createdAt`, `createdByUserId?`, `createdByLabel?`
- `Notifications`
  - `id`, `type`, `title`, `body?`, `entityType?`, `entityId?`, `taskInstanceId?`, `dueDate?`, `createdAt`, `dismissedAt?`, `snoozedUntil?`

## Export Payload

```json
{
  "version": 1,
  "exportedAt": "2026-02-22T00:00:00.000Z",
  "app": {
    "name": "Nemetz Bescheid-Auflagen Prototype",
    "buildLabel": "local"
  },
  "data": {
    "scopes": { "companies": [], "sites": [], "facilities": [] },
    "authorities": { "authorities": [], "contacts": [] },
    "users": [],
    "projects": [],
    "legalDocs": [],
    "obligations": [],
    "deadlines": [],
    "taskState": {},
    "auditLog": [],
    "notifications": [],
    "featureFlagsSnapshot": {
      "enableReports": true,
      "enableDiagnostics": true,
      "enableNotifications": true,
      "enableEvidence": true,
      "enableRbacDemo": true,
      "enableCalendarExport": true,
      "enableAiAnalysis": false
    }
  }
}
```

## Versioning & Migration

- Persistence und Export sind versioniert (`version` + `timestamp/exportedAt`).
- `migratePayload(versionFrom, versionTo, value)` in `src/state/persistence.ts` fuehrt Feld-Migrationen aus.
- Import-Validation laeuft in `src/state/importExport/validateImport.ts` (Errors + Warnings vor Confirm).
