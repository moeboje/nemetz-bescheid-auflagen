import type { Authority, AuthorityContact } from "../data/authorities";
import type { Deadline } from "../data/deadlines";
import type { LegalDoc } from "../data/legalDocs";
import {
  cloneDefaultObligationEvidenceRequirements,
  type Obligation
} from "../data/obligations";
import type { Project } from "../data/projects";
import { buildObligationTaskInstanceId, type TaskStateMap } from "./TaskStateStore";
import type { AuthoritiesSnapshot } from "./AuthoritiesStore";
import type { ScopesSnapshot } from "./ScopesStore";

export type DemoScenarioSeed = {
  scopes: ScopesSnapshot;
  authorities: AuthoritiesSnapshot;
  projects: Project[];
  legalDocs: LegalDoc[];
  obligations: Obligation[];
  deadlines: Deadline[];
  taskState: TaskStateMap;
};

function dateOffset(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function isoStamp() {
  return new Date().toISOString();
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((item) => [item.id, item] as const));
  incoming.forEach((item) => {
    byId.set(item.id, item);
  });
  return Array.from(byId.values());
}

export function createDemoScenarioSeed(): DemoScenarioSeed {
  const now = isoStamp();
  const scopes: ScopesSnapshot = {
    companies: [
      {
        id: "demo-c-001",
        name: "Demo Company Nord",
        shortName: "DCN",
        isArchived: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "demo-c-002",
        name: "Demo Company Sued",
        shortName: "DCS",
        isArchived: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    sites: [
      {
        id: "demo-s-001",
        companyId: "demo-c-001",
        name: "Demo Site Wien",
        isArchived: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "demo-s-002",
        companyId: "demo-c-002",
        name: "Demo Site Graz",
        isArchived: false,
        createdAt: now,
        updatedAt: now
      }
    ],
    facilities: [
      {
        id: "demo-f-001",
        companyId: "demo-c-001",
        siteId: "demo-s-001",
        name: "Sortierhalle A",
        type: "Sortierung",
        isArchived: false,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "demo-f-002",
        companyId: "demo-c-002",
        siteId: "demo-s-002",
        name: "Zwischenlager B",
        type: "Lager",
        isArchived: false,
        createdAt: now,
        updatedAt: now
      }
    ]
  };

  const authorities: Authority[] = [
    {
      id: "demo-auth-001",
      name: "Bezirkshauptmannschaft Demo",
      shortName: "BHD",
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-auth-002",
      name: "Landesregierung Demo",
      shortName: "LRD",
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const contacts: AuthorityContact[] = [
    {
      id: "demo-contact-001",
      authorityId: "demo-auth-001",
      name: "Sachbearbeitung Demo 1",
      email: "demo1@example.invalid",
      roleTitle: "Sachbearbeitung",
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-contact-002",
      authorityId: "demo-auth-002",
      name: "Sachbearbeitung Demo 2",
      email: "demo2@example.invalid",
      roleTitle: "Koordination",
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const projects: Project[] = [
    {
      id: "demo-p-001",
      title: "Demo Projekt Bescheid Nord",
      shortDescription: "Demodaten fuer Bescheidprojekt Nord.",
      authorityRef: "DEMO-001",
      companyId: "demo-c-001",
      siteId: "demo-s-001",
      facilityId: "demo-f-001",
      authorityId: "demo-auth-001",
      authorityContactId: "demo-contact-001",
      ownerUserId: "u-001",
      deputyUserId: "u-002",
      internalParticipants: [{ userId: "u-003" }],
      participantUserIds: ["u-003"],
      dependsOnProjectIds: [],
      referenceLegalDocIds: [],
      externalParticipants: [],
      attachments: [],
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-p-002",
      title: "Demo Projekt Zwischenlager Sued",
      shortDescription: "Demodaten fuer Zwischenlager.",
      authorityRef: "DEMO-002",
      companyId: "demo-c-002",
      siteId: "demo-s-002",
      facilityId: "demo-f-002",
      authorityId: "demo-auth-002",
      authorityContactId: "demo-contact-002",
      ownerUserId: "u-004",
      deputyUserId: "u-005",
      internalParticipants: [{ userId: "u-006" }],
      participantUserIds: ["u-006"],
      dependsOnProjectIds: ["demo-p-001"],
      referenceLegalDocIds: ["demo-ld-001"],
      externalParticipants: [],
      attachments: [],
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const legalDocs: LegalDoc[] = [
    {
      id: "demo-ld-001",
      projectId: "demo-p-001",
      type: "DECISION",
      title: "Bescheid Demo Nord",
      shortDescription: "Bescheid fuer Standort Nord.",
      reference: "BES-DEMO-001",
      issuedAt: dateOffset(-45),
      attachments: [],
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ld-002",
      projectId: "demo-p-002",
      type: "PERMIT",
      title: "Gewerbe Demo Zwischenlager",
      shortDescription: "Gewerbeberechtigung fuer Zwischenlager.",
      reference: "GEW-DEMO-002",
      issuedAt: dateOffset(-30),
      attachments: [],
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ld-003",
      projectId: "demo-p-002",
      type: "DIRECTIVE",
      title: "Abfallsammelgenehmigung Demo",
      shortDescription: "Unternehmensweite Demo-Genehmigung.",
      reference: "ABF-DEMO-003",
      issuedAt: dateOffset(-20),
      attachments: [],
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const obligations: Obligation[] = [
    {
      id: "demo-ob-001",
      legalDocId: "demo-ld-001",
      title: "Monatliche Sichtkontrolle",
      infoTextLong: "Monatliche Sichtkontrolle mit Dokumentation.",
      level: "MANDATORY",
      scheduleType: "ONCE",
      firstDueDate: dateOffset(-5),
      ownerUserId: "u-001",
      deputyUserId: "u-002",
      criticality: "HIGH",
      emailReminderEnabled: true,
      emailReminderDaysBefore: 7,
      evidenceRequirements: cloneDefaultObligationEvidenceRequirements(),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ob-002",
      legalDocId: "demo-ld-001",
      title: "Quartalsbericht an Behoerde",
      infoTextLong: "Quartalsbericht fristgerecht uebermitteln.",
      level: "MANDATORY",
      scheduleType: "ONCE",
      firstDueDate: dateOffset(10),
      ownerUserId: "u-003",
      deputyUserId: "u-004",
      criticality: "MEDIUM",
      emailReminderEnabled: true,
      emailReminderDaysBefore: 14,
      evidenceRequirements: cloneDefaultObligationEvidenceRequirements(),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ob-003",
      legalDocId: "demo-ld-001",
      title: "Jaehrlicher Wartungsnachweis",
      infoTextLong: "Wartungsnachweise jaehrlich pruefen.",
      level: "RECOMMENDED",
      scheduleType: "ONCE",
      firstDueDate: dateOffset(40),
      ownerUserId: "u-005",
      deputyUserId: "u-006",
      criticality: "LOW",
      emailReminderEnabled: false,
      emailReminderDaysBefore: undefined,
      evidenceRequirements: cloneDefaultObligationEvidenceRequirements(),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ob-004",
      legalDocId: "demo-ld-002",
      title: "Pruefprotokoll Lagerflaeche",
      infoTextLong: "Regelmaessige Protokolle fuer Lagerflaeche.",
      level: "MANDATORY",
      scheduleType: "ONCE",
      firstDueDate: dateOffset(-1),
      ownerUserId: "u-004",
      deputyUserId: "u-005",
      criticality: "HIGH",
      emailReminderEnabled: true,
      emailReminderDaysBefore: 1,
      evidenceRequirements: cloneDefaultObligationEvidenceRequirements(),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ob-005",
      legalDocId: "demo-ld-002",
      title: "Halbjahres-Review",
      infoTextLong: "Halbjahres-Review intern dokumentieren.",
      level: "RECOMMENDED",
      scheduleType: "ONCE",
      firstDueDate: dateOffset(60),
      ownerUserId: "u-006",
      deputyUserId: "u-007",
      criticality: "LOW",
      emailReminderEnabled: false,
      emailReminderDaysBefore: undefined,
      evidenceRequirements: cloneDefaultObligationEvidenceRequirements(),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-ob-006",
      legalDocId: "demo-ld-003",
      title: "Einmaliger Nachweis Sammelgenehmigung",
      infoTextLong: "Nachweis fuer Sammelgenehmigung einreichen.",
      level: "MANDATORY",
      scheduleType: "ONCE",
      firstDueDate: dateOffset(5),
      ownerUserId: "u-008",
      deputyUserId: "u-009",
      criticality: "MEDIUM",
      emailReminderEnabled: true,
      emailReminderDaysBefore: 7,
      evidenceRequirements: cloneDefaultObligationEvidenceRequirements(),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const deadlines: Deadline[] = [
    {
      id: "demo-dl-001",
      title: "Frist Nachreichung Unterlagen",
      description: "Unterlagen bei Behoerde nachreichen.",
      dueDate: dateOffset(-3),
      status: "OPEN",
      projectId: "demo-p-001",
      legalDocId: "demo-ld-001",
      authorityId: "demo-auth-001",
      ownerUserId: "u-001",
      deputyUserId: "u-002",
      emailReminderEnabled: true,
      emailReminderDaysBefore: 7,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-dl-002",
      title: "Frist Jahresmeldung",
      description: "Jahresmeldung abschliessen.",
      dueDate: dateOffset(14),
      status: "OPEN",
      projectId: "demo-p-002",
      legalDocId: "demo-ld-002",
      authorityId: "demo-auth-002",
      ownerUserId: "u-004",
      deputyUserId: "u-005",
      emailReminderEnabled: true,
      emailReminderDaysBefore: 14,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "demo-dl-003",
      title: "Frist interne Freigabe",
      description: "Interne Freigabe fuer Dokumentation.",
      dueDate: dateOffset(35),
      status: "OPEN",
      projectId: "demo-p-002",
      legalDocId: "demo-ld-003",
      authorityId: "demo-auth-002",
      ownerUserId: "u-006",
      deputyUserId: "u-007",
      emailReminderEnabled: false,
      emailReminderDaysBefore: undefined,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const taskState: TaskStateMap = {
    [buildObligationTaskInstanceId("demo-ob-001", dateOffset(-5))]: {
      status: "DONE",
      completedAt: isoStamp(),
      completedByUserId: "u-001",
      completedByLabel: "Betriebsleitung 1",
      evidence: [],
      updatedAt: isoStamp()
    },
    [buildObligationTaskInstanceId("demo-ob-004", dateOffset(-1))]: {
      status: "IN_PROGRESS",
      updatedAt: isoStamp(),
      evidence: []
    }
  };

  return {
    scopes,
    authorities: {
      authorities,
      contacts
    },
    projects,
    legalDocs,
    obligations,
    deadlines,
    taskState
  };
}

export function mergeDemoScenario(current: DemoScenarioSeed, incoming: DemoScenarioSeed): DemoScenarioSeed {
  return {
    scopes: {
      companies: mergeById(current.scopes.companies, incoming.scopes.companies),
      sites: mergeById(current.scopes.sites, incoming.scopes.sites),
      facilities: mergeById(current.scopes.facilities, incoming.scopes.facilities)
    },
    authorities: {
      authorities: mergeById(current.authorities.authorities, incoming.authorities.authorities),
      contacts: mergeById(current.authorities.contacts, incoming.authorities.contacts)
    },
    projects: mergeById(current.projects, incoming.projects),
    legalDocs: mergeById(current.legalDocs, incoming.legalDocs),
    obligations: mergeById(current.obligations, incoming.obligations),
    deadlines: mergeById(current.deadlines, incoming.deadlines),
    taskState: {
      ...current.taskState,
      ...incoming.taskState
    }
  };
}
