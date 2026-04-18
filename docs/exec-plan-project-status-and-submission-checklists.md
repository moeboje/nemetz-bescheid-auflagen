# Umsetzungsplan: Projektstatus und einreichphasenbezogene Checklisten

## 1. Zielbild
- Die Funktion wird als additive Erweiterung des bereits serverseitig persistierten Projektbereichs umgesetzt, nicht als neue Persistenzphase.
- Jedes neue Projekt erhaelt einen fachlichen Projektstatus und eine konfigurierbare Einreichlogik, damit das Team den Reifegrad des Projekts und die naechsten fachlichen Arbeitspunkte sofort erkennen kann.
- Eine "Einreichphase-Checkliste" ist im Portal keine starre Dateiliste, sondern eine projektbezogene, versionierte interne Arbeitsliste aus Themen, Pruefungen, Unterlagen, Zustaendigkeiten und Fristen.
- Der praktische Nutzen fuer Projektteams:
  - Sichtbarkeit von fehlenden Unterlagen
  - Sichtbarkeit offener Pruefthemen
  - Zuweisung verantwortlicher Personen
  - Nachverfolgung von Zielterminen
  - Ueberblick ueber bereits hinterlegte Dokumente
  - nachvollziehbare Dokumentation des Einreichstands
- Die Funktion ist teamorientiert: Sie soll Arbeitsvorbereitung, Vollstaendigkeitskontrolle und Koordination unterstuetzen, nicht juristische Freigaben automatisieren.
- Das Modell unterscheidet nicht mehr nur binar zwischen `AWG` und `UVP/UVE`, sondern unterstuetzt mindestens drei fachliche Einreichprofile:
  - `Gewerbe`
  - `Gewerbe + AWG`
  - `Gewerbe + AWG + UVP/UVE`
- Fachlich wird dafuer ein flexibles Profil-/Modul-Modell empfohlen:
  - `Gewerbe` als Basisprofil
  - `AWG` als Zusatzmodul auf einer gewerbeaehnlichen Basis
  - `UVP/UVE` als weiteres Zusatzmodul
- Mischfaelle wie `Gewerbe + AWG` oder `Gewerbe + AWG + UVP/UVE` muessen konzeptionell sauber moeglich sein.
- Die Funktion bleibt in bestehenden Projekt-Workflows verankert, insbesondere im Projektdetail und in bestehenden Dokument-/LegalDoc-Bezuegen.

## 2. Nicht-Ziele
- Keine automatische Rechtspruefung.
- Keine vollstaendige juristische Expertensoftware.
- Keine automatische Genehmigungsentscheidung.
- Keine sofortige Vollpflicht fuer alle historischen Projekte.
- Keine direkte Implementierung in diesem Lauf.
- Keine neue native App, keine neue Backend-Architektur, keine unnoetigen Dependencies.
- Keine Destabilisierung der bereits umgesetzten serverseitigen Persistenz.
- Keine neue Aufgaben- oder Dokumentenarchitektur nur fuer diese Funktion.

## 3. Fachliches Datenmodell (konzeptionell)
- `ProjectStatus`: kontrollierter fachlicher Status des Projekts; fachlich auf Projektebene verankert, mit manuellen Statuswechseln und Historisierung ueber Audit oder Statushistorie.
- `ProjectSubmissionBaseProfile`: empfohlen zunaechst `GEWERBE` als Basisprofil; spaetere weitere Basisprofile bleiben theoretisch moeglich, sind aber nicht Teil des MVP.
- `ProjectSubmissionModule`: additive Fachmodule, initial mindestens:
  - `AWG`
  - `UVP_UVE`
- `ProjectSubmissionProfile` bzw. `ProjectType`: fuer UI und Reporting kann zusaetzlich ein abgeleitetes Preset oder Label angeboten werden, z. B.:
  - `GEWERBE`
  - `GEWERBE_AWG`
  - `GEWERBE_AWG_UVP_UVE`
  - optional spaeter `GEWERBE_UVP_UVE`, falls fachlich noetig
- Empfohlene fachliche Source of Truth ist nicht eine starre Enum, sondern:
  - `baseProfile = GEWERBE`
  - `enabledModules = [] | [AWG] | [UVP_UVE] | [AWG, UVP_UVE]`
