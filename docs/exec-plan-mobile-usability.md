# Umsetzungsplan: Mobile Usability der bestehenden Web-App

## 1. Zielbild
- Die bestehende Web-App bleibt fachlich identisch, ist aber auf Touch-Geräten ohne Zoomen, horizontales Seitenscrollen oder verdeckte Primäraktionen nutzbar.
- "Mobil nutzbar" bedeutet für diese App konkret:
  - Login, Navigation, Suchen/Filtern, Listen-Nutzung, Detailansichten, Anlegen/Bearbeiten und Abschluss-/Evidence-Flows funktionieren auf Smartphone und kleinem Tablet.
  - Primäre Aktionen bleiben mit dem Daumen erreichbar; Touch-Ziele sind mindestens 44px hoch.
  - Formulare, Dialoge, Tabellen, Tabs, Upload- und Preview-Flows brechen auf kleinen Screens nicht visuell oder funktional.
  - On-Screen-Keyboard, Scroll-Containment und Modal-Footer verdecken keine Pflichtfelder oder Save-Aktionen.
- Verbindliche Zielgrößen für Welle 1:
  - Smartphone Portrait: `390x844` als Pflichtziel.
  - Kleines Tablet Portrait: `768x1024` als Pflichtziel.
  - `360px` Breite bleibt Best Effort, aber kein explizites Blocker-Ziel.
- Desktop-Verhalten ab `>= 961px` bleibt optisch und funktional unverändert.

## 2. Nicht-Ziele
- Keine native App, kein neuer Backend- oder Persistenzpfad, keine API-/Prisma-/Store-Änderungen.
- Keine fachlichen UX-Änderungen: gleiche Seiten, gleiche Rollen/Berechtigungen, gleiche Kernabläufe, gleiche Bezeichnungen.
- Keine PWA/Installierbarkeit in Welle 1 bis M4; M5 bleibt optional und separat.
- Keine umfassende Mobile-Optimierung für Reports, Print-Ansichten und Admin-Verwaltung in der ersten Welle.
- Desktop-first dürfen zunächst bleiben:
  - `ReportsPage`, `TasksReportPrintPage`, `ComplianceSummaryPage`
  - `AdminUsersPage`, `AdminRolesPage`, `AdminExternalOrgsPage`, `AdminAuthoritiesPage`
  - Legacy-/Duplikatseiten unter `apps/web/src/pages/bescheide/*`
- Auth-, MFA-, Help-, About- und Security-Seiten werden nur auf mobile Funktionsfähigkeit abgesichert; sie bekommen keine eigene Optimierungswelle.

## 3. Analyse des Ist-Zustands
- Die aktive App-Shell in `apps/web/src/App.tsx` nutzt `@nemetz/ui`-Primitives, die mobil aktuell nur stapeln statt echte Mobile-Navigation zu liefern.
- `packages/ui/src/components/AppShell.module.css` schaltet unter `960px` auf einspaltig, lässt die Sidebar aber als dauerhaft sichtbaren Block stehen; es gibt keinen Drawer/Overlay-Modus.
- Die Topbar ist auf kleine Screens überfrachtet: User-Badge, Logout, Security, Notifications und Help liegen nebeneinander.
- Tabellen sind der dominante Desktop-Mechanismus:
  - `ProjectsPage`, `LegalDocsPage`, `ObligationsPage`, `DeadlinesPage`, `TasksPage`, `DashboardPage`, `NotificationsPage`, mehrere Detailseiten und alle Admin-Seiten nutzen `DataTable`.
  - `DataTable` bietet heute nur horizontales Scrollen, keine mobile Karten-/Stack-Darstellung.
- Filter sind mobil problematisch:
  - `filterRowFour` bis `filterRowNine` kollabieren unter `900px` zwar auf eine Spalte, bleiben aber lange, unstrukturierte vertikale Blöcke.
  - Kritisch sind vor allem `TasksPage` mit `filterRowNine`, `DeadlinesPage`/`ObligationsPage` mit `filterRowSix`, `ProjectsPage` mit `filterRowFive`.
- Tabs sind mobil problematisch:
  - `ProjectDetailPage`, `LegalDocPage` und `AdminSubnav` nutzen `tabs` als `inline-flex` ohne dedizierte mobile Scroll-/Wrap-Strategie.
- Modals sind klar desktop-lastig:
  - `Modal` hat global `width: min(960px, 95vw)` und nur `TaskCompleteModal` besitzt eine spezielle Mobile-Regel.
  - Große Form-Modals wie `ProjectModal`, `LegalDocModal`, `ObligationModal`, `DeadlineModal`, `AiAnalysisReviewModal` laufen mobil in lange Scroll-Container ohne sticky Save-Zone.
