# Umsetzungsplan C2: Einfache projektbezogene Checklisten-Engine

## Summary
- C2 ist eine additive Erweiterung der bereits serverseitig persistierten Domäne `projects`; es ist keine neue Persistenzphase und kein Architekturwechsel.
- Ziel ist eine neutrale, manuell pflegbare Checklisten-Engine pro Projekt: eine optionale Checkliste mit Sektionen und Punkten.
- C1a `Project.status` bleibt unverändert der fachliche Phasenindikator. C1b `submissionProfileKeys` bleibt ein getrenntes Konzept und ist für C2 noch nicht steuernd.
- C2 schafft die technische Grundlage für C3/C4-Templates und für C5-Metadaten, ohne diese Inhalte bereits einzuführen.

## 1. Fachliches Zielbild
- C2 liefert eine einfache Arbeitsliste im Projektdetail: projektbezogen, serverseitig dauerhaft, manuell pflegbar, ohne AWG-/UVP-Fachinhalte.
- Ein Projekt kann genau eine Checkliste haben. Diese ist optional und wird erst bei expliziter Nutzung angelegt.
- Eine Checkliste besteht aus geordneten Sektionen. Sektionen enthalten geordnete Checklistenpunkte.
- Ein Checklistenpunkt hat in C2 nur `title`, optionale `description`, `status`, `sortOrder` und `sectionId`.
- Nicht Teil von C2 sind Templates, Profil-zu-Checklist-Automatik, Dokumentpflichtlogik, Verantwortliche, Fälligkeiten, Eskalationen, Reminder, Reports, Aufgabenableitungen und UVP-/UVE-Zusatzmodule.
- Der Projektstatus beantwortet weiterhin "In welcher Phase befindet sich das Projekt?". Die Checkliste beantwortet "Welche konkreten Punkte im Projekt sind offen oder erledigt?".
- Es gibt keine automatische Statusableitung aus der Checkliste und keine automatische Checklistenänderung aus dem Projektstatus.

## 2. Abgrenzung zu späteren Phasen
- C2: neutrale Engine mit manueller Projektcheckliste, Sektionen, Punkten, Status und Reihenfolge.
- C3: erste kuratierte Standard-AWG-/Basistemplates, Template-Materialisierung, optionale Initialisierung aus Profilen.
- C4: UVP-/UVE-Zusatzmodule und profilabhängige Template-Komposition.
- C5: Verantwortliche, Fälligkeiten, Dokument-/LegalDoc-Verknüpfungen und ggf. richer item metadata.
- Spätere Reporting-/Mobile-Phasen: projektübergreifende Auswertungen, Reminder, Aufgabenkopplung, Header-/Listen-Badges außerhalb des Tabs und mobile Feinschliffe.

## 3. Fachliches Daten- und Statusmodell
- `ProjectChecklist`: Root-Objekt, `projectId` eindeutig, optional vorhanden, keine eigene Fachlogik außer "Checkliste existiert / existiert nicht".
- `ProjectChecklistSection`: `id`, `projectChecklistId`, `title`, optionale `description`, `sortOrder`.
- `ProjectChecklistItem`: `id`, `projectChecklistSectionId`, `title`, optionale `description`, `status`, `sortOrder`.
- `ChecklistItemStatus`: `OPEN`, `IN_PROGRESS`, `DONE`, `NOT_REQUIRED`.
- `sortOrder` ist jeweils nur unter Geschwistern relevant und wird serverseitig auf eine stabile, lückenfreie Reihenfolge normalisiert.
- C2 speichert keine Template-Herkunft. Nullable Felder wie `sourceTemplateId`, `sourceTemplateSectionId`, `sourceTemplateItemId`, `originType` oder `isSystemGenerated` bleiben bewusst C3/C4 vorbehalten.
- `BLOCKED` gehört nicht in C2. Ohne Verantwortliche, Eskalation, Gründe oder Abhängigkeiten ist dieser Status fachlich zu schwer und zieht die Engine zu früh in Richtung Workflow-/Task-System.
- `NOT_REQUIRED` gehört bereits in C2, damit spätere templatebasierte Checklisten nicht auf Delete- oder Freitext-Workarounds angewiesen sind.
- C2 darf nicht auf C1b warten. Die Engine funktioniert profilunabhängig; vorhandene `submissionProfileKeys` werden erst ab C3/C4 für Initialisierung und Templatewahl relevant.

