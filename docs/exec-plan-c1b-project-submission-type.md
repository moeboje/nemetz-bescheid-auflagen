# Umsetzungsplan C1b: Einzelner Einreichtyp am Projekt

## Kurzfassung
- C1b ist eine additive Erweiterung der bereits serverseitig persistierten Domaene `projects`; es ist keine neue Persistenzphase.
- C1a `Project.status` bleibt unveraendert bestehen; C1b ergaenzt dazu einen einzelnen fachlichen Einreichtyp.
- Die fruehere Idee eines flexiblen Mehrprofil-/Modul-Modells wird fuer Version 1 verworfen.
- Fuer den Start hat ein Projekt genau einen Einreichtyp:
  - `GEWERBE`
  - `AWG`
  - `UVP_UVE`
- C1b schafft nur die fachliche und technische Grundlage fuer spaetere typgebundene Checklisten und Vorlagen.

## 1. Zielbild
- Der Einreichtyp beschreibt die fachliche Verfahrensart eines Projekts.
- Er beantwortet nicht den Bearbeitungsstand des Projekts, sondern dessen fachlichen Einreichkontext.
- Der bereits eingefuehrte Projektstatus beschreibt weiterhin den Bearbeitungs- und Verfahrensstand.
- Archivierung bleibt ein drittes, getrenntes Konzept fuer Sichtbarkeit und Lebenszyklus.
- Die drei Konzepte bleiben bewusst getrennt:
  - `status` = Prozesszustand
  - `submissionType` = fachliche Klassifikation
  - `archivierung` = Lebenszyklus-/Sichtbarkeitszustand
- Diese Trennung vermeidet spaetere Vermischung von Fortschritt, Fachtyp und Sichtbarkeit.

## 2. Nicht-Ziele
- Kein Mehrfachprofil-System.
- Keine Kombinationen wie `GEWERBE + AWG`.
- Keine Checklisten-Engine.
- Keine Dokumentpflichtlogik.
- Keine Verantwortlichen-, Faelligkeits- oder Eskalationslogik.
- Keine automatische Genehmigungs- oder Rechtslogik.
- Keine direkte Implementierung in diesem Lauf.

## 3. Fachliches Modell
- `submissionType` ist ein fachliches Attribut des Projekts.
- Erlaubte Werte sind in Version 1 genau:
  - `GEWERBE`
  - `AWG`
  - `UVP_UVE`
- Beziehung zum Projekt:
  - genau ein Einreichtyp pro Projekt
  - fuer Legacy-Bestaende zunaechst nullable
- Beziehung zum Status:
  - unabhaengig
  - kein Status wird aus dem Einreichtyp abgeleitet
  - kein Einreichtyp wird aus dem Status abgeleitet
- Beziehung zu spaeteren Checklisten/Vorlagen:
  - C2 kann spaeter generische Checklisten pro Projekt fuehren
  - C3/C4 koennen Vorlagen spaeter gezielt anhand des Einreichtyps initialisieren
- Spaetere Erweiterbarkeit:
  - weitere Typen sind spaeter moeglich
  - nicht Teil des MVP

## 4. Empfohlenes Modell fuer Version 1
- Klare Empfehlung: `Single-Select`.
- Genau ein Typ pro Projekt.
- Keine Kombinationen.
- Kein Basisprofil.
- Keine Add-ons.
- Keine Modulkomposition.
- Spaetere Erweiterbarkeit bleibt moeglich, ist aber bewusst nicht Teil des MVP.

## 5. Legacy- und Migrationsstrategie
- Bestehende Projekte sollen sicherheitsorientiert behandelt werden.
- Bevorzugte Loesung:
  - `submissionType` fuer Altbestaende zunaechst `null`
  - keine automatische Umklassifizierung
  - keine Ableitung aus Status, Dokumenten oder Freitext
- Neue Projekte:
  - sollen den Einreichtyp aktiv waehlen
  - sollen keinen stillen Default erhalten
- Empfohlene sichere Kombination:
  - UI-seitig fuer neue Projekte verpflichtende Auswahl
  - backend-seitig zunaechst nullable fuer Legacy- und Import-Kompatibilitaet
- Altprojekte sollen klar als "nicht gesetzt" oder aequivalent dargestellt werden.

## 6. Technisches Modell (konzeptionell)
- Konzeptionell wird ein einzelnes Feld am `Project` empfohlen.
- Zielrichtung:
  - `Project.submissionType`
  - kontrollierter Enum mit `GEWERBE | AWG | UVP_UVE`