- Operative Spezialfälle:
  - `ScopesPage` nutzt eine zweispaltige Baum-/Summary-Struktur mit vielen Inline-Aktionen.
  - `ProjectDetailPage` und `LegalDocPage` kombinieren Tabs, Relation-Listen, Tabellen und mehrere sekundäre Modals.
  - `DocumentsPanel`, `DocumentPreviewModal`, `EvidenceUploader`, `TaskCompleteModal`, `EvidenceCompletionModal` und `PdfViewer` sind für Kamera-, Preview- und Upload-Flows relevant, aber nur teilweise mobil optimiert.
- Bestehende responsive Regeln in `apps/web/src/styles/app.css` helfen punktuell, lösen aber die Kernprobleme nicht:
  - Filter werden einspaltig.
  - `scopesLayout` wird einspaltig.
  - `taskCompleteModal` wird auf kleinen Screens fullscreen.
  - Für App-Shell, DataTable, Standard-Modal, Tabs und Topbar fehlt eine vollständige Mobile-Strategie.

## 4. Priorisierung
- Höchste Priorität in Welle 1:
  - `TasksPage`, `TaskDetailPage`, `DeadlinesPage`, `DeadlineDetailPage`
  - `DashboardPage`
  - `LegalDocsPage`, `LegalDocPage`
  - `ProjectsPage`, `ProjectDetailPage`
  - Zugehörige Modals für Projekt, Rechtsdokument, Auflage, Frist, Task-Abschluss und Evidence
- Mittlere Priorität in Welle 1:
  - `ScopesPage`
  - Dokument-/Attachment-/Preview-Komponenten
- Spätere Welle:
  - Alle Admin-Seiten außer Basis-Nutzbarkeit über Shell/Navigation
  - Reports, Print, Compliance Summary
  - PWA/Installierbarkeit

## 5. Wichtige Interface-/Komponentenänderungen
- Keine öffentlichen Backend-Interfaces ändern.
- Additive interne UI-Interfaces in `packages/ui`:
  - `AppShell`: mobiler Drawer-Modus unter `960px`, inklusive Overlay, Fokusführung und Scroll-Lock.
  - `DataTable`: optionale mobile Darstellung `cards` für operative Listen; Default bleibt `table`.
  - `Modal`: optionale mobile Variante `fullscreen` für große Form-/Preview-Modals; Default bleibt Desktop-Center-Modal.
- Bestehende Seiten- und Datenkomponenten werden weiterverwendet; keine neue State- oder Routing-Architektur.

## 6. Phasenplan