## 4. UI-/UX-Konzept
- Die Checkliste sitzt als neuer Tab `Checkliste` ausschließlich im Projektdetail; keine neue Route, keine Navigationserweiterung, kein Umbau des Projekt-Headers.
- Der bestehende Status-Badge und die vorhandenen Einreichprofil-Chips bleiben unverändert. Eine zusätzliche Header-Statusübersicht ist nicht Teil von C2 MVP.
- Projekte ohne Checkliste zeigen im Tab einen Empty State mit kurzer Erklärung und einer primären Aktion `Checkliste anlegen`.
- Sektionen sind im Tab einklappbar und zeigen je Sektion kompakte Zähler für `OPEN`, `IN_PROGRESS`, `DONE`, `NOT_REQUIRED`.
- Die Darstellung bleibt sektionsbasiert; offene und erledigte Punkte werden nicht global gruppiert, damit spätere Template-Strukturen nicht zerstört werden. Ein `Erledigte ausblenden`-Toggle im Tab ist sinnvoll.
- Bearbeitung erfolgt in-page und inline: Sektion anlegen/umbenennen/löschen, Punkt anlegen/umbenennen/beschreiben, Status wechseln, Reihenfolge ändern. Große Modals sind für C2 nicht nötig.
- Löschen ganzer Sektionen oder Punkte braucht nur eine schlanke Bestätigung, keinen neuen Wizard.

## 5. Technisches Modell und Einführung
- Persistenzrichtung: additive Projektsubressource innerhalb der bestehenden serverseitigen Projektarchitektur; keine Rückkehr zu `localStorage`, kein Snapshot-Fallback.
- Datenhaltung: eigene relationale Tabellen/Modelle sind empfohlen. Die Struktur ist flach genug, dass JSONB hier keinen klaren Vorteil bringt; spätere C3/C5-Erweiterungen profitieren von stabilen Section-/Item-IDs.
- API-Vertrag: projekt-scoped Snapshot-DTO statt viele neue globale Listen-Endpunkte.
- Empfehlung: `GET /projects/:id/checklist` liefert `null` oder eine vollständige Checklist-Snapshot-Response; `PUT /projects/:id/checklist` erstellt oder ersetzt die gesamte Checkliste atomar; `DELETE /projects/:id/checklist` setzt sie auf "keine Checkliste" zurück.
- Der API-Vertrag bleibt damit klein, kompatibel zu Export/Import und passend für page-lokale Inline-Bearbeitung. Last-write-wins ist für C2 ausreichend; Echtzeit-Kollaboration ist ausdrücklich kein Ziel.
- Frontend-Anbindung: kein Ausbau des bestehenden `ProjectsStore`-List-Payloads. Empfehlung ist ein kleines `api/projectChecklists.ts` plus page-lokaler State/Hook in `ProjectDetailPage`, damit die bestehende serverseitige Projektpersistenz nicht destabilisiert wird.
- Import/Export später mitbedenken: Export erhält einen separaten `projectChecklists`-Block; Import validiert ihn nach `projects`; Demo-/Reset-Flows erzeugen in C2 keine Default-Checklisten.
- Legacy-Projekte ohne Checkliste bleiben fachlich neutral. `GET` liefert `null`, die UI zeigt den Empty State, und sonst ändert sich am Projektverhalten nichts.
- Einführungsstrategie: Tab per Runtime-Flag freischalten, aber Checklisten für neue wie bestehende Projekte nur manuell anlegen. Kein Auto-Seed, kein Backfill, kein stilles Erzeugen beim Projekt-Create.

## 6. Interne Umsetzungsphasen innerhalb von C2
| Schritt | Ziel | Betroffene Bereiche | Hauptrisiken | Abnahmekriterien |
|---|---|---|---|---|
| `C2.1 Datenmodell + API-Vertrag` | Root/Section/Item-Modelle und Snapshot-DTO definieren. | Prisma, API-Route, API-Tests. | Übermodellierung, versehentliche Kopplung an `projects`-List-Payload. | `GET` liefert `null` ohne Fehler; `PUT` legt eine valide Checkliste an; Status und Sortierung roundtrippen stabil. |
| `C2.2 Projektdetail-Tab + Read-Only` | Tab, Empty State, Renderlogik, Sektionen und Zähler. | `ProjectDetailPage`, i18n, kleiner Checklist-API-Client. | Detailseiten-Regressions, unklare Empty-State-UX. | Ein Projekt ohne Checkliste bleibt stabil; ein Projekt mit Checkliste zeigt die Struktur korrekt nach Reload und Inkognito. |
| `C2.3 Inline-Bearbeitung + Reihenfolge + Statuswechsel` | Manuelle Pflege ohne neue Workflows. | Checklisten-Tab-Komponenten, Snapshot-Save, API-Validierung. | Sortierungsfehler, versehentliches Überschreiben kompletter Snapshots. | Sektionen und Punkte anlegen, bearbeiten, löschen, verschieben und im Status ändern funktioniert ohne Seitenwechsel. |
| `C2.4 Import/Export/Admin-Kompatibilität` | Recovery-/Admin-Pfade konsistent halten. | `exportPayload`, `validateImport`, Admin-Reset/Bulk-Flows. | Orphaned Daten, partielle Imports, unvollständige Reset-Reihenfolge. | Export/Import roundtrippt Checklisten verlustfrei; Reset entfernt Checklisten sauber mit Projekten oder davor. |
| `C2.5 Abschluss, Tests, Rollout-Bereitschaft` | Freischaltungs- und Rollout-Gate. | API-/Web-Build, manuelle Browser-Smokes, Runtime-Flag. | Hidden regressions im Projektdetail, Rollback ohne Flag schwer. | Schema, API und Web bauen lokal; Pilotfreigabe kann per Flag reversibel erfolgen. |

