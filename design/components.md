**Komponenten-Inventar**
Alle Komponenten muessen i18n-keys fuer Labels, Titel, Tooltips und Buttons verwenden.

**Sidebar**
1. Varianten: collapsed, expanded.
2. States: default, hover, active.
3. Inhalte: Logo, Navigationseintraege mit Icon, optional Submenu.

**Topbar**
1. Inhalte: Breadcrumbs links, User/Notifications rechts.
2. States: default, sticky.

**Breadcrumbs**
1. Varianten: 2-stufig, 3-stufig.
2. Trennzeichen als Chevron.
3. Letztes Element ist nicht klickbar.

**Card**
1. Varianten: default, flat (ohne Shadow).
2. States: default, hover.
3. Verwendet fuer Container und Abschnitte.

**StatCard**
1. Varianten: icon-left, icon-top.
2. Inhalte: Icon, Label, Value.
3. State: highlight (Value in `primary`).

**Dashboard Tile**
1. Varianten: primary (gelb), neutral (grau).
2. Inhalte: Titel links, Icon rechts.
3. States: default, hover.

**Table**
1. Varianten: with-filters, compact.
2. States: default, row-hover, row-selected.
3. Slots: header, filter row, body, empty state.

**Modal**
1. Varianten: form, confirm.
2. States: open, closing.
3. Slots: header, body, footer actions.

**Button**
1. Varianten: primary, secondary, ghost.
2. Groessen: sm, md, lg.
3. States: default, hover, active, disabled, loading.

**IconButton**
1. Varianten: neutral, danger.
2. Groessen: sm, md.
3. States: default, hover, active, disabled.

**Input**
1. Varianten: text, email, password.
2. States: default, focus, error, disabled.
3. Optional: leading icon, trailing action (z.B. toggle).

**Select**
1. Varianten: single, multi.
2. States: default, focus, error, disabled.
3. Dropdown mit klare Abtrennung und `shadow-sm`.

**DateInput**
1. Varianten: single-date, range.
2. States: default, focus, error, disabled.
3. Icon rechts, Input-Format per i18n/locale.

**Badge/StatusDot**
1. Varianten: success, warning, danger, neutral.
2. Groessen: sm, md.
3. Einsatz: Tabellenstatus, Alerts, KPIs.
