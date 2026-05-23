export type RoadmapStatus = "available" | "planned" | "exploring";

export type RoadmapItem = {
  title: string;
  body: string;
};

export type RoadmapSection = {
  status: RoadmapStatus;
  title: string;
  description: string;
  items: RoadmapItem[];
};

export const ROADMAP_SECTIONS: RoadmapSection[] = [
  {
    status: "available",
    title: "Verfuegbar / aktuell nutzbar",
    description: "Diese Bereiche stehen im Portal heute fuer berechtigte Benutzer zur Verfuegung.",
    items: [
      {
        title: "Projektuebersicht",
        body: "Projekte koennen gesucht, gefiltert, geoeffnet und im Detail mit Status, Einreichtyp, Beteiligten und Zugriff gelesen werden."
      },
      {
        title: "Rechtsdokumente",
        body: "Aktive Rechtsdokumente koennen mit Projektbezug, Kurzbeschreibung, detaillierter Beschreibung, Zusammenfassung und Folgearbeit gepflegt werden."
      },
      {
        title: "Unterlagen",
        body: "Unterlagen koennen in berechtigten Kontexten hochgeladen, in der Vorschau geoeffnet, heruntergeladen, ersetzt oder entfernt werden."
      },
      {
        title: "Fristen, Aufgaben und Nachweise",
        body: "Fristen und Aufgaben koennen angezeigt, erledigt, wieder geoeffnet und mit serverseitig gespeicherten Nachweisen dokumentiert werden."
      },
      {
        title: "Externe Benutzer",
        body: "Externe Portalbenutzer haben einen eingeschraenkten, rollen- und projektbezogenen Zugang zu den fuer sie vorgesehenen Portalbereichen."
      },
      {
        title: "Administration",
        body: "Interne Admin-Bereiche fuer Benutzer, Rollen, externe Firmen, Stammdaten, Sicherheit, Branding und Benachrichtigungen sind vorhanden."
      }
    ]
  },
  {
    status: "planned",
    title: "Geplant / in Vorbereitung",
    description: "Diese Themen sind als naechste Ausbaurichtungen vorgesehen, aber ohne feste Liefertermine.",
    items: [
      {
        title: "Bessere Hilfetexte und Onboarding",
        body: "Weitere kurze Anleitungen, Einstiegshilfen und rollenbezogene Orientierung koennen auf dem Help Center aufbauen."
      },
      {
        title: "Benachrichtigungen und Erinnerungen",
        body: "Reminder, Uebersichten und Einstellungen koennen weiter verbessert und zielgerichteter gemacht werden."
      },
      {
        title: "Auswertungen und Reports",
        body: "Bestehende Uebersichten und Reports koennen weiter verdichtet und fuer wiederkehrende Auswertungen besser nutzbar gemacht werden."
      },
      {
        title: "UX-Verbesserungen",
        body: "Listen, Filter, Detailseiten, Upload-Flows und mobile Nutzung koennen schrittweise weiter vereinfacht werden."
      }
    ]
  },
  {
    status: "exploring",
    title: "In Pruefung / Ueberlegung",
    description: "Diese Themen werden evaluiert und brauchen separate fachliche Freigabe.",
    items: [
      {
        title: "Checklisten-Vorlagen",
        body: "Vorlagen fuer wiederkehrende Projekttypen sind angedacht. In diesem Feature wird keine Vorlage umgesetzt."
      },
      {
        title: "Paragraf-82b-Unterstuetzung",
        body: "82b-nahe Pruef- und Nachweisprozesse koennen fachlich evaluiert werden. Es wird hier keine 82b-Logik umgesetzt."
      },
      {
        title: "Dashboard-/Reporting-Erweiterungen",
        body: "Weitere Kennzahlen, Trends oder zielgruppenspezifische Sichten werden geprueft und nicht als bereits verfuegbar dargestellt."
      },
      {
        title: "Externer Self-Service",
        body: "Erweiterter Self-Service fuer externe Benutzer wird geprueft, etwa externe Nachweisabgabe, gezielte Dokumentfreigaben, externe Dokumentvorschau oder externe Aufgaben- und Rueckmeldeprozesse. Das ist abhaengig von einem Berechtigungs- und Freigabekonzept."
      },
      {
        title: "Weitere Automatisierung",
        body: "Moegliche Automatisierungen fuer Folgearbeit, Eskalationen oder Rueckfragen muessen separat gegen Berechtigungen und fachliche Verantwortung geprueft werden."
      }
    ]
  }
];

export const ROADMAP_DISCLAIMER =
  "Die Roadmap beschreibt Orientierungsrichtungen. Sie enthaelt keine verbindlichen Liefertermine, keine Implementierungszusage und keine Rechtsberatung.";
