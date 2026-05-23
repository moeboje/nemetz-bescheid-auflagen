# Masterplan: Help Center Overhaul im bestehenden Portal

## Kurzfassung
- Das Portal hat bereits eine nutzbare, aber stark begrenzte Hilfe-Basis: `apps/web/src/pages/HelpPage.tsx` rendert heute statische Sektionen aus `apps/web/src/help/helpContent.ts`, pagebezogene `HelpHintCard`s existieren nur auf ausgewaehlten Listen-Seiten, Dismiss-States liegen pro Benutzer lokal in `apps/web/src/state/HelpHintsStore.tsx`.
- Die aktive Architektur ist klar: React-Web-App, bestehende Routen unter `/compliance/*` und `/help`, Feature-Flags wie `enableHelpHints` und `enableProjectChecklists`, serverseitig persistierte Fachdomaenen, keine Help-API und keine Content-DB.
- Der Ausbau soll deshalb als dateibasiertes, versionsgefuehrtes Help-System innerhalb der bestehenden Web-Architektur erfolgen, ohne neue Persistenzphase, ohne neue Backend-Architektur und ohne Destabilisierung der bereits migrierten Fachdomaenen.
- Produktentscheidung fuer diesen Plan: allgemeine Login-/Passwort-/MFA-Hilfe wird zusaetzlich vor Login erreichbar; fachliche Portalhilfe bleibt authentifiziert. Inhalte werden primaer im Repo dateibasiert gepflegt.

## 1. Zielbild
- Das neue System ist kein einzelnes FAQ, sondern ein kombiniertes Hilfesystem aus zentralem Help Center, kontextbezogener Hilfe im UI und ergaenzendem FAQ/Troubleshooting.
- Das Help Center erklaert fuer jeden relevanten Bereich klar: wofuer er da ist, wann er genutzt wird, wie der Ablauf Schritt fuer Schritt aussieht, worauf zu achten ist und welche typischen Fehler auftreten.
- FAQ bleibt eine schnelle Zusatzschicht fuer Kurzfragen; es ersetzt keine modul- oder aufgabenbezogene Hilfe.
- Endbenutzer erhalten schnellere Orientierung, weniger Fehlbedienungen und weniger Rueckfragen; Admins erhalten klare Hilfe fuer Stammdaten, Datenmanagement, Recovery und Rollen-/Benutzer-Themen.

## 2. Nicht-Ziele
- Keine vollstaendige Schulungsplattform, kein LMS, keine Wissensdatenbank ausserhalb des Portals.
- Keine juristische Fachberatung; fachliche Einreichhilfe bleibt praxisorientierte Produktunterstuetzung mit klarem Disclaimer.
- Keine direkte Implementierung in diesem Lauf.
- Kein vollstaendiger UI-Relaunch des Portals und keine neue native App.
- Keine neue Persistenzphase, keine neue Backend-Architektur, keine unnoetigen Dependencies.

## 3. Nutzergruppen und Nutzungsszenarien
- Interne operative Nutzer brauchen schnelle Modulhilfe im Tagesgeschaeft; sie erwarten Hilfe direkt auf Listen-, Detail- und Abschlussseiten.
- Projektbearbeiter brauchen Schritt-fuer-Schritt-Hilfe zu Projektanlage, Status, Einreichtyp, Rechtsdokumenten, Auflagen, Fristen, Aufgaben, Dokumenten und Nachweisen; sie erwarten Hilfe im jeweiligen Arbeitskontext und im zentralen Help Center.
- Admins brauchen klare Hilfe zu Benutzern, Rollen, externen Firmen, Behoerden/Ansprechpartnern, Import/Export/Reset/Demo/Integritaetspruefung; sie erwarten Hilfe in Admin-Unterseiten und im Datenmanagement.
- Mobile Nutzer brauchen kurze, scannbare Hilfe zu den wichtigsten Kernflows und zu Upload-/Evidence-Ablaeufen; sie erwarten kompakte kontextbezogene Hilfe und mobil gut navigierbare Artikel.
- Neue Mitarbeiter brauchen einen verstaendlichen Einstieg, Begriffe, Rollenverstaendnis und Standardablaeufe; sie erwarten ein gefuehrtes zentrales Help Center.
- Seltene Nutzer brauchen kurze Auffrischung und Troubleshooting; sie erwarten "Hilfe zu dieser Seite" und FAQ.
- Fachlich vertiefte Nutzer brauchen Einreichhilfe nach `GEWERBE`, `AWG`, `UVP_UVE`, Projektstatus und Checklistenbezug; sie erwarten modulnahe Leitfaeden und fachliche Vertiefungsartikel.

