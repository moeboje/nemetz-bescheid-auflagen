export type HelpVisibility = "public" | "authenticated" | "admin";

export type HelpArticleType =
  | "overview"
  | "workflow"
  | "step_by_step"
  | "reference"
  | "troubleshooting"
  | "submission_guidance";

export type HelpAudience =
  | "new_staff"
  | "operative_users"
  | "project_workers"
  | "admins"
  | "mobile_users"
  | "advanced_users";

export type HelpCategory = {
  slug: string;
  title: string;
  summary: string;
};

export type HelpArticleSection = {
  heading: string;
  lines: string[];
  ordered?: boolean;
};

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  articleType: HelpArticleType;
  categorySlug: string;
  visibility: HelpVisibility;
  audiences: HelpAudience[];
  tags: string[];
  searchTerms: string[];
  relatedArticleSlugs: string[];
  contextKeys: string[];
  sections: HelpArticleSection[];
};

export type HelpFaqEntry = {
  id: string;
  question: string;
  answer: string;
  visibility: HelpVisibility;
  tags: string[];
  relatedArticleSlugs: string[];
};

export type HelpGlossaryEntry = {
  term: string;
  definition: string;
  visibility: HelpVisibility;
  synonyms?: string[];
};

export type HelpQuickLink = {
  id: string;
  label: string;
  description: string;
  articleSlug: string;
  visibility: HelpVisibility;
};

export type HelpScope = "portal" | "publicAuth";

