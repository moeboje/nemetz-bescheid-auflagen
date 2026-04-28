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
  adminData: "admin-data-management-and-recovery",
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
    title: "Einstieg",
    summary: "Portal verstehen, Grundbegriffe klaeren und den ersten sinnvollen Startpunkt finden."
  },
  {
    slug: "portal-areas",
    title: "Portalbereiche",
    summary: "Modulbezogene Hilfe fuer Dashboard, Projekte, Rechtsdokumente, Auflagen, Fristen, Aufgaben und Dokumente."
  },
  {
    slug: "workflows",
    title: "Aufgaben & Workflows",
    summary: "Schritt-fuer-Schritt-Hilfe fuer haeufige Arbeitsablaeufe im Tagesgeschaeft."
  },
  {
    slug: "admin",
    title: "Admin",
    summary: "Benutzer, Rollen, Stammdaten, Datenmanagement, Demo, Import/Export und Recovery."
  },
  {
    slug: "submissions",
    title: "Fachliche Einreichhilfe",
    summary: "Orientierung fuer Gewerbe, AWG und UVP/UVE im Produktkontext."
  },
  {
    slug: "security",
    title: "Sicherheit & Zugang",
    summary: "Login, Passwort, Microsoft-Anmeldung, MFA und allgemeine Sicherheitsfragen."
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting & FAQ",
    summary: "Hauefige Probleme, Schnellchecks und passende Anschlussartikel."
  },
  {
    slug: "glossary",
    title: "Glossar",
    summary: "Wichtige Begriffe und Abkuerzungen aus Portal und Fachkontext."
  }
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "portal-overview-and-first-steps",
    title: "Portalueberblick und erste Schritte",
    summary: "Ein kompakter Einstieg fuer neue Mitarbeiter und gelegentliche Nutzer.",
    articleType: "overview",
    categorySlug: "getting-started",
    visibility: "authenticated",
    audiences: ["new_staff", "operative_users", "project_workers"],
    tags: ["Einstieg", "Onboarding", "Portal", "Ueberblick"],
    searchTerms: ["wo anfangen", "erste schritte", "onboarding", "ueberblick"],
    relatedArticleSlugs: [
      "scope-structure-and-master-data",
      "projects-workspace",
      "dashboard-overview"
    ],
    contextKeys: ["dashboard", "projectsList"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Das Portal verbindet Stammdaten, Projekte, Rechtsdokumente, Auflagen, Fristen und Aufgaben in einem durchgaengigen Arbeitsmodell.",
          "Ziel ist nicht nur Dokumentation, sondern belastbare operative Nachverfolgung mit klaren Referenzen."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn Sie neu im Portal sind, einen Arbeitsbereich zum ersten Mal nutzen oder den Gesamtzusammenhang verstehen muessen."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Pruefen Sie zuerst den Scope: Company, Standort und Anlage muessen passen.",
          "Legen Sie danach oder darauf aufbauend ein Projekt mit Behoerde, Ansprechpartner und Einreichtyp an.",
          "Verknuepfen Sie Rechtsdokumente mit dem Projekt und leiten Sie daraus Auflagen und Fristen ab.",
          "Arbeiten Sie offene Aufgaben und Nachweise ueber Aufgaben- und Fristenansichten im Tagesbetrieb ab."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Archivierung ist nicht dasselbe wie Projektstatus oder Einreichtyp.",
          "Viele Folgebeziehungen setzen stabile Stammdaten voraus; ueberspringen Sie Scope und Ansprechpartner nicht."
        ]
      },
      {
        heading: "Verwandte Themen",
        lines: [
          "Die naechsten sinnvollen Artikel sind Scope-Struktur, Projekte und Dashboard."
        ]
      }
    ]
  },
  {
    slug: "dashboard-overview",
    title: "Dashboard verstehen und sinnvoll nutzen",
    summary: "Das Dashboard ist die schnelle Uebersichtsseite fuer offene Arbeit und aktuelle Risiken.",
    articleType: "overview",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "mobile_users"],
    tags: ["Dashboard", "KPI", "Ueberfaellig", "Benachrichtigungen"],
    searchTerms: ["dashboard", "kennzahlen", "ueberfaellige aufgaben", "statistiken"],
    relatedArticleSlugs: ["tasks-and-completion", "deadlines-and-evidence"],
    contextKeys: ["dashboard"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Das Dashboard zeigt verdichtete Kennzahlen, ueberfaellige Aufgaben und aktuelle Benachrichtigungen.",
          "Es ist ein Einstieg fuer Priorisierung, nicht die Stelle fuer tiefe Bearbeitung."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Zu Tagesbeginn, bei Wochenstarts, vor Statusrunden oder wenn Sie schnell erkennen muessen, wo Handlungsbedarf besteht."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Kennzahlen sind Zusammenfassungen. Bearbeitet wird danach in Aufgaben-, Fristen- oder Fachansichten.",
          "Wenn Zahlen unerwartet wirken, pruefen Sie Filter, Archivstatus und den Zeitraum in den Zielansichten."
        ]
      },
      {
        heading: "Haeufige Fehler",
        lines: [
          "Das Dashboard als einzige Quelle fuer Detailbewertung zu nutzen.",
          "Ueberfaelligkeiten zu lesen, ohne die zugrunde liegenden Auflagen- oder Fristenreferenzen zu oeffnen."
        ]
      }
    ]
  },
  {
    slug: "scope-structure-and-master-data",
    title: "Scope-Struktur und Stammdaten",
    summary: "Companies, Standorte und Anlagen sauber pflegen, damit nachgelagerte Referenzen stabil bleiben.",
    articleType: "workflow",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "admins"],
    tags: ["Scope", "Company", "Standort", "Anlage", "Stammdaten"],
    searchTerms: ["scope", "company", "standort", "anlage", "stammdaten"],
    relatedArticleSlugs: ["projects-workspace", "admin-authorities-and-contacts"],
    contextKeys: ["scopes"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Scope beschreibt die hierarchische Struktur aus Company, Standort und Anlage.",
          "Diese Struktur ist Grundlage fuer Projekte, Rechtsdokumente, Fristen und Aufgaben."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Vor der ersten Projektanlage, bei neuen Standorten oder wenn Referenzen in Projekten unklar oder fehlerhaft sind."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Legen Sie zunaechst die Company an.",
          "Erfassen Sie darunter den passenden Standort.",
          "Ergaenzen Sie nur dann eine Anlage, wenn das Projekt oder Dokument wirklich anlagenbezogen ist.",
          "Pruefen Sie nach groesseren Aenderungen die betroffenen Projekte und Folgeobjekte."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Ein falsch gewaehlter Scope fuehrt spaeter zu unklaren Filterergebnissen und Referenzproblemen.",
          "Archivieren Sie Stammdaten nur bewusst, weil sie Folgeobjekte indirekt beeinflussen."
        ]
      },
      {
        heading: "Praxisbeispiel",
        lines: [
          "Wenn ein neues Werk zu einer bestehenden Company gehoert, wird zuerst der Standort angelegt und danach bei Bedarf die konkrete Anlage fuer das Projekt gewaehlt."
        ]
      }
    ]
  },
  {
    slug: "projects-workspace",
    title: "Projekte anlegen und sauber pflegen",
    summary: "Projekte sind der Arbeitskontext fuer Dokumente, Auflagen, Fristen und Beteiligte.",
    articleType: "workflow",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["project_workers", "operative_users", "advanced_users"],
    tags: ["Projekte", "Projektanlage", "Beteiligte", "Owner", "Scope"],
    searchTerms: ["projekt", "projekt anlegen", "owner", "deputy", "behoerde"],
    relatedArticleSlugs: [
      "project-status-and-submission-type",
      "project-detail-and-checklist",
      "legal-documents-workspace"
    ],
    contextKeys: ["projectsList"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Im Projekt werden Scope, Behoerde, Ansprechpartner, Verantwortliche und weitere Referenzen gebuendelt.",
          "Rechtsdokumente, Auflagen und Fristen knuepfen fachlich an dieses Projekt an."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Sobald ein neuer Vorgang, eine neue Einreichung oder ein bestaehender Projektkontext im Portal abgebildet werden soll."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Waehlen Sie den korrekten Scope.",
          "Setzen Sie Behoerde und Ansprechpartner, damit spaetere Referenzen belastbar bleiben.",
          "Pflegen Sie Owner, Stellvertretung und weitere Teilnehmer fuer die operative Zusammenarbeit.",
          "Ergaenzen Sie erst danach Abhaengigkeiten und Referenzdokumente, wenn sie fachlich wirklich gebraucht werden."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Status, Einreichtyp und Archivierung sind drei verschiedene Dinge.",
          "Teilnehmer und externe Beteiligte sollten nur gepflegt werden, wenn sie fuer das Projekt wirklich relevant sind."
        ]
      },
      {
        heading: "Haeufige Fehler",
        lines: [
          "Projekt ohne belastbaren Scope oder ohne passende Behoerde anzulegen.",
          "Einreichtyp und Projektstatus fachlich zu vermischen."
        ]
      }
    ]
  },
  {
    slug: "project-status-and-submission-type",
    title: "Projektstatus, Einreichtyp und Archivierung sauber trennen",
    summary: "Status zeigt den Verfahrensstand, Einreichtyp den fachlichen Kontext und Archivierung die Sichtbarkeit.",
    articleType: "reference",
    categorySlug: "workflows",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users", "admins"],
    tags: ["Projektstatus", "Einreichtyp", "Archivierung", "GEWERBE", "AWG", "UVP_UVE"],
    searchTerms: ["status", "einreichtyp", "gewerbe", "awg", "uvp", "archiviert"],
    relatedArticleSlugs: [
      "projects-workspace",
      "submission-help-gewerbe",
      "submission-help-awg",
      "submission-help-uvp-uve"
    ],
    contextKeys: ["projectStatus"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Projektstatus beschreibt den fachlichen Bearbeitungs- und Verfahrensstand.",
          "Einreichtyp beschreibt den fachlichen Kontext des Projekts: `GEWERBE`, `AWG` oder `UVP_UVE`.",
          "Archivierung blendet Projekte aus aktiven Arbeitslisten aus, aendert aber weder Status noch Einreichtyp."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Beim Anlegen und Pflegen von Projekten, bei Statusrunden und wenn unklar ist, warum ein Projekt in einer bestimmten Liste erscheint."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Neue Projekte erhalten einen Startstatus, aber keinen stillen Einreichtyp-Default.",
          "Ein archiviertes Projekt bleibt fachlich dasselbe Projekt; es ist nur nicht mehr Teil der aktiven Standardarbeit."
        ]
      },
      {
        heading: "Praxisbeispiel",
        lines: [
          "Ein `AWG`-Projekt kann von `DRAFT` auf `SUBMISSION_PREPARATION` und spaeter auf `SUBMITTED` wechseln, ohne dass der Einreichtyp geaendert wird."
        ]
      }
    ]
  },
  {
    slug: "project-detail-and-checklist",
    title: "Projektdetail, Beziehungen und Checkliste",
    summary: "Das Projektdetail fuehrt Uebersicht, Folgeobjekte, Dokumente, Beteiligte und die optionale Projektcheckliste zusammen.",
    articleType: "step_by_step",
    categorySlug: "workflows",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["Projektdetail", "Checkliste", "Abhaengigkeiten", "Referenzen"],
    searchTerms: ["projektdetail", "checkliste", "abhaengigkeiten", "referenzdokumente"],
    relatedArticleSlugs: [
      "projects-workspace",
      "legal-document-detail-and-follow-up",
      "submission-help-awg"
    ],
    contextKeys: ["projectDetail"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Im Projektdetail laufen Metadaten, Dokumente, Fristen, Beteiligte, Kommentare und Historie zusammen.",
          "Wenn das Feature aktiv ist, gibt es zusaetzlich einen Checklisten-Tab fuer projektbezogene Arbeitspunkte."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn ein Projekt bereits existiert und Sie Folgeobjekte, Beziehungen oder den aktuellen Bearbeitungsstand vertieft bearbeiten wollen."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Pruefen Sie zuerst die Uebersicht: Status, Einreichtyp, Scope und Referenzen.",
          "Bearbeiten Sie danach die betroffenen Tabs, nicht alles gleichzeitig.",
          "Nutzen Sie die Checkliste fuer operative Arbeitspunkte, nicht als Ersatz fuer Status oder Archivierung."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Abhaengige Projekte und Referenzdokumente sind bewusst getrennte Konzepte.",
          "Die Projektcheckliste ist generisch und ersetzt keine fachliche AWG- oder UVP-Bewertung."
        ]
      }
    ]
  },
  {
    slug: "legal-documents-workspace",
    title: "Rechtsdokumente strukturiert erfassen",
    summary: "Rechtsdokumente verbinden den fachlichen Bescheid mit Projekt, Scope und Folgearbeit.",
    articleType: "workflow",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["project_workers", "operative_users", "advanced_users"],
    tags: ["Rechtsdokumente", "Bescheid", "Projektbezug", "Scope-Override"],
    searchTerms: ["rechtsdokument", "bescheid", "genehmigung", "aktenzeichen", "scope override"],
    relatedArticleSlugs: [
      "legal-document-detail-and-follow-up",
      "obligations-and-scheduling",
      "documents-uploads-and-evidence"
    ],
    contextKeys: ["legalDocsList"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Rechtsdokumente bilden Bescheide, Genehmigungen und vergleichbare Referenzdokumente im Portal ab.",
          "Sie sind die fachliche Quelle fuer viele Auflagen und Fristen."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Sobald ein Dokument projektbezogen erfasst, geordnet, mit Metadaten versehen oder fuer Folgearbeit nutzbar gemacht werden muss."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Verknuepfen Sie jedes Dokument mit einem bestehenden Projekt.",
          "Pflegen Sie Typ, Referenz/Aktenzeichen und relevante Datumsfelder sauber.",
          "Nutzen Sie Scope-Override nur, wenn das Dokument bewusst von der Projektstruktur abweicht."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Ein Scope-Override ist eine fachliche Ausnahme und sollte sparsam eingesetzt werden.",
          "AI-Review ist nur eine Arbeitshilfe; die fachliche Verantwortung fuer uebernommene Inhalte bleibt beim Nutzer."
        ]
      }
    ]
  },
  {
    slug: "legal-document-detail-and-follow-up",
    title: "Rechtsdokument-Detail, Folgeobjekte und AI-Review",
    summary: "Im Dokumentdetail bearbeiten Sie Folgeobjekte, Dokumentanhaenge, Kommentare und gegebenenfalls AI-Auswertung.",
    articleType: "step_by_step",
    categorySlug: "workflows",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["Dokumentdetail", "AI-Review", "Folgeobjekte", "Anhaenge"],
    searchTerms: ["dokumentdetail", "ai review", "anhang", "obligations tab", "deadlines tab"],
    relatedArticleSlugs: [
      "legal-documents-workspace",
      "obligations-and-scheduling",
      "deadlines-and-evidence"
    ],
    contextKeys: ["legalDocDetail"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Das Dokumentdetail ist die operative Stelle fuer Folgeobjekte, Anhange, Kommentare und Historie eines einzelnen Rechtsdokuments."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn Sie aus einem Dokument Auflagen oder Fristen ableiten, Dokumente hochladen oder bestaehende Folgeobjekte pruefen wollen."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Archivieren Sie nicht vorschnell auf Dokumentebene, wenn darunter noch operative Folgeobjekte laufen.",
          "AI-Ergebnisse sind Vorschlaege. Uebernehmen Sie nur fachlich gepruefte Inhalte."
        ]
      }
    ]
  },
  {
    slug: "obligations-and-scheduling",
    title: "Auflagen planen, terminieren und sauber verantworten",
    summary: "Auflagen steuern wiederkehrende und einmalige operative Pflichtarbeit.",
    articleType: "step_by_step",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "advanced_users"],
    tags: ["Auflagen", "Scheduling", "Intervall", "Reminder", "Verantwortliche"],
    searchTerms: ["auflage", "scheduling", "intervall", "reminder", "pflichtnachweis"],
    relatedArticleSlugs: ["tasks-and-completion", "deadlines-and-evidence"],
    contextKeys: ["obligations"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Auflagen beschreiben Verpflichtungen aus einem Rechtsdokument und erzeugen daraus operative Arbeit.",
          "Je nach Konfiguration entstehen wiederkehrende oder einmalige Task-Instanzen."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn Sie dokumentbezogene Verpflichtungen strukturieren, terminieren und verantwortlich zuordnen muessen."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Formulieren Sie die Auflage fachlich klar und knapp.",
          "Waehlen Sie das passende Scheduling und den ersten sinnvollen Faelligkeitspunkt.",
          "Setzen Sie Owner und Reminder fruehzeitig.",
          "Definieren Sie Pflichtnachweise nur dort, wo ein Abschluss ohne Evidence nicht ausreichend waere."
        ],
        ordered: true
      },
      {
        heading: "Haeufige Fehler",
        lines: [
          "Intervall und Startdatum unklar zu setzen, sodass unerwartete Task-Serien entstehen.",
          "Pflichtnachweise zu breit zu definieren und damit die operative Bearbeitung unnoetig zu erschweren."
        ]
      }
    ]
  },
  {
    slug: "deadlines-and-evidence",
    title: "Fristen abschliessen, nachweisen und wieder oeffnen",
    summary: "Fristen sind terminorientierte Pflichten mit Projekt- oder Dokumentbezug und optionalem Evidence-Abschluss.",
    articleType: "workflow",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "mobile_users"],
    tags: ["Fristen", "Evidence", "Due Date", "Reminder", "Reopen"],
    searchTerms: ["frist", "evidence", "due date", "erledigt", "wiederoeffnen"],
    relatedArticleSlugs: ["tasks-and-completion", "documents-uploads-and-evidence"],
    contextKeys: ["deadlines"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Fristen bilden terminorientierte Pflichten ab, die direkt an Projekte oder Rechtsdokumente gekoppelt sein koennen."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn Termine eigenstaendig nachverfolgt, mit Reminder versehen oder mit Nachweisen abgeschlossen werden muessen."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Offen, erledigt und ueberfaellig werden aus Faelligkeit und Abschlusszustand abgeleitet.",
          "Wenn Evidence aktiviert ist, sollte der Nachweis unmittelbar beim Abschluss erfasst werden."
        ]
      },
      {
        heading: "Praxisbeispiel",
        lines: [
          "Eine Frist fuer eine Einreichung kann direkt am Projekt haengen, waehrend eine Nachreichfrist am konkreten Rechtsdokument haengt."
        ]
      }
    ]
  },
  {
    slug: "tasks-and-completion",
    title: "Aufgaben filtern, abschliessen und dokumentieren",
    summary: "Aufgaben sind die operative Arbeitsansicht fuer Auflagen- und Fristenarbeit.",
    articleType: "workflow",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "mobile_users"],
    tags: ["Aufgaben", "TaskState", "Evidence", "ICS", "Filter"],
    searchTerms: ["aufgaben", "task", "ics export", "erledigen", "nachweis"],
    relatedArticleSlugs: ["obligations-and-scheduling", "deadlines-and-evidence"],
    contextKeys: ["tasks"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Die Aufgabenansicht zeigt operative Arbeitspakete aus Auflagen und Fristen in einer einheitlichen Liste."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Fuer taegliche Priorisierung, Abschluss, Wiederoeffnung und Nachweisverwaltung."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Nutzen Sie Status-, Typ-, Zeitraum-, Projekt- und Scope-Filter, bevor Sie Aufgaben bewerten.",
          "Oeffnen Sie den Abschlussdialog direkt aus der Liste, wenn Evidence oder Abschlusskommentar noetig sind.",
          "Nutzen Sie den ICS-Export nur fuer persoenliche Planung, nicht als fachliche Quelle fuer Statusbewertung."
        ],
        ordered: true
      },
      {
        heading: "Haeufige Fehler",
        lines: [
          "Keine Aufgaben zu sehen, weil Filter, Zeitraum oder Assignee-Fokus noch gesetzt sind.",
          "Eine erledigte Aufgabe wieder zu oeffnen, ohne die fachliche Ursache zu dokumentieren."
        ]
      }
    ]
  },
  {
    slug: "documents-uploads-and-evidence",
    title: "Dokumente, Uploads, Anhaenge und Evidence richtig einordnen",
    summary: "Das Portal unterscheidet zwischen serverseitigen Dokumenten und lokalen Evidence-Dateiinhalten.",
    articleType: "reference",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "mobile_users", "advanced_users"],
    tags: ["Dokumente", "Upload", "Anhang", "Evidence", "Preview", "Download"],
    searchTerms: ["dokumente", "upload", "attachment", "evidence", "preview", "download"],
    relatedArticleSlugs: ["deadlines-and-evidence", "tasks-and-completion", "admin-data-management-and-recovery"],
    contextKeys: ["documents"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Dokumente in `DocumentsPanel` sind serverseitig gespeichert und fuer das jeweilige Objekt verknuepft.",
          "Evidence-Dateimetadaten werden fachlich mit Aufgabe oder Frist verbunden, ihre Datei-Inhalte liegen jedoch lokal im Browser."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Beim Hochladen von Unterlagen, beim mobilen Foto-Nachweis, bei Vorschau/Download und nach Importen mit fehlenden Datei-Inhalten."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Ein JSON-Export enthaelt keine binaeren Datei-Inhalte aus lokaler Evidence-Speicherung.",
          "Wenn nach einem Import `content missing` oder `storage: none` erscheint, muessen Nachweise neu hochgeladen werden."
        ]
      },
      {
        heading: "Praxisbeispiel",
        lines: [
          "Ein PDF im Dokumentpanel bleibt serverseitig verfuegbar, ein lokales Foto als Evidence-Nachweis muss nach Browser- oder Geraetwechsel eventuell erneut erfasst werden."
        ]
      }
    ]
  },
  {
    slug: "reports-compliance-summary-and-notifications",
    title: "Reports, Compliance Summary und Benachrichtigungen lesen",
    summary: "Diese Bereiche helfen bei Ueberblick, Trendbeobachtung und Erinnerung, ersetzen aber keine Fachbearbeitung.",
    articleType: "overview",
    categorySlug: "portal-areas",
    visibility: "authenticated",
    audiences: ["operative_users", "advanced_users", "admins"],
    tags: ["Reports", "Compliance Summary", "Benachrichtigungen", "Reminder"],
    searchTerms: ["report", "compliance summary", "notifications", "reminder"],
    relatedArticleSlugs: ["dashboard-overview", "tasks-and-completion"],
    contextKeys: ["reports", "notifications"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Reports und die Compliance Summary verdichten Aufgaben- und Fristenlagen.",
          "Benachrichtigungen zeigen aktive Reminder, Overdue-Hinweise und Systemmeldungen."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Fuer Statusrunden, Management-Transparenz, Priorisierung und Nachverfolgung offener Arbeit."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Nicht jede Benachrichtigung ist eine neue fachliche Aufgabe.",
          "Die Summary ist ein Lesemodul. Operative Korrekturen erfolgen in Projekten, Aufgaben, Fristen oder Auflagen."
        ]
      }
    ]
  },
  {
    slug: "admin-users-and-roles",
    title: "Admin: Benutzer und Rollen",
    summary: "Benutzer und Rollen steuern, wer was sehen und bearbeiten darf.",
    articleType: "workflow",
    categorySlug: "admin",
    visibility: "admin",
    audiences: ["admins"],
    tags: ["Admin", "Benutzer", "Rollen", "Passwort Reset", "MFA Reset"],
    searchTerms: ["admin users", "rollen", "password reset", "mfa reset"],
    relatedArticleSlugs: ["security-login-password-mfa", "admin-data-management-and-recovery"],
    contextKeys: ["adminUsers"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Die Admin-Unterseiten fuer Benutzer und Rollen regeln den Zugriff auf Fachbereiche und Schreibrechte."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Beim Onboarding neuer Nutzer, bei Rollenwechseln oder wenn ein Passwort- oder MFA-Reset noetig ist."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Archivierte Benutzer bleiben Teil der Historie, sollten aber keine operative Verantwortung mehr tragen.",
          "Rollenanpassungen und Passwort-/MFA-Resets sind administrative Eingriffe und sollten nachvollziehbar bleiben."
        ]
      }
    ]
  },
  {
    slug: "admin-authorities-and-contacts",
    title: "Admin: Behoerden, Ansprechpartner und externe Firmen",
    summary: "Diese Stammdaten sind die stabile Grundlage fuer belastbare Referenzen im Projektkontext.",
    articleType: "workflow",
    categorySlug: "admin",
    visibility: "admin",
    audiences: ["admins", "advanced_users"],
    tags: ["Admin", "Behoerden", "Ansprechpartner", "Externe Firmen"],
    searchTerms: ["behoerde", "ansprechpartner", "external org", "stammdaten"],
    relatedArticleSlugs: ["scope-structure-and-master-data", "projects-workspace"],
    contextKeys: ["adminAuthorities"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Behoerden, Ansprechpartner und externe Firmen werden zentral gepflegt, damit Projekte und Dokumente nicht auf Freitext-Referenzen angewiesen sind."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Primary Contacts sollten nur bewusst gesetzt werden.",
          "Archivieren Sie Kontakte oder Behoerden nicht unbemerkt, wenn sie in aktiven Projekten noch verwendet werden."
        ]
      }
    ]
  },
  {
    slug: "admin-data-management-and-recovery",
    title: "Admin: Import, Export, Reset, Demo und Recovery",
    summary: "Datenmanagement ist ein Werkzeug fuer Sicherung, Test, Wiederherstellung und Fehlerisolation.",
    articleType: "step_by_step",
    categorySlug: "admin",
    visibility: "admin",
    audiences: ["admins"],
    tags: ["Import", "Export", "Reset", "Demo", "Recovery", "Safe Mode", "Diagnostics"],
    searchTerms: ["import", "export", "reset", "demo", "safe mode", "recovery", "integritaetspruefung"],
    relatedArticleSlugs: [
      "documents-uploads-and-evidence",
      "troubleshooting-common-issues",
      "security-login-password-mfa"
    ],
    contextKeys: ["adminData"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Die Datenverwaltung kombiniert Sicherung, Import, Demo-Datenerzeugung, TaskState-Cleanup und Benachrichtigungsaktualisierung.",
          "Die Integritaetspruefung sucht inkonsistente Referenzen und bietet sichere Korrekturwege."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Erstellen Sie vor groesseren Aenderungen immer zuerst einen Export.",
          "Pruefen Sie Importfehler und Warnungen vor dem eigentlichen Einspielen.",
          "Nutzen Sie Replace und Append bewusst und nie ohne fachliche Absicht.",
          "Verwenden Sie Safe Mode oder den Recovery-Export nur fuer Fehlerisolierung und Wiederherstellung."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Evidence-Datei-Inhalte sind nicht vollstaendig im JSON-Export enthalten.",
          "Ein Reset ist kein harmloser Testklick, sondern eine bewusste Ruecksetzung auf Demo- oder Ausgangsdaten."
        ]
      }
    ]
  },
  {
    slug: "security-login-password-mfa",
    title: "Login, Passwort, Microsoft-Anmeldung und MFA",
    summary: "Zugang und Sicherheit sind bewusst getrennte Schritte: anmelden, MFA bestaetigen und sicher verwalten.",
    articleType: "workflow",
    categorySlug: "security",
    visibility: "public",
    audiences: ["new_staff", "operative_users", "admins"],
    tags: ["Login", "Passwort", "MFA", "Microsoft", "Recovery-Code", "Sicherheit"],
    searchTerms: ["login", "anmelden", "passwort", "mfa", "microsoft", "recovery code"],
    relatedArticleSlugs: ["admin-users-and-roles", "troubleshooting-common-issues"],
    contextKeys: ["security"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Das Portal unterstuetzt klassische Anmeldung, optional Microsoft-Anmeldung und MFA mit Authenticator-Code oder Recovery-Code."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Beim ersten Login, beim Passwortverlust, beim MFA-Setup, bei einem Geraetewechsel oder wenn MFA neu bestaetigt werden muss."
        ]
      },
      {
        heading: "Schritt fuer Schritt",
        lines: [
          "Melden Sie sich mit E-Mail und Passwort oder ueber Microsoft an.",
          "Wenn MFA verlangt wird, bestaetigen Sie den Login mit Authenticator-Code oder Recovery-Code.",
          "Pflegen Sie MFA in den Sicherheitseinstellungen und speichern Sie Recovery-Codes getrennt und sicher."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Ein Recovery-Code ist kein Alltagslogin, sondern ein Notfallpfad.",
          "Passwort-Reset und MFA-Deaktivierung sind unterschiedliche Prozesse."
        ]
      },
      {
        heading: "Haeufige Fehler",
        lines: [
          "MFA-Code auf einem alten Geraet zu suchen, obwohl bereits ein neues Setup aktiv ist.",
          "Zu spaet zu bemerken, dass der Reset-Link oder MFA-Setup-Link abgelaufen ist."
        ]
      }
    ]
  },
  {
    slug: "mobile-usage-and-field-work",
    title: "Mobile Nutzung und Arbeiten im Feld",
    summary: "Die Web-App ist fuer Kernaufgaben mobil nutzbar, aber nicht jede Seite ist fuer tiefe Bearbeitung gleich gut geeignet.",
    articleType: "reference",
    categorySlug: "workflows",
    visibility: "authenticated",
    audiences: ["mobile_users", "operative_users"],
    tags: ["Mobil", "Smartphone", "Tablet", "Upload", "Feldarbeit"],
    searchTerms: ["mobile", "smartphone", "tablet", "feldarbeit", "kamera"],
    relatedArticleSlugs: ["documents-uploads-and-evidence", "tasks-and-completion"],
    contextKeys: ["mobile"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Die wichtigsten Kernaufgaben wie Aufgabenbearbeitung, Fristabschluss und mobile Nachweiserfassung koennen auf Smartphone und kleinem Tablet genutzt werden."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn Sie vor Ort Fotos erfassen, Nachweise hochladen, eine Aufgabe direkt abschliessen oder schnell einen Status pruefen wollen."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Laengere Stammdatenpflege, komplexe Admin-Arbeit und umfangreiche Reports funktionieren auf Desktop meist besser.",
          "Wenn lokale Evidence-Dateien wichtig sind, vermeiden Sie Browserwechsel mitten im Arbeitsablauf."
        ]
      }
    ]
  },
  {
    slug: "troubleshooting-common-issues",
    title: "Haeufige Probleme schnell einordnen",
    summary: "Ein zentraler Artikel fuer typische Symptome, erste Checks und die richtigen Anschlussstellen.",
    articleType: "troubleshooting",
    categorySlug: "troubleshooting",
    visibility: "authenticated",
    audiences: ["operative_users", "project_workers", "admins"],
    tags: ["Troubleshooting", "Keine Aufgaben", "Importfehler", "Safe Mode", "Evidence fehlt"],
    searchTerms: ["problem", "fehler", "keine aufgaben", "import fehlgeschlagen", "safe mode"],
    relatedArticleSlugs: [
      "admin-data-management-and-recovery",
      "tasks-and-completion",
      "documents-uploads-and-evidence",
      "security-login-password-mfa"
    ],
    contextKeys: ["troubleshooting"],
    sections: [
      {
        heading: "Typische Schnellchecks",
        lines: [
          "Wenn keine Aufgaben sichtbar sind: zuerst Filter, Zeitraum, Assignee und Archivstatus pruefen.",
          "Wenn etwas ueberfaellig erscheint: Due Date und Abschlussstatus in Frist oder Aufgabe pruefen.",
          "Wenn ein Import fehlschlaegt: Validierungsfehler und Warnungen vor dem Bestaetigen lesen.",
          "Wenn Evidence fehlt: pruefen, ob nur Metadaten importiert wurden und die Datei-Inhalte neu hochgeladen werden muessen.",
          "Wenn die UI in einen Fehlerzustand faellt: Recovery-Export, Reset und Safe Mode nur bewusst nutzen."
        ],
        ordered: true
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Safe Mode isoliert Fehlerzustande, ersetzt aber keine saubere Ursachenanalyse.",
          "Nicht jeder Importfehler ist ein technischer Fehler; oft fehlen einfach erforderliche Downstream-Daten im Paket."
        ]
      }
    ]
  },
  {
    slug: "submission-help-gewerbe",
    title: "Fachliche Einreichhilfe: Gewerbe-Basis",
    summary: "Die Gewerbe-Basis beschreibt den allgemeinen Einreichkontext im Produkt, ohne juristische Detailberatung zu leisten.",
    articleType: "submission_guidance",
    categorySlug: "submissions",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["Gewerbe", "Einreichhilfe", "Einreichtyp"],
    searchTerms: ["gewerbe", "einreichung", "gewerbe basis"],
    relatedArticleSlugs: [
      "project-status-and-submission-type",
      "project-detail-and-checklist"
    ],
    contextKeys: ["submissionGewerbe"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Dieser Artikel hilft dabei, Gewerbe-Projekte im Produkt sauber zu strukturieren und typische Arbeitsfragen einzuordnen.",
          "Er ersetzt keine Rechtsberatung und keine fachliche Prüfung durch die zustaendige Stelle."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn ein Projekt fachlich dem Einreichtyp `GEWERBE` zugeordnet ist oder dieser Einreichtyp geprueft wird."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Projektstatus und Einreichtyp nicht vermischen.",
          "Die Projektcheckliste ist eine operative Hilfe, keine formale Einreichbestaetigung."
        ]
      }
    ]
  },
  {
    slug: "submission-help-awg",
    title: "Fachliche Einreichhilfe: AWG-Zusatz",
    summary: "AWG-spezifische Orientierung fuer Projekte mit dem Einreichtyp `AWG`.",
    articleType: "submission_guidance",
    categorySlug: "submissions",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["AWG", "Einreichhilfe", "Checkliste"],
    searchTerms: ["awg", "awg zusatz", "abfallwirtschaft"],
    relatedArticleSlugs: [
      "project-status-and-submission-type",
      "project-detail-and-checklist",
      "submission-help-gewerbe"
    ],
    contextKeys: ["submissionAwg"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Der AWG-Zusatz hilft dabei, AWG-Projekte im Portal besser zu strukturieren, typische Zusatzunterlagen einzuordnen und Folgearbeit sauber zu planen."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn ein Projekt mit `submissionType = AWG` gefuehrt wird oder von einer allgemeinen Gewerbe-Basis in eine vertiefte AWG-Bearbeitung uebergeht."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Nicht jeder AWG-spezifische Arbeitspunkt ist bereits als Produktlogik materialisiert.",
          "Nutzen Sie die Projektcheckliste und Verwandte-Themen-Artikel als strukturierende Hilfe."
        ]
      }
    ]
  },
  {
    slug: "submission-help-uvp-uve",
    title: "Fachliche Einreichhilfe: UVP/UVE-Zusatz",
    summary: "Orientierung fuer Projekte mit hohem Vorbereitungs- und Abstimmungsbedarf im Kontext `UVP_UVE`.",
    articleType: "submission_guidance",
    categorySlug: "submissions",
    visibility: "authenticated",
    audiences: ["project_workers", "advanced_users"],
    tags: ["UVP", "UVE", "Einreichhilfe", "Vorbereitung"],
    searchTerms: ["uvp", "uve", "uvp uve", "uvp preparation"],
    relatedArticleSlugs: [
      "project-status-and-submission-type",
      "project-detail-and-checklist",
      "submission-help-awg"
    ],
    contextKeys: ["submissionUvpUve"],
    sections: [
      {
        heading: "Worum geht es?",
        lines: [
          "Der UVP/UVE-Zusatz bietet Produktorientierung fuer Projekte mit umfangreicher Vorbereitung, abgestuften Statuswechseln und hohem Dokumentbezug."
        ]
      },
      {
        heading: "Wann brauche ich das?",
        lines: [
          "Wenn das Projekt den Einreichtyp `UVP_UVE` traegt oder den Statuspfad `UVP_PREPARATION` beruehrt."
        ]
      },
      {
        heading: "Worauf achten?",
        lines: [
          "Die Hilfe beschreibt Produktnutzung und Strukturierung, nicht die fachliche Endbewertung.",
          "Verwenden Sie Status, Dokumente und Checkliste konsistent und trennen Sie Orientierung von formaler Freigabe."
        ]
      }
    ]
  }
];