- API-/Store-/UI-Auswirkungen fuer die spaetere Umsetzung:
  - Projekt-DTOs fuehren einen skalaren Einreichtyp
  - Frontend-Projektmodell fuehrt einen skalaren Einreichtyp
  - Projektmodal und Projektdetail zeigen und pflegen ihn
  - Import/Export/Admin transportieren denselben skalaren Wert
- Spaeter betroffene Bereiche:
  - Projektliste
  - Filter/Badge-Logik
  - spaetere Template-Initialisierung
  - spaetere Checklisten-Startlogik

## 7. UI-/UX-Konzept
- Primaerer Pflegeort soll das bestehende Projektmodal bleiben.
- Zusaetzlich soll der Einreichtyp im Projektdetail read-only sichtbar sein.
- Keine neue Seite.
- Kein neuer Navigationspfad.
- Projektliste:
  - Badge oder Filter ist sinnvoll, aber nicht Teil des kleinsten MVP
- Darstellung:
  - einfache Single-Select-Auswahl im Modal
  - klare Anzeige im Detail
  - Legacy ohne Wert als neutraler Zustand statt Fehlklassifizierung

## 8. Beziehung zu spaeteren Phasen
- C1b liefert eine klare fachliche Einordnung pro Projekt.
- C2 kann darauf spaeter kompatibel aufsetzen, bleibt aber zunaechst typunabhaengig.
- C3 kann AWG-Vorlagen direkt an `submissionType = AWG` koppeln.
- C4 kann UVP-/UVE-Zusatzlogik direkt an `submissionType = UVP_UVE` koppeln.
- Die Single-Select-Entscheidung vereinfacht C3/C4:
  - keine Modulkomposition
  - keine Konfliktregeln
  - keine Prioritaetslogik zwischen Basisprofil und Add-ons

## 9. Risiken / offene Fragen
- Fachliches Risiko:
  - reale Mischfaelle sind im MVP bewusst nicht abgebildet
- UX-Risiko:
  - Status und Einreichtyp koennen verwechselt werden, wenn die Bezeichnungen unklar sind
- Datenmodell-Risiko:
  - bestehende Mehrprofil-Annahmen in Doku und Code muessen spaeter sauber ersetzt werden
- Migrationsrisiko:
  - automatische Nachklassifizierung von Altprojekten waere fachlich unsicher
- Technisches Risiko:
  - Import/Export/Admin muessen das neue Feld konsistent fuehren
- Offene Fragen:
  - Soll die Auswahl bei neuen Projekten UI-seitig hart blockierend sein?
  - Reicht in C1b Modal plus Detail oder braucht die Projektliste bereits Badge/Filter?
  - Welche konkrete Legacy-Benennung soll fuer `null` verwendet werden?

## 10. MVP-Empfehlung
- Kleinste sinnvolle C1b-Version:
  - ein einzelnes Feld `submissionType` am Projekt
  - Werte `GEWERBE`, `AWG`, `UVP_UVE`
  - Pflege im Projekt-Modal
  - Anzeige im Projektdetail
  - serverseitige Persistenz ueber die bestehende Projektarchitektur
- Empfehlung fuer neue Projekte:
  - aktive Auswahl im UI
  - kein stiller Default
- Empfehlung fuer Altprojekte:
  - `null`/nicht gesetzt zulassen
  - nicht automatisch umklassifizieren
- Ausdruecklich spaeter:
  - Checklisten-Engine
  - typspezifische Templates
  - Dokumentpflichtlogik
  - Verantwortliche/Faelligkeiten
  - automatische Rechts- oder Genehmigungslogik

## 11. Lokale Pruef- und Rollout-Hinweise fuer die spaetere Umsetzung
- Lokale Pflichtchecks:
  - `cd apps/api && npx prisma generate`
  - `cd apps/api && npm run build`
  - `cd apps/web && npm run build`
- Manuelle Pflichtpruefungen:
  - neues Projekt mit Einreichtyp anlegen
  - Altprojekt ohne Einreichtyp laden
  - Reload, Inkognito und Zweitsitzung pruefen
  - Import/Export mit und ohne Einreichtyp pruefen
- Wichtiger technischer Hinweis:
  - wegen des bekannten lokalen Prisma-/Migrationszustands bleibt fuer spaetere Schemaaenderungen der Repo-Uebergangsworkflow mit `prisma generate` plus `prisma db push --skip-generate` relevant