- `ChecklistTemplate`, `ChecklistTemplateSection`, `ChecklistTemplateItem`: versionierte fachliche Vorlagen; initial nicht als frei editierbare Admin-Baukaesten geplant, sondern kuratiert und freigegeben.
- `ChecklistTemplateModule`: fachlicher Template-Baustein, aus dem eine Projektcheckliste zusammengesetzt wird; initial:
  - `GEWERBE_CORE`
  - `AWG_ADDON`
  - `UVP_UVE_ADDON`
- `ProjectChecklist`: projektbezogene materialisierte Instanz einer Template-Version; enthaelt Basisprofil, Modulzusammenstellung, Aktivierungsstatus, Zusammenfassung und Historienbezug.
- `ProjectChecklistItem`: projektbezogene Kopie eines Template-Items mit eigenem Bearbeitungsstatus, Verantwortlichem, Faelligkeit, Prioritaet, Kommentar und Dokumentverknuepfung.
- `ProjectChecklistDocumentLink`: konzeptionelle Verknuepfung eines Checklistenpunkts zu bestehenden `Document`-Eintraegen und optional zu bestehenden `LegalDocument`-Eintraegen; kein neues Dateisilo im MVP.
- `ResponsiblePerson`: im MVP nur interner `User`; externe Beteiligte, Behoerdenkontakte und Sachverstaendige bleiben zunaechst als Hinweis- oder Freitextfelder am Item.
- `DueDate`, `Priority`, `ItemStatus`, `Comment`, `Fachbereich / Sachverstaendiger / Pruefthema`: eigenstaendige fachliche Felder am Projekt-Checklistenpunkt.
- Additive Schnittstellenaenderungen fuer eine spaetere Umsetzung:
  - `Project` erhaelt fachlich `status`
  - `Project` erhaelt `submissionBaseProfile`
  - `Project` erhaelt `submissionModules`
  - optional zusaetzlich ein abgeleitetes `submissionPreset` fuer UI und Reporting
  - ergaenzend braucht es projektbezogene Status-/Checklisten-Endpunkte
  - ergaenzend braucht es Web-API-Clients analog zu bestehenden Domaenenstores

## 4. Statusmodell
- Empfohlene Statusliste:
  - `ENTWURF`
  - `INTERNE_PRUEFUNG`
  - `EINREICHPHASE`
  - `UVP_UVE_IN_AUSARBEITUNG`
  - `BEI_BEHOERDE_EINGEREICHT`
  - `ERGAENZUNGSAUFTRAG_OFFEN`
  - `GENEHMIGT`
  - `IN_UMSETZUNG`
  - `ARCHIVIERT`
- Checklisten aktiv:
  - `INTERNE_PRUEFUNG`
  - `EINREICHPHASE`
  - `UVP_UVE_IN_AUSARBEITUNG`
  - `ERGAENZUNGSAUFTRAG_OFFEN`
- Checklisten nicht mehr als offene Pflichtliste aktiv:
  - `BEI_BEHOERDE_EINGEREICHT`
  - `GENEHMIGT`
  - `IN_UMSETZUNG`
  - `ARCHIVIERT`
  - in diesen Status nur Read-only-Historie und Dokumentation
- Rein informativ:
  - `ENTWURF` als Default-Startstatus ohne aktive Pflichtbearbeitung
- `UVP_UVE_IN_AUSARBEITUNG` ist nur fuer Projekte mit aktivem Modul `UVP_UVE` fachlich auswaehlbar.
- Fuer reine `Gewerbe`- oder `Gewerbe + AWG`-Projekte bleibt `UVP_UVE_IN_AUSARBEITUNG` verborgen.
- Statuswechsel funktionieren manuell durch Nutzer mit bestehenden Projekt-Bearbeitungsrechten; Admin hat Override, es gibt keine automatische Statusaenderung aufgrund von Checklistenfortschritt.
- Empfohlene Standardpfade:
  - `Gewerbe`:
    `ENTWURF -> INTERNE_PRUEFUNG -> EINREICHPHASE -> BEI_BEHOERDE_EINGEREICHT -> ERGAENZUNGSAUFTRAG_OFFEN -> BEI_BEHOERDE_EINGEREICHT -> GENEHMIGT -> IN_UMSETZUNG -> ARCHIVIERT`
  - `Gewerbe + AWG`:
    gleicher Kernpfad, aber mit aktiven AWG-Modulen in `INTERNE_PRUEFUNG`, `EINREICHPHASE` und ggf. `ERGAENZUNGSAUFTRAG_OFFEN`
  - `Gewerbe + AWG + UVP/UVE`:
    `ENTWURF -> INTERNE_PRUEFUNG -> UVP_UVE_IN_AUSARBEITUNG -> BEI_BEHOERDE_EINGEREICHT -> ERGAENZUNGSAUFTRAG_OFFEN -> ...`

