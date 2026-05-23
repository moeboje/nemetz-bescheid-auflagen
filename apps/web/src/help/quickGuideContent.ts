export type QuickGuideStep = {
  title: string;
  body: string;
};

export type QuickGuideCallout = {
  title: string;
  body: string;
};

export type QuickGuidePage = {
  audienceLabel: string;
  title: string;
  subtitle: string;
  steps: QuickGuideStep[];
  important: QuickGuideCallout;
  doItems: string[];
  dontItems: string[];
  supportNote: string;
  footerNote: string;
};

export const QUICK_GUIDE_TITLE = "Nemetz Bescheid- und Auflagenportal - Kurzanleitung";

export const QUICK_GUIDE_PAGES: QuickGuidePage[] = [
  {
    audienceLabel: "Seite 1 / Interne Portalbenutzer",
    title: "Interne Portalbenutzer",
    subtitle: "Projektarbeit, Rechtsdokumente, Fristen, Aufgaben und Nachweise kompakt im Blick.",
    steps: [
      {
        title: "Anmelden und Ueberblick gewinnen",
        body: "Melde dich an und pruefe Dashboard, Aufgaben und aktuelle Hinweise."
      },
      {
        title: "Projekt oeffnen",
        body: "Suche das Projekt und lies Uebersicht, Beteiligte, Zugriff und Arbeitskontext."
      },
      {
        title: "Rechtsdokumente und Unterlagen pruefen",
        body: "Oeffne aktive Rechtsdokumente, Kurzbeschreibung, Details und zugehoerige Dateien."
      },
      {
        title: "Fristen und Aufgaben bearbeiten",
        body: "Erledige faellige Arbeit nur, wenn Status, Projektbezug und Berechtigung passen."
      },
      {
        title: "Nachweise hochladen",
        body: "Lade erforderliche Fotos, Dokumente oder Berichte serverseitig hoch und pruefe Datei fehlt Hinweise."
      }
    ],
    important: {
      title: "Wichtig",
      body: "Rolle und Projektzugriff bestimmen, was du sehen, bearbeiten, abschliessen oder wieder oeffnen darfst."
    },
    doItems: [
      "Projekt, Rechtsdokument, Frist oder Aufgabe vor dem Speichern pruefen.",
      "Pflichtnachweise direkt im Abschluss hochladen.",
      "Support mit Bereich, Zeitpunkt und kurzer Beschreibung kontaktieren."
    ],
    dontItems: [
      "Keine Passwoerter, Tokens, Reset-Links oder vertraulichen Screenshots weitergeben.",
      "FILE_MISSING oder alte Browser-Anhaenge nicht als gueltigen Nachweis behandeln.",
      "Import-, Reset- oder Recovery-Wege nicht ungeprueft verwenden."
    ],
    supportNote:
      "Bei fachlichen Fragen hilft die Projektverantwortung. Bei Rollen-, Login- oder Zugriffsfragen hilft ein interner Admin.",
    footerNote: "Interne Benutzer arbeiten mit Portalrollen, Projektzugriff und geschuetzten Dokumentpfaden."
  },
  {
    audienceLabel: "Seite 2 / Externe Portalbenutzer",
    title: "Externe Portalbenutzer",
    subtitle: "Eingeschraenkter Portalzugang fuer die jeweils vorgesehenen Bereiche.",
    steps: [
      {
        title: "Anmelden",
        body: "Nutze dein persoenliches Konto und, falls aktiv, MFA oder Recovery-Code."
      },
      {
        title: "Vorgesehene Bereiche pruefen",
        body: "Nach dem Login siehst du nur Bereiche, die fuer deinen Zugang vorgesehen sind."
      },
      {
        title: "Fehlende Inhalte melden",
        body: "Wenn Projekte, Dokumente oder Aktionen fehlen, kontaktiere deine interne Ansprechperson."
      },
      {
        title: "Unterlagen abstimmen",
        body: "Stelle Nachweise oder Unterlagen aktuell ueber den abgestimmten internen Prozess bereit."
      },
      {
        title: "Rueckfragen stellen",
        body: "Melde fehlenden Zugriff, blockierte Aktionen oder fachliche Unklarheiten an deine Nemetz-Ansprechperson."
      }
    ],
    important: {
      title: "Wichtig",
      body: "Externer Zugriff ist rollen- und projektbezogen. Nicht sichtbare Aktionen oder 403-Blockaden sind in der Regel erwartetes Berechtigungsverhalten."
    },
    doItems: [
      "Nur die fuer deinen Zugang vorgesehenen Portalbereiche verwenden.",
      "Nachweise oder Unterlagen ueber den abgestimmten internen Prozess bereitstellen.",
      "Bei fehlendem Zugriff Projekt, Bereich und Zeitpunkt nennen."
    ],
    dontItems: [
      "Keine Admin-Funktionen erwarten oder anfordern, wenn sie nicht vorgesehen sind.",
      "Keine Aufgabenabschluesse, Nachweis-Uploads oder Dokumentdownloads im Portal erwarten, wenn die Aktion nicht sichtbar ist.",
      "Keine Passwoerter, MFA-Codes, Reset-Links oder Tokens weitergeben.",
      "Keine sensiblen Inhalte in Screenshots mitsenden."
    ],
    supportNote:
      "Bei Fragen zu Inhalt, Frist oder Nachweisumfang kontaktiere deine Nemetz-Ansprechperson. Aufgabenabschluss und Nachweisverwaltung erfolgen derzeit durch berechtigte interne Benutzer.",
    footerNote: "Die Kurzanleitung enthaelt keine personenbezogenen Daten und keinen Live-Datenexport."
  }
];