| Phase | Ziel | Betroffene Bereiche | Mobile/UI-Muster | Risiken | Abnahmekriterien |
|---|---|---|---|---|---|
| `M0 Audit` | Mobile-Baseline und Defektliste verifizieren, ohne Verhalten zu ändern. | `apps/web/src/App.tsx`, `apps/web/src/styles/app.css`, `packages/ui`, operative Seiten und Kern-Modals. | Viewport-Audit, Touch-Target-Audit, Keyboard-/Scroll-Audit, Screenshot-Baseline für `390`, `768`, `1280+`. | Falsche Priorisierung, wenn nur CSS statt echter Nutzbarkeit bewertet wird. | Inventar pro Seite liegt vor: Shell, Listen, Detailseiten, Modals, Upload/Preview. Für jede Kernseite ist klar, ob Problem in Navigation, Tabelle, Filter, Tabs, Modal oder Upload liegt. |
| `M1 App-Shell / Navigation / globale Layoutregeln` | Navigation, Header, Tabs und globale Abstände mobil belastbar machen. | `packages/ui/src/components/AppShell*`, `Topbar*`, `Sidebar*`, `apps/web/src/App.tsx`, `apps/web/src/styles/app.css`. | Sidebar als Drawer/Overlay statt Block; Topbar-Buttons priorisieren und umbrechen; `pageHeader` und `sectionHeader` vertikal stapeln; `tabs` horizontal scrollbar; Safe-Mode-Banner und globale Action-Reihen mobile-tauglich. | Desktop-Regressions in Shell, Fokus-/Overlay-Probleme, unklare Escape-/Dismiss-Logik. | Auf `390x844` lässt sich die App mit einer Hand öffnen, navigieren und wieder schließen. Keine Topbar-Aktion läuft aus dem Viewport. Ab `1280px` bleibt die bestehende Shell unverändert. |
| `M2 Listen- und Übersichtsseiten` | Operative Listen mobil lesbar und bedienbar machen. | `packages/ui/src/components/DataTable*`, `DashboardPage`, `TasksPage`, `DeadlinesPage`, `LegalDocsPage`, `ProjectsPage`. | `DataTable` optional als mobile Kartenliste; Row-Actions unter dem Datensatz statt in schmaler letzter Spalte; Filter-Card bleibt fachlich gleich, wird aber klar einspaltig und mit konsistenter Abstandslogik dargestellt; Sticky-Header nur desktop. | Inkonsistente Listen, wenn einzelne Seiten Sonderwege nehmen; Kartenmodus darf Desktop nicht beeinflussen. | Auf `390px` sind Kernlisten ohne horizontales Tabellenscrollen nutzbar. Filter, Öffnen, Bearbeiten, Abschließen und Evidence-Aktionen sind erreichbar, ohne dass Aktionen abgeschnitten werden. Desktop-Tabellen bleiben Tabellen. |
| `M3 Detailseiten / Formulare / Modals` | Detailseiten und große Bearbeitungsdialoge mobil bedienbar machen. | `ProjectDetailPage`, `LegalDocPage`, `TaskDetailPage`, `DeadlineDetailPage`, `ObligationDetailPage`, `ScopesPage`, `ProjectModal`, `LegalDocModal`, `ObligationModal`, `DeadlineModal`, `ExternalParticipantModal`, `ScopeInlineCreateModal`, `AiAnalysisReviewModal`. | Große Modals auf kleinen Screens fullscreen; Footer sticky; Formfelder einspaltig; relation picker/listen umbrechen; Detailkarten und Meta-Grids auf eine Spalte; Tabs der Detailseiten horizontal scrollen; `ScopesPage` Baum und Summary untereinander. | Lange Formflows können trotz Fullscreen unübersichtlich bleiben; verschachtelte Modals und Inline-Create-Flows dürfen sich nicht gegenseitig blockieren. | Projekt-, Rechtsdokument-, Auflagen- und Frist-Dialoge sind auf `390px` vollständig ausfüllbar; Save/Cancel bleiben bei geöffneter Tastatur erreichbar. `ProjectDetailPage`, `LegalDocPage` und `ScopesPage` funktionieren ohne Layoutbruch und ohne abgeschnittene Tabs/Aktionen. |
| `M4 Upload / Evidence / Kamera / Anhänge` | Mobile Dateiflüsse für Feldnutzung stabilisieren. | `DocumentsPanel`, `DocumentPreviewModal`, `EvidenceUploader`, `EvidenceCompletionModal`, `EvidenceListModal`, `TaskCompleteModal`, `PdfViewer`, `FileUploadStub`. | Kamera-Trigger und Dateiauswahl mit großen Touch-Zielen; Preview-/PDF-Modal fullscreen; Actions unter Preview-Inhalten statt daneben; Attachment-Listen umbrechen statt quetschen; fehlende Dateien/IndexedDB-Hinweise mobil verständlich anzeigen. | Unterschiede zwischen iOS Safari und Android Chrome bei `capture`, Dateipickern und Blob-Preview; PDF-Scroll-Containment. | Foto aufnehmen, Dokument anhängen, Evidence abschließen, PDF/Bild voranzeigen und Datei downloaden funktionieren auf Smartphone. Kein Modal klemmt bei Kamerarückkehr oder Tastaturwechsel. |
| `M5 PWA / Installierbarkeit (optional)` | Nur nach erfolgreicher Welle 1; keine Voraussetzung für Mobile-Nutzbarkeit. | `apps/web/index.html`, optionale Manifest-/Service-Worker-Artefakte. | Install-Hinweise, Icon/Manifest, offline policy nur wenn fachlich gewollt. | Zusätzliche Caching-/Offline-Risiken, unnötiger Scope-Sprung. | Nur starten, wenn M1-M4 stabil sind; sonst explizit aus dem ersten Rollout ausklammern. |
| `M6 Abschluss / QA / Device-Test` | Desktop- und Mobile-Regressionen vor Rollout absichern. | `apps/web`, `packages/ui`, QA-Checklisten in `docs`. | Responsive Regressionstest, Geräte-Smokes, Browser-DevTools-Audit, Fokus-/Touch-/Scroll-Prüfung. | Verdeckte Desktop-Regressions durch globale CSS-Regeln; Edge-Cases in Safari. | Alle priorisierten operativen Flows bestehen DevTools- und Real-Device-Smoke-Tests. Desktop bei `1280+` bleibt visuell und funktional stabil. |