## 5. Template-Konzept
- Es gibt keine Einheits-Checkliste fuer alle Projekte.
- Die bisherige binare Sicht `STANDARD_AWG` vs. `UVP_UVE` wird ersetzt durch ein flexibles Modulmodell.
- `Gewerbe` liefert die Basisthemen eines typischen genehmigungsnahen Einreichprojekts.
- `AWG` erweitert die gewerbliche Basis um abfallrechtliche Zusatzthemen.
- `UVP/UVE` erweitert die vorhandene Basis und vorhandene Zusatzmodule um formale UVP-Unterlagen, Verzeichnisse, Fachbeitraege und Gutachtenmodule.
- Jedes Template-Item traegt fachliche Metadaten:
  - Pflichtgrad
  - Item-Typ
  - relevante Phase
  - Modulzugehoerigkeit
  - Nachforderungsflag
  - optionale Fachbereich- oder Pruefthema-Hinweise
- Empfohlene Struktur:
  - `Basisprofil`: bestimmt die Grundarchitektur des Projekts
  - `Module`: aktivieren Zusatzbloecke
  - `Preset`: dient nur als Benutzerhilfe im UI
- Vorlagen werden versioniert und nach Veroeffentlichung als unveraenderlich behandelt.
- Ein Projekt materialisiert beim Aktivieren eine feste Kopie der gewaehlten Template-Version und Modulzusammenstellung; spaetere Template-Aenderungen veraendern bestehende Projekte nicht rueckwirkend.
- Ein Profil- oder Modulwechsel nach Aktivierung erfolgt nur explizit ueber Reset oder Neuinitialisierung, damit keine stillen Massenaenderungen an laufenden Projektchecklisten entstehen.
- Weitere Vorlagetypen sollen spaeter ueber neue Modulpakete ergaenzt werden, nicht ueber neue technische Grundarchitektur.

## 6. Vorschlag fuer erste Template-Struktur

### 6A. Gewerbe-Basisprofil

#### Projekt- und Verfahrensgrundlagen
- Zweck: Verfahrensrahmen, Genehmigungsweg und Rollen klaeren.
- Typische Punkte:
  - Projektziel
  - Verfahrensart
  - Genehmigungstatbestand
  - Behoerdenbezug
  - Profil- und Modulkombination
- Pflichtgrad: immer pruefen
- Typ: Dokument, Fachpruefung, Abstimmung

#### Standort / Grundstueck / Eigentum / Zustimmung
- Zweck: Standortsicherheit und Verfuegbarkeiten absichern.
- Typische Punkte:
  - Grundstuecksdaten
  - Eigentum
  - Miet- oder Pachtlage
  - Zustimmungen
  - Grundbuchbezug
- Pflichtgrad: haeufig pruefen
- Typ: Dokument, Abstimmung

#### Betriebsbeschreibung / Logistik / Personal / Verkehr
- Zweck: Betriebsablauf verstaendlich und belastbar darstellen.
- Typische Punkte:
  - Betriebszeiten
  - Logistik
  - Materialfluss
  - Personal
  - Verkehrsaufkommen
- Pflichtgrad: haeufig pruefen
- Typ: Dokument, Fachpruefung

#### Maschinen / Verfahren / Arbeitsmittel
- Zweck: technische Ausruestung und Prozesslogik belegen.
- Typische Punkte:
  - Anlagenliste
  - Leistungsdaten
  - Datenblaetter
  - Verfahrensbeschreibung
  - Arbeitsmittel
- Pflichtgrad: haeufig pruefen
- Typ: Dokument, Fachpruefung

#### Bau / Gebaeude / Infrastruktur
- Zweck: bauliche und infrastrukturelle Voraussetzungen vollstaendig dokumentieren.
- Typische Punkte:
  - Hallen
  - Lagerflaechen
  - Gebaeude
  - Medienanschluesse
  - Erschliessung
