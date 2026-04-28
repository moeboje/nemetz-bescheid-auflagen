# Umsetzungsplan: Projektstatus, Einreichtyp und projektbezogene Checklisten

## Kurzfassung
- C1a `Project.status` ist bereits umgesetzt und bleibt unveraendert das fachliche Prozessstatus-Konzept auf Projektebene.
- Die fruehere Idee eines flexiblen Basisprofil-/Add-on-/Mehrprofil-Modells wird verworfen.
- Fuer die erste Version gilt stattdessen ein klares Single-Select-Modell: Ein Projekt hat genau einen Einreichtyp.
- Zulaessige Werte sind ausschliesslich:
  - `GEWERBE`
  - `AWG`
  - `UVP_UVE`
- C2 fuehrt danach eine einfache, generische Checklisten-Engine pro Projekt ein, noch ohne fachliche AWG- oder UVP-Templates.
- C3 und C4 koppeln spaetere fachliche Vorlagen und Zusatzmodule an genau diesen einen Einreichtyp.

## 1. Zielbild
- Die Funktion wird als additive Erweiterung der bereits serverseitig persistierten Projekt-Domaene umgesetzt und ist keine neue Persistenzphase.
- Ein Projekt soll fachlich ueber drei getrennte Konzepte verfuegen:
  - `Project.status` fuer den Bearbeitungs- und Verfahrensstand
  - `Project.submissionType` fuer den fachlichen Einreichkontext
  - `isArchived` bzw. `archivedAt` fuer Sichtbarkeit und Lebenszyklus
- `Project.status` beantwortet die Frage: In welcher Phase befindet sich das Projekt derzeit?
- `Project.submissionType` beantwortet die Frage: Welche fachliche Einreichart gilt fuer dieses Projekt?
- Archivierung beantwortet die Frage: Ist das Projekt aktiv sichtbar oder archiviert?
- Diese Trennung ist notwendig, weil sich:
  - der Status mehrfach aendern kann, ohne dass sich der fachliche Typ aendert
  - der Einreichtyp fachlich stabil bleibt, auch wenn das Projekt von `DRAFT` zu `SUBMITTED` oder `APPROVED` wechselt
  - Archivierung weder Prozessstatus noch Fachtyp ersetzt
- C2 und spaetere Phasen bauen auf dieser Trennung auf, ohne sie zu vermischen.

## 2. Nicht-Ziele
- Kein Mehrfachprofil-System.
- Kein Basisprofil plus Add-ons.
- Keine Kombinationen wie `GEWERBE + AWG` oder `AWG + UVP_UVE`.
- Keine Checklisten-Engine in C1b.
- Keine Dokumentpflichtlogik in C1b.
- Keine automatische Genehmigungs- oder Rechtslogik.
- Keine Verantwortlichen-, Faelligkeits- oder Eskalationslogik in C1b.
- Keine direkte Implementierung fachlicher AWG- oder UVP-Template-Inhalte in C1b.

## 3. Fachliches Datenmodell
- `ProjectStatus`
  - bereits in C1a eingefuehrt
  - beschreibt den fachlichen Fortschritt bzw. den Verfahrensstand
  - bleibt unabhaengig vom Einreichtyp
- `ProjectSubmissionType`
  - neues fachliches Konzept fuer C1b
  - genau ein Wert pro Projekt in Version 1
  - zulaessige Werte:
    - `GEWERBE`
    - `AWG`
    - `UVP_UVE`
- `ProjectChecklist`
  - kommt erst in C2
  - ist eine projektbezogene generische Checkliste
  - wird spaeter typkompatibel, aber nicht bereits in C1b vom Typ abgeleitet
- Spaetere fachliche Vorlagen
  - werden nicht mehr aus einer Mehrprofil-Kombination zusammengesteckt
  - werden spaeter an genau einen Einreichtyp gekoppelt
- Erweiterbarkeit
  - weitere Einreichtypen koennen spaeter als zusaetzliche kontrollierte Werte ergaenzt werden
  - dies ist ausdruecklich nicht Teil des MVP

## 4. Statusmodell
- Das bestehende C1a-Statusmodell bleibt die alleinige fachliche Status-Quelle.
- Status und Einreichtyp beeinflussen sich im MVP nicht automatisch.
- Es gibt keine automatische Aktivierung von Statuspfaden aus dem Einreichtyp.
- Es gibt keine automatische Einreichtyp-Ableitung aus Status, Dokumenten oder Projektnamen.
- Status bleibt weiterhin fuer Listen, Header, Detailansichten und Prozesskommunikation der primaere Fortschrittsindikator.