export const HELP_FAQ_ENTRIES: HelpFaqEntry[] = [
  {
    id: "faq-no-tasks",
    question: "Warum sehe ich keine Aufgaben?",
    answer: "Pruefen Sie zuerst Filter, Zeitraum, Assignee, Scope und ob nur aktive statt archivierter Eintraege angezeigt werden.",
    visibility: "authenticated",
    tags: ["Aufgaben", "Filter", "keine Aufgaben"],
    relatedArticleSlugs: ["tasks-and-completion", "troubleshooting-common-issues"]
  },
  {
    id: "faq-overdue",
    question: "Warum ist eine Aufgabe oder Frist ueberfaellig?",
    answer: "Der Status ergibt sich aus Due Date und Abschlussstatus. Oeffnen Sie die zugrunde liegende Frist oder Aufgabe und pruefen Sie Datum und Abschluss.",
    visibility: "authenticated",
    tags: ["ueberfaellig", "Frist", "Aufgabe"],
    relatedArticleSlugs: ["deadlines-and-evidence", "tasks-and-completion"]
  },
  {
    id: "faq-import",
    question: "Warum schlaegt ein Import fehl oder wird blockiert?",
    answer: "Teilimporte werden geblockt, wenn Downstream-Daten fehlen oder bereits serverseitige Abhaengigkeiten bestehen. Lesen Sie Validierungsfehler und Warnungen vor dem Bestaetigen komplett.",
    visibility: "authenticated",
    tags: ["Import", "Validierung", "Blocker"],
    relatedArticleSlugs: ["admin-data-management-and-recovery"]
  },
  {
    id: "faq-files-missing",
    question: "Warum fehlen nach dem Import Datei-Inhalte?",
    answer: "JSON-Exporte enthalten keine lokalen Evidence-Dateiinhalte. Datei-Metadaten bleiben sichtbar, die Inhalte muessen aber neu hochgeladen werden.",
    visibility: "authenticated",
    tags: ["Evidence", "Datei", "Import"],
    relatedArticleSlugs: ["documents-uploads-and-evidence"]
  },
  {
    id: "faq-safe-mode",
    question: "Was macht Safe Mode?",
    answer: "Safe Mode startet die App mit einem Fokus auf Fehlerisolierung und ohne regulaeres Weiterarbeiten auf Basis lokaler Browserdaten.",
    visibility: "authenticated",
    tags: ["Safe Mode", "Recovery"],
    relatedArticleSlugs: ["admin-data-management-and-recovery", "troubleshooting-common-issues"]
  },
  {
    id: "faq-mfa",
    question: "Ich komme wegen MFA nicht in das Portal. Was nun?",
    answer: "Verwenden Sie zuerst den aktuellen Authenticator-Code oder einen Recovery-Code. Wenn das nicht moeglich ist, braucht es einen administrativen Reset oder ein neues MFA-Setup.",
    visibility: "public",
    tags: ["MFA", "Login", "Recovery-Code"],
    relatedArticleSlugs: ["security-login-password-mfa"]
  }
];