- Pflichtgrad: haeufig pruefen
- Typ: Dokument, Abstimmung

#### Wasser / Entwaesserung / Emissionen
- Zweck: umweltrelevante Ausleitungen und Belastungen sauber abdecken.
- Typische Punkte:
  - Wasserbedarf
  - Entwaesserung
  - Abwasser
  - Luft-, Geruch- und Laermpunkte
  - Emissionen
- Pflichtgrad: haeufig pruefen
- Typ: Fachpruefung, Gutachten

#### Brandschutz / Explosionsschutz / ArbeitnehmerInnenschutz
- Zweck: Sicherheits- und Schutzkonzepte absichern.
- Typische Punkte:
  - Brandschutzkonzept
  - Ex-Schutz
  - ArbeitnehmerInnenschutz
  - Notfallthemen
- Pflichtgrad: haeufig bis fallabhaengig pruefen
- Typ: Fachpruefung, Gutachten, Massnahmenpunkt

#### Plaene / Einlagen / Anhaenge
- Zweck: formale Vollstaendigkeit der Einreichunterlagen sichern.
- Typische Punkte:
  - Lageplaene
  - Grundrisse
  - Schnitte
  - Verfahrensschemata
  - Verzeichnisse
  - Anhaenge
- Pflichtgrad: immer pruefen
- Typ: Dokument

### 6B. AWG-Zusatzmodule

#### AWG-/Abfall-Fachteil
- Zweck: den abfallrechtlichen Kernfachteil strukturiert abbilden.
- Typische Punkte:
  - Abfallarten
  - Stoffstroeme
  - Mengenansaetze
  - Annahmekriterien
  - Entsorgungs- und Verwertungswege
- Pflichtgrad: immer pruefen
- Typ: Fachpruefung, Dokument

#### Lagerung / Behandlung / Entsorgungswege
- Zweck: die operative Abfalllogik, Zwischenlagerung und Behandlung nachvollziehbar dokumentieren.
- Typische Punkte:
  - Lagerkonzept
  - Behandlungsablaeufe
  - Zwischenlagerung
  - Ausbringungs- oder Entsorgungswege
  - Sicherheits- und Trennlogik
- Pflichtgrad: immer bis haeufig pruefen
- Typ: Fachpruefung, Dokument

#### Abfallrechtliche Nachweise / Zustimmungen
- Zweck: AWG-spezifische Nachweise, Abstimmungen und Spezialzustimmungen sichtbar machen.
- Typische Punkte:
  - Nachweislogik
  - Vertragsanbindungen
  - Spezialzustimmungen
  - abfallrechtliche Abstimmungsthemen
- Pflichtgrad: haeufig bis fallabhaengig pruefen
- Typ: Dokument, Abstimmung

### 6C. UVP-/UVE-Zusatzmodule

#### Formale UVP-Unterlagen
- Zweck: formale UVP-Verfahrensunterlagen komplett machen.
- Typische Punkte:
  - Antragsstruktur
  - Verfahrensbezeichnungen
  - formale Einreichsets
  - Verfahrensbezuege
- Pflichtgrad: immer pruefen
- Typ: Dokument, Abstimmung

#### Gesamteinlagenverzeichnis
- Zweck: ein vollstaendiges, versionssicheres Gesamtverzeichnis aller Einlagen fuehren.
- Typische Punkte:
  - Register
  - Version und Datum
  - Zuordnung
  - Vollstaendigkeitskontrolle
- Pflichtgrad: immer pruefen
- Typ: Dokument, Kontrolle

#### Allgemein verstaendliche Zusammenfassung
- Zweck: die nichttechnische Darstellung fuer Oeffentlichkeit und Verfahren sichern.
- Typische Punkte:
  - Projektbeschreibung
  - wesentliche Wirkungen
  - Massnahmen
  - Kernaussagen
- Pflichtgrad: immer pruefen
- Typ: Dokument

#### Synthesebericht
- Zweck: Fachbeitraege zusammenfuehren und Abwaegungslinien sichtbar machen.
- Typische Punkte:
  - Gesamtbewertung
  - Konflikte
  - Wechselwirkungen
  - Alternativen
  - Restwirkungen
- Pflichtgrad: immer pruefen
- Typ: Fachpruefung, Gutachten

