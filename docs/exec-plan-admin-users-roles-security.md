# Admin Users, Rollen und Sicherheit

## Zielbild
- Persoenliche Kontofuehrung und persoenliche Kontosicherheit laufen ueber einen einheitlichen Konto-Einstieg in der Topbar.
- Admin-Benutzerverwaltung, Rollenverwaltung und globale Sicherheit bleiben fachlich getrennt im Admin-Bereich.
- Serverseitige Permission Checks bleiben die massgebliche Autorisierungsschicht.
- Bestehende serverseitige Auth-, Session-, MFA- und Rollenstrukturen werden erweitert, nicht ersetzt.

## Ist-Zustand im Repository
- Persoenliche Kontosicherheit existiert bereits als `SecuritySettingsPage` mit Passwortwechsel, Passwort-Policy und eigenem MFA-Setup.
- Admin-Benutzerverwaltung existiert bereits serverseitig und im UI fuer Anlegen, Bearbeiten, Rollenwechsel, Typ intern/extern, Passwort-Reset, `mustChangePassword`, Unlock und MFA-Reset.
- Admin-Rollenverwaltung existiert bereits serverseitig inkl. `permissionsJson`, war im UI aber bisher weitgehend auf Rollen-Stammdaten reduziert.
- Admin-Sicherheit existiert bereits fuer Passwortregeln, Lockout, Session-TTL, `allowExternalUsers`, Status und Audit-Uebersicht.
- In der Topbar gab es bisher einen separaten Button `Kontosicherheit` und kein eigentliches Konto-Menue.

## Zielnavigation
- Klick auf Benutzername/User-Karte oeffnet ein Konto-Menue.
- Konto-Menue enthaelt mindestens:
  - `Mein Konto`
  - `Kontosicherheit`
  - `Abmelden`
- Persoenliche Konto-Routen:
  - `/compliance/account`
  - `/compliance/account/security`
- Bisherige Route `/compliance/settings/security` bleibt als Redirect auf `/compliance/account/security` erhalten.
- Admin-Routen bleiben:
  - `/compliance/admin/users`
  - `/compliance/admin/roles`
  - `/compliance/admin/security`

## Fachliche Trennung
### Mein Konto
- Zeigt nur den aktuell angemeldeten Benutzer.
- Enthaelt persoenliche Profilinformationen, letzte Anmeldung und eigene Sicherheitszusammenfassung.
- Enthaelt keine Fremdverwaltung.

### Kontosicherheit
- Bleibt Self-Service fuer das eigene Konto.
- Enthaelt Passwortwechsel, Passwort-Policy und eigenes MFA.
- Spaetere Themen wie eigene Sessions oder weitere MFA-Methoden bleiben moegliche Ausbaustufen.

### Admin > Benutzer
- Verwaltet andere Benutzer.
- Deckt Anlegen, Bearbeiten, Rollen, intern/extern, externe Organisation, Archivieren, Reaktivieren, Initialpasswort/Reset, `mustChangePassword`, Unlock und MFA-Reset ab.
- Zeigt sicherheitsrelevante Metadaten wie letzte Anmeldung, MFA-Status und Fehlversuche.

### Admin > Rollen
- Zeigt Rollen, Systemrollenschutz und Permission-Bundles.
- Systemrollen bleiben geschuetzt.
- Custom Roles koennen im bestehenden Modell ueber `permissionsJson` verwaltet werden.

### Admin > Sicherheit
- Verwaltet globale Passwort-, Lockout-, Session- und External-User-Regeln.
- Zeigt Sicherheitsstatus und Audit-Ereignisse.
- Persoenliche Kontosicherheit wird bewusst nicht hier abgelegt.

## Rollen- und Berechtigungsmodell
- Pflichtrollen:
  - `ADMIN`
  - `COMPLIANCE_MANAGER`
  - `COMPLIANCE_EDITOR`
  - `READ_ONLY`
  - `EXTERNAL`
- Legacy-Rollen bleiben nur fuer Kompatibilitaet erhalten.
- Systemrollen bleiben gegen Key-Aenderung, Permission-Aenderung und Archivierung geschuetzt.
- Der letzte aktive interne Admin darf nicht demotet, archiviert oder anderweitig entfernt werden.

## Passwort- und Initialpasswort-Konzept
- Kein bekanntes Default-Passwort.
- Zulaessige Admin-Modi:
  - Reset-/Einladungslink
  - temporaeres Passwort manuell setzen
  - temporaeres Passwort sicher generieren
- Manuell oder generiert gesetzte Initialpasswoerter setzen immer `mustChangePassword`.
- Generierte oder manuell gesetzte temporaere Passwoerter werden nur einmalig angezeigt.
- Passwort-Policy kommt aus den globalen Security Settings.
- Keine Passwort-Hashes im Frontend, Export oder UI.

## Serverseitige Durchsetzung
- Admin-Unterbereiche werden zusaetzlich zu `admin.access` mit fachlichen Permissions abgesichert:
  - `users.view` / `users.manage`
  - `roles.view` / `roles.manage`
  - `security.view` / `security.manage`
- Read-only und externe Benutzer duerfen nicht nur im UI eingeschraenkt werden, sondern muessen serverseitig 403 erhalten, wenn sie unzulaessige Endpunkte aufrufen.
- `allowExternalUsers` bleibt ein globaler Schalter mit serverseitiger Wirkung.

## Nicht-Ziele
- Keine komplette IAM-Plattform.
- Kein Portal-Relaunch.
- Keine neue Persistenzphase.
- Keine Entra-Vollintegration in diesem Schritt.
- Keine E-Mail-Zustellung von Passwoertern oder Links in diesem Schritt.
- Keine Anzeige oder Speicherung von Passwort-Hashes.

## Verifikation
- API-Build
- Web-Build
- Smoke-Checks fuer:
  - Konto-Menue und Redirect von alter Security-Route
  - persoenliche Kontosicherheit fuer Nicht-Admins
  - Admin-Benutzerverwaltung
  - Rollenverwaltung inkl. Permission-Bundles
  - globale Security Settings
  - letzter Admin Schutz
  - Passwort-Reset / Initialpasswort / `mustChangePassword`

## Fortschreibung 2026-04-19
- Admin-Passwortreset bleibt auf dem bestehenden Endpunkt `POST /api/admin/users/:id/reset-password`.
- Keine neue Permission eingefuehrt; Reset bleibt an `admin.access` plus `users.manage` gekoppelt.
- Der Admin-Reset invalidiert jetzt zusaetzlich offene `PasswordResetToken`s des Zielbenutzers.
- Self-Reset ueber den Admin-Endpunkt ist serverseitig und im UI blockiert; eigene Passwortaenderungen bleiben Self-Service unter Kontosicherheit.
- Die Admin-User-Liste liefert die bereits im UI benoetigten Sicherheitsfelder `mustChangePassword`, `failedLoginCount` und `lastPasswordResetAt` konsistent aus der API.
- Die Admin-Users-UI zeigt den Reset weiter als separate Sicherheitsaktion, ergaenzt um Policy-Hinweis, Ziel-E-Mail und klarere deutsche Fehlertexte fuer Policy-/Placeholder-Verstoesse.