## 4. Informationsarchitektur des Help Centers
- Hauptstruktur: `Einstieg`, `Portalbereiche`, `Aufgaben & Workflows`, `Fachliche Einreichhilfe`, `Admin`, `Sicherheit & Zugang`, `Troubleshooting & FAQ`, `Glossar`.
- Modulbezogene Hilfe bildet die aktive Informationsarchitektur des Portals ab: Dashboard, Projekte, Projektdetail, Rechtsdokumente, Auflagen, Fristen, Aufgaben, Dokumente/Nachweise, Reports, Notifications, Scopes, Admin-Unterseiten.
- Aufgabenbezogene Hilfe wird zusaetzlich quer geschnitten: Projekt anlegen, Rechtsdokument erfassen, Auflage planen, Frist abschliessen, Aufgabe mit Nachweis erledigen, Import pruefen, Demo-Daten nutzen, Recovery durchfuehren.
- Fachliche Einreichhilfe ist eine eigene Hauptebene mit `Gewerbe-Basis`, `AWG-Zusatz`, `UVP/UVE-Zusatz`, jeweils getrennt nach Orientierung, Schrittfolge und Checklisten-/Vorlagenbezug.
- FAQ ist eine Zusatzebene fuer Kurzantworten und verweist immer auf ausfuehrliche Artikel.
- Suche und Schlagworte nutzen modulbezogene, aufgabenbezogene und fachliche Begriffe plus Synonyme.
- Glossar deckt produktinterne Schluesselbegriffe ab: Scope, Behoerde, Ansprechpartner, Rechtsdokument, Auflage, Frist, Aufgabe, Nachweis/Evidence, Einreichtyp, Projektstatus, Safe Mode, Demo, Integritaetspruefung.

## 5. Inhaltsmodell
- `HelpCategory`: `id`, `slug`, `title`, `summary`, `parentSlug?`, `order`, `visibility`, `icon?`.
- `HelpArticle`: `slug`, `title`, `summary`, `articleType`, `categorySlugs[]`, `audiences[]`, `visibility(publicAuth|authenticated|adminOnly)`, `module?`, `task?`, `submissionTypes[]`, `projectStatuses[]`, `bodySections[]`, `relatedArticleSlugs[]`, `faqEntryIds[]`, `contextLinks[]`, `ownerRole`, `reviewerRole`, `status(draft|reviewed|published|deprecated)`, `version`, `lastReviewedAt`, `lastChangedAt`.
- `HelpArticleType`: `overview`, `workflow`, `step_by_step`, `reference`, `troubleshooting`, `faq`, `submission_guidance`, `glossary`.
- `HelpTag`: `key`, `label`, `synonyms[]`, `module?`, `task?`, `submissionType?`.
- `HelpContextLink` / `HelpSlug`: `slug`, `routePattern`, `tabId?`, `modalId?`, `fieldId?`, `placement(pageHeader|inlineCard|infoBox|tooltip|modalFooterLink)`, `featureFlag?`, `permissionGuard?`.
- `FAQEntry`: `id`, `question`, `shortAnswer`, `relatedArticleSlugs[]`, `tags[]`.
- `InlineHint` / `ContextHint`: `hintId`, `title`, `bullets[]`, `ctaSlug?`, `dismissible`, `placement`, `visibility`, `featureFlag?`.
- `RelatedArticles`: manuell gepflegte Primaerverweise plus automatische Sekundaerverweise aus Tags/Synonymen.
- Verantwortlichkeit: jeder Artikel hat fachlichen Owner und Review-Verantwortung; technische Owners verantworten nur Produktmechanik, nicht Fachinhalt.

