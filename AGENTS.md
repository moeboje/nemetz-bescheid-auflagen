\# AGENTS.md



\## Purpose



This repository is being migrated from browser-local / snapshot-based persistence to real server-side domain persistence on PostgreSQL.



The migration must preserve the existing user experience and business workflows.

Do not redesign the UI. Do not invent new workflows. Do not rename domain concepts unless strictly necessary for compatibility.



This file defines the working rules for Codex in this repository.



\---



\## Core Principles



1\. \*\*No functional UX changes\*\*

&#x20;  - Keep the current UI behavior, screens, navigation, labels, and workflows intact.

&#x20;  - Only change persistence and data-loading behavior as needed.



2\. \*\*Minimize change scope\*\*

&#x20;  - Prefer small, reviewable, domain-focused changes.

&#x20;  - Do not refactor unrelated code while implementing a phase.



3\. \*\*Server-side persistence is the source of truth\*\*

&#x20;  - For migrated domains, PostgreSQL + API is the source of truth.

&#x20;  - Browser localStorage must not remain the primary source of truth for migrated domains.



4\. \*\*Snapshot migration must be gradual\*\*

&#x20;  - The current server snapshot / browser snapshot approach may stay in place temporarily for domains not yet migrated.

&#x20;  - As soon as a domain is properly migrated to API + PostgreSQL, remove or disable that domain from the snapshot flow.

&#x20;  - Never leave a migrated domain with two competing sources of truth.



5\. \*\*No secrets in Git\*\*

&#x20;  - Never commit passwords, tokens, connection strings, `.env`, dumps, exported backups, or credentials.

&#x20;  - Never add debug secrets or temporary secrets to tracked files.



6\. \*\*No unnecessary new dependencies\*\*

&#x20;  - Avoid adding new runtime dependencies unless truly needed.

&#x20;  - Prefer using the existing stack, patterns, and utilities already present in the repo.



7\. \*\*Always validate changes\*\*

&#x20;  - After each implementation step, run the relevant local build/test commands.

&#x20;  - After each phase, provide a short manual browser test checklist.



\---



\## Working Mode for Codex



\### Plan-first rule

For any task that touches:

\- Prisma schema

\- API routes

\- frontend stores

\- frontend data loading/saving

\- snapshot/server-state synchronization

\- more than one domain



Codex must:

1\. read this `AGENTS.md`

2\. work in \*\*Plan Mode\*\* first (`/plan`)

3\. create or update an execution plan document

4\. only implement after the plan is clear



\### Execution plan file

Use this file for the master migration plan:



\- `docs/exec-plan-domain-persistence.md`



If the file does not exist, create it before implementation.



The plan should include:

\- goal

\- current state

\- risks

\- phased migration order

\- data model changes

\- API changes

\- frontend changes

\- snapshot deprecation strategy

\- local test plan

\- Azure rollout steps

\- rollback ideas



\### Review rule

After completing each phase, run:

\- local API build

\- local Web build

\- relevant manual checks

\- `/review`



Review focus:

\- data loss

\- conflicting sources of truth

\- auth/session regressions

\- snapshot interference

\- backwards compatibility

\- accidental UX changes



\---



\## Repository Context



\### Project goal

This application manages:

\- companies

\- sites

\- facilities

\- authorities

\- authority contacts

\- projects

\- legal documents

\- obligations

\- deadlines

\- task state / tasks

\- admin users and roles



\### Current migration direction

Auth and login are already functioning server-side.

The current remaining work is to replace browser-only or snapshot-only persistence with true domain persistence.



\### Important architectural rule

Do \*\*not\*\* jump directly to a full redesign.

Migrate domain-by-domain in a controlled sequence.



\---



\## Migration Order



Work in this order unless a real blocker forces a change:



1\. \*\*Authorities + Authority Contacts + Scopes\*\*

&#x20;  - authorities

&#x20;  - authority contacts

&#x20;  - companies

&#x20;  - sites

&#x20;  - facilities



2\. \*\*Projects\*\*



3\. \*\*Legal Documents\*\*



4\. \*\*Obligations\*\*



5\. \*\*Deadlines\*\*



6\. \*\*Task State / Tasks\*\*



7\. \*\*Snapshot cleanup / removal\*\*

&#x20;  - only after all needed domains are migrated



Do \*\*not\*\* start a later phase before the current phase is locally complete and manually verified.



\---



\## Domain Migration Rules



For each migrated domain, do all of the following:



1\. Extend or adapt the Prisma data model.

2\. Use the repo’s database migration workflow for real schema evolution.

3\. Add or adapt API endpoints.

4\. Migrate the frontend store from local/browser persistence to API-backed persistence.

5\. Keep the current UI behavior intact.

6\. Remove that domain from snapshot/server-state persistence.

7\. Validate with reload + incognito + second-session tests.



\### Allowed simplification

If a domain has deeply nested frontend structures and a pure relational refactor would cause too much disruption, JSON/JSONB storage is acceptable \*\*temporarily\*\*, as long as:

\- functionality stays the same

\- the domain becomes server-side durable

\- the design remains understandable and reviewable



\---



\## Required Behavior for Specific Domains



\### Authorities / Authority Contacts

The system must support server-side persistence for:

\- authority

\- authority contact

\- name

\- email

\- phone

\- roleTitle / function

\- archive / restore behavior



This belongs in the admin area and must remain usable there.



\### Scopes

The system must support server-side persistence for:

\- companies

\- sites

\- facilities



These must survive:

\- reload

\- incognito

\- new browser session

\- local restart

\- Azure redeploy / revision change



\### Projects

Projects must be migrated after scopes and authorities are properly server-side persisted because they depend on:

\- companyId

\- siteId

\- facilityId

\- authorityId

\- authorityContactId

\- owner/deputy

\- participant references

\- project relations



\### Legal Documents, Obligations, Deadlines, Tasks

These domains must be migrated only after their upstream dependencies are stable.



\---



\## Strict Non-Goals



Codex must \*\*not\*\* do any of the following unless explicitly instructed:

\- redesign navigation

\- rename routes or pages

\- replace the UI framework

\- change translation keys unnecessarily

\- rewrite unrelated stores

\- introduce a new architecture “for cleanliness”

\- add speculative features

\- remove working auth/session code

\- change deployment model without need



\---



\## Local Development Environment



\### Repository root

Run all repo-wide tasks from the repository root.



\### Local database

Use a local PostgreSQL instance for development.

Do not develop against the live Azure production database.



\### API app

Location:

\- `apps/api`



Typical local workflow:

```bash

cd apps/api

npm ci

npx prisma generate

npm run build

npm run dev

