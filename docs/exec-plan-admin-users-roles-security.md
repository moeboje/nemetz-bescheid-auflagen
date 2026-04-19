# Admin Users, Rollen und Sicherheit

## Ziel
- Ausbau der serverseitig gestuetzten Admin-Benutzerverwaltung, Rollen, Berechtigungen und Sicherheitseinstellungen.
- Trennung zwischen globaler Admin-Sicherheit und persoenlicher Kontosicherheit.
- Keine UX-Neugestaltung ausserhalb der betroffenen Admin-/Security-Flaechen.

## Umsetzungsschwerpunkte
- Feste Rollen und serverseitig durchgesetzte Permission-Bundles.
- Erweiterte Admin-Benutzerverwaltung inkl. temporaerer Passwoerter, `mustChangePassword`, MFA-Status und Sperrverwaltung.
- Admin-Sicherheitsbereich fuer globale Lockout-/Session-/Passwort-Regeln und Sicherheitsstatus.
- Persoenliche Kontosicherheit fuer Passwortwechsel und eigenes MFA.

## Leitplanken
- Kein localStorage- oder Snapshot-Backslide.
- Keine Secrets oder Hashes im Frontend.
- Keine bekannte Default-Passwoerter.
- Bestehende Auth-/Session-/MFA-/Entra-Struktur nur additiv erweitern.
- Bereits serverseitig persistierte Domaenen duerfen nicht regressieren.