export const HELP_CONTEXT_SLUGS = {
  dashboard: "dashboard-overview",
  scopes: "scope-structure-and-master-data",
  projectsList: "projects-workspace",
  projectDetail: "project-detail-and-checklist",
  projectStatus: "project-status-and-submission-type",
  legalDocsList: "legal-documents-workspace",
  legalDocDetail: "legal-document-detail-and-follow-up",
  obligations: "obligations-and-scheduling",
  deadlines: "deadlines-and-evidence",
  tasks: "tasks-and-completion",
  documents: "documents-uploads-and-evidence",
  reports: "reports-compliance-summary-and-notifications",
  notifications: "reports-compliance-summary-and-notifications",
  adminUsers: "admin-users-and-roles",
  adminAuthorities: "admin-authorities-and-contacts",
  adminData: "export-import-recovery",
  security: "security-login-password-mfa",
  mobile: "mobile-usage-and-field-work",
  troubleshooting: "troubleshooting-common-issues",
  submissionGewerbe: "submission-help-gewerbe",
  submissionAwg: "submission-help-awg",
  submissionUvpUve: "submission-help-uvp-uve"
} as const;

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    slug: "getting-started",
    title: "Erste Schritte",
    summary: "Einloggen, Dashboard, Navigation und die wichtigsten Begriffe im Alltag."
  },
  {
    slug: "roles-permissions",
    title: "Rollen und Berechtigungen",
    summary: "Warum du bestimmte Projekte, Bereiche oder Buttons siehst oder nicht siehst."
  },
  {
    slug: "projects",
    title: "Projekte",
    summary: "Projekte anlegen, filtern, bearbeiten und mit Status, Einreichtyp und Zugriff pflegen."
  },
  {
    slug: "project-detail-tabs",
    title: "Projekt-Detailseite und Tabs",
    summary: "Alle Projekt-Tabs und die wichtigsten Aktionen im Projekt erklaert."
  },
  {
    slug: "legal-documents",
    title: "Rechtsdokumente",
    summary: "Aktive Bescheide und andere Rechtsdokumente erfassen und nachverfolgen."
  },
  {
    slug: "legacy-decisions",
    title: "Altbescheide",
    summary: "Historische Bescheide dokumentieren, pruefen und von aktiven Pflichten trennen."
  },
  {
    slug: "obligations",
    title: "Auflagen",
    summary: "Auflagen mit Verantwortlichen, Wiederholung, Erinnerungen und Nachweisen verwalten."
  },
  {
    slug: "deadlines",
    title: "Fristen",
    summary: "Fristen anlegen, abschliessen, wieder oeffnen und Erinnerungen verstehen."
  },
  {
    slug: "tasks-evidence",
    title: "Aufgaben und Nachweise",
    summary: "Offene Arbeit erledigen und Nachweise wie Fotos, Dokumente oder Berichte hinterlegen."
  },
  {
    slug: "external-users",
    title: "Externe Firmen und externe Benutzer",
    summary: "Organisationen, externe Portalzugange und eingeschraenkten Projektzugriff einordnen."
  },
  {
    slug: "admin-area",
    title: "Admin-Bereich",
    summary: "Benutzer, Rollen, externe Firmen, Behoerden, Sicherheit und Admin-Aktionen."
  },
  {
    slug: "notifications-email",
    title: "Benachrichtigungen und E-Mails",
    summary: "In-App-Hinweise, E-Mail-Versand, PowerAutomate, Dry-Run und Versandstatus."
  },
  {
    slug: "export-recovery",
    title: "Export, Import und Wiederherstellung",
    summary: "Teil-Export, gesperrte Import-/Reset-Wege und sicheres Vorgehen bei Recovery."
  },
  {
    slug: "account-security",
    title: "Mein Konto und Sicherheit",
    summary: "Eigenes Passwort, MFA, Recovery-Codes und sichere Anmeldung."
  },
  {
    slug: "mobile",
    title: "Mobile Nutzung",
    summary: "Portal am Smartphone oder Tablet nutzen, ohne Desktop-Arbeiten zu verwechseln."
  },
  {
    slug: "faq",
    title: "Haeufige Fragen",
    summary: "Kurze Antworten auf typische Fragen und Probleme."
  }
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "portal-overview-and-first-steps",
    title: "Portalueberblick und erste Schritte",
    summary: "So findest du dich nach dem Login zurecht und verstehst, wie die wichtigsten Bereiche zusammenhaengen.",
    articleType: "overview",
    categorySlug: "getting-started",
    visibility: "authenticated",
    audiences: ["new_staff", "operative_users", "project_workers", "mobile_users"],
    tags: ["Einstieg", "Dashboard", "Navigation", "Portal"],
    searchTerms: ["erste schritte", "login", "dashboard", "navigation", "wo anfangen"],
    relatedArticleSlugs: [
      "roles-and-project-permissions",
      "projects-workspace",
      "dashboard-overview"
    ],
    contextKeys: ["dashboard", "projectsList"],
    sections: [
      {
        heading: "Wofuer ist das Portal gedacht?",
        lines: [
          "Das Portal hilft dabei, Projekte, Bescheide, Rechtsdokumente, Auflagen, Fristen, Aufgaben, Nachweise und Beteiligte an einer Stelle zu verwalten.",
          "Du siehst nur Bereiche, Projekte und Aktionen, fuer die du berechtigt bist."
        ]
      },
      {
        heading: "So startest du",
        lines: [
          "Melde dich an und oeffne danach das Dashboard.",
          "Nutze das Hauptmenue links, um zu Projekten, Rechtsdokumenten, Auflagen, Fristen, Aufgaben, Reports oder Admin-Bereichen zu wechseln.",
          "Nutze Suche und Filter in Listen, wenn du ein Projekt, Dokument oder eine Aufgabe schneller finden moechtest.",
          "Oeffne ein Projekt, wenn du die zugehoerigen Rechtsdokumente, Fristen, Unterlagen, Altbescheide, Auflagen oder Beteiligten sehen moechtest."
        ],
        ordered: true
      },
      {
        heading: "Wenn etwas fehlt",
        lines: [
          "Wenn du ein Projekt oder eine Aktion nicht siehst, liegt das meistens an deinen Berechtigungen.",
          "Bitte einen Admin oder Projektverantwortlichen, Rolle und Projektzugriff zu pruefen.",
          "Ein fehlender Button bedeutet meistens, dass du die Aktion ansehen, aber nicht selbst ausfuehren darfst."
        ]
      },
      {
        heading: "Wichtige Begriffe",
        lines: [
          "Ein Projekt ist der Arbeitsrahmen fuer ein Vorhaben oder Verfahren.",
          "Ein Rechtsdokument ist ein aktiver Bescheid, eine Genehmigung oder ein vergleichbares Dokument.",
          "Ein Altbescheid ist historische Dokumentation und erzeugt keine aktiven Pflichten automatisch.",
          "Eine Auflage beschreibt eine Pflicht aus einem Rechtsdokument.",
          "Eine Frist ist ein konkreter Termin. Eine Aufgabe ist die operative Arbeit, die erledigt werden muss.",
          "Ein Nachweis ist ein Foto, Dokument, Bericht oder anderer Beleg zum Abschluss."
        ]
      }
    ]
  },
  {
    slug: "dashboard-overview",
    title: "Dashboard nutzen",
    summary: "Das Dashboard zeigt dir schnell, wo offene Arbeit, ueberfaellige Aufgaben und wichtige Hinweise liegen.",
    articleType: "overview",
    categorySlug: "getting-started",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "mobile_users"],
    tags: ["Dashboard", "Aufgaben", "Fristen", "Benachrichtigungen"],
    searchTerms: ["dashboard", "ueberfaellig", "offene aufgaben", "kennzahlen"],
    relatedArticleSlugs: ["tasks-and-completion", "deadlines-and-evidence"],
    contextKeys: ["dashboard"],
    sections: [
      {
        heading: "Was zeigt das Dashboard?",
        lines: [
          "Du siehst offene Aufgaben, ueberfaellige Arbeit, anstehende Fristen und aktuelle Hinweise.",
          "Das Dashboard ist fuer den schnellen Ueberblick gedacht. Die eigentliche Bearbeitung passiert in den Detailseiten."
        ]
      },
      {
        heading: "So arbeitest du damit",
        lines: [
          "Starte am Dashboard, wenn du priorisieren moechtest.",
          "Oeffne danach die passende Aufgabe, Frist oder das passende Projekt.",
          "Pruefe bei unerwarteten Zahlen immer auch Filter, Zeitraum und archivierte Eintraege in der Zielansicht."
        ],
        ordered: true
      }
    ]
  },
  {
    slug: "roles-and-project-permissions",
    title: "Rollen, Berechtigungen und Projektzugriff",
    summary: "Rollen bestimmen, was du grundsaetzlich darfst. Projektzugriff bestimmt, fuer welche Projekte das gilt.",
    articleType: "reference",
    categorySlug: "roles-permissions",
    visibility: "authenticated",
    audiences: ["new_staff", "operative_users", "project_workers", "admins"],
    tags: ["Rollen", "Berechtigungen", "Projektzugriff", "Externe Benutzer"],
    searchTerms: ["berechtigung", "zugriff", "rolle", "projekt fehlt", "button fehlt"],
    relatedArticleSlugs: [
      "project-access-management",
      "external-orgs-and-users",
      "admin-users-and-roles"
    ],
    contextKeys: ["projectsList", "projectDetail"],
    sections: [
      {
        heading: "Das Grundprinzip",
        lines: [
          "Jeder Benutzer hat eine Rolle. Diese Rolle legt fest, welche Bereiche und Aktionen grundsaetzlich erlaubt sind.",
          "Zusaetzlich kann ein Benutzer Zugriff auf einzelne Projekte bekommen.",
          "Projektzugriff allein reicht nicht immer aus. Wenn die Rolle einen Fachbereich nicht erlaubt, bleibt dieser Bereich trotzdem verborgen oder nur lesbar."
        ]
      },
      {
        heading: "Was wird ausgeblendet?",
        lines: [
          "Projekte ohne Zugriff werden nicht angezeigt.",
          "Dazu gehoerende Rechtsdokumente, Altbescheide, Auflagen, Fristen, Aufgaben, Dokumente und Kommentare werden ebenfalls nicht angezeigt.",
          "Archivierte Projekte koennen fuer normale Benutzer ausgeblendet sein, auch wenn sie frueher sichtbar waren."
        ]
      },
      {
        heading: "Typische Zugriffsebenen",
        lines: [
          "Projekt ansehen bedeutet: Das Projekt und freigegebene Projektinhalte lesen.",
          "Projekt bearbeiten bedeutet: Im Projekt Inhalte bearbeiten, wenn die Rolle den jeweiligen Fachbereich erlaubt.",
          "Externer Projektzugriff bedeutet: Eine externe Person sieht nur ausdruecklich freigegebene Projektinhalte.",
          "Externe Ausfuehrende koennen fuer Aufgaben oder Durchfuehrung eingebunden sein, sehen aber nicht automatisch das ganze Portal."
        ]
      },
      {
        heading: "Beispiele",
        lines: [
          "Ein Benutzer mit Leserecht fuer Projekte sieht nur Projekte, die ihm zugewiesen wurden.",
          "Ein Bearbeiter kann nur in freigegebenen Projekten arbeiten und nur dort, wo seine Rolle Bearbeitung erlaubt.",
          "Ein externer Benutzer sieht nur freigegebene Inhalte und keine internen Admin- oder Gesamtlisten."
        ]
      }
    ]
  },
  {
    slug: "scope-structure-and-master-data",
    title: "Companies, Standorte und Anlagen",
    summary: "Scopes helfen dir, Projekte und Dokumente dem richtigen Unternehmen, Standort und der richtigen Anlage zuzuordnen.",
    articleType: "reference",
    categorySlug: "projects",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "admins"],
    tags: ["Scope", "Company", "Standort", "Anlage"],
    searchTerms: ["scope", "company", "standort", "anlage", "stammdaten"],
    relatedArticleSlugs: ["projects-workspace", "admin-authorities-and-contacts"],
    contextKeys: ["scopes"],
    sections: [
      {
        heading: "Wofuer ist der Scope da?",
        lines: [
          "Der Scope besteht aus Company, Standort und optional Anlage.",
          "Viele Listen und Reports nutzen diese Zuordnung, damit du nach dem richtigen Bereich filtern kannst."
        ]
      },
      {
        heading: "So verwendest du ihn",
        lines: [
          "Lege zuerst die Company an.",
          "Lege darunter den Standort an.",
          "Lege eine Anlage nur an, wenn das Projekt oder Dokument wirklich anlagenbezogen ist.",
          "Pruefe nach Aenderungen, ob betroffene Projekte noch richtig zugeordnet sind."
        ],
        ordered: true
      }
    ]
  },
  {
    slug: "projects-workspace",
    title: "Projekte anlegen und bearbeiten",
    summary: "Ein Projekt ist der Arbeitsrahmen fuer Rechtsdokumente, Altbescheide, Auflagen, Fristen, Aufgaben und Beteiligte.",
    articleType: "workflow",
    categorySlug: "projects",
    visibility: "authenticated",
    audiences: ["project_workers", "operative_users", "advanced_users"],
    tags: ["Projekte", "Projektanlage", "Status", "Einreichtyp", "Beteiligte"],
    searchTerms: ["projekt", "projekt anlegen", "projekt bearbeiten", "owner", "teilnehmer"],
    relatedArticleSlugs: [
      "project-status-and-submission-type",
      "project-detail-and-checklist",
      "project-access-management"
    ],
    contextKeys: ["projectsList"],
    sections: [
      {
        heading: "Was ist ein Projekt?",
        lines: [
          "Ein Projekt buendelt den fachlichen Vorgang mit Scope, Behoerde, Ansprechpartnern, Verantwortlichen und Beteiligten.",
          "Rechtsdokumente, Altbescheide, Auflagen und Fristen werden im Portal ueber das Projekt zusammengefuehrt."
        ]
      },
      {
        heading: "Projektliste",
        lines: [
          "In der Projektliste kannst du nach Suche, Company, Standort, Anlage, Behoerde, Status, Einreichtyp und archivierten Projekten filtern.",
          "Die Liste zeigt wichtige Projektdaten, Status, Einreichtyp, Behoerde, Verantwortliche und Aufgabenlage.",
          "Ob du ein Projekt anlegen, bearbeiten, archivieren oder wiederherstellen darfst, haengt von Rolle und Projektzugriff ab."
        ]
      },
      {
        heading: "Projekt anlegen",
        lines: [
          "Vergib einen klaren Titel.",
          "Waehle Status und Einreichtyp.",
          "Nutze die detaillierte Beschreibung fuer Zweck, Umfang und fachlichen Inhalt des Projekts.",
          "Ordne Company, Standort und bei Bedarf Anlage zu.",
          "Waehle Behoerde und Kontakt, wenn sie bekannt sind.",
          "Setze Verantwortliche, Stellvertretung, interne Beteiligte und bei Bedarf externe Beteiligte.",
          "Ergaenze Abhaengigkeiten oder Referenzdokumente nur, wenn sie fachlich wirklich passen."
        ],
        ordered: true
      },
      {
        heading: "Warum sehe ich ein Projekt nicht?",
        lines: [
          "Meist fehlt der Projektzugriff oder die passende Rolle.",
          "Bitte einen Admin oder Projektverantwortlichen, den Zugriff im Projekt oder in der Benutzerverwaltung zu pruefen."
        ]
      }
    ]
  },
  {
    slug: "project-status-and-submission-type",
    title: "Projektstatus und Einreichtyp",
    summary: "Status, Einreichtyp und Archivierung bedeuten unterschiedliche Dinge und sollten nicht vermischt werden.",
    articleType: "reference",
    categorySlug: "projects",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users", "admins"],
    tags: ["Projektstatus", "Einreichtyp", "Gewerbe", "AWG", "UVP/UVE"],
    searchTerms: ["status", "einreichtyp", "gewerbe", "awg", "uvp", "uve"],
    relatedArticleSlugs: [
      "projects-workspace",
      "submission-help-gewerbe",
      "submission-help-awg",
      "submission-help-uvp-uve"
    ],
    contextKeys: ["projectStatus"],
    sections: [
      {
        heading: "Projektstatus",
        lines: [
          "Der Status beschreibt, wo das Projekt fachlich steht, zum Beispiel Entwurf, Vorbereitung, eingereicht oder abgeschlossen.",
          "Der Status ist keine Berechtigung und keine Archivierung."
        ]
      },
      {
        heading: "Einreichtyp",
        lines: [
          "Der Einreichtyp beschreibt den fachlichen Kontext: Gewerbe, AWG oder UVP/UVE.",
          "Der Einreichtyp hilft, Projekte, Checklisten und Einreichlogik richtig einzuordnen."
        ]
      },
      {
        heading: "Archivierung",
        lines: [
          "Archivieren nimmt ein Projekt aus der aktiven Arbeit heraus.",
          "Beim Archivieren kann je nach Ansicht auch abgefragt werden, ob zugehoerige Rechtsdokumente, Auflagen und Fristen mit archiviert werden sollen.",
          "Archivieren ersetzt nicht den fachlich richtigen Projektstatus."
        ]
      }
    ]
  },
  {
    slug: "project-detail-and-checklist",
    title: "Projekt-Detailseite und Tabs",
    summary: "Die Projekt-Detailseite zeigt alle wichtigen Projektinformationen und die verknuepften Arbeitsbereiche.",
    articleType: "reference",
    categorySlug: "project-detail-tabs",
    visibility: "authenticated",
    audiences: ["project_workers", "operative_users", "advanced_users"],
    tags: ["Projektdetail", "Tabs", "Checkliste", "Altbescheide", "Zugriff"],
    searchTerms: ["projektdetail", "tab", "uebersicht", "unterlagen", "altbescheide", "zugriff"],
    relatedArticleSlugs: [
      "legal-documents-workspace",
      "legacy-decisions",
      "obligations-and-scheduling",
      "project-access-management"
    ],
    contextKeys: ["projectDetail"],
    sections: [
      {
        heading: "Uebersicht",
        lines: [
          "Hier siehst du die wichtigsten Projektdaten: Status, Einreichtyp, Scope, Behoerde, Kontakt, Verantwortliche, Stellvertretung, Projektbeschreibung und Projektbeziehungen.",
          "Wenn naechste Fristen oder Aufgaben angezeigt werden, dienen sie als schneller Hinweis auf aktuelle Arbeit."
        ]
      },
      {
        heading: "Rechtsdokumente",
        lines: [
          "Hier liegen die aktiven Rechtsdokumente des Projekts.",
          "Du kannst ein Rechtsdokument oeffnen, bearbeiten oder neu anlegen, wenn du die passende Berechtigung hast."
        ]
      },
      {
        heading: "Fristen",
        lines: [
          "Hier findest du Fristen mit Projektbezug.",
          "Du kannst Fristen anlegen, bearbeiten, abschliessen oder wieder oeffnen, wenn deine Berechtigung das erlaubt."
        ]
      },
      {
        heading: "Unterlagen",
        lines: [
          "Hier werden Dateien und Dokumente direkt am Projekt abgelegt.",
          "Unterlagen sind nicht dasselbe wie Altbescheide. Altbescheide haben einen eigenen Tab und eigene Angaben."
        ]
      },
      {
        heading: "Altbescheide",
        lines: [
          "Hier dokumentierst du historische Bescheide.",
          "Altbescheide erzeugen keine aktiven Auflagen, Fristen oder Aufgaben automatisch."
        ]
      },
      {
        heading: "Auflagen",
        lines: [
          "Dieser Tab zeigt Auflagen aus den Rechtsdokumenten des Projekts.",
          "Du kannst hier eine neue Auflage anlegen, wenn mindestens ein aktives Rechtsdokument vorhanden ist und du schreiben darfst.",
          "Wenn kein aktives Rechtsdokument vorhanden ist, lege zuerst ein Rechtsdokument an."
        ]
      },
      {
        heading: "Beteiligte, Checkliste, Zugriff, Notizen und Historie",
        lines: [
          "Beteiligte zeigt interne Beteiligte und externe Beteiligte wie Firmen oder Ansprechpartner.",
          "Die Checkliste ist sichtbar, wenn die Projektcheckliste aktiviert ist.",
          "Zugriff ist nur fuer berechtigte Admins oder Benutzerverwalter sichtbar und steuert explizite Projektfreigaben.",
          "Notizen und Historie helfen bei Nachvollziehbarkeit und Abstimmung."
        ]
      },
      {
        heading: "Praxisbeispiel",
        lines: [
          "Du willst eine neue Auflage zu einem Projekt erfassen? Oeffne das Projekt, gehe auf Auflagen und klicke auf Auflage anlegen. Wenn der Button fehlt, pruefe Berechtigung und aktives Rechtsdokument."
        ]
      }
    ]
  },
  {
    slug: "project-access-management",
    title: "Projektzugriff verwalten",
    summary: "Im Zugriff-Tab wird festgelegt, welche Benutzer ein Projekt sehen oder bearbeiten duerfen.",
    articleType: "step_by_step",
    categorySlug: "roles-permissions",
    visibility: "admin",
    audiences: ["admins", "advanced_users"],
    tags: ["Projektzugriff", "Benutzer", "Admin", "Externe Benutzer"],
    searchTerms: ["projektzugriff", "zugriff tab", "benutzer hinzufuegen", "zugriff entfernen"],
    relatedArticleSlugs: ["roles-and-project-permissions", "admin-users-and-roles"],
    contextKeys: ["projectDetail", "adminUsers"],
    sections: [
      {
        heading: "Wer sieht den Tab?",
        lines: [
          "Der Zugriff-Tab ist nur sichtbar, wenn du Benutzer verwalten darfst und nicht als externer Benutzer angemeldet bist.",
          "Normale Bearbeiter sehen den Tab nicht, auch wenn sie im Projekt arbeiten duerfen."
        ]
      },
      {
        heading: "Zugriff vergeben",
        lines: [
          "Oeffne das Projekt und den Tab Zugriff.",
          "Waehle den Benutzer aus.",
          "Waehle eine passende Zugriffsebene.",
          "Ergaenze bei Bedarf eine Notiz.",
          "Speichere die Freigabe."
        ],
        ordered: true
      },
      {
        heading: "Zugriff entfernen",
        lines: [
          "Explizit vergebener Zugriff kann entfernt werden.",
          "Impliziter Zugriff, zum Beispiel ueber Owner, Stellvertretung oder interne Beteiligung, wird als solcher angezeigt und nicht wie eine normale Freigabe entfernt."
        ]
      }
    ]
  },
  {
    slug: "legal-documents-workspace",
    title: "Rechtsdokumente",
    summary: "Rechtsdokumente sind aktive fachliche Dokumente wie Bescheide, Genehmigungen oder vergleichbare Unterlagen.",
    articleType: "workflow",
    categorySlug: "legal-documents",
    visibility: "authenticated",
    audiences: ["project_workers", "operative_users", "advanced_users"],
    tags: ["Rechtsdokumente", "Bescheid", "Genehmigung", "Auflagen", "Fristen"],
    searchTerms: ["rechtsdokument", "bescheid", "genehmigung", "aktenzeichen", "dokument anlegen"],
    relatedArticleSlugs: [
      "legal-document-detail-and-follow-up",
      "legacy-decisions",
      "obligations-and-scheduling"
    ],
    contextKeys: ["legalDocsList"],
    sections: [
      {
        heading: "Was ist ein Rechtsdokument?",
        lines: [
          "Ein Rechtsdokument ist ein aktives Dokument mit Projektbezug, aus dem Auflagen oder Fristen entstehen koennen.",
          "Es unterscheidet sich vom Altbescheid: Ein Altbescheid ist historische Dokumentation und nicht automatisch aktiv."
        ]
      },
      {
        heading: "Rechtsdokumentliste",
        lines: [
          "Du kannst nach Suche, Typ, Projekt, Scope und archivierten Eintraegen filtern.",
          "Ein Dokument kann fehlen, wenn du keinen Projektzugriff hast, kein Leserecht fuer Rechtsdokumente hast oder das Dokument archiviert ist."
        ]
      },
      {
        heading: "Rechtsdokument anlegen",
        lines: [
          "Waehle ein Projekt aus.",
          "Pflege Titel, Typ, Referenz oder Aktenzeichen und relevante Datumsangaben.",
          "Ergaenze Kurzbeschreibung, detaillierte Beschreibung und Zusammenfassung, wenn diese fachlich vorliegen.",
          "Fuelle die im Formular sichtbaren Felder aus.",
          "Zusaetzliche Angaben aus einer AI-Pruefung erscheinen nur im entsprechenden Pruefflow.",
          "Lade Unterlagen hoch, wenn sie zum Dokument gehoeren.",
          "Lege daraus nur fachlich gepruefte Auflagen oder Fristen an."
        ],
        ordered: true
      },
      {
        heading: "Archivieren und Wiederherstellen",
        lines: [
          "Archivieren nimmt ein Rechtsdokument aus der aktiven Arbeit.",
          "Beim Archivieren kann je nach Ansicht auch abgefragt werden, ob zugehoerige Auflagen und Fristen mit archiviert werden sollen.",
          "Wiederherstellen ist nur sichtbar, wenn du die passende Berechtigung hast."
        ]
      }
    ]
  },
  {
    slug: "legal-document-detail-and-follow-up",
    title: "Rechtsdokument-Detailseite",
    summary: "Die Detailseite zeigt Uebersicht, Auflagen, Fristen, Unterlagen, Notizen und Historie eines Rechtsdokuments.",
    articleType: "reference",
    categorySlug: "legal-documents",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["Rechtsdokument Detail", "Auflagen", "Fristen", "Unterlagen", "Historie"],
    searchTerms: ["rechtsdokument detail", "dokument tabs", "auflagen am dokument", "fristen am dokument"],
    relatedArticleSlugs: ["legal-documents-workspace", "obligations-and-scheduling", "deadlines-and-evidence"],
    contextKeys: ["legalDocDetail"],
    sections: [
      {
        heading: "Tabs",
        lines: [
          "Uebersicht zeigt die wichtigsten Dokumentdaten, Projektbezug, Scope, Behoerde, Datumsangaben, detaillierte Beschreibung und Zusammenfassung.",
          "Auflagen zeigt Auflagen, die zu diesem Rechtsdokument gehoeren.",
          "Fristen zeigt dokumentbezogene Fristen.",
          "Unterlagen dient fuer serverseitig gespeicherte Dateien am Rechtsdokument mit Vorschau und Download.",
          "Notizen und Historie dienen der Nachvollziehbarkeit."
        ]
      },
      {
        heading: "Folgearbeit",
        lines: [
          "Lege Auflagen und Fristen nur an, wenn der Inhalt fachlich geprueft wurde.",
          "Wenn ein Dokument archiviert ist, koennen zugehoerige Inhalte je nach Ansicht weiter nachvollziehbar bleiben, sind aber nicht mehr Teil der normalen aktiven Arbeit."
        ]
      }
    ]
  },
  {
    slug: "legacy-decisions",
    title: "Altbescheide",
    summary: "Altbescheide sind historische Bescheide fuer Dokumentation und Nachvollziehbarkeit.",
    articleType: "workflow",
    categorySlug: "legacy-decisions",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users", "admins"],
    tags: ["Altbescheide", "Historische Bescheide", "Archiv", "Relevanz"],
    searchTerms: ["altbescheid", "alter bescheid", "historisch", "nur archiv", "zu pruefen"],
    relatedArticleSlugs: ["project-detail-and-checklist", "legal-documents-workspace"],
    contextKeys: ["projectDetail", "documents"],
    sections: [
      {
        heading: "Was ist ein Altbescheid?",
        lines: [
          "Altbescheide sind historische Bescheide. Sie koennen sehr alt sein und haben oft keine aktuelle Geltung mehr.",
          "Sie werden abgelegt, damit spaeter nachvollziehbar bleibt, was es frueher gab.",
          "Ein Altbescheid ist nicht automatisch ein aktives Rechtsdokument."
        ]
      },
      {
        heading: "Altbescheid erfassen",
        lines: [
          "Oeffne das Projekt und den Tab Altbescheide.",
          "Klicke auf Altbescheid hochladen.",
          "Pflege Titel, Geschaeftszahl oder Aktenzahl, Behoerde und Ausstellungsdatum.",
          "Waehle den passenden Status oder die passende Relevanz.",
          "Ergaenze eine Relevanznotiz, wenn der Bescheid nur historisch oder noch zu pruefen ist.",
          "Verknuepfe ihn nur dann mit einem aktiven Rechtsdokument, wenn das fachlich passt."
        ],
        ordered: true
      },
      {
        heading: "Status und Relevanz",
        lines: [
          "Nur Archiv bedeutet: historische Dokumentation ohne aktive Pflichten.",
          "Zu pruefen bedeutet: Inhalt muss fachlich noch bewertet werden.",
          "Teilweise relevant bedeutet: einzelne Inhalte koennen wichtig sein.",
          "Ersetzt oder nicht mehr gueltig bedeutet: der Bescheid wurde abgeloest.",
          "In aktives Rechtsdokument uebernommen bedeutet: relevante Inhalte wurden in die aktive Arbeit ueberfuehrt."
        ]
      },
      {
        heading: "Wichtiger Hinweis",
        lines: [
          "Lege aktive Auflagen oder Fristen nur an, wenn der Inhalt fachlich geprueft wurde.",
          "Fuer alte Bescheide ohne aktuelle Geltung ist meist Nur Archiv oder Ersetzt passend, mit einer Notiz wie: Nur historische Dokumentation, keine aktiven Pflichten uebernommen."
        ]
      }
    ]
  },
  {
    slug: "obligations-and-scheduling",
    title: "Auflagen",
    summary: "Auflagen beschreiben Pflichten aus Rechtsdokumenten und steuern wiederkehrende oder einmalige Arbeit.",
    articleType: "workflow",
    categorySlug: "obligations",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "advanced_users"],
    tags: ["Auflagen", "Wiederholung", "Reminder", "Nachweis", "Loeschen"],
    searchTerms: ["auflage", "wiederholung", "wiederholungsende", "externe firma", "loeschen blockiert"],
    relatedArticleSlugs: ["tasks-and-completion", "deadlines-and-evidence", "external-orgs-and-users"],
    contextKeys: ["obligations"],
    sections: [
      {
        heading: "Was ist eine Auflage?",
        lines: [
          "Eine Auflage ist eine fachliche Pflicht, die normalerweise aus einem Rechtsdokument stammt.",
          "Du kannst eine Auflage auf der Auflagenseite oder im Projekt-Tab Auflagen anlegen, wenn ein aktives Rechtsdokument vorhanden ist."
        ]
      },
      {
        heading: "Auflage anlegen",
        lines: [
          "Waehle das Rechtsdokument.",
          "Erfasse Titel, Beschreibung und Einstufung.",
          "Waehle interne Verantwortliche und bei Bedarf eine Stellvertretung.",
          "Waehle bei Bedarf eine externe Firma oder einen externen Ansprechpartner.",
          "Lege fest, ob die Auflage einmalig oder wiederkehrend ist.",
          "Setze Erinnerung am Faelligkeitstag oder x Tage vorher.",
          "Definiere Pflichtnachweise, wenn Foto, Dokument oder Bericht erforderlich sind."
        ],
        ordered: true
      },
      {
        heading: "Wiederholungsende",
        lines: [
          "Ohne Enddatum laeuft eine wiederkehrende Auflage unbefristet weiter.",
          "Mit Enddatum werden Aufgaben nur bis zu diesem Datum erzeugt.",
          "Pruefe das Enddatum besonders bei befristeten Bescheiden oder saisonalen Pflichten."
        ]
      },
      {
        heading: "Bearbeiten, archivieren und loeschen",
        lines: [
          "Bearbeiten ist nur moeglich, wenn du im Projekt schreiben darfst und deine Rolle Auflagen erlaubt.",
          "Endgueltiges Loeschen kann blockiert sein, wenn Aufgabenstatus, Nachweise oder Dokumente sowie Kommentare vorhanden sind.",
          "So verhindert das Portal Datenverlust. In solchen Faellen ist Archivieren meist der bessere Weg, wenn es dir angeboten wird."
        ]
      }
    ]
  },
  {
    slug: "deadlines-and-evidence",
    title: "Fristen",
    summary: "Fristen sind konkrete Termine mit Projekt- oder Rechtsdokumentbezug.",
    articleType: "workflow",
    categorySlug: "deadlines",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "mobile_users"],
    tags: ["Fristen", "Faelligkeit", "Reminder", "Abschliessen", "Wieder oeffnen"],
    searchTerms: ["frist", "faelligkeit", "reminder", "am faelligkeitstag", "wiederoeffnen"],
    relatedArticleSlugs: ["tasks-and-completion", "documents-uploads-and-evidence"],
    contextKeys: ["deadlines"],
    sections: [
      {
        heading: "Was ist eine Frist?",
        lines: [
          "Eine Frist ist ein Termin, der nachverfolgt werden muss.",
          "Sie kann mit einem Projekt und, wenn passend, mit einem Rechtsdokument verbunden sein."
        ]
      },
      {
        heading: "Frist anlegen",
        lines: [
          "Vergib einen Titel.",
          "Setze das Faelligkeitsdatum.",
          "Ordne Projekt und bei Bedarf Rechtsdokument zu.",
          "Waehle Verantwortliche und Stellvertretung.",
          "Setze die E-Mail-Erinnerung: 0 Tage bedeutet am Faelligkeitstag, jede andere Zahl bedeutet entsprechend viele Tage vorher."
        ],
        ordered: true
      },
      {
        heading: "Abschliessen und wieder oeffnen",
        lines: [
          "Fristen koennen abgeschlossen werden, wenn du die passende Berechtigung hast.",
          "Beim Abschluss koennen ein Erledigungsdatum, ein Kommentar und serverseitige Nachweisdateien erfasst werden.",
          "Abgeschlossene Fristen bleiben nachvollziehbar und koennen bei Bedarf wieder geoeffnet werden, wenn du das darfst.",
          "Nachweise bleiben auch nach dem Wieder oeffnen erhalten."
        ]
      }
    ]
  },
  {
    slug: "tasks-and-completion",
    title: "Aufgaben und Nachweise",
    summary: "Aufgaben sind die taegliche Arbeitsliste fuer Auflagen, Fristen und faellige Erledigungen.",
    articleType: "workflow",
    categorySlug: "tasks-evidence",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "mobile_users"],
    tags: ["Aufgaben", "Nachweise", "Erledigen", "Wieder oeffnen", "Externe Benutzer"],
    searchTerms: ["aufgabe", "nachweis", "foto", "bericht", "dokument", "abschliessen"],
    relatedArticleSlugs: ["obligations-and-scheduling", "deadlines-and-evidence"],
    contextKeys: ["tasks"],
    sections: [
      {
        heading: "Was sind Aufgaben?",
        lines: [
          "Aufgaben entstehen aus Auflagen, Fristen oder anderer faelliger Arbeit im Portal.",
          "Die Aufgabenliste zeigt offene, laufende und erledigte Aufgaben, je nach Filter und Berechtigung."
        ]
      },
      {
        heading: "Aufgabe abschliessen",
        lines: [
          "Oeffne die Aufgabe oder nutze die Aktion in der Liste.",
          "Fuege einen Kommentar hinzu, wenn etwas erklaert werden muss.",
          "Lade erforderliche Nachweise hoch, zum Beispiel Foto, Dokument oder Bericht.",
          "Schliesse die Aufgabe ab."
        ],
        ordered: true
      },
      {
        heading: "Nachweise",
        lines: [
          "Nachweise zeigen, warum eine Aufgabe oder Frist als erledigt gilt.",
          "Serverseitig hochgeladene Nachweise bleiben auch bei erledigten und wieder geoeffneten Aufgaben sichtbar.",
          "Wenn Pflichtnachweise verlangt werden, kann die Aufgabe ohne diese Nachweise nicht abgeschlossen werden.",
          "Vorhandene Nachweise schuetzen Auflagen vor unabsichtlichem endgueltigem Loeschen."
        ]
      },
      {
        heading: "Warum darf ich nicht abschliessen?",
        lines: [
          "Du kannst eine Aufgabe eventuell sehen, aber nicht abschliessen, wenn dir Bearbeitungsrecht, Abschlussrecht oder Projektzugriff fehlt.",
          "Externe Benutzer sehen nur freigegebene oder zugewiesene Inhalte und keinen allgemeinen Aufgabenbereich, sofern dieser fuer sie nicht vorgesehen ist."
        ]
      }
    ]
  },
  {
    slug: "documents-uploads-and-evidence",
    title: "Unterlagen, Dokumente und Nachweise",
    summary: "Unterlagen gehoeren zu Projekten, Rechtsdokumenten oder Altbescheiden. Nachweise gehoeren zum Abschluss von Aufgaben oder Fristen.",
    articleType: "reference",
    categorySlug: "tasks-evidence",
    visibility: "authenticated",
    audiences: ["operative_users", "mobile_users", "advanced_users"],
    tags: ["Dokumente", "Upload", "Unterlagen", "Nachweise", "Download", "Kategorien", "Freigabe"],
    searchTerms: ["dokumente", "upload", "unterlagen", "nachweis", "evidence", "download", "kategorie", "freigabe"],
    relatedArticleSlugs: ["tasks-and-completion", "deadlines-and-evidence", "legacy-decisions"],
    contextKeys: ["documents"],
    sections: [
      {
        heading: "Der Unterschied",
        lines: [
          "Unterlagen sind Dateien direkt an einem Projekt, Rechtsdokument oder Altbescheid.",
          "Nachweise sind Belege fuer die Erledigung einer Aufgabe oder Frist.",
          "Ein Dokument kann also Informationsquelle sein, ein Nachweis ist Teil des Abschlusses."
        ]
      },
      {
        heading: "Uploads und Downloads",
        lines: [
          "Hochladen, Vorschau und Download sind nur sichtbar, wenn du Zugriff auf das zugehoerige Projekt und die passende Berechtigung hast.",
          "Serverseitige Nachweisdateien werden ueber die geschuetzte Document API geladen; es gibt keine oeffentlichen Dateilinks.",
          "PDF-Dateien und Bilder koennen in der Vorschau geoeffnet werden. Office-Dateien, CSV und TXT werden heruntergeladen.",
          "Wenn ein Datei-Inhalt nicht mehr verfuegbar ist, muss der Nachweis neu hochgeladen werden.",
          "Alte Browser-Anhaenge sind nur Altbestand. Lade sie erneut hoch, wenn sie serverseitig verfuegbar sein sollen."
        ]
      },
      {
        heading: "Kategorien und Freigaben",
        lines: [
          "Beim Hochladen kann eine Dokumentkategorie gesetzt werden, damit Unterlagen leichter gruppiert und gefiltert werden koennen.",
          "Wenn eine Unterlage vor Weitergabe geprueft werden soll, kann eine Freigabe angefordert und eine interne freigebende Person ausgewaehlt werden.",
          "Der Freigabestatus wird als Ampel angezeigt: keine Freigabe, offen, freigegeben oder abgelehnt bzw. Aenderungen erforderlich.",
          "Wird eine bereits freigegebene Datei ersetzt, gilt die alte Freigabe nicht automatisch fuer die neue Dateiversion."
        ]
      }
    ]
  },
  {
    slug: "external-orgs-and-users",
    title: "Externe Firmen und externe Benutzer",
    summary: "Externe Firmen sind Organisationen. Externe Benutzer sind Personen mit eingeschraenktem Portalzugang.",
    articleType: "reference",
    categorySlug: "external-users",
    visibility: "authenticated",
    audiences: ["project_workers", "admins", "advanced_users"],
    tags: ["Externe Firmen", "Externe Benutzer", "Beteiligte", "Projektzugriff"],
    searchTerms: ["externe firma", "externer benutzer", "externer zugriff", "beteiligte"],
    relatedArticleSlugs: ["admin-users-and-roles", "admin-authorities-and-contacts", "roles-and-project-permissions"],
    contextKeys: ["projectDetail", "adminUsers"],
    sections: [
      {
        heading: "Der Unterschied",
        lines: [
          "Eine externe Firma ist eine Organisation, zum Beispiel ein Dienstleister, Ingenieurbuero oder Berater.",
          "Ein externer Benutzer ist eine konkrete Person mit Portalzugang.",
          "Ein externer Beteiligter im Projekt ist nicht immer automatisch ein Portalbenutzer."
        ]
      },
      {
        heading: "Externe Firma anlegen",
        lines: [
          "Oeffne Admin und dann Externe Firmen.",
          "Lege Name, Typ, Kontaktangaben und Adresse an.",
          "Waehle die externe Firma danach bei Projektbeteiligten, bei externen Durchfuehrenden von Auflagen oder bei externen Benutzern aus, wenn sie dort gebraucht wird.",
          "Rechtsdokumente haben derzeit kein eigenes Feld zur direkten Auswahl einer externen Firma."
        ],
        ordered: true
      },
      {
        heading: "Externen Benutzer anlegen",
        lines: [
          "Oeffne Admin und dann Benutzer.",
          "Waehle den Benutzertyp Extern.",
          "Ordne die externe Firma zu.",
          "Setze ein Initialpasswort, erzeuge einen Reset-Link oder nutze den vorgesehenen Zugangspfad.",
          "Vergib danach ausdruecklich Projektzugriff, wenn die Person Projektinhalte sehen soll."
        ],
        ordered: true
      },
      {
        heading: "Sicherheitsprinzip",
        lines: [
          "Externe Benutzer erhalten nur Zugriff auf Inhalte, die ausdruecklich freigegeben wurden.",
          "Wenn externe Benutzer deaktiviert sind oder archiviert wurden, koennen sie sich nicht anmelden."
        ]
      }
    ]
  },
  {
    slug: "admin-users-and-roles",
    title: "Admin: Benutzer und Rollen",
    summary: "Admins verwalten Benutzer, Rollen, Passwoerter, MFA und grundlegende Zugriffe.",
    articleType: "workflow",
    categorySlug: "admin-area",
    visibility: "admin",
    audiences: ["admins"],
    tags: ["Admin", "Benutzer", "Rollen", "Passwortreset", "MFA"],
    searchTerms: ["admin users", "rollen", "passwort reset", "mfa reset", "benutzer archivieren"],
    relatedArticleSlugs: ["roles-and-project-permissions", "security-login-password-mfa", "project-access-management"],
    contextKeys: ["adminUsers"],
    sections: [
      {
        heading: "Benutzer verwalten",
        lines: [
          "In Admin > Benutzer kannst du interne und externe Benutzer anlegen, bearbeiten, archivieren oder wiederherstellen.",
          "Du siehst Rolle, Benutzertyp, externe Firma, letzten Login, Sperrstatus und MFA-Status.",
          "Archivierte Benutzer bleiben nachvollziehbar, sollten aber keine aktive Verantwortung mehr tragen."
        ]
      },
      {
        heading: "Passwortreset",
        lines: [
          "Ein Admin kann fuer andere Benutzer ein Passwort setzen, ein Initialpasswort erzeugen oder einen Reset-Link verwenden.",
          "Mit Passwortwechsel beim naechsten Login muss der Benutzer danach ein eigenes Passwort setzen.",
          "Das eigene Passwort aenderst du nicht in der Admin-Liste, sondern unter Mein Konto und Kontosicherheit."
        ]
      },
      {
        heading: "MFA und gesperrte Konten",
        lines: [
          "Admins koennen MFA erzwingen, MFA zuruecksetzen oder gesperrte Konten entsperren, wenn die Berechtigung vorhanden ist.",
          "Ein MFA-Reset sollte nur erfolgen, wenn die Identitaet des Benutzers sicher geklaert ist."
        ]
      },
      {
        heading: "Rollen",
        lines: [
          "Rollen bestimmen grundsaetzlich, welche Bereiche jemand sehen oder bearbeiten darf.",
          "Projektzugriff bestimmt, fuer welche Projekte das gilt.",
          "Systemrollen koennen eingeschraenkt bearbeitbar sein. Benutzerdefinierte Rollen werden ueber Berechtigungen gepflegt."
        ]
      }
    ]
  },
  {
    slug: "admin-authorities-and-contacts",
    title: "Admin: Behoerden, Kontakte und externe Firmen",
    summary: "Diese Admin-Bereiche pflegen wichtige Stammdaten fuer Projekte, Rechtsdokumente und Beteiligte.",
    articleType: "workflow",
    categorySlug: "admin-area",
    visibility: "admin",
    audiences: ["admins", "advanced_users"],
    tags: ["Admin", "Behoerden", "Kontakte", "Externe Firmen"],
    searchTerms: ["behoerde", "kontakt", "ansprechpartner", "external org", "externe firma"],
    relatedArticleSlugs: ["external-orgs-and-users", "projects-workspace", "legal-documents-workspace"],
    contextKeys: ["adminAuthorities"],
    sections: [
      {
        heading: "Behoerden",
        lines: [
          "In Admin > Behoerden pflegst du Behoerden und ihre Kontakte.",
          "Kontakte koennen Name, Funktion, Abteilung, E-Mail, Telefon, Mobilnummer, Notiz und Primaerkontakt enthalten.",
          "Archivieren oder Wiederherstellen ist nur sichtbar, wenn du die passende Berechtigung hast."
        ]
      },
      {
        heading: "Externe Firmen",
        lines: [
          "In Admin > Externe Firmen legst du externe Organisationen an.",
          "Diese Firmen koennen spaeter bei Projektbeteiligten, Auflagen oder externen Benutzern verwendet werden.",
          "Archivierte Firmen bleiben historisch nachvollziehbar, sollten aber nicht fuer neue aktive Zuordnungen verwendet werden."
        ]
      }
    ]
  },
  {
    slug: "admin-security-and-settings",
    title: "Admin: Sicherheitseinstellungen",
    summary: "Globale Sicherheitseinstellungen steuern Passwortregeln, externe Benutzer und Kontoschutz.",
    articleType: "reference",
    categorySlug: "admin-area",
    visibility: "admin",
    audiences: ["admins"],
    tags: ["Admin", "Sicherheit", "Passwortregeln", "Externe Benutzer", "MFA"],
    searchTerms: ["admin security", "passwortregeln", "allow external users", "mfa pflicht"],
    relatedArticleSlugs: ["security-login-password-mfa", "external-orgs-and-users"],
    contextKeys: ["security"],
    sections: [
      {
        heading: "Was wird hier eingestellt?",
        lines: [
          "Admins koennen Passwortregeln, Sperrverhalten nach Fehlversuchen, Sitzungsdauer und externe Benutzer steuern.",
          "Je nach Konfiguration koennen MFA-Pflichten und Sicherheitsuebersichten angezeigt werden."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Externe Benutzer aktivieren oder deaktivieren wirkt sich direkt auf externe Logins aus.",
          "Sicherheitseinstellungen sollten bewusst und sparsam geaendert werden."
        ]
      }
    ]
  },
  {
    slug: "reports-compliance-summary-and-notifications",
    title: "Reports und In-App-Benachrichtigungen",
    summary: "Reports geben Ueberblick. In-App-Benachrichtigungen sind Hinweise im Portal und nicht dasselbe wie E-Mail-Versand.",
    articleType: "overview",
    categorySlug: "notifications-email",
    visibility: "authenticated",
    audiences: ["operative_users", "advanced_users", "admins"],
    tags: ["Reports", "Benachrichtigungen", "In-App", "CSV"],
    searchTerms: ["reports", "compliance", "notifications", "benachrichtigung", "csv"],
    relatedArticleSlugs: ["notifications-email-powerautomate", "dashboard-overview"],
    contextKeys: ["reports"],
    sections: [
      {
        heading: "Reports",
        lines: [
          "Reports fassen Aufgaben, Fristen, Rueckstaende und Erfuellung nach Zeitraum, Scope und Projekt zusammen.",
          "Je nach Berechtigung kannst du CSV-Exporte oder weitere Auswertungen nutzen."
        ]
      },
      {
        heading: "In-App-Benachrichtigungen",
        lines: [
          "Die Benachrichtigungsseite zeigt Hinweise im Portal, zum Beispiel Reminder, ueberfaellige Punkte oder Systemmeldungen.",
          "Du kannst Hinweise ausblenden oder spaeter erneut anzeigen lassen.",
          "Diese Hinweise sind nicht dasselbe wie die E-Mail-Versandliste im Admin-Bereich."
        ]
      }
    ]
  },
  {
    slug: "notifications-email-powerautomate",
    title: "Benachrichtigungen, E-Mail und PowerAutomate",
    summary: "Das Portal kann Benachrichtigungen erzeugen. E-Mails werden ueber den konfigurierten Versandweg verarbeitet.",
    articleType: "reference",
    categorySlug: "notifications-email",
    visibility: "admin",
    audiences: ["admins"],
    tags: ["Notifications", "E-Mail", "PowerAutomate", "Dry-Run", "Outbox"],
    searchTerms: ["notifications", "powerautomate", "dry-run", "retry", "cancel", "passwort reset"],
    relatedArticleSlugs: ["reports-compliance-summary-and-notifications", "admin-users-and-roles"],
    contextKeys: ["notifications"],
    sections: [
      {
        heading: "Was passiert hier?",
        lines: [
          "Das Portal kann E-Mail-Benachrichtigungen fuer Passwort-Reset sowie fuer faellige, ueberfaellige oder neu zugewiesene Fristen erzeugen.",
          "Wenn E-Mail-Versand aktiviert ist, werden E-Mails ueber PowerAutomate oder den eingerichteten Versandweg verschickt."
        ]
      },
      {
        heading: "Admin Notifications",
        lines: [
          "Admin > Notifications zeigt Uebersicht, Versandhistorie, fehlgeschlagene Eintraege, Einstellungen und Systemstatus.",
          "Admins koennen Details ansehen, fehlgeschlagene oder wartende Eintraege erneut versuchen oder abbrechen, wenn sie die Berechtigung haben.",
          "Die Einstellungen steuern derzeit Frist-Erinnerungen und Fristzuweisungen. Einige weitere Einstellungen koennen sichtbar sein, erzeugen aktuell aber noch keine automatischen E-Mails."
        ]
      },
      {
        heading: "Dry-Run",
        lines: [
          "Dry-Run bedeutet Testmodus.",
          "Wenn der Versand im Testmodus ist, erscheinen Benachrichtigungen im System, aber es werden keine echten E-Mails verschickt.",
          "Dry-Run ist hilfreich, um Regeln und Inhalte zu pruefen, ohne Empfaenger zu kontaktieren."
        ]
      },
      {
        heading: "Nicht verwechseln",
        lines: [
          "In-App-Benachrichtigungen im Portal sind Hinweise fuer Benutzer.",
          "Die Admin-Versandliste zeigt geplante, gesendete, fehlgeschlagene oder abgebrochene E-Mail-Vorgaenge."
        ]
      }
    ]
  },
  {
    slug: "export-import-recovery",
    title: "Export, Import und Wiederherstellung",
    summary: "Der Export ist ein Teil-Export fuer Analyse und Absicherung, kein vollstaendiges Backup der ganzen Anwendung.",
    articleType: "reference",
    categorySlug: "export-recovery",
    visibility: "admin",
    audiences: ["admins"],
    tags: ["Export", "Import", "Recovery", "Reset", "Teil-Export"],
    searchTerms: ["export", "import", "recovery", "reset", "backup", "teil-export"],
    relatedArticleSlugs: ["admin-users-and-roles", "notifications-email-powerautomate", "troubleshooting-common-issues"],
    contextKeys: ["adminData"],
    sections: [
      {
        heading: "Was ist im Export enthalten?",
        lines: [
          "Der Export enthaelt bestimmte Fachdatenbereiche fuer Analyse und Wiederherstellungspruefung.",
          "Er ist kein vollstaendiges Backup der gesamten Anwendung."
        ]
      },
      {
        heading: "Was ist nicht enthalten?",
        lines: [
          "Nicht enthalten sind Passwoerter, Reset-Tokens, Secrets, PowerAutomate-Webhooks und vergleichbare Sicherheitsdaten.",
          "Benutzer, Rollen, externe Firmen, Sicherheitseinstellungen und die E-Mail-Versandhistorie gehoeren nicht zum generischen Fach-Export.",
          "Datei-Inhalte aus Nachweisen koennen fehlen und muessen dann neu hochgeladen werden."
        ]
      },
      {
        heading: "Import, Reset und Demo-Replace",
        lines: [
          "Gesamt-Import, Gesamt-Reset und Demo-Replace sind aus Sicherheitsgruenden gesperrt oder eingeschraenkt.",
          "Der Grund ist Schutz vor Datenverlust und vor widerspruechlichen Daten.",
          "Spiele keine alten JSON-Dateien einfach ein, wenn etwas fehlt. Informiere einen Admin und klaere den passenden Recovery-Weg."
        ]
      },
      {
        heading: "Recovery",
        lines: [
          "Bei Recovery gilt: erst pruefen, dann handeln.",
          "Nutze Exporte zur Analyse und Abstimmung, nicht als blindes Gesamt-Backup.",
          "Wenn Inhalte fehlen oder gesperrt sind, dokumentiere den Fall und pruefe Berechtigungen, Archivstatus und Projektzugriff."
        ]
      }
    ]
  },
  {
    slug: "security-login-password-mfa",
    title: "Mein Konto, Passwort und MFA",
    summary: "Hier geht es um deinen eigenen Zugang: Passwort aendern, MFA einrichten und Recovery-Codes sicher aufbewahren.",
    articleType: "workflow",
    categorySlug: "account-security",
    visibility: "public",
    audiences: ["new_staff", "operative_users", "admins"],
    tags: ["Login", "Passwort", "MFA", "Recovery-Code", "Mein Konto"],
    searchTerms: ["login", "passwort", "mfa", "kontosicherheit", "recovery code", "reset link"],
    relatedArticleSlugs: ["admin-users-and-roles", "troubleshooting-common-issues"],
    contextKeys: ["security"],
    sections: [
      {
        heading: "Mein Konto",
        lines: [
          "Ueber das Benutzermenue oeffnest du Mein Konto und Kontosicherheit.",
          "Dort kannst du dein eigenes Passwort aendern und MFA einrichten oder verwalten."
        ]
      },
      {
        heading: "Passwort",
        lines: [
          "Dein eigenes Passwort aenderst du in Kontosicherheit.",
          "Wenn ein Admin dein Passwort zuruecksetzt, musst du beim naechsten Login eventuell ein neues eigenes Passwort setzen.",
          "Ein Reset-Link kann ablaufen. Fordere bei Bedarf einen neuen Link an."
        ]
      },
      {
        heading: "MFA und Recovery-Codes",
        lines: [
          "MFA schuetzt dein Konto mit einem zusaetzlichen Code aus einer Authenticator-App.",
          "Recovery-Codes sind fuer den Notfall, zum Beispiel bei Geraetewechsel.",
          "Bewahre Recovery-Codes sicher auf und teile sie nicht."
        ]
      },
      {
        heading: "Wenn Login nicht funktioniert",
        lines: [
          "Pruefe zuerst E-Mail, Passwort, MFA-Code und Ablaufdatum des Reset-Links.",
          "Wenn dein Konto deaktiviert, archiviert oder fuer externe Benutzer gesperrt ist, kann nur ein Admin helfen."
        ]
      }
    ]
  },
  {
    slug: "mobile-usage-and-field-work",
    title: "Mobile Nutzung",
    summary: "Das Portal ist mobil nutzbar. Fuer lange Formulare und Admin-Arbeit ist Desktop meist besser.",
    articleType: "reference",
    categorySlug: "mobile",
    visibility: "authenticated",
    audiences: ["mobile_users", "operative_users"],
    tags: ["Mobil", "Smartphone", "Tablet", "Drawer", "Nachweise"],
    searchTerms: ["mobile", "smartphone", "tablet", "drawer", "vollbild", "karten"],
    relatedArticleSlugs: ["tasks-and-completion", "documents-uploads-and-evidence"],
    contextKeys: ["mobile"],
    sections: [
      {
        heading: "So funktioniert es mobil",
        lines: [
          "Auf kleinen Bildschirmen nutzt du die Navigation ueber das Menue oder den Drawer.",
          "Tabellen koennen als Karten erscheinen, damit die wichtigsten Informationen besser lesbar bleiben.",
          "Formulare und Dialoge koennen im Vollbild erscheinen."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Bei laengeren Formularen zwischendurch bewusst pruefen, ob alle Pflichtfelder gesetzt sind.",
          "Speichere vor dem Wechseln der Seite.",
          "Fuer umfangreiche Admin-Arbeiten, Reports und komplexe Stammdatenpflege ist Desktop empfohlen."
        ]
      }
    ]
  },
  {
    slug: "troubleshooting-common-issues",
    title: "Haeufige Probleme schnell einordnen",
    summary: "Erste Hilfe, wenn Projekte, Buttons, Aufgaben, E-Mails oder Exporte nicht so aussehen wie erwartet.",
    articleType: "troubleshooting",
    categorySlug: "faq",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "admins"],
    tags: ["FAQ", "Troubleshooting", "Berechtigungen", "Export", "Notifications"],
    searchTerms: ["faq", "problem", "projekt fehlt", "button fehlt", "loeschen blockiert"],
    relatedArticleSlugs: [
      "roles-and-project-permissions",
      "export-import-recovery",
      "notifications-email-powerautomate"
    ],
    contextKeys: ["troubleshooting"],
    sections: [
      {
        heading: "Schnellchecks",
        lines: [
          "Projekt fehlt: Projektzugriff, Rolle und Archivstatus pruefen lassen.",
          "Button fehlt: meist fehlt die passende Berechtigung fuer diese Aktion.",
          "Auflage laesst sich nicht loeschen: Aufgabenstatus, Nachweise oder Dokumente sowie Kommentare koennen das Loeschen blockieren.",
          "Frist laesst sich nicht abschliessen: Abschlussrecht und Projektzugriff pruefen.",
          "E-Mail kommt nicht an: Admin Notifications, Dry-Run, Fehlerstatus und Empfaengeradresse pruefen."
        ]
      },
      {
        heading: "Wenn etwas gesperrt ist",
        lines: [
          "Import, Reset und Demo-Replace koennen bewusst gesperrt sein, um Datenverlust zu verhindern.",
          "Klaere den Fall mit einem Admin, statt alte Dateien ungeprueft einzuspielen."
        ]
      }
    ]
  },
  {
    slug: "submission-help-gewerbe",
    title: "Einreichtyp Gewerbe",
    summary: "Gewerbe beschreibt den allgemeinen gewerblichen Einreichkontext eines Projekts.",
    articleType: "submission_guidance",
    categorySlug: "projects",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["Gewerbe", "Einreichtyp", "Projekt"],
    searchTerms: ["gewerbe", "einreichung", "einreichtyp"],
    relatedArticleSlugs: ["project-status-and-submission-type", "projects-workspace"],
    contextKeys: ["submissionGewerbe"],
    sections: [
      {
        heading: "Wann passt Gewerbe?",
        lines: [
          "Waehle Gewerbe, wenn das Projekt fachlich in den allgemeinen gewerblichen Einreichkontext faellt.",
          "Nutze Status, Unterlagen und Checkliste, um die Vorbereitung nachvollziehbar zu halten."
        ]
      }
    ]
  },
  {
    slug: "submission-help-awg",
    title: "Einreichtyp AWG",
    summary: "AWG beschreibt Projekte mit abfallwirtschaftlichem Einreichkontext.",
    articleType: "submission_guidance",
    categorySlug: "projects",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["AWG", "Einreichtyp", "Projekt"],
    searchTerms: ["awg", "abfallwirtschaft", "einreichtyp"],
    relatedArticleSlugs: ["project-status-and-submission-type", "projects-workspace"],
    contextKeys: ["submissionAwg"],
    sections: [
      {
        heading: "Wann passt AWG?",
        lines: [
          "Waehle AWG, wenn das Projekt fachlich dem abfallwirtschaftlichen Einreichkontext zugeordnet ist.",
          "Pruefe besonders Unterlagen, Projektstatus und relevante Auflagen, weil hier oft mehrere Fachbeteiligte zusammenarbeiten."
        ]
      }
    ]
  },
  {
    slug: "submission-help-uvp-uve",
    title: "Einreichtyp UVP/UVE",
    summary: "UVP/UVE beschreibt Projekte mit umfangreicher Vorbereitung und hohem Dokumentbezug.",
    articleType: "submission_guidance",
    categorySlug: "projects",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["UVP", "UVE", "Einreichtyp", "Projekt"],
    searchTerms: ["uvp", "uve", "einreichtyp"],
    relatedArticleSlugs: ["project-status-and-submission-type", "projects-workspace"],
    contextKeys: ["submissionUvpUve"],
    sections: [
      {
        heading: "Wann passt UVP/UVE?",
        lines: [
          "Waehle UVP/UVE, wenn das Projekt fachlich in diesen umfangreichen Einreichkontext faellt.",
          "Halte Unterlagen, Status, Beteiligte und Fristen besonders sorgfaeltig aktuell."
        ]
      }
    ]
  }
];