## 5. Beziehung zwischen Status, Einreichtyp und Archivierung
- Status, Einreichtyp und Archivierung bleiben bewusst drei getrennte Konzepte.
- Status ist dynamisch und prozessual.
- Einreichtyp ist fachlich klassifizierend.
- Archivierung ist technisch-organisatorisch und steuert Sichtbarkeit, nicht Fachlogik.
- Beispiele:
  - Ein `AWG`-Projekt kann nacheinander `DRAFT`, `SUBMISSION_PREPARATION`, `SUBMITTED` und `APPROVED` sein.
  - Ein `GEWERBE`-Projekt kann archiviert werden, ohne seinen fachlichen Typ zu verlieren.
  - Ein archiviertes `UVP_UVE`-Projekt bleibt fachlich `UVP_UVE`, aber ist nicht mehr Teil der aktiven Arbeitsliste.

## 6. Template-Konzept
- Die fruehere Idee einer Template-Komposition aus Basisprofil plus Add-ons wird verworfen.
- Neues Zielmodell:
  - genau ein Einreichtyp pro Projekt
  - spaetere Vorlagen und Zusatzpakete werden 1:1 an diesen Typ gekoppelt
- C2
  - fuehrt nur die generische technische und fachliche Grundlage fuer projektbezogene Checklisten ein
  - noch keine AWG- oder UVP-Fachvorlagen
- C3
  - fuehrt die erste kuratierte Standard-AWG-Vorlage ein
  - gilt fuer Projekte mit `submissionType = AWG`
- C4
  - fuehrt UVP-/UVE-Zusatzmodule oder UVP-/UVE-spezifische Vorlagen ein
  - gilt fuer Projekte mit `submissionType = UVP_UVE`
- `GEWERBE`
  - kann spaeter eine eigene Standardvorlage erhalten
  - ist fuer C1b und C2 zunaechst nur ein fachlicher Typ, nicht schon eine materialisierte Vorlagenstruktur

## 7. UI-/UX-Konzept
- Der bestehende Projekt-Modal-Flow bleibt der primaere Pflegeort fuer Projektstatus und Einreichtyp.
- Im Projektdetail wird der Einreichtyp additiv sichtbar, nahe beim Status oder im gleichen Meta-Bereich.
- Es gibt keine neue Projektseite und keinen neuen Navigationspfad.
- Die Projektliste kann spaeter ein kompaktes Badge oder einen Filter erhalten, ist aber nicht Kern des kleinsten MVP.
- Legacy-Projekte ohne gesetzten Einreichtyp sollen klar als "nicht gesetzt" oder aequivalent erkennbar sein, statt implizit falsch klassifiziert zu werden.

## 8. Migrations- und Einfuehrungsstrategie
- C1b ist keine neue Persistenzphase, sondern eine additive Projekterweiterung innerhalb der bestehenden serverseitigen Projektpersistenz.
- Bestehende Projekte:
  - bleiben bevorzugt `submissionType = null`
  - werden nicht automatisch einem Typ zugeordnet
  - duerfen nicht aufgrund von Status, Dokumentenbestand oder alten Annahmen falsch umklassifiziert werden
- Neue Projekte:
  - sollen im UI den Einreichtyp aktiv waehlen
  - sollen keinen stillen Default erhalten
  - backend-seitig kann das Feld aus Kompatibilitaetsgruenden zunaechst nullable bleiben
- Spaetere Rollout-Logik:
  - zuerst rein additive Einfuehrung im Projektkontext
  - danach generische Checklisten-Engine
  - danach typspezifische Vorlagen

## 9. Umsetzungsphasen

### Phase C1a: Projektstatus
- Bereits umgesetzt.
- `Project.status` ist serverseitig persistiert und UI-seitig verankert.

### Phase C1b: Einzelner Einreichtyp am Projekt
- Ziel:
  - genau einen fachlichen Einreichtyp pro Projekt einfuehren
  - Status und Archivierung unveraendert daneben bestehen lassen
- Betroffene Bereiche:
  - Projektmodell
  - Projekt-API
  - Projektmodal
  - Projektdetail
  - Import/Export/Admin
- Risiken:
  - Verwechslung von Status und Einreichtyp
  - zu fruehe Pflichtlogik im UI
- Abnahmekriterien:
  - genau ein Typ pro Projekt
  - keine Kombinationen
  - Altprojekte bleiben ohne erzwungene Umklassifizierung nutzbar

### Phase C2: einfache generische Checklisten-Engine
- Ziel:
  - projektbezogene Checkliste mit Sektionen und Punkten
  - noch ohne AWG-/UVP-Fachinhalte
