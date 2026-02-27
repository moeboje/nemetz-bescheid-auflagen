import type { I18nKey } from "../i18n";

export type HelpSectionStep = {
  titleKey: I18nKey;
  bodyKey: I18nKey;
};

export type HelpSectionLink = {
  labelKey: I18nKey;
  to: string;
};

export type HelpSection = {
  id: string;
  titleKey: I18nKey;
  descriptionKey?: I18nKey;
  steps?: HelpSectionStep[];
  links?: HelpSectionLink[];
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "quickstart",
    titleKey: "help.sections.quickstart.title",
    descriptionKey: "help.sections.quickstart.description",
    steps: [
      {
        titleKey: "help.sections.quickstart.steps.1.title",
        bodyKey: "help.sections.quickstart.steps.1.body"
      },
      {
        titleKey: "help.sections.quickstart.steps.2.title",
        bodyKey: "help.sections.quickstart.steps.2.body"
      },
      {
        titleKey: "help.sections.quickstart.steps.3.title",
        bodyKey: "help.sections.quickstart.steps.3.body"
      },
      {
        titleKey: "help.sections.quickstart.steps.4.title",
        bodyKey: "help.sections.quickstart.steps.4.body"
      },
      {
        titleKey: "help.sections.quickstart.steps.5.title",
        bodyKey: "help.sections.quickstart.steps.5.body"
      },
      {
        titleKey: "help.sections.quickstart.steps.6.title",
        bodyKey: "help.sections.quickstart.steps.6.body"
      },
      {
        titleKey: "help.sections.quickstart.steps.7.title",
        bodyKey: "help.sections.quickstart.steps.7.body"
      }
    ],
    links: [
      { labelKey: "help.links.projects", to: "/projects" },
      { labelKey: "help.links.legalDocs", to: "/legal-docs" },
      { labelKey: "help.links.tasks", to: "/tasks" }
    ]
  },
  {
    id: "data-model",
    titleKey: "help.sections.model.title",
    descriptionKey: "help.sections.model.description",
    steps: [
      {
        titleKey: "help.sections.model.steps.1.title",
        bodyKey: "help.sections.model.steps.1.body"
      },
      {
        titleKey: "help.sections.model.steps.2.title",
        bodyKey: "help.sections.model.steps.2.body"
      },
      {
        titleKey: "help.sections.model.steps.3.title",
        bodyKey: "help.sections.model.steps.3.body"
      },
      {
        titleKey: "help.sections.model.steps.4.title",
        bodyKey: "help.sections.model.steps.4.body"
      },
      {
        titleKey: "help.sections.model.steps.5.title",
        bodyKey: "help.sections.model.steps.5.body"
      },
      {
        titleKey: "help.sections.model.steps.6.title",
        bodyKey: "help.sections.model.steps.6.body"
      },
      {
        titleKey: "help.sections.model.steps.7.title",
        bodyKey: "help.sections.model.steps.7.body"
      }
    ],
    links: [
      { labelKey: "help.links.scopes", to: "/scopes" },
      { labelKey: "help.links.projects", to: "/projects" },
      { labelKey: "help.links.admin", to: "/admin" }
    ]
  },
  {
    id: "workflows",
    titleKey: "help.sections.workflows.title",
    descriptionKey: "help.sections.workflows.description",
    steps: [
      {
        titleKey: "help.sections.workflows.steps.1.title",
        bodyKey: "help.sections.workflows.steps.1.body"
      },
      {
        titleKey: "help.sections.workflows.steps.2.title",
        bodyKey: "help.sections.workflows.steps.2.body"
      },
      {
        titleKey: "help.sections.workflows.steps.3.title",
        bodyKey: "help.sections.workflows.steps.3.body"
      },
      {
        titleKey: "help.sections.workflows.steps.4.title",
        bodyKey: "help.sections.workflows.steps.4.body"
      },
      {
        titleKey: "help.sections.workflows.steps.5.title",
        bodyKey: "help.sections.workflows.steps.5.body"
      },
      {
        titleKey: "help.sections.workflows.steps.6.title",
        bodyKey: "help.sections.workflows.steps.6.body"
      },
      {
        titleKey: "help.sections.workflows.steps.7.title",
        bodyKey: "help.sections.workflows.steps.7.body"
      }
    ],
    links: [
      { labelKey: "help.links.projects", to: "/projects" },
      { labelKey: "help.links.legalDocs", to: "/legal-docs" },
      { labelKey: "help.links.obligations", to: "/obligations" },
      { labelKey: "help.links.deadlines", to: "/deadlines" },
      { labelKey: "help.links.reports", to: "/reports" },
      { labelKey: "help.links.admin", to: "/admin" }
    ]
  },
  {
    id: "admin-tools",
    titleKey: "help.sections.adminTools.title",
    descriptionKey: "help.sections.adminTools.description",
    steps: [
      {
        titleKey: "help.sections.adminTools.steps.1.title",
        bodyKey: "help.sections.adminTools.steps.1.body"
      },
      {
        titleKey: "help.sections.adminTools.steps.2.title",
        bodyKey: "help.sections.adminTools.steps.2.body"
      },
      {
        titleKey: "help.sections.adminTools.steps.3.title",
        bodyKey: "help.sections.adminTools.steps.3.body"
      },
      {
        titleKey: "help.sections.adminTools.steps.4.title",
        bodyKey: "help.sections.adminTools.steps.4.body"
      }
    ],
    links: [{ labelKey: "help.links.admin", to: "/admin" }]
  },
  {
    id: "faq",
    titleKey: "help.sections.faq.title",
    descriptionKey: "help.sections.faq.description",
    steps: [
      {
        titleKey: "help.sections.faq.steps.1.title",
        bodyKey: "help.sections.faq.steps.1.body"
      },
      {
        titleKey: "help.sections.faq.steps.2.title",
        bodyKey: "help.sections.faq.steps.2.body"
      },
      {
        titleKey: "help.sections.faq.steps.3.title",
        bodyKey: "help.sections.faq.steps.3.body"
      },
      {
        titleKey: "help.sections.faq.steps.4.title",
        bodyKey: "help.sections.faq.steps.4.body"
      }
    ],
    links: [
      { labelKey: "help.links.tasks", to: "/tasks" },
      { labelKey: "help.links.admin", to: "/admin" }
    ]
  },
  {
    id: "limitations",
    titleKey: "help.sections.limitations.title",
    descriptionKey: "help.sections.limitations.description",
    steps: [
      {
        titleKey: "help.sections.limitations.steps.1.title",
        bodyKey: "help.sections.limitations.steps.1.body"
      },
      {
        titleKey: "help.sections.limitations.steps.2.title",
        bodyKey: "help.sections.limitations.steps.2.body"
      }
    ]
  }
];