export const HELP_FAQ_ENTRIES: HelpFaqEntry[] = [
  {
    id: "faq-project-missing",
    question: "Warum sehe ich ein Projekt nicht?",
    answer: "Meist fehlt Projektzugriff, die passende Rolle oder das Projekt ist archiviert. Bitte einen Admin oder Projektverantwortlichen, den Zugriff zu pruefen.",
    visibility: "authenticated",
    tags: ["Projekt", "Zugriff", "Berechtigung"],
    relatedArticleSlugs: ["roles-and-project-permissions", "project-access-management"]
  },
  {
    id: "faq-button-missing",
    question: "Warum sehe ich einen Button nicht?",
    answer: "Das Portal blendet Aktionen aus, fuer die du keine Berechtigung hast. Wenn du die Aktion brauchst, lass Rolle und Projektzugriff pruefen.",
    visibility: "authenticated",
    tags: ["Button", "Berechtigung"],
    relatedArticleSlugs: ["roles-and-project-permissions"]
  },
  {
    id: "faq-obligation-delete-blocked",
    question: "Warum kann ich eine Auflage nicht loeschen?",
    answer: "Loeschen kann blockiert sein, wenn Aufgabenstatus, Nachweise oder Dokumente sowie Kommentare vorhanden sind. Das schuetzt vor Datenverlust. Archivieren ist oft der bessere Weg.",
    visibility: "authenticated",
    tags: ["Auflage", "Loeschen", "Nachweise"],
    relatedArticleSlugs: ["obligations-and-scheduling"]
  },
  {
    id: "faq-deadline-complete-blocked",
    question: "Warum kann ich eine Frist nicht abschliessen?",
    answer: "Dir kann Abschlussrecht oder Projektzugriff fehlen. Wenn Nachweise verlangt werden, muessen diese beim Abschluss erfasst werden.",
    visibility: "authenticated",
    tags: ["Frist", "Abschliessen", "Berechtigung"],
    relatedArticleSlugs: ["deadlines-and-evidence", "tasks-and-completion"]
  },
  {
    id: "faq-legal-doc-vs-legacy",
    question: "Was ist der Unterschied zwischen Rechtsdokument und Altbescheid?",
    answer: "Ein Rechtsdokument ist aktiv und kann Grundlage fuer Auflagen oder Fristen sein. Ein Altbescheid ist historische Dokumentation und erzeugt keine aktiven Pflichten automatisch.",
    visibility: "authenticated",
    tags: ["Rechtsdokument", "Altbescheid"],
    relatedArticleSlugs: ["legal-documents-workspace", "legacy-decisions"]
  },
  {
    id: "faq-old-decision-no-validity",
    question: "Wie gebe ich alte Bescheide ohne Gueltigkeit ein?",
    answer: "Lege sie als Altbescheid an, waehle meist Nur Archiv oder Ersetzt und ergaenze eine Notiz wie: Nur historische Dokumentation, keine aktiven Pflichten uebernommen.",
    visibility: "authenticated",
    tags: ["Altbescheid", "Archiv"],
    relatedArticleSlugs: ["legacy-decisions"]
  },
  {
    id: "faq-grant-project-access",
    question: "Wie gebe ich einem Benutzer Zugriff auf ein Projekt?",
    answer: "Oeffne das Projekt, gehe auf Zugriff, waehle Benutzer und Zugriffsebene und speichere die Freigabe. Der Tab ist nur fuer berechtigte Admins sichtbar.",
    visibility: "admin",
    tags: ["Projektzugriff", "Benutzer"],
    relatedArticleSlugs: ["project-access-management"]
  },
  {
    id: "faq-create-external-org",
    question: "Wie lege ich eine externe Firma an?",
    answer: "Oeffne Admin > Externe Firmen, lege die Organisation an und waehle sie danach bei externen Benutzern, Beteiligten oder Auflagen aus.",
    visibility: "admin",
    tags: ["Externe Firma", "Admin"],
    relatedArticleSlugs: ["external-orgs-and-users", "admin-authorities-and-contacts"]
  },
  {
    id: "faq-reset-user-password",
    question: "Wie setze ich das Passwort eines Benutzers zurueck?",
    answer: "Oeffne Admin > Benutzer, waehle die Passwort-Aktion und nutze je nach Fall neues Passwort, Initialpasswort oder Reset-Link.",
    visibility: "admin",
    tags: ["Passwort", "Reset", "Admin"],
    relatedArticleSlugs: ["admin-users-and-roles", "security-login-password-mfa"]
  },
  {
    id: "faq-email-immediate",
    question: "Werden E-Mails sofort versendet?",
    answer: "Nicht immer. E-Mails werden ueber den eingerichteten Versandweg verarbeitet. Status, Fehler und Wartezeiten pruefst du in Admin > Notifications.",
    visibility: "admin",
    tags: ["E-Mail", "Notifications"],
    relatedArticleSlugs: ["notifications-email-powerautomate"]
  },
  {
    id: "faq-dry-run",
    question: "Was bedeutet Dry-Run?",
    answer: "Dry-Run ist Testmodus. Benachrichtigungen erscheinen im System, aber es werden keine echten E-Mails versendet.",
    visibility: "admin",
    tags: ["Dry-Run", "PowerAutomate"],
    relatedArticleSlugs: ["notifications-email-powerautomate"]
  },
  {
    id: "faq-export-included",
    question: "Was ist im Export enthalten?",
    answer: "Der Export ist ein Teil-Export bestimmter Fachdaten. Er enthaelt keine Passwoerter, Reset-Tokens, Secrets, Webhooks oder vollstaendige Admin-/Sicherheitsdaten.",
    visibility: "admin",
    tags: ["Export", "Recovery"],
    relatedArticleSlugs: ["export-import-recovery"]
  },
  {
    id: "faq-missing-or-blocked",
    question: "Was mache ich, wenn etwas fehlt oder gesperrt ist?",
    answer: "Pruefe zuerst Filter, Archivstatus, Berechtigung und Projektzugriff. Bei Import, Reset oder Recovery bitte einen Admin einbinden und nichts ungeprueft einspielen.",
    visibility: "authenticated",
    tags: ["Troubleshooting", "Gesperrt", "Recovery"],
    relatedArticleSlugs: ["troubleshooting-common-issues", "export-import-recovery"]
  },
  {
    id: "faq-mfa",
    question: "Ich komme wegen MFA nicht in das Portal. Was nun?",
    answer: "Nutze den aktuellen Authenticator-Code oder einen Recovery-Code. Wenn das nicht klappt, braucht es einen Admin-Reset oder ein neues MFA-Setup.",
    visibility: "public",
    tags: ["MFA", "Login", "Recovery-Code"],
    relatedArticleSlugs: ["security-login-password-mfa"]
  }
];