## 6. Standardstruktur pro Hilfeseite
- Empfohlenes Standardformat: `Worum geht es?`, `Wann brauche ich das?`, `Wer darf das?`, `Schritt fuer Schritt`, `Worauf achten?`, `Haeufige Fehler`, `Praxisbeispiel`, `Verwandte Themen`.
- `Overview`-Artikel nutzen kompakte Zusammenfassung plus "typische Aufgaben in diesem Bereich".
- `Step-by-step`-Artikel nutzen nummerierte Schritte, Pruefhinweise und "typische Stolpersteine".
- `Troubleshooting`-Artikel nutzen `Symptom`, `Schnellcheck`, `Wahrscheinliche Ursache`, `Naechster sinnvoller Schritt`.
- `Submission guidance`-Artikel ergaenzen einen klaren Disclaimer: produktbezogene Orientierung, keine Rechtsberatung.

## 7. Inhaltsstruktur nach Portalbereichen
- Einstieg / Ueberblick: Portalueberblick, Rollenbild, taeglicher Standardablauf, wichtigste Begriffe, "Wo beginne ich?".
- Dashboard: Ueberblicksartikel zu Kennzahlen, ueberfaelligen Aufgaben, Fristen- und Benachrichtigungssicht; FAQ nur fuer KPI-Interpretation.
- Projekte: Ueberblick zu Projektanlage und Pflege; Schritt-fuer-Schritt zu Scope, Behoerde, Ansprechpartner, Owner/Deputy, Teilnehmern, Abhaengigkeiten, Referenzdokumenten; eigener Artikel zu `status`, eigener Artikel zu `submissionType`, eigener Artikel zum Checklisten-Tab.
- Projektstatus: klare Statusdefinitionen, Abgrenzung zu Archivierung, typische Statuswechsel, Bezug zu Einreichphasen.
- Rechtsdokumente: Ueberblick zu Dokumenttypen, Verknuepfung mit Projekten, Scope-Override, AI-Review falls aktiviert, Anhaenge; FAQ nur fuer "warum taucht mein Dokument nicht auf?"-Fragen.
- Auflagen: Ueberblick, Scheduling, Intervalllogik, Reminder, Verantwortliche, Pflichtnachweise; Schritt-fuer-Schritt fuer wiederkehrende Auflagen.
- Fristen: Ueberblick, Projekt-/Dokumentbezug, Reminder, Abschluss/Wiederoeffnung, Evidence; FAQ fuer Statuslogik und ueberfaellig/offen.
- Aufgaben: Ueberblick, abgeleitete Natur der Tasks, Filter, ICS-Export falls aktiv, Abschluss mit Evidence, Wiederoeffnung.
- Dokumente / Upload / Anhaenge / Evidence: Unterschied zwischen serverseitigen Dokumenten (`DocumentsPanel`) und lokaler Evidence-Dateispeicherung (`EvidenceUploader`), Vorschau/Download, fehlende Datei-Inhalte nach Import.
- Reports / Compliance Summary / Benachrichtigungen: Leselogik, Filter, Interpretation, Grenzen der Kennzahlen, Reminder-/Overdue-/System-Meldungen.
- Admin: eigene Artikel fuer Benutzer, Rollen, Externe Firmen, Behoerden/Ansprechpartner; zusaetzlich Legacy-Adminseite `/admin` mit Tabs `authorities`, `contacts`, `users`, `diagnostics`, `data`.
- Import / Export / Reset / Demo / Recovery: eigener Aufgabenstrang mit Export, Importpruefung, Replace vs Append, Demo-Szenario, TaskState-Cleanup, Safe Mode, ErrorBoundary-Recovery.
- Sicherheit / Login / Passwort / MFA: Login, Microsoft-Login, Passwort vergessen, Passwort-Reset, MFA pruefen, Recovery-Code, Security-Settings, Admin-Resetfaelle.
- Mobile Nutzung: unterstuetzte Mobilaufgaben, Einschraenkungen, Upload-/Kamerafluss, wann besser Desktop nutzen.
- Fehlerbehebung / haeufige Probleme: fehlende Aufgaben, ueberfaellig, Importfehler, fehlende Anhaenge, Berechtigungsprobleme, Safe Mode.
- Fachliche Einreichhilfe: getrennte Artikelpfade fuer `GEWERBE`, `AWG`, `UVP_UVE` mit Bezug auf Projektstatus und spaetere Checklisten-/Vorlagenlogik.