#### Massnahmenplanung
- Zweck: Vermeidungs-, Minderungs-, Ausgleichs- und Monitoringmassnahmen buendeln.
- Typische Punkte:
  - Massnahmenliste
  - Verantwortungen
  - Umsetzungslogik
  - Nachverfolgung
- Pflichtgrad: immer pruefen
- Typ: Massnahmenpunkt, Abstimmung

#### Wirkfaktorberichte
- Zweck: auswirkungsbezogene Spezialgutachten abdecken.
- Typische Punkte:
  - Laerm
  - Luft / Geruch
  - Erschuetterungen
- Pflichtgrad: fallabhaengig bis haeufig pruefen
- Typ: Gutachten

#### Schutzgueter-Fachbeitraege
- Zweck: schutzgutbezogene Fachpruefung strukturieren.
- Typische Punkte:
  - Mensch / Humanmedizin
  - Mensch / Siedlungsraum / Freizeit
  - Biologische Vielfalt
  - Wasser / Grundwasser / Altlasten
  - Luft und Klima
  - Flaeche und Boden
  - Sachgueter / Stadtbild
- Pflichtgrad: haeufig pruefen
- Typ: Fachpruefung, Gutachten

#### Zusaetzliche Fachthemen
- Zweck: projektspezifische Zusatzthemen modular ergaenzen.
- Typische Punkte:
  - Verkehr
  - Geotechnik
  - Grundbuch / Zustimmung
  - Baumschutz
  - Bodenschutz
  - Klima- und Energiekonzept
  - Blendgutachten
  - Bahn / Anschlussbahn
- Pflichtgrad: fallabhaengig pruefen
- Typ: Gutachten, Abstimmung