export const HELP_GLOSSARY: HelpGlossaryEntry[] = [
  {
    term: "Scope",
    definition: "Die hierarchische Struktur aus Company, Standort und Anlage.",
    visibility: "authenticated",
    synonyms: ["Company", "Standort", "Anlage"]
  },
  {
    term: "Projektstatus",
    definition: "Der fachliche Bearbeitungs- oder Verfahrensstand eines Projekts.",
    visibility: "authenticated"
  },
  {
    term: "Einreichtyp",
    definition: "Die fachliche Klassifikation eines Projekts, z. B. `GEWERBE`, `AWG` oder `UVP_UVE`.",
    visibility: "authenticated"
  },
  {
    term: "Rechtsdokument",
    definition: "Ein Bescheid, eine Genehmigung oder ein vergleichbares Referenzdokument mit Projektbezug.",
    visibility: "authenticated",
    synonyms: ["Bescheid", "Genehmigung"]
  },
  {
    term: "Auflage",
    definition: "Eine Verpflichtung aus einem Rechtsdokument, aus der operative Arbeit abgeleitet wird.",
    visibility: "authenticated",
    synonyms: ["Verpflichtung"]
  },
  {
    term: "Frist",
    definition: "Eine terminbezogene Pflicht mit Projekt- oder Dokumentbezug.",
    visibility: "authenticated",
    synonyms: ["Termin"]
  },
  {
    term: "Evidence",
    definition: "Nachweis zum Abschluss einer Aufgabe oder Frist, z. B. Foto, Dokument oder Bericht.",
    visibility: "authenticated",
    synonyms: ["Nachweis", "Anhang"]
  },
  {
    term: "Safe Mode",
    definition: "Ein spezieller Startmodus zur Fehlerisolierung und Recovery-Unterstuetzung.",
    visibility: "authenticated"
  },
  {
    term: "MFA",
    definition: "Mehrfaktor-Authentifizierung mit Authenticator-Code oder Recovery-Code.",
    visibility: "public",
    synonyms: ["Mehrfaktor", "Authenticator"]
  }
];