## 8. Kontext-Hilfe im UI
- Bestehendes Muster `HelpHintCard` bleibt die Basis fuer Seiteneinstiege; es wird additiv auf `ScopesPage`, `ProjectDetailPage`, `LegalDocPage`, `ComplianceSummaryPage`, `NotificationsPage`, `SecuritySettingsPage` und relevante Admin-Unterseiten erweitert.
- `Tooltip` nur fuer kurze Begriffserklaerungen: Status-Badges, Evidence-Icons, Storage-Hinweise, kleine Felddefinitionen.
- `Info-Box` in Formularen/Modals fuer komplexe Felder: Projektstatus, Einreichtyp, Scope-Override, Scheduling, Reminder, Evidence-Anforderungen, Importmodus.
- `Link ins Help Center` in Page-Headern, Tab-Headern und Modal-Footern fuer laengere Erklaerungen; bestehende Buttons `Hilfe oeffnen` bleiben das Muster.
- `HelpContextLink` dockt an bestehende Routen und UI-Kontexte an, z. B. `projects.list`, `projects.detail.overview`, `projects.detail.checklist`, `projects.modal.scope`, `legalDocs.modal.scopeOverride`, `obligations.modal.scheduling`, `deadlines.modal.evidence`, `tasks.complete`, `admin.dataManagement`, `settings.security`, `auth.login`, `auth.mfa`.
- Tabs, Modals und Formulare bekommen keine neue Navigationslogik; sie bekommen nur kontextgenaue Slugs und CTA-Verknuepfungen.

## 9. Fachliche Hilfe fuer Einreichungen
- `Gewerbe-Basis`: Orientierung zu Grundablauf, typischen Projektschritten, Mindestdaten im Projekt, typische Dokument-/Auflagen-/Fristenbezuege; Schwerpunkt auf Ueberblick und Basisschritte.
- `AWG-Zusatz`: zusaetzliche fachliche Orientierung, typische Zusatzunterlagen, haeufige Stolpersteine, Bezug zu projektbezogenen Checklisten; Schwerpunkt auf vertiefter Schrittfolge und Checklisten-/Vorlagenbezug.
- `UVP/UVE-Zusatz`: Orientierung zu erweitertem Vorbereitungsaufwand, Statusbezug (`UVP_PREPARATION`), Dokumenttiefe und spaeteren Zusatzmodulen; Schwerpunkt auf vertiefter Guidance, nicht auf juristischer Bewertung.
- Checklistenbezug: Help-Artikel referenzieren die bestehende generische Projektcheckliste als operative Arbeitsflaeche; spaetere typspezifische Vorlagen werden als "verwandte Hilfe" statt als harte Produktlogik erklaert.
- Projektstatusbezug: Hilfeartikel koennen spaeter nach `project.status` und `project.submissionType` vorgeschlagen werden, ohne neue Geschaeftslogik einzufuehren.

## 10. Such- und Navigationskonzept
- Globale Help-Suche arbeitet clientseitig auf dem dateibasierten Artikelregister; durchsucht Titel, Summary, Body-Section-Titel, Tags, Synonyme, Glossarbegriffe und FAQ-Fragen.
- Navigation unterstuetzt drei Einstiege: modulbezogen, task-orientiert, fachlich nach Einreichtyp.
- "Hilfe zu dieser Seite" fuehrt immer auf einen konkreten Slug und optional direkt auf einen Anker in einem laengeren Artikel.
- Verwandte Themen kombinieren manuelle Links mit Tag-basierter Ergaenzung; Artikel verweisen immer auf naechstlogische Folgeaktionen.
- Mobile Suche priorisiert Sucheingabe, kurze Ergebnis-Karten und thematische Schnellzugriffe; Desktop kann zusaetzlich Index und verwandte Themen gleichzeitig zeigen.
- Synonym-Logik muss explizit gepflegt werden: `Behoerde/Authority`, `Ansprechpartner/Kontakt`, `Rechtsdokument/Bescheid/Genehmigung`, `Auflage/Verpflichtung`, `Frist/Termin`, `Nachweis/Evidence/Anhang`, `Safe Mode`, `Demo`, `Reset`, `Integritaetspruefung`.