export const HELP_GLOSSARY: HelpGlossaryEntry[] = [
  {
    term: "Projekt",
    definition: "Arbeitsrahmen fuer einen fachlichen Vorgang mit Scope, Beteiligten, Rechtsdokumenten, Auflagen und Fristen.",
    visibility: "authenticated"
  },
  {
    term: "Projektzugriff",
    definition: "Freigabe, die bestimmt, welche Benutzer ein bestimmtes Projekt sehen oder bearbeiten duerfen.",
    visibility: "authenticated",
    synonyms: ["Zugriff", "Freigabe"]
  },
  {
    term: "Rolle",
    definition: "Sammlung von Berechtigungen, die grundsaetzlich festlegt, welche Bereiche und Aktionen ein Benutzer nutzen darf.",
    visibility: "authenticated"
  },
  {
    term: "Rechtsdokument",
    definition: "Aktiver Bescheid, Genehmigung oder vergleichbares Dokument mit Projektbezug.",
    visibility: "authenticated",
    synonyms: ["Bescheid", "Genehmigung"]
  },
  {
    term: "Altbescheid",
    definition: "Historischer Bescheid fuer Dokumentation und Nachvollziehbarkeit. Er erzeugt keine aktiven Pflichten automatisch.",
    visibility: "authenticated",
    synonyms: ["Historischer Bescheid"]
  },
  {
    term: "Auflage",
    definition: "Pflicht aus einem Rechtsdokument, aus der operative Arbeit entstehen kann.",
    visibility: "authenticated",
    synonyms: ["Verpflichtung"]
  },
  {
    term: "Frist",
    definition: "Konkreter Termin, der ueberwacht und abgeschlossen werden kann.",
    visibility: "authenticated",
    synonyms: ["Faelligkeit"]
  },
  {
    term: "Aufgabe",
    definition: "Operative Arbeit, die aus Auflagen, Fristen oder anderer Faelligkeit entsteht.",
    visibility: "authenticated"
  },
  {
    term: "Nachweis",
    definition: "Beleg fuer Erledigung, zum Beispiel Foto, Dokument oder Bericht.",
    visibility: "authenticated",
    synonyms: ["Evidence", "Beleg"]
  },
  {
    term: "Externe Firma",
    definition: "Organisation ausserhalb des eigenen Unternehmens, die als Beteiligte, Dienstleister oder Zuordnung verwendet werden kann.",
    visibility: "authenticated"
  },
  {
    term: "Externer Benutzer",
    definition: "Person mit eingeschraenktem Portalzugang, die nur ausdruecklich freigegebene Inhalte sieht.",
    visibility: "authenticated"
  },
  {
    term: "Dry-Run",
    definition: "Testmodus fuer Benachrichtigungen. Vorgaenge werden erzeugt, aber nicht als echte E-Mail versendet.",
    visibility: "admin"
  },
  {
    term: "Teil-Export",
    definition: "Export bestimmter Fachdaten. Er ist kein vollstaendiges Backup der ganzen Anwendung.",
    visibility: "admin"
  },
  {
    term: "MFA",
    definition: "Mehrfaktor-Authentifizierung mit zusaetzlichem Code oder Recovery-Code.",
    visibility: "public",
    synonyms: ["Mehrfaktor", "Authenticator"]
  }
];