## 7. Tests, Risiken und lokale Leitplanken
- API-Tests für C2 müssen mindestens abdecken: `GET null`, `PUT create`, `PUT update`, Statuswechsel, Sortierreihenfolge, `DELETE reset`, Projektzugriffsrechte und Cascade-Delete beim Projekt.
- Web-Checks: `cd apps/web && npm run build`; bei Schema/API-Anpassung zusätzlich `cd apps/api && npx prisma generate`, `npx prisma db push --skip-generate`, `npm run build`.
- Manuelle Pflichtprüfungen: Projekt ohne Checkliste öffnen, Checkliste anlegen, Sektion/Punkt anlegen, Status ändern, Reihenfolge ändern, Reload, Inkognito, zweite Sitzung und unveränderte Archivierungs-/Restore-Flows des Projekts.
- Fachliches Risiko: C2 wird versehentlich schon wie eine AWG-/UVP-Lösung modelliert. Gegenmaßnahme: nur neutrale Engine, keine fachlichen Pflichtinhalte.
- UX-Risiko: Projektdetail wird überladen. Gegenmaßnahme: eigener Tab, kein Header-Umbau, keine projektlistenweite Zusatzanzeige im MVP.
- Datenmodell-Risiko: zu früher Template-/Origin-Ballast. Gegenmaßnahme: C2 hält nur manuelle Engine-Felder; Herkunftsmetadaten erst ab C3/C4.
- Migrations-/Legacy-Risiko: Altprojekte wirken plötzlich "unvollständig". Gegenmaßnahme: keine Auto-Erzeugung, `null`-Checkliste als neutraler Standard.
- Import-/Reset-/Recovery-Risiko: neue Daten werden bei Recovery vergessen. Gegenmaßnahme: C2.4 ist Pflicht vor produktiver Freischaltung.
- Technisches Risiko: lokaler Prisma-/Migrationszustand im Repo bleibt Übergangsmodus. Bei späterer C2-Umsetzung lokal weiter mit `prisma generate` plus `prisma db push --skip-generate` validieren; `migrate deploy` lokal nicht als Gate annehmen.

## 8. MVP-Empfehlung und offene Fragen
- Kleinste sinnvolle C2-Version: optionaler Projekt-Tab `Checkliste`, manuelles Anlegen einer einzelnen Checkliste, Sektionen, Punkte, Reihenfolge, Status und serverseitige Persistenz mit Reload-/Incognito-Stabilität.
- Pflichtfelder im MVP: Section `title`, `sortOrder`; Item `title`, optionale `description`, `status`, `sortOrder`, `sectionId`.
- Pflichtstatus im MVP: `OPEN`, `IN_PROGRESS`, `DONE`, `NOT_REQUIRED`.
- Sektionen und Reihenfolge gehören bereits in C2 MVP. Ohne beides wäre die spätere Template-Kompatibilität künstlich eingeschränkt und die Engine zu flach.
- Bewusst erst ab C3/C4/C5: Vorlageninhalte, Profil-zu-Template-Initialisierung, UVP-/UVE-Module, Dokumentpflichtlogik, Verantwortliche, Fälligkeiten, Dokumentverknüpfung, Reminder, Reports und Aufgabenableitungen.
- Wichtigste offene Fragen vor Implementierung: Soll `DELETE /projects/:id/checklist` als normale Benutzeraktion sichtbar sein oder nur als Admin-/Recovery-Pfad? Soll der Tab sofort für alle internen Projektbearbeiter sichtbar sein oder zunächst hinter einem Runtime-Flag pilotiert werden? Sollen erledigte Punkte standardmäßig sichtbar bleiben oder im MVP initial ausgeblendet werden?
- Default-Entscheidung dieses Plans: Delete nur additiv und nicht prominent, Tab rollout-gated per Flag, erledigte Punkte standardmäßig sichtbar mit manuellem Ausblenden.