## 11. Technisches Umsetzungskonzept
- Inhalte werden primaer dateibasiert im Repo gepflegt; keine Help-Datenbank und keine Help-Backend-API im MVP.
- Empfohlenes Format: strukturierte TypeScript-Content-Module unter einem neuen Help-Verzeichnis im Web-Client, nicht MDX; Begruendung: bestehende Architektur ist TS-basiert, neue Parser-/MDX-Dependencies sind vermeidbar.
- Rendering erfolgt ueber generische React-Help-Komponenten, die sowohl zentrale Artikel als auch Inline-Hints aus demselben Registry-Modell beziehen.
- Versionierung erfolgt ueber Git plus inhaltliche Metadaten im Artikel (`version`, `lastReviewedAt`, `lastChangedAt`, `status`).
- Suche funktioniert zunaechst rein clientseitig auf dem Help-Registry; spaeter optional Vorberechnung eines statischen Suchindex bei Build, aber weiterhin ohne Backend-Zwang.
- Verknuepfung zu Seiten erfolgt ueber `HelpContextLink` und feste Slugs; spaetere Trigger koennen zusaetzlich `featureFlag`, `permissionGuard`, `project.status`, `project.submissionType`, `tabId` und `modalId` beruecksichtigen.
- Oeffentliche Auth-Hilfe nutzt denselben Content-Registry-Ansatz, aber nur mit `visibility = publicAuth`; fachliche Inhalte bleiben in der AppShell authentifiziert.

## 12. Priorisierung innerhalb des Gesamtplans
- MVP: zentrale Startseite, Suche, Glossar-Basis, Kernartikel fuer Dashboard, Projekte, Projektstatus, Rechtsdokumente, Auflagen, Fristen, Aufgaben, Dokumente/Evidence, Admin-Datenmanagement, Login/Passwort/MFA, Troubleshooting, erweiterte Hint-Cards auf Kernseiten.
- Hohe Prioritaet: ProjectDetail-/LegalDocDetail-Hilfe, Compliance Summary, Notifications, Admin-Unterseiten, Import/Export/Reset/Demo/Recovery-Leitfaeden, mobile optimierte Help-Darstellung, kontextuelle Links in Modals.
- Spaetere Ausbaustufe: fachliche Einreichhilfe mit `GEWERBE`/`AWG`/`UVP_UVE`, kontextabhaengige Hilfe nach `submissionType` und `status`, Checklisten-nahe Hilfelinks, oeffentliche Auth-Hilfe vor Login.
- Nice-to-have: weitergehende Glossar-Querverweise, automatische Related-Articles-Logik, Nutzerfeedback auf Artikeln, interne Redaktions-Checks.