export const HELP_QUICK_LINKS: HelpQuickLink[] = [
  {
    id: "quick-new-staff",
    label: "Neu im Portal",
    description: "Den Gesamtaufbau in wenigen Minuten verstehen.",
    articleSlug: "portal-overview-and-first-steps",
    visibility: "authenticated"
  },
  {
    id: "quick-projects",
    label: "Projekt sauber anlegen",
    description: "Scope, Behoerde, Ansprechpartner und Einreichtyp richtig setzen.",
    articleSlug: "projects-workspace",
    visibility: "authenticated"
  },
  {
    id: "quick-recovery",
    label: "Import / Export / Recovery",
    description: "Vor groesseren Aenderungen absichern und Fehler sauber isolieren.",
    articleSlug: "admin-data-management-and-recovery",
    visibility: "admin"
  },
  {
    id: "quick-mobile",
    label: "Mobil im Feld arbeiten",
    description: "Aufgaben abschliessen und Nachweise mobil erfassen.",
    articleSlug: "mobile-usage-and-field-work",
    visibility: "authenticated"
  },
  {
    id: "quick-auth",
    label: "Login und MFA",
    description: "Zugang, Passwort und Recovery-Codes verstehen.",
    articleSlug: "security-login-password-mfa",
    visibility: "public"
  },
  {
    id: "quick-troubleshooting",
    label: "Schnelle Fehlerhilfe",
    description: "Typische Symptome und erste Checks.",
    articleSlug: "troubleshooting-common-issues",
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