- Betroffene Bereiche:
  - Projekt-Checklisten-Domaene
  - API
  - Projektdetail-Tab
- Risiken:
  - Checkliste wird zu frueh mit Fachlogik ueberladen
- Abnahmekriterien:
  - Checkliste existiert pro Projekt optional
  - Sektionen und Punkte sind einfach bearbeitbar
  - keine automatische Ableitung aus dem Einreichtyp im MVP

### Phase C3: AWG-Standardvorlage
- Ziel:
  - erste kuratierte AWG-Checkliste oder AWG-Template-Schicht einfuehren
- Betroffene Bereiche:
  - Template-Daten
  - Projekt-Initialisierung aus `submissionType = AWG`
- Risiken:
  - zu fruehe Fachueberladung
- Abnahmekriterien:
  - AWG-Projekte koennen mit einer standardisierten Vorlage initialisiert werden

### Phase C4: UVP-/UVE-Zusatzmodule
- Ziel:
  - UVP-/UVE-spezifische Vorlagen oder Module einfuehren
- Betroffene Bereiche:
  - Template-Logik
  - Projekt-Initialisierung aus `submissionType = UVP_UVE`
- Risiken:
  - falsche Kopplung an AWG oder fruehere Mehrprofil-Logik
- Abnahmekriterien:
  - UVP-/UVE-Projekte erhalten gezielt ihre spaeteren Fachinhalte

### Phase C5: Verantwortliche, Faelligkeiten, Dokumentverknuepfung
- Ziel:
  - Checklistenpunkte spaeter um Team- und Dokumentbezug erweitern
- Betroffene Bereiche:
  - User-Referenzen
  - Dokumentverknuepfungen
  - Item-Metadaten
- Risiken:
  - zu breite fachliche Ausweitung
- Abnahmekriterien:
  - Verantwortliche, Termine und Dokumentbezug funktionieren, ohne C1b oder C2 zu destabilisieren

## 10. Risiken und offene Fragen
- Fachliches Risiko:
  - reale Mischfaelle werden im MVP nicht abgebildet
- UX-Risiko:
  - wenn Status und Einreichtyp im UI zu aehnlich dargestellt werden, entsteht Interpretationsfehler
- Datenmodell-Risiko:
  - bestehende Mehrprofil-Annahmen in Code und Doku muessen spaeter konsistent entfernt werden
- Migrationsrisiko:
  - eine automatische Altklassifizierung waere fachlich riskant und ist zu vermeiden
- Technisches Risiko:
  - Import/Export/Admin muessen das neue skalare Feld konsistent fuehren
- Offene Fragen:
  - Soll der Einreichtyp fuer neue Projekte UI-seitig hart verpflichtend sein?
  - Reicht in C1b Modal plus Detail oder soll die Projektliste bereits Badge/Filter erhalten?
  - Welche exakte Legacy-Darstellung soll fuer `null` verwendet werden?

## 11. MVP-Empfehlung
- Kleinste sinnvolle C1b-Version:
  - ein einzelnes Feld `submissionType` am Projekt
  - Werte `GEWERBE`, `AWG`, `UVP_UVE`
  - Pflege im bestehenden Projekt-Modal
  - Anzeige im Projektdetail
  - serverseitige Persistenz ueber die bestehende Projektarchitektur
- Empfehlung fuer neue Projekte:
  - aktive Auswahl im UI
  - kein stiller Default
- Empfehlung fuer Altprojekte:
  - `null`/nicht gesetzt erlauben
  - keine automatische Umklassifizierung
- Bewusst spaeter:
  - Checklisten-Engine
  - typspezifische Vorlagen
  - Dokumentpflichtlogik
  - Verantwortliche/Faelligkeiten
  - Reports, Reminder oder Aufgabenableitungen aus Checklisten

## 12. Lokale Test- und Rollout-Hinweise fuer die spaetere Umsetzung
- Lokale Pflichtchecks:
  - `cd apps/api && npx prisma generate`
  - `cd apps/api && npm run build`
  - `cd apps/web && npm run build`
- Manuelle Pflichtpruefungen:
  - neues Projekt mit aktiv gewaehltem Einreichtyp anlegen
  - Altprojekt ohne Einreichtyp laden
  - Reload, Inkognito und Zweitsitzung pruefen
  - Import/Export mit und ohne `submissionType` pruefen
- Rollout-Grundsatz:
  - additive Einfuehrung
  - keine Destabilisierung bereits serverseitig migrierter Domaenen
  - keine Rueckkehr zu Snapshot- oder Browser-Only-Persistenz