## 13. Umsetzungsphasen innerhalb des Gesamtplans
- `H1 Grundstruktur / Architektur`: Ziel ist das Help-Registry, Content-Modell, zentrale IA und Rendering-Konzept; Bereiche `HelpPage`, bestehende Hint-Struktur, Routing-Konzept; Risiken sind falsches Scope-Creep und zu viel Technik; Abnahme: Modell, Slug-Konzept, Sichtbarkeitsregeln und Ordnerstruktur sind final.
- `H2 Kerninhalte`: Ziel sind Landing, Einstieg, Glossar-Basis, Dashboard, Projekte, Projektstatus, Rechtsdokumente, Auflagen, Fristen, Aufgaben; Risiko ist zu generische oder zu duenne Hilfe; Abnahme: Kernmodule sind jeweils mit Ueberblick, Workflow und Fehlerhinweisen abgedeckt.
- `H3 Admin und Spezialthemen`: Ziel sind Admin-Unterseiten, Legacy-Admin `/admin`, Datenmanagement, Diagnostics, Import/Export/Reset/Demo/Recovery, Notifications, Compliance Summary; Risiko ist Vermischung von Fach- und Systemhilfe; Abnahme: Admin- und Recovery-Themen sind klar und getrennt dokumentiert.
- `H4 Einreichungs- und Fachhilfe`: Ziel sind `GEWERBE`-, `AWG`- und `UVP/UVE`-Leitfaeden sowie die Kopplung an `submissionType`, Projektstatus und Checklistenbezug; Risiko ist juristische Ueberdehnung; Abnahme: fachliche Orientierung ist verstaendlich, produktbezogen und mit Disclaimer versehen.
- `H5 Kontext-Hilfe im UI`: Ziel sind Slug-Mapping, pagebezogene Hint-Cards, Info-Boxen in Modals, Help-Links in Tabs/Detailseiten; Risiko ist visuelle Ueberladung; Abnahme: jede Kernseite hat genau definierte kontextuelle Einstiege mit passendem Umfang.
- `H6 Suche / Mobile / Feinschliff`: Ziel sind lokale Suche, Synonyme, mobile Darstellungsregeln, oeffentliche Auth-Hilfe und bessere Related-Articles-Navigation; Risiko ist Suchrauschen und mobile Unuebersichtlichkeit; Abnahme: Suche funktioniert fuer Kernbegriffe, Help ist auf `390x844` und `768x1024` gut nutzbar.
- `H7 Cleanup / Rollout`: Ziel sind Konsolidierung, Redaktions-Governance, Reviewprozess und Rollout-Gates; Risiko ist veralteter Content direkt nach Go-live; Abnahme: Owner, Review-Rhythmus, Aenderungsprozess und MVP-Rollout-Reihenfolge sind festgelegt.

## 14. Risiken / offene Fragen
- Fachliches Risiko: Einreichhilfe kann versehentlich wie Rechtsberatung wirken; Gegenmassnahme ist strikter Produkt-/Prozessfokus mit Disclaimer.
- Content-Aufwand: viele Bereiche, viele Detailseiten und Modals; Gegenmassnahme ist klare Priorisierung und Standardstruktur pro Artikel.
- UX-Risiko: zu viele Inline-Hinweise stoeren den Arbeitsfluss; Gegenmassnahme ist strikte Trennung zwischen Tooltip, Info-Box und Deep-Link.
- Such-/Navigationsrisiko: Nutzer suchen mit Alltagsbegriffen statt Domaenenbegriffen; Gegenmassnahme sind Synonyme, Glossar und task-orientierte Einstiege.
- Technisches Risiko: zu freies Content-Format macht Rendering und Suche uneinheitlich; Gegenmassnahme ist ein streng strukturiertes TS-Modell statt freiem MDX.
- Vor Implementierung noch zu entscheiden: exakte oeffentliche Route fuer Auth-Hilfe, Sichtbarkeit adminbezogener Artikel fuer Nicht-Admins, Einsatz von Screenshots im MVP, formale Freigabe-Owner je Fachdomaene.

## 15. Empfehlung fuer MVP
- Kleinste sinnvolle erste Version: zentrales authentifiziertes Help Center plus oeffentliche Auth-Hilfe, lokale Suche, Glossar-Basis, Kernartikel und kontextuelle Hint-Erweiterung auf den wichtigsten Arbeitsseiten.
- Zuerst zu erstellen: Einstieg/Ueberblick, Dashboard, Projekte, Projektstatus, Rechtsdokumente, Auflagen, Fristen, Aufgaben, Dokumente/Evidence, Admin-Datenmanagement, Login/Passwort/MFA, Troubleshooting.
- Hoechster unmittelbarer Mehrwert: Projekte, Rechtsdokumente, Auflagen, Fristen, Aufgaben, Import/Export/Recovery, Security/MFA.
- Bewusst spaeter: tiefere fachliche Einreichhilfe, detaillierte Admin-Unterseiten, modal-/feldgenaue Kontext-Hilfe, automatische kontextabhaengige Hilfe nach `submissionType` und Checkliste.

