**Ziel**
Dieses Dokument beschreibt die UI- und UX-Regeln fuer das Portal-Modul basierend auf den Referenz-Screens. Alle UI-Texte muessen i18n-keys verwenden, keine harten Strings in Komponenten.

**Layout**
1. Sidebar links mit fixer Breite, Icon + Label pro Eintrag.
2. Topbar im Content-Bereich mit Breadcrumbs links und Profil/Benachrichtigung rechts.
3. Hauptbereich nutzt ein helles Hintergrundgrau mit weissen Karten.
4. Content-Container mit max. Breite und seitlichem Innenabstand.
5. Page-Title oberhalb der Inhalte, Abstand nach oben und unten je eine Spacing-Einheit groesser als Standard.

**Cards**
1. Karten auf `surface`, abgerundete Ecken `radius-md` und `shadow-sm`.
2. Dashboard-Tiles sind grossflaechig, gelb, mit Icon und Titel links.
3. StatCards zeigen Icon, Label und Wert, Werte in `primary`.
4. Karten-Gruppen mit gleichmaessigem Grid und `space-6` Gutter.

**Tables**
1. Tabellenkopf in `textMuted`, Body in `text`.
2. Zeilenhoehe luftig, mind. `space-6` vertikal.
3. Zeilen haben dezente Trennlinie in `border`.
4. Actions in eigener Spalte links oder rechts, Icons als `IconButton`.
5. Tabelle immer mit Filterzeile ueber den Daten.

**Modals**
1. Modal zentriert mit `shadow-md`, `radius-lg`, `surface`.
2. Header mit Titel links und Close-Icon rechts.
3. Formulare im Modal in 2- oder 3-Spalten Grid, mit gleichmaessigen Abstaenden.
4. Primary-Action rechts unten, Secondary optional links daneben.

**Inputs**
1. Inputs haben `radius-pill`, hellen Border, und ausreichend Padding.
2. Labels oben, klein bis mittel, in `text`.
3. Placeholder in `textMuted`.
4. Focus mit `primary` Border und leichter Glow-Shadow.

**Buttons**
1. Primary-Button: `primary` Hintergrund, `primaryTextOn` Text, `radius-pill`.
2. Secondary-Button: `surface` Hintergrund, `border` Border, `text` Farbe.
3. IconButton: runder Container, Hover mit leichtem Hintergrund.
4. Button-Groessen: sm, md, lg mit konsistentem Padding.

**Spacing**
1. Basisspacing `space-4` fuer Standardabstaende.
2. Section-Abstand `space-8`.
3. Input-Gruppen `space-5` vertikal.
4. Grid-Gutter `space-6`.

**Zustaende**
1. Hover: Hintergrund leicht abdunkeln, Border leicht staerker.
2. Active: minimaler Press-Effekt, Shadow reduzieren.
3. Disabled: 40-60% Opazitaet, kein Hover.
4. Validation: `success`, `warning`, `danger` fuer Rahmen und Hilfetext.

**Tabellenaktionen**
1. Aktionen als IconButton mit Tooltip (i18n-key).
2. Reihenfolge: View, Edit, Delete.
3. Delete mit `danger` Akzent.

**Pagination**
1. Pagination zentriert am Tabellenfuss.
2. Aktive Seite als gefuellter Kreis mit `primary`.
3. Weitere Seiten als Outline oder neutral.