export const HELP_QUICK_LINKS: HelpQuickLink[] = [
  {
    id: "quick-first-steps",
    label: "Erste Schritte",
    description: "Portalaufbau, Navigation und Grundbegriffe verstehen.",
    articleSlug: "portal-overview-and-first-steps",
    visibility: "authenticated"
  },
  {
    id: "quick-projects",
    label: "Projektarbeit",
    description: "Projekte anlegen, filtern und Detail-Tabs nutzen.",
    articleSlug: "projects-workspace",
    visibility: "authenticated"
  },
  {
    id: "quick-permissions",
    label: "Warum sehe ich das nicht?",
    description: "Rollen, Berechtigungen und Projektzugriff einordnen.",
    articleSlug: "roles-and-project-permissions",
    visibility: "authenticated"
  },
  {
    id: "quick-obligations",
    label: "Auflagen und Nachweise",
    description: "Auflagen, Aufgaben, Fristen und Nachweise sauber bearbeiten.",
    articleSlug: "obligations-and-scheduling",
    visibility: "authenticated"
  },
  {
    id: "quick-admin",
    label: "Admin-Hilfe",
    description: "Benutzer, Rollen, externe Firmen, Sicherheit und Recovery.",
    articleSlug: "admin-users-and-roles",
    visibility: "admin"
  },
  {
    id: "quick-notifications",
    label: "E-Mail und Dry-Run",
    description: "PowerAutomate, Versandstatus und Testmodus verstehen.",
    articleSlug: "notifications-email-powerautomate",
    visibility: "admin"
  },
  {
    id: "quick-auth",
    label: "Login und MFA",
    description: "Passwort, MFA und Recovery-Codes verwalten.",
    articleSlug: "security-login-password-mfa",
    visibility: "public"
  },
  {
    id: "quick-mobile",
    label: "Mobil nutzen",
    description: "Navigation, Kartenansichten und mobile Nachweise.",
    articleSlug: "mobile-usage-and-field-work",
    visibility: "authenticated"
  }
];

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export function getHelpHref(slug: string, scope: HelpScope = "portal") {
  return scope === "publicAuth" ? `/help/auth#${slug}` : `/help#${slug}`;
}