## 16. Redaktions- und Pflegekonzept
- Help-Inhalte werden fachlich durch Modul-/Prozessverantwortliche gepflegt und technisch ueber normale Repo-Aenderungen, Review und Deploy ausgeliefert.
- Jede relevante Produktaenderung an Seiten, Feldern, Statuswerten, Einreichtypen, Checklisten oder Datenmanagement muss einen Help-Impact-Check im PR-/Review-Prozess bekommen.
- Fachliche Hilfe und technische Hilfe bleiben getrennt: fachliche Owner verantworten Arbeitslogik und Beispiele, technische Owner verantworten UI-/Trigger-/Routing-Konsistenz.
- Veraltete Inhalte werden ueber `status`, `lastReviewedAt` und Review-Rhythmus sichtbar gemacht; `deprecated`-Artikel bleiben nur als Bruecke mit klarer Weiterleitung auf aktuelle Inhalte.
- Bestehende Hint-Dismiss-Logik pro Benutzer bleibt erhalten; bei groesseren Inhaltsaenderungen soll eine kontrollierte Hint-Reset-Strategie pro Slug/Hinweis vorgesehen werden, nicht global blind.

## 17. Fortschreibung 2026-05-23: FAQ, Kurzanleitung und Roadmap
- Dieser Lauf ist ein reines Frontend-/Content-Feature auf Branch `feature/help-faq-quick-guide-roadmap`.
- Ziel ist die Aktualisierung der bestehenden FAQ-/Help-Inhalte, eine zweiseitige gebrandete Kurzanleitung fuer interne und externe Portalbenutzer und eine Roadmap-Seite fuer kuenftige Portal-Weiterentwicklungen.
- Umsetzung bleibt dateibasiert im Web-Client: `helpContent.ts` fuer Help/FAQ, ergaenzende statische Content-Module fuer Kurzanleitung und Roadmap sowie neue React-Seiten/Routen.
- Es wird keine Help-API, kein Help-CMS, keine Prisma-Aenderung, keine neue Dependency und keine Azure-Arbeit eingefuehrt.
- Die Kurzanleitung wird als printbare HTML-Seite bereitgestellt, damit Benutzer sie ueber die Browser-Druckfunktion als PDF speichern koennen. Sie enthaelt kein Live-Datenexport, keine personenbezogenen Daten und keine Secrets.
- Die Kurzanleitung ist auf zwei Seiten ausgelegt: Seite 1 fuer interne Portalbenutzer, Seite 2 fuer externe Portalbenutzer, jeweils mit maximal fuenf Schritten, Wichtig-Callout, Do-/Don't-Box und Support-Hinweis.
- Es wird kein statisches PDF erzeugt, weil im Repository kein separater stabiler PDF-Workflow fuer diesen Inhalt benoetigt wird. Benutzer speichern bei Bedarf ueber die Browser-Druckfunktion als PDF.
- Die Roadmap unterscheidet `Verfuegbar`, `Geplant / in Vorbereitung` und `In Pruefung / Ueberlegung`, ohne feste Liefertermine oder verbindliche Zusagen.
- Checklisten-Vorlagen und 82b-nahe Themen stehen nur unter `In Pruefung / Ueberlegung`. Dashboard-/Reporting-Ausbau, bessere Benachrichtigungen und externe Self-Service-Prozesse duerfen nur als Ausblick erwaehnt werden und werden in diesem Lauf nicht als Fachfunktion umgesetzt.

## Annahmen und Defaults
- Help bleibt insgesamt Teil der bestehenden Web-App; es wird keine separate Wissensplattform aufgebaut.
- Fachliche Portalhilfe bleibt authentifiziert; allgemeine Auth-/Sicherheitsartikel werden zusaetzlich oeffentlich vor Login bereitgestellt.
- Content bleibt repo-/dateibasiert; kein Admin-CMS im MVP.
- Die aktive Implementierungsbasis sind `apps/web/src/pages/*`, `HelpPage`, `HelpHintCard`, `HelpHintsStore`, `runtimeConfig`, `ProjectChecklistTab`, `DocumentsPanel`, `EvidenceUploader` und die bereits serverseitig stabilisierten Fachdomaenen.