## 7. Technische Leitplanken
- Responsive Web-App statt native App.
- Keine Fachlogikänderung, keine Rollen-/Berechtigungsänderung, keine API-/Persistenzänderung.
- Bestehende Komponenten und Stores weiterverwenden; Änderungen zuerst in `packages/ui` und globalen Styles bündeln, erst dann seitenlokal ergänzen.
- Tabellen mobil sinnvoll darstellen:
  - Operative Listen nutzen unter kleinem Breakpoint Karten-/Stack-Layout.
  - Desktop behält Tabellenansicht.
  - Admin-/Report-Tabellen bleiben in Welle 1 bei horizontal scrollender Tabelle, solange sie nicht priorisiert sind.
- Dialoge/Formulare mobil anpassen:
  - Große Formmodals werden fullscreen.
  - Kurze Bestätigungsdialoge bleiben zentriert.
  - Footer-Aktionen bleiben sticky und touch-tauglich.
- Keine unnötigen Dependencies; nur React, Router, bestehendes `@nemetz/ui`, CSS/CSS Modules.
- CSS-Änderungen sollen mobile-first innerhalb klarer `max-width`-Breakpoints bleiben; keine Desktop-Neugestaltung.

## 8. Teststrategie
- Lokale Checks pro Phase:
  - `cd apps/web && npm run build`
  - Wenn `packages/ui` geändert wird: denselben Web-Build als Integrationscheck nutzen.
  - Vor Rollout von M1, M3 und M4 zusätzlich kompletter Web-Smoke mit lokal laufender API, damit serverseitig migrierte Domänen im UI nicht unbeabsichtigt beschädigt werden.
- Browser-DevTools-Checks pro Phase:
  - `390x844` Smartphone Portrait
  - `768x1024` Tablet Portrait
  - `360x800` Best-Effort-Sanity
  - `1280x800` und `1440x900` Desktop-Regression
  - Prüfen: Drawer, Scroll-Lock, Sticky-Footer, Keyboard-Verhalten, horizontales Overflow, Tab-Scroll, Touch-Ziele, Dateiauswahl
- Echte Geräte-Checks:
  - iPhone mit Safari
  - Android-Gerät mit Chrome
  - Wenn verfügbar: kleines Tablet
- Manuelle Mobile-Smoke-Tests:
  - Login und Navigation zu Dashboard, Aufgaben, Fristen, Projekte, Rechtsdokumente
  - Filter setzen und zurücksetzen
  - Detailseite öffnen und zurück navigieren
  - Projekt/Rechtsdokument/Auflage/Frist anlegen oder bearbeiten
  - Aufgabe/Frist abschließen, Evidence hinzufügen, Evidence ansehen
  - Dokument/PDF/Bild voranzeigen und herunterladen
  - Drawer öffnen/schließen, Tabs wechseln, Modal mit Tastatur bedienen
- Da aktuell keine dedizierte Frontend-Test-Harness im Repo existiert, bleibt die erste Absicherung build- plus manuell gerätebasiert.

## 9. Rolloutstrategie
- Umsetzung in kleinen UI-only PRs entlang M1 bis M4; kein Sammel-Refactor.
- Reihenfolge für sichere Auslieferung:
  - M0 abschließen
  - M1 separat ausrollen
  - M2 separat ausrollen
  - M3 separat ausrollen
  - M4 separat ausrollen
  - M6 als Abschluss-Gate vor produktionsnaher Freigabe
- Desktop-Regressionsvermeidung:
  - Jede Phase mit Desktop-Baseline-Screens bei `1280+` prüfen.
  - Shared-Komponenten standardmäßig desktop-kompatibel lassen; mobile Verhalten nur additiv und breakpoint-gesteuert aktivieren.
  - Keine pageübergreifenden CSS-Overrides ohne direkte Nutzung auf mindestens zwei Zielseiten.
- Bereits serverseitig migrierte Persistenzphasen bleiben unangetastet:
  - Kein Eingriff in Stores, API-Clients, Persistenzlogik oder Datenmodelle.
  - Mobilarbeit bleibt auf `apps/web`, `packages/ui` und styles begrenzt.
- Reports, Print und Admin bleiben zunächst aus dem Kernrollout heraus; nur Shell-Kompatibilität und grobe Nicht-Blocker-Sichtbarkeit werden mitgezogen.

## 10. Annahmen und Defaults
- Welle 1 richtet sich primär an operative mobile Nutzung, nicht an vollständige Admin-Parität.
- Verbindliche Zielgeräte für Welle 1 sind `390px` Smartphone Portrait und `768px` Tablet Portrait.
- Reports und drucknahe Ansichten werden bewusst in eine spätere Mobile-Welle verschoben.
- PWA/Installierbarkeit ist kein Bestandteil von M1 bis M4.
- `pages/bescheide/*` sind nicht Teil der aktiven Route-Implementierung und werden in diesem Track nicht optimiert.