export function getHelpArticle(slug: string) {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}

export function getHelpArticlesForScope(scope: HelpScope, allowAdminContent = false) {
  return HELP_ARTICLES.filter((article) => {
    if (scope === "publicAuth") {
      return article.visibility === "public";
    }
    if (article.visibility === "admin") {
      return allowAdminContent;
    }
    return article.visibility === "public" || article.visibility === "authenticated";
  });
}

export function getHelpFaqEntriesForScope(scope: HelpScope, allowAdminContent = false) {
  return HELP_FAQ_ENTRIES.filter((entry) => {
    if (scope === "publicAuth") {
      return entry.visibility === "public";
    }
    if (entry.visibility === "admin") {
      return allowAdminContent;
    }
    return entry.visibility === "public" || entry.visibility === "authenticated";
  });
}

export function getHelpGlossaryForScope(scope: HelpScope, allowAdminContent = false) {
  return HELP_GLOSSARY.filter((entry) => {
    if (scope === "publicAuth") {
      return entry.visibility === "public";
    }
    if (entry.visibility === "admin") {
      return allowAdminContent;
    }
    return entry.visibility === "public" || entry.visibility === "authenticated";
  });
}

export function getHelpQuickLinksForScope(scope: HelpScope, allowAdminContent = false) {
  return HELP_QUICK_LINKS.filter((link) => {
    if (scope === "publicAuth") {
      return link.visibility === "public";
    }
    if (link.visibility === "admin") {
      return allowAdminContent;
    }
    return link.visibility === "public" || link.visibility === "authenticated";
  });
}

export function matchesHelpArticle(article: HelpArticle, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    article.title,
    article.summary,
    article.articleType,
    ...article.tags,
    ...article.searchTerms,
    ...article.contextKeys,
    ...article.sections.flatMap((section) => [section.heading, ...section.lines])
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function matchesHelpFaqEntry(entry: HelpFaqEntry, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return [entry.question, entry.answer, ...entry.tags]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

export function matchesHelpGlossaryEntry(entry: HelpGlossaryEntry, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return [entry.term, entry.definition, ...(entry.synonyms ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}