## 7. Vorschlag fuer Checklistenpunkt-Felder
- `title`
- `description`
- `sectionKey`
- `sectionLabel`
- `moduleKey`
- `templateItemKey`
- `templateVersion`
- `itemType`: `DOCUMENT`, `FACHPRUEFUNG`, `ABSTIMMUNG`, `GUTACHTEN`, `MASSNAHME`
- `priority`: `IMMER_PRUEFEN`, `HAEUFIG_PRUEFEN`, `FALLABHAENGIG_PRUEFEN`
- `itemStatus`: empfohlen `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `NOT_APPLICABLE`
- `responsibleUserId`
- `responsibleDisplayName`
- `dueDate`
- `documentLinks`: Verknuepfungen zu bestehenden `Document.id` und optional zu bestehenden `LegalDocument.id`
- `comment` bzw. `internalNote`
- `disciplineKey`
- `disciplineLabel`
- `expertHint`
- `authorityHint`
- `reviewTopic`
- `isRelevantInSubmissionPhase`
- `requiresModuleAwg`
- `requiresModuleUvpUve`
- `isSupplementRequestItem`
- `becomesHistoryAfterSubmission`
- `updatedAt`
- `updatedBy`
- optional `completedAt`
- optional `completedBy`

## 8. UI-/UX-Konzept
- Primaerer Einstiegspunkt ist das Projektdetail in `apps/web/src/pages/ProjectDetailPage.tsx`; dort kommt additiv ein Status-Badge im Header und ein neuer Tab `Einreichung & Checkliste` hinzu.
- Das Projekterstellen und Projektbearbeiten nutzt weiterhin den bestehenden Modal-Flow; dort werden additiv `Projektstatus`, `Basisprofil` und eine einfache Modulauswahl oder ein Preset aufgenommen statt eine neue Seite einzufuehren.
- Der neue Tab zeigt Sektionen gruppiert, mit Filtern fuer `offen`, `ueberfaellig`, `erledigt`, `nicht relevant`, plus Summen je Sektion und Modul.
- Jedes Item zeigt:
  - Titel
  - Pflichtgrad
  - Status
  - Verantwortlich
  - Faelligkeit
  - Fachbereich oder Gutachterhinweis
  - Dokumentlinks
  - Kommentar
- Die Projektliste in `apps/web/src/pages/ProjectsPage.tsx` erhaelt spaeter additiv Status-Badge, optionalen Statusfilter und eine kleine Zusammenfassung offener Checklistenpunkte.
- Dokumentverknuepfungen nutzen den bestehenden serverseitigen Dokumentfluss ueber `apps/web/src/api/documents.ts` und bestehende `LegalDoc`-Bezuege; im MVP kein neuer Upload-Owner-Typ.
- In passiven Status zeigt der Tab dieselben Inhalte read-only als Historie, nicht als aktive Pflichtliste.
- Die Darstellung bleibt kompatibel mit dem bestehenden Mobile-Usability-Plan: kein neuer Navigationspfad, keine neue App, keine separate mobile Architektur.

## 9. Migrations-/Einfuehrungsstrategie
- Die Funktion ist eine additive Projekterweiterung, kein neuer Migrationsblock der alten Snapshot-zu-Postgres-Roadmap.
- Einfuehrung per bestehendem Feature-Flag- oder Runtime-Config-Muster oder vergleichbarer kontrollierter Freischaltung.
- Neue Projekte:
  - Default `ENTWURF`
  - Default `baseProfile = GEWERBE`
  - Default `submissionModules = []`
- Fuer einfache Bedienbarkeit koennen im UI kuratierte Startoptionen angeboten werden:
  - `Gewerbe`
  - `Gewerbe + AWG`
  - spaeter `Gewerbe + AWG + UVP/UVE`
- Bestehende Projekte:
  - `opt-in`
  - sie bekommen hoechstens einen neutralen Default-Status
  - keine aktive Checkliste ohne explizite Initialisierung
- Checklisten werden erst bei Aktivierung materialisiert; dadurch bleiben historische Projekte ohne implizite Pflichtlisten stabil.
- Pilotbetrieb:
  - zuerst nur internes Kernteam
  - dann ausgewaehlte neue Gewerbe- oder Gewerbe+AWG-Projekte
  - danach gezielt AWG-Pilot
  - UVP/UVE erst in einer zweiten fachlichen Welle
- Keine automatische Massenmigration von Altprojekten in aktive Checklisten.
- Keine automatische Task-Erzeugung im MVP.

## 10. Umsetzungsphasen

### Phase C1: Projektstatus und Profilmodell einfuehren
- Ziel: Status, Basisprofil und Module additiv auf Projektebene sichtbar und editierbar machen.
- Betroffene Bereiche:
  - Projektmodell
  - Projekt-API
  - Projektmodal
  - Projektliste
  - Projektdetail
- Risiken:
  - Statusinflation
  - unklare Begrifflichkeit zwischen Profil, Modul und Preset
- Abnahmekriterien:
  - neue Projekte starten mit Default-Status
  - Profil oder Preset ist in Modal und Detail sichtbar
  - bestehende Workflows bleiben unveraendert

### Phase C2: einfache modulare Checklisten-Engine
- Ziel: Template-Version, Projekt-Checkliste, Modulkomposition, Item-Status, Aktivierungslogik und Read-only-Historie einfuehren.
- Betroffene Bereiche:
  - neue Projekt-Checklisten-Domaene
  - API
  - Web-Store
  - Projektdetail-Tab
- Risiken:
  - Template- oder Projektkopie driftet
  - passive Status zeigen faelschlich offene Pflichtliste
- Abnahmekriterien:
  - manuelle Aktivierung funktioniert
  - aktive und passive Status schalten korrekt
  - bestehende Projekte bleiben ohne Auto-Aktivierung unberuehrt

### Phase C3: Gewerbe-Basisvorlage
- Ziel: praxistaugliche gewerbliche Basisvorlage ausrollen.
- Betroffene Bereiche:
  - kuratierte Template-Daten
  - Projektdetail-Ansicht
- Risiken:
  - zu generisch
  - zu formal
  - zu unkonkret
- Abnahmekriterien:
  - ein Gewerbeprojekt kann mit der Vorlage sinnvoll vorbereitet werden
  - Sektionen und Punkte sind fuer Projektteams handhabbar

### Phase C4: AWG-Zusatzmodule
- Ziel: AWG als Add-on zur gewerblichen Basis ausrollen.
- Betroffene Bereiche:
  - Template-Komposition
  - Profilpreset `Gewerbe + AWG`
  - Projektdetail
- Risiken:
  - Duplikate zum Basistemplate
  - AWG-Inhalte rutschen faelschlich in reine Gewerbeprojekte
- Abnahmekriterien:
  - AWG-Projekte laden Basis plus AWG-Module
  - reine Gewerbeprojekte bleiben frei von AWG-Last

### Phase C5: UVP-/UVE-Zusatzmodule
- Ziel: UVP/UVE als weiteres Erweiterungsprofil ergaenzen.
- Betroffene Bereiche:
  - Template-Komposition
  - Statuspfad
  - Projektdetail
- Risiken:
  - Ueberkomplexitaet
  - unklare Abgrenzung zu AWG-Modulen
- Abnahmekriterien:
  - UVP-Projekte laden passende Zusatzmodule
  - Gewerbe- und AWG-Projekte bleiben unveraendert

### Phase C6: Verantwortliche / Faelligkeiten / Dokumentverknuepfung
- Ziel: Teamsteuerung je Punkt nutzbar machen.
- Betroffene Bereiche:
  - User-Selector
  - Dokumentlinks zu bestehenden Dokumenten und LegalDocs
  - Item-Details
- Risiken:
  - Dokumentreferenzen werden uneindeutig
  - UI wird ueberfrachtet
- Abnahmekriterien:
  - interne Verantwortliche, Faelligkeit und Dokumentbezug pro Punkt funktionieren ohne neue Upload-Architektur

### Phase C7: Reporting / Uebersicht / mobile Optimierung
- Ziel: Uebersicht ueber offene und ueberfaellige Checklistenpunkte und mobile Nutzbarkeit absichern.
- Betroffene Bereiche:
  - Projektliste
  - Projektdetail
  - responsive Darstellung
- Risiken:
  - zusaetzliche UI-Komplexitaet
  - Detailseiten-Regressions
- Abnahmekriterien:
  - Status- und Offenheitsuebersicht ist in Projektliste verstaendlich
  - Projektdetail-Tab bleibt auf kleinen Screens nutzbar

### Phase C8: Cleanup / Rollout
- Ziel: Pilot, Feedback, Template-Haertung, Hilfetexte und Rolloutabsicherung abschliessen.
- Betroffene Bereiche:
  - Runtime-Flags
  - Hilfe- und Dokumentation
  - gegebenenfalls Audit- oder Recovery-Anschluss
- Risiken:
  - halbfertige Bestandsprojekte
  - ungeklaerte Template-Verantwortung
- Abnahmekriterien:
  - Pilotteam kann die Funktion produktiv testen
  - Rollout kann kontrolliert und reversibel aktiviert werden

## 11. Risiken / offene Fragen
- Fachliches Risiko: Die Checkliste kippt in eine ueberjuristische Vollstaendigkeitsmaschine statt in ein praxistaugliches Teamwerkzeug.
- Datenmodell-Risiko: Zu fruehe Uebermodellierung macht die erste Version unnoetig schwer; zu grobe Modellierung erschwert spaetere Auswertungen.
- UX-Risiko: Zu viele Pflichtchips, Status und Sektionen koennen das Projektdetail ueberladen.
- Einfuehrungsrisiko: Historische Projekte koennten faelschlich als "unvollstaendig" erscheinen, wenn Aktivierung und Historienmodus nicht sauber getrennt sind.
- Offene Abstimmung vor echter Umsetzung:
  - Wer gibt fachlich Template-Versionen frei?
  - Wie werden Ergaenzungsauftraege als Delta versus Reopen modelliert?
  - Wird spaeter ein Admin-Template-Editor gewuenscht?
  - Soll `UVP/UVE` fachlich immer auf `AWG` aufsetzen oder auch ohne AWG als Sonderfall moeglich sein?
  - Welche Gewerbe-Basisbloecke sind wirklich standardmaessig aktiv und welche nur `fallabhaengig`?
- Repo- und Fachreferenz-Hinweis:
  - Die in der Anfrage erwaehnten Beispiel-Einreichunterlagen waren im Workspace nicht sichtbar.
  - Vor Umsetzung sollten Template-Tiefe, Benennung und Pflichtgrad noch gegen reale Gewerbe-, AWG- und UVP-Beispiele gegengeprueft werden.
- Festgelegte Defaults dieses Plans:
  - Bestandsprojekte opt-in
  - Verantwortliche im MVP nur interne User
  - Checklisten im MVP getrennt vom bestehenden Task-System
  - Statuswechsel manuell statt automatisch
  - `Gewerbe` ist die Basis, `AWG` und `UVP/UVE` sind Zusatzmodule

## 12. Empfehlung fuer MVP
- Kleinste sinnvolle erste Version: `C1 + C2 + C3 + C4` mit minimalem Ausschnitt aus `C6`.
- Unbedingt in Version 1:
  - Projektstatus
  - Basisprofil `Gewerbe`
  - Modul `AWG`
  - kuratierte Presets `Gewerbe` und `Gewerbe + AWG`
  - Aktivierungslogik
  - Sektionen
  - Item-Status
  - interner Verantwortlicher
  - Faelligkeit
  - Kommentar oder Hinweis
  - Dokumentverknuepfung auf bestehende Dokumente
  - Read-only-Historie in passiven Status
- Bewusst spaeter:
  - `UVP/UVE`
  - automatische Task-Kopplung
  - externer Verantwortlichen-Workflow
  - freier Template-Editor im Admin
  - komplexe Dashboards und Reports
  - automatische Statusvorschlaege
  - rechtliche Regelmaschinen
- Empfehlung zu UVP im MVP:
  - nein
  - `UVP/UVE` sollte Welle 2 sein
  - der Datenrahmen und das Profil muessen von Tag 1 vorbereitet werden
  - die fachliche Aktivierung aber erst nach Stabilisierung von `Gewerbe` und `Gewerbe + AWG`

## 13. Test- und Abnahmeszenarien
- Neues Gewerbeprojekt anlegen:
  - Default `ENTWURF`
  - Basisprofil `GEWERBE`
  - noch keine aktive Pflichtliste bis zur Aktivierung oder bis zum Statuswechsel
- Neues `Gewerbe + AWG`-Projekt anlegen:
  - gleiche Basis
  - zusaetzlich aktivierte AWG-Module nach Initialisierung
- Statuswechsel auf `INTERNE_PRUEFUNG` oder `EINREICHPHASE`:
  - die passende Checkliste materialisiert sich mit korrekter Template-Version und korrekter Modulzusammenstellung
- Statuswechsel auf `BEI_BEHOERDE_EINGEREICHT`:
  - gleiche Liste bleibt sichtbar, aber read-only und ohne offene Pflichtdarstellung
- Ergaenzungsauftrag:
  - Projekt wechselt auf `ERGAENZUNGSAUFTRAG_OFFEN`
  - relevante Punkte werden wieder aktiv bearbeitbar
- Dokumentbezug:
  - Projekt- oder LegalDoc-Dokumente koennen mit einem Checklistenpunkt verknuepft werden, ohne neuen Uploadpfad
- Bestandsprojekt:
  - bleibt ohne aktive Checkliste, bis ein Benutzer die Funktion explizit initialisiert
- Template-Versionierung:
  - neue Template-Version wirkt nur auf neu initialisierte Projekte, nicht rueckwirkend auf bestehende Projektchecklisten
- UVP-Welle 2:
  - Profil `Gewerbe + AWG + UVP/UVE` laedt Basis plus Zusatzmodule
  - Gewerbe- und AWG-Projekte bleiben unveraendert

## 14. Erweiterungszusammenfassung
- Erweiterte Kapitel:
  - `1. Zielbild`
  - `3. Fachliches Datenmodell`
  - `5. Template-Konzept`
  - `6. Vorschlag fuer erste Template-Struktur`
  - `10. Umsetzungsphasen`
  - `11. Risiken / offene Fragen`
  - `12. Empfehlung fuer MVP`
- Neues Profil-Modell:
  - `Gewerbe` als Basisprofil
  - `AWG` als Zusatzprofil auf gewerbeaehnlicher Basis
  - `UVP/UVE` als zusaetzliches Erweiterungsprofil
  - Mischfaelle werden ueber `Basisprofil + Module` abgebildet, nicht ueber eine starre binare Auswahl
- Empfohlene MVP-Profile:
  - `Gewerbe`
  - `Gewerbe + AWG`
  - `Gewerbe + AWG + UVP/UVE` erst Welle 2
- Vor Implementierung noch fachlich zu klaeren:
  - ob `UVP/UVE` fachlich immer auf `AWG` aufsetzt
  - welche Basismodule fuer `Gewerbe` wirklich standardmaessig aktiv sein sollen
  - wer Templates fachlich freigibt und pflegt
  - wie Ergaenzungsauftraege modelliert werden
  - wie die Modulstruktur gegen reale Referenzunterlagen gespiegelt wird
