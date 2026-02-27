import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Modal,
  Select
} from "@nemetz/ui";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { t } from "../i18n";
import HelpHintCard from "../components/HelpHintCard";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import {
  useAuthorities
} from "../state/AuthoritiesStore";
import {
  parsePersistedPayload
} from "../state/persistence";
import {
  useScopes
} from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";
import { useProjects } from "../state/ProjectsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useTaskState, type TaskStateMap } from "../state/TaskStateStore";
import { useAuditLog } from "../state/AuditLogStore";
import { useNotifications } from "../state/NotificationsStore";
import { sanitizeProjectRelations } from "../state/projectRelations";
import { runIntegrityScan, type IntegrityFinding } from "../state/diagnostics/integrityScan";
import {
  buildExportPayload,
  downloadExportPayload,
  resetAllPersistedData
} from "../state/importExport/exportPayload";
import {
  validateImport,
  type ImportValidationMessage
} from "../state/importExport/validateImport";
import { createDemoScenarioSeed, mergeDemoScenario } from "../state/demoScenario";
import type { ExportPayload } from "../state/importExport/types";
import type { Project } from "../data/projects";
import type { LegalDoc } from "../data/legalDocs";
import type { Obligation } from "../state/ObligationsStore";
import type { Deadline } from "../state/DeadlinesStore";
import type { Evidence } from "../types/evidence";
import { getFile } from "../services/fileStorage";
import { getUserDisplayName } from "../data/users";

type ImportEvidenceNormalizationResult = {
  deadlines?: Deadline[];
  taskState?: TaskStateMap;
  attachmentCount: number;
  missingContentCount: number;
};

type AttachmentReference = {
  entityType: "TASK" | "DEADLINE";
  entityId: string;
  entityLabel: string;
  attachmentId: string;
  filename: string;
};

function collectAttachmentIdsFromEvidence(evidence: Evidence[] | undefined, target: Set<string>) {
  if (!Array.isArray(evidence)) {
    return;
  }
  evidence.forEach((entry) => {
    const attachments = Array.isArray(entry.attachments) ? entry.attachments : [];
    attachments.forEach((attachment) => {
      if (attachment.id) {
        target.add(attachment.id);
      }
    });
  });
}

async function buildFileAvailabilityMap(ids: Set<string>) {
  const rows = await Promise.all(
    Array.from(ids).map(async (id) => {
      const file = await getFile(id);
      return [id, Boolean(file)] as const;
    })
  );
  return new Map(rows);
}

function normalizeEvidenceStorage(
  evidence: Evidence[] | undefined,
  fileAvailability: Map<string, boolean>,
  counters: { attachmentCount: number; missingContentCount: number }
): Evidence[] | undefined {
  if (!Array.isArray(evidence)) {
    return evidence;
  }

  return evidence.map((entry) => ({
    ...entry,
    attachments: (Array.isArray(entry.attachments) ? entry.attachments : []).map((attachment) => {
      counters.attachmentCount += 1;

      if (attachment.storage !== "indexeddb") {
        return attachment;
      }

      const available = attachment.id ? fileAvailability.get(attachment.id) === true : false;
      if (!available) {
        counters.missingContentCount += 1;
      }

      return {
        ...attachment,
        storage: available ? "indexeddb" : "none"
      };
    })
  }));
}

async function normalizeImportedEvidenceStorage(
  input: Pick<ExportPayload["data"], "deadlines" | "taskState">
): Promise<ImportEvidenceNormalizationResult> {
  const attachmentIds = new Set<string>();

  (input.deadlines ?? []).forEach((deadline) =>
    collectAttachmentIdsFromEvidence(deadline.evidence, attachmentIds)
  );
  Object.values(input.taskState ?? {}).forEach((entry) =>
    collectAttachmentIdsFromEvidence(entry?.evidence, attachmentIds)
  );

  const fileAvailability = await buildFileAvailabilityMap(attachmentIds);
  const counters = {
    attachmentCount: 0,
    missingContentCount: 0
  };

  const deadlines = input.deadlines
    ? input.deadlines.map((deadline) => ({
        ...deadline,
        evidence: normalizeEvidenceStorage(deadline.evidence, fileAvailability, counters)
      }))
    : undefined;

  const taskState = input.taskState
    ? Object.fromEntries(
        Object.entries(input.taskState).map(([instanceId, entry]) => [
          instanceId,
          {
            ...entry,
            evidence: normalizeEvidenceStorage(entry.evidence, fileAvailability, counters)
          }
        ])
      )
    : undefined;

  return {
    deadlines,
    taskState,
    attachmentCount: counters.attachmentCount,
    missingContentCount: counters.missingContentCount
  };
}

function collectIndexedDbAttachmentReferences(
  taskState: TaskStateMap,
  deadlines: Deadline[]
): AttachmentReference[] {
  const refs: AttachmentReference[] = [];

  Object.entries(taskState).forEach(([instanceId, entry]) => {
    entry.evidence?.forEach((evidence) => {
      const attachments = Array.isArray(evidence.attachments) ? evidence.attachments : [];
      attachments.forEach((attachment) => {
        if (attachment.storage === "indexeddb" && attachment.id) {
          refs.push({
            entityType: "TASK",
            entityId: instanceId,
            entityLabel: instanceId,
            attachmentId: attachment.id,
            filename: attachment.filename
          });
        }
      });
    });
  });

  deadlines.forEach((deadline) => {
    deadline.evidence?.forEach((evidence) => {
      const attachments = Array.isArray(evidence.attachments) ? evidence.attachments : [];
      attachments.forEach((attachment) => {
        if (attachment.storage === "indexeddb" && attachment.id) {
          refs.push({
            entityType: "DEADLINE",
            entityId: deadline.id,
            entityLabel: deadline.title,
            attachmentId: attachment.id,
            filename: attachment.filename
          });
        }
      });
    });
  });

  return refs;
}

const emptyAuthorityForm = {
  name: "",
  shortName: ""
};

const emptyContactForm = {
  authorityId: "",
  name: "",
  email: "",
  phone: "",
  roleTitle: ""
};

const emptyUserForm = {
  firstName: "",
  lastName: "",
  companyRole: "",
  email: "",
  phone: "",
  isExternal: false
};

function isValidEmail(value: string) {
  if (!value) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminPage() {
  const navigate = useNavigate();
  const runtimeConfig = useRuntimeConfig();
  const {
    authorities,
    contacts,
    getContacts,
    addAuthority,
    updateAuthority,
    archiveAuthority,
    restoreAuthority,
    addContact,
    updateContact,
    archiveContact,
    restoreContact,
    replaceAuthorities,
    resetAuthorities
  } = useAuthorities();
  const {
    companies,
    sites,
    facilities,
    replaceScopes,
    resetScopes
  } = useScopes();
  const {
    users,
    addUser,
    updateUser,
    archiveUser,
    restoreUser,
    searchUsers,
    replaceUsers,
    resetUsers
  } = useUsers();
  const { projects, updateProject, replaceProjects, resetProjects } = useProjects();
  const { legalDocs, updateLegalDoc, replaceLegalDocs, resetLegalDocs } = useLegalDocs();
  const { obligations, updateObligation, replaceObligations, resetObligations } = useObligations();
  const {
    deadlines,
    updateDeadline,
    replaceDeadlines,
    resetDeadlines,
    markDeadlineAttachmentUnavailable
  } = useDeadlines();
  const {
    taskState,
    replaceTaskState,
    resetTaskState,
    cleanupOld,
    markAttachmentUnavailable
  } = useTaskState();
  const { entries, replaceAuditLog, resetAuditLog, logEvent } = useAuditLog();
  const {
    notifications,
    replaceNotifications,
    resetNotifications,
    runDailyTick,
    lastTickAt
  } = useNotifications();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState("authorities");
  const [showArchivedAuthorities, setShowArchivedAuthorities] = useState(false);
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);
  const [showArchivedUsers, setShowArchivedUsers] = useState(false);
  const [userTypeFilter, setUserTypeFilter] = useState<"ALL" | "INTERNAL" | "EXTERNAL">("ALL");
  const [userSearch, setUserSearch] = useState("");

  const [authorityModalOpen, setAuthorityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [archiveUserConfirmId, setArchiveUserConfirmId] = useState<string | null>(null);

  const [editingAuthorityId, setEditingAuthorityId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [authorityForm, setAuthorityForm] = useState(emptyAuthorityForm);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [contactAuthorityFilter, setContactAuthorityFilter] = useState("");

  const [pendingImport, setPendingImport] = useState<ExportPayload | null>(null);
  const [importErrors, setImportErrors] = useState<ImportValidationMessage[]>([]);
  const [importWarnings, setImportWarnings] = useState<ImportValidationMessage[]>([]);
  const [dataManagementMessage, setDataManagementMessage] = useState("");
  const [demoMode, setDemoMode] = useState<"append" | "replace">("replace");
  const [reassignValues, setReassignValues] = useState<Record<string, string>>({});
  const [attachmentDiagnosticsFindings, setAttachmentDiagnosticsFindings] = useState<
    IntegrityFinding[]
  >([]);

  const visibleAuthorities = useMemo(
    () =>
      authorities.filter((authority) =>
        showArchivedAuthorities ? true : !authority.isArchived
      ),
    [authorities, showArchivedAuthorities]
  );

  const authorityFilterOptions = useMemo(
    () =>
      authorities
        .filter((authority) => (showArchivedContacts ? true : !authority.isArchived))
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities, showArchivedContacts]
  );

  const authorityFormOptions = useMemo(
    () =>
      authorities
        .filter(
          (authority) =>
            !authority.isArchived || authority.id === contactForm.authorityId
        )
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities, contactForm.authorityId]
  );

  useEffect(() => {
    if (
      contactAuthorityFilter &&
      authorityFilterOptions.some((option) => option.value === contactAuthorityFilter)
    ) {
      return;
    }
    setContactAuthorityFilter(authorityFilterOptions[0]?.value ?? "");
  }, [authorityFilterOptions, contactAuthorityFilter]);

  const visibleContacts = useMemo(() => {
    if (!contactAuthorityFilter) {
      return [];
    }
    return getContacts(contactAuthorityFilter, { includeArchived: showArchivedContacts });
  }, [contactAuthorityFilter, getContacts, showArchivedContacts]);

  const visibleUsers = useMemo(() => {
    return searchUsers(userSearch, {
      includeArchived: showArchivedUsers,
      includeExternal: userTypeFilter !== "INTERNAL",
      includeInternal: userTypeFilter !== "EXTERNAL"
    });
  }, [searchUsers, showArchivedUsers, userSearch, userTypeFilter]);

  const baseDiagnosticsFindings = useMemo<IntegrityFinding[]>(
    () =>
      runIntegrityScan({
        projects,
        legalDocs,
        obligations,
        deadlines,
        authorities,
        contacts,
        companies,
        sites,
        facilities
      }),
    [authorities, companies, contacts, deadlines, facilities, legalDocs, obligations, projects, sites]
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      const refs = collectIndexedDbAttachmentReferences(taskState, deadlines);
      if (!refs.length) {
        if (active) {
          setAttachmentDiagnosticsFindings([]);
        }
        return;
      }

      const availability = await buildFileAvailabilityMap(
        new Set(refs.map((reference) => reference.attachmentId))
      );

      const findings = refs
        .filter((reference) => availability.get(reference.attachmentId) !== true)
        .map(
          (reference): IntegrityFinding => ({
            id: `attachment-content-${reference.entityType}-${reference.entityId}-${reference.attachmentId}`,
            severity: "warning",
            messageKey: "diagnostics.finding.attachmentContentMissing",
            entityType: reference.entityType,
            entityId: reference.entityId,
            entityLabel: `${reference.entityLabel} · ${reference.filename}`,
            field: "attachment.storage",
            suggestedFixes: ["markUnavailable"],
            attachmentId: reference.attachmentId
          })
        );

      if (active) {
        setAttachmentDiagnosticsFindings(findings);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [deadlines, taskState]);

  const diagnosticsFindings = useMemo(
    () => [...baseDiagnosticsFindings, ...attachmentDiagnosticsFindings],
    [attachmentDiagnosticsFindings, baseDiagnosticsFindings]
  );

  const authorityColumns = [
    {
      key: "name",
      header: t("admin.authorities.table.name"),
      render: (row: (typeof authorities)[number]) => row.name
    },
    {
      key: "shortName",
      header: t("admin.authorities.table.shortName"),
      render: (row: (typeof authorities)[number]) => row.shortName || t("common.notAvailable")
    },
    {
      key: "contacts",
      header: t("admin.authorities.table.contactsCount"),
      align: "right" as const,
      render: (row: (typeof authorities)[number]) =>
        contacts.filter(
          (contact) => contact.authorityId === row.id && !contact.isArchived
        ).length
    }
  ];

  const contactColumns = [
    {
      key: "name",
      header: t("admin.contacts.table.name"),
      render: (row: (typeof contacts)[number]) => row.name
    },
    {
      key: "role",
      header: t("admin.contacts.table.role"),
      render: (row: (typeof contacts)[number]) => row.roleTitle || t("common.notAvailable")
    },
    {
      key: "email",
      header: t("admin.contacts.table.email"),
      render: (row: (typeof contacts)[number]) => row.email || t("common.notAvailable")
    },
    {
      key: "phone",
      header: t("admin.contacts.table.phone"),
      render: (row: (typeof contacts)[number]) => row.phone || t("common.notAvailable")
    }
  ];

  const userColumns = [
    {
      key: "name",
      header: t("admin.users.table.name"),
      render: (row: (typeof users)[number]) => getUserDisplayName(row)
    },
    {
      key: "type",
      header: t("admin.users.table.type"),
      render: (row: (typeof users)[number]) => (
        <Badge variant={row.isExternal ? "warning" : "neutral"}>
          {row.isExternal ? t("users.external") : t("users.internal")}
        </Badge>
      )
    },
    {
      key: "companyRole",
      header: t("admin.users.table.role"),
      render: (row: (typeof users)[number]) => row.companyRole || t("common.notAvailable")
    },
    {
      key: "email",
      header: t("admin.users.table.email"),
      render: (row: (typeof users)[number]) => row.email || t("common.notAvailable")
    },
    {
      key: "phone",
      header: t("users.phone"),
      render: (row: (typeof users)[number]) => row.phone || t("common.notAvailable")
    },
    {
      key: "status",
      header: t("users.archived"),
      render: (row: (typeof users)[number]) =>
        row.isArchived ? t("users.archived") : t("module.status.active")
    }
  ];

  const openAuthorityModal = (authorityId?: string) => {
    if (authorityId) {
      const authority = authorities.find((item) => item.id === authorityId);
      if (authority) {
        setAuthorityForm({
          name: authority.name,
          shortName: authority.shortName ?? ""
        });
        setEditingAuthorityId(authority.id);
      }
    } else {
      setAuthorityForm(emptyAuthorityForm);
      setEditingAuthorityId(null);
    }
    setAuthorityModalOpen(true);
  };

  const openContactModal = (contactId?: string) => {
    if (contactId) {
      const contact = contacts.find((item) => item.id === contactId);
      if (contact) {
        setContactForm({
          authorityId: contact.authorityId,
          name: contact.name,
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          roleTitle: contact.roleTitle ?? ""
        });
        setEditingContactId(contact.id);
      }
    } else {
      setContactForm({
        ...emptyContactForm,
        authorityId: contactAuthorityFilter || ""
      });
      setEditingContactId(null);
    }
    setContactModalOpen(true);
  };

  const openUserModal = (userId?: string) => {
    if (userId) {
      const user = users.find((item) => item.id === userId);
      if (user) {
        setUserForm({
          firstName: user.firstName,
          lastName: user.lastName,
          companyRole: user.companyRole,
          email: user.email,
          phone: user.phone ?? "",
          isExternal: user.isExternal
        });
        setEditingUserId(user.id);
      }
    } else {
      setUserForm(emptyUserForm);
      setEditingUserId(null);
    }
    setUserModalOpen(true);
  };

  const authorityNameError = !authorityForm.name.trim()
    ? t("admin.validation.authorityName")
    : "";

  const contactAuthorityError = !contactForm.authorityId
    ? t("admin.validation.contactAuthority")
    : "";
  const contactNameError = !contactForm.name.trim()
    ? t("admin.validation.contactName")
    : "";
  const contactEmailError =
    contactForm.email.trim() && !isValidEmail(contactForm.email.trim())
      ? t("admin.validation.contactEmail")
      : "";
  const userFirstNameError = !userForm.firstName.trim() ? t("users.validation.required") : "";
  const userLastNameError = !userForm.lastName.trim() ? t("users.validation.required") : "";
  const userCompanyRoleError = !userForm.companyRole.trim() ? t("users.validation.required") : "";
  const userEmailRequiredError = !userForm.email.trim() ? t("users.validation.required") : "";
  const userEmailFormatError =
    userForm.email.trim() && !isValidEmail(userForm.email.trim()) ? t("users.validation.email") : "";
  const userUniqueEmailError = users.some(
    (user) =>
      !user.isArchived &&
      user.id !== editingUserId &&
      user.email.trim().toLowerCase() === userForm.email.trim().toLowerCase()
  )
    ? t("users.validation.uniqueEmail")
    : "";

  const isAuthoritySaveDisabled = Boolean(authorityNameError);
  const isContactSaveDisabled = Boolean(
    contactAuthorityError || contactNameError || contactEmailError
  );
  const isUserSaveDisabled = Boolean(
    userFirstNameError ||
      userLastNameError ||
      userCompanyRoleError ||
      userEmailRequiredError ||
      userEmailFormatError ||
      userUniqueEmailError
  );

  const handleSaveAuthority = () => {
    if (isAuthoritySaveDisabled) {
      return;
    }
    const payload = {
      name: authorityForm.name.trim(),
      shortName: authorityForm.shortName.trim()
    };

    if (editingAuthorityId) {
      updateAuthority(editingAuthorityId, payload);
    } else {
      addAuthority(payload);
    }

    setAuthorityModalOpen(false);
    setEditingAuthorityId(null);
    setAuthorityForm(emptyAuthorityForm);
  };

  const handleSaveContact = () => {
    if (isContactSaveDisabled) {
      return;
    }
    const payload = {
      authorityId: contactForm.authorityId,
      name: contactForm.name.trim(),
      email: contactForm.email.trim(),
      phone: contactForm.phone.trim(),
      roleTitle: contactForm.roleTitle.trim()
    };

    if (editingContactId) {
      updateContact(editingContactId, payload);
    } else {
      addContact(payload);
    }

    setContactModalOpen(false);
    setEditingContactId(null);
    setContactForm(emptyContactForm);
  };

  const handleSaveUser = () => {
    if (isUserSaveDisabled) {
      return;
    }
    const payload = {
      firstName: userForm.firstName.trim(),
      lastName: userForm.lastName.trim(),
      companyRole: userForm.companyRole.trim(),
      email: userForm.email.trim(),
      phone: userForm.phone.trim(),
      isExternal: userForm.isExternal
    };

    if (editingUserId) {
      updateUser(editingUserId, payload);
    } else {
      addUser(payload);
    }

    setUserModalOpen(false);
    setEditingUserId(null);
    setUserForm(emptyUserForm);
  };

  const handleExport = () => {
    const payload = buildExportPayload({
      scopes: {
        companies,
        sites,
        facilities
      },
      authorities: {
        authorities,
        contacts
      },
      projects,
      legalDocs,
      obligations,
      deadlines,
      taskState,
      auditLog: entries,
      users,
      notifications
    });
    downloadExportPayload(payload);

    setDataManagementMessage(t("admin.dataManagement.exportSuccess"));
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setImportErrors([]);
    setImportWarnings([]);
    setDataManagementMessage("");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}")) as unknown;
        const persistedPayload = parsePersistedPayload<unknown>(parsed);
        const candidate =
          persistedPayload && persistedPayload.data && typeof persistedPayload.data === "object"
            ? {
                ...(persistedPayload.data as Record<string, unknown>),
                version: persistedPayload.version,
                exportedAt: persistedPayload.timestamp
              }
            : parsed;

        const validation = validateImport(candidate);
        setImportErrors(validation.errors);
        setImportWarnings(validation.warnings);
        if (!validation.ok || !validation.payload) {
          return;
        }
        setPendingImport(validation.payload);
        setImportConfirmOpen(true);
      } catch {
        setImportErrors([{ key: "admin.dataManagement.importInvalid" }]);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) {
      return;
    }

    const imported = pendingImport.data;
    const legalDocsForImport = imported.legalDocs ?? legalDocs;
    const sanitizedProjectImport = imported.projects
      ? sanitizeProjectRelations(
          imported.projects,
          new Set(legalDocsForImport.map((doc) => doc.id))
        )
      : null;
    const normalizedEvidenceStorage = await normalizeImportedEvidenceStorage({
      deadlines: imported.deadlines,
      taskState: imported.taskState
    });

    replaceScopes(imported.scopes);
    replaceAuthorities(imported.authorities);
    if (sanitizedProjectImport) {
      replaceProjects(sanitizedProjectImport.projects);
    }
    if (imported.legalDocs) {
      replaceLegalDocs(imported.legalDocs);
    }
    if (imported.obligations) {
      replaceObligations(imported.obligations);
    }
    if (imported.deadlines) {
      replaceDeadlines(normalizedEvidenceStorage.deadlines ?? imported.deadlines);
    }
    if (imported.taskState) {
      replaceTaskState(normalizedEvidenceStorage.taskState ?? imported.taskState);
    }
    replaceAuditLog(imported.auditLog ?? []);
    replaceUsers(imported.users ?? users);
    replaceNotifications(imported.notifications ?? []);

    setPendingImport(null);
    setImportConfirmOpen(false);
    setImportErrors([]);

    const warnings: ImportValidationMessage[] = [];
    if (normalizedEvidenceStorage.missingContentCount > 0) {
      warnings.push({ key: "admin.dataManagement.importMissingFiles" });
    }
    if (
      sanitizedProjectImport &&
      (sanitizedProjectImport.removedDependencyLinks > 0 ||
        sanitizedProjectImport.removedLegalDocRefs > 0)
    ) {
      warnings.push({ key: "admin.dataManagement.importRelationsSanitized" });
    }

    setImportWarnings(warnings);

    if (warnings.length) {
      setDataManagementMessage(
        `${t("admin.dataManagement.importSuccess")} ${warnings
          .map((warning) => formatImportMessage(warning))
          .join(" ")}`
      );
      return;
    }

    setDataManagementMessage(t("admin.dataManagement.importSuccess"));
  };

  const handleConfirmReset = () => {
    resetAllPersistedData();
    resetScopes();
    resetAuthorities();
    resetProjects();
    resetLegalDocs();
    resetObligations();
    resetDeadlines();
    resetTaskState();
    resetAuditLog();
    resetUsers();
    resetNotifications();

    setResetConfirmOpen(false);
    setImportErrors([]);
    setImportWarnings([]);
    setDataManagementMessage(t("admin.dataManagement.resetSuccess"));
  };

  const handleCleanupTaskState = () => {
    const removed = cleanupOld(365);
    setDataManagementMessage(t("admin.dataManagement.cleanupTaskStateSuccess").replace("{count}", String(removed)));
  };

  const handleRunNotificationTick = () => {
    const result = runDailyTick({ force: true });
    setDataManagementMessage(
      t("admin.dataManagement.tickResult")
        .replace("{created}", String(result.created))
        .replace("{skipped}", String(result.skipped))
    );
  };

  const handleConfirmDemoScenario = () => {
    const seed = createDemoScenarioSeed();
    if (demoMode === "replace") {
      replaceScopes(seed.scopes);
      replaceAuthorities(seed.authorities);
      replaceProjects(seed.projects);
      replaceLegalDocs(seed.legalDocs);
      replaceObligations(seed.obligations);
      replaceDeadlines(seed.deadlines);
      replaceTaskState(seed.taskState);
      replaceNotifications([]);
    } else {
      const merged = mergeDemoScenario(
        {
          scopes: { companies, sites, facilities },
          authorities: { authorities, contacts },
          projects,
          legalDocs,
          obligations,
          deadlines,
          taskState
        },
        seed
      );
      replaceScopes(merged.scopes);
      replaceAuthorities(merged.authorities);
      replaceProjects(merged.projects);
      replaceLegalDocs(merged.legalDocs);
      replaceObligations(merged.obligations);
      replaceDeadlines(merged.deadlines);
      replaceTaskState(merged.taskState);
    }

    setDemoConfirmOpen(false);
    setDataManagementMessage(t("admin.dataManagement.demoScenarioSuccess"));
    runDailyTick({ force: true });
  };

  const diagnosticsColumns = [
    {
      key: "severity",
      header: t("diagnostics.table.severity"),
      render: (row: IntegrityFinding) =>
        row.severity === "error"
          ? t("diagnostics.severity.error")
          : t("diagnostics.severity.warning")
    },
    {
      key: "entity",
      header: t("diagnostics.table.entity"),
      render: (row: IntegrityFinding) => row.entityLabel
    },
    {
      key: "message",
      header: t("diagnostics.table.message"),
      render: (row: IntegrityFinding) => t(row.messageKey as never)
    }
  ];

  const logIntegrityFix = (
    finding: IntegrityFinding,
    fixType: "archive" | "unlink" | "reassign" | "markUnavailable"
  ) => {
    logEvent({
      actorLabel: "Demo User",
      entityType: "SYSTEM",
      entityId: finding.id,
      action: "CLEANUP",
      summary: `Integrity fix ${fixType} for ${finding.entityType}:${finding.entityId}`
    });
  };

  const handleFixArchive = (finding: IntegrityFinding) => {
    if (!window.confirm(t("diagnostics.confirm.archive"))) {
      return;
    }
    if (finding.entityType === "PROJECT") {
      const project = projects.find((item) => item.id === finding.entityId);
      if (project && !project.isArchived) {
        updateProject(project.id, { archivedAt: new Date().toISOString(), isArchived: true });
        logIntegrityFix(finding, "archive");
      }
      return;
    }
    if (finding.entityType === "LEGAL_DOC") {
      const legalDoc = legalDocs.find((item) => item.id === finding.entityId);
      if (legalDoc && !legalDoc.isArchived) {
        updateLegalDoc(legalDoc.id, { archivedAt: new Date().toISOString(), isArchived: true });
        logIntegrityFix(finding, "archive");
      }
      return;
    }
    if (finding.entityType === "OBLIGATION") {
      const obligation = obligations.find((item) => item.id === finding.entityId);
      if (obligation && !obligation.isArchived) {
        updateObligation(obligation.id, {
          archivedAt: new Date().toISOString(),
          isArchived: true
        });
        logIntegrityFix(finding, "archive");
      }
      return;
    }
    if (finding.entityType === "DEADLINE") {
      const deadline = deadlines.find((item) => item.id === finding.entityId);
      if (deadline && !deadline.isArchived) {
        updateDeadline(deadline.id, { archivedAt: new Date().toISOString(), isArchived: true });
        logIntegrityFix(finding, "archive");
      }
    }
  };

  const handleFixUnlink = (finding: IntegrityFinding) => {
    if (!window.confirm(t("diagnostics.confirm.unlink"))) {
      return;
    }
    if (!finding.field) {
      return;
    }
    if (finding.entityType === "PROJECT") {
      updateProject(finding.entityId, { [finding.field]: undefined } as Partial<Project>);
      logIntegrityFix(finding, "unlink");
      return;
    }
    if (finding.entityType === "LEGAL_DOC") {
      if (finding.field === "scopeOverride.companyId") {
        updateLegalDoc(finding.entityId, { scopeOverride: undefined } as Partial<LegalDoc>);
      } else {
        updateLegalDoc(finding.entityId, { [finding.field]: undefined } as Partial<LegalDoc>);
      }
      logIntegrityFix(finding, "unlink");
      return;
    }
    if (finding.entityType === "OBLIGATION") {
      updateObligation(finding.entityId, {
        [finding.field]: undefined
      } as Partial<Obligation>);
      logIntegrityFix(finding, "unlink");
      return;
    }
    updateDeadline(finding.entityId, { [finding.field]: undefined } as Partial<Deadline>);
    logIntegrityFix(finding, "unlink");
  };

  const handleFixReassign = (finding: IntegrityFinding) => {
    if (!window.confirm(t("diagnostics.confirm.reassign"))) {
      return;
    }
    if (!finding.field) {
      return;
    }
    const value = reassignValues[finding.id];
    if (!value) {
      return;
    }
    if (finding.entityType === "PROJECT") {
      updateProject(finding.entityId, { [finding.field]: value } as Partial<Project>);
      logIntegrityFix(finding, "reassign");
      return;
    }
    if (finding.entityType === "LEGAL_DOC") {
      if (finding.field === "scopeOverride.companyId") {
        const current = legalDocs.find((item) => item.id === finding.entityId);
        updateLegalDoc(finding.entityId, {
          scopeOverride: {
            companyId: value,
            siteId: current?.scopeOverride?.siteId,
            facilityId: current?.scopeOverride?.facilityId
          }
        });
      } else {
        updateLegalDoc(finding.entityId, { [finding.field]: value } as Partial<LegalDoc>);
      }
      logIntegrityFix(finding, "reassign");
      return;
    }
    if (finding.entityType === "OBLIGATION") {
      updateObligation(finding.entityId, { [finding.field]: value } as Partial<Obligation>);
      logIntegrityFix(finding, "reassign");
      return;
    }
    updateDeadline(finding.entityId, { [finding.field]: value } as Partial<Deadline>);
    logIntegrityFix(finding, "reassign");
  };

  const handleFixMarkUnavailable = (finding: IntegrityFinding) => {
    if (!finding.attachmentId) {
      return;
    }
    if (!window.confirm(t("diagnostics.confirm.markUnavailable"))) {
      return;
    }

    if (finding.entityType === "DEADLINE") {
      markDeadlineAttachmentUnavailable(finding.entityId, finding.attachmentId);
      logIntegrityFix(finding, "markUnavailable");
      return;
    }

    if (finding.entityType === "TASK") {
      markAttachmentUnavailable(finding.entityId, finding.attachmentId);
      logIntegrityFix(finding, "markUnavailable");
    }
  };

  const formatImportMessage = (message: ImportValidationMessage) => {
    const base = t(message.key as never);
    if (!message.path) {
      return base;
    }
    return `${base} (${message.path})`;
  };

  useEffect(() => {
    if (!runtimeConfig.features.enableDiagnostics && tab === "diagnostics") {
      setTab("data");
    }
  }, [runtimeConfig.features.enableDiagnostics, tab]);

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "admin", label: t("breadcrumb.admin") }
            ]}
          />
          <h1 className="pageTitle">{t("admin.title")}</h1>
        </div>
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.admin"
          titleKey="helpHints.admin.title"
          bulletsKeys={[
            "helpHints.admin.bullets.1",
            "helpHints.admin.bullets.2",
            "helpHints.admin.bullets.3"
          ]}
          link={{ labelKey: "common.openHelp", to: "/help#admin-tools" }}
        />
      ) : null}

      <div className="tabs">
        <button
          type="button"
          className={`tabButton ${tab === "authorities" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("authorities")}
        >
          {t("admin.tabs.authorities")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "contacts" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("contacts")}
        >
          {t("admin.tabs.contacts")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "users" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("users")}
        >
          {t("admin.tabs.users")}
        </button>
        {runtimeConfig.features.enableDiagnostics ? (
          <button
            type="button"
            className={`tabButton ${tab === "diagnostics" ? "tabButtonActive" : ""}`}
            onClick={() => setTab("diagnostics")}
          >
            {t("admin.tabs.diagnostics")}
          </button>
        ) : null}
        <button
          type="button"
          className={`tabButton ${tab === "data" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("data")}
        >
          {t("admin.tabs.dataManagement")}
        </button>
      </div>

      {tab === "authorities" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("admin.authorities.title")}</h2>
            <div className="inlineMeta">
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={showArchivedAuthorities}
                  onChange={(event) => setShowArchivedAuthorities(event.target.checked)}
                />
                <span>{t("admin.authorities.showArchived")}</span>
              </label>
              <Button onClick={() => openAuthorityModal()}>
                {t("admin.authorities.action.new")}
              </Button>
            </div>
          </div>
          <DataTable
            columns={authorityColumns}
            data={visibleAuthorities}
            getRowKey={(row) => row.id}
            rowActions={(row) => (
              <div className="tableActions">
                <IconButton
                  ariaLabel={t("common.edit")}
                  onClick={() => openAuthorityModal(row.id)}
                >
                  <EditIcon />
                </IconButton>
                {row.isArchived ? (
                  <Button size="sm" variant="ghost" onClick={() => restoreAuthority(row.id)}>
                    {t("common.restore")}
                  </Button>
                ) : (
                  <IconButton
                    ariaLabel={t("common.archive")}
                    onClick={() => archiveAuthority(row.id)}
                  >
                    <ArchiveIcon />
                  </IconButton>
                )}
              </div>
            )}
          />
        </div>
      ) : null}

      {tab === "contacts" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("admin.contacts.title")}</h2>
            <div className="inlineMeta">
              <Select
                options={[
                  { value: "", label: t("admin.contacts.filters.authority") },
                  ...authorityFilterOptions
                ]}
                value={contactAuthorityFilter}
                onChange={(event) => setContactAuthorityFilter(event.target.value)}
              />
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={showArchivedContacts}
                  onChange={(event) => setShowArchivedContacts(event.target.checked)}
                />
                <span>{t("admin.contacts.showArchived")}</span>
              </label>
              <Button onClick={() => openContactModal()} disabled={!contactAuthorityFilter}>
                {t("admin.contacts.action.new")}
              </Button>
            </div>
          </div>

          {contactAuthorityFilter ? (
            <DataTable
              columns={contactColumns}
              data={visibleContacts}
              getRowKey={(row) => row.id}
              rowActions={(row) => (
                <div className="tableActions">
                  <IconButton
                    ariaLabel={t("common.edit")}
                    onClick={() => openContactModal(row.id)}
                  >
                    <EditIcon />
                  </IconButton>
                  {row.isArchived ? (
                    <Button size="sm" variant="ghost" onClick={() => restoreContact(row.id)}>
                      {t("common.restore")}
                    </Button>
                  ) : (
                    <IconButton
                      ariaLabel={t("common.archive")}
                      onClick={() => archiveContact(row.id)}
                    >
                      <ArchiveIcon />
                    </IconButton>
                  )}
                </div>
              )}
            />
          ) : (
            <Card>
              <p className="placeholderText">{t("admin.contacts.emptySelection")}</p>
            </Card>
          )}
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("users.title")}</h2>
            <Button onClick={() => openUserModal()}>{t("users.add")}</Button>
          </div>
          <Card>
            <div className="filterRowFive">
              <Input
                placeholder={t("common.search")}
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
              <Select
                options={[
                  { value: "ALL", label: t("users.filter.all") },
                  { value: "INTERNAL", label: t("users.internal") },
                  { value: "EXTERNAL", label: t("users.external") }
                ]}
                value={userTypeFilter}
                onChange={(event) =>
                  setUserTypeFilter(event.target.value as "ALL" | "INTERNAL" | "EXTERNAL")
                }
              />
            </div>
            <div className="sectionSpacer" />
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={showArchivedUsers}
                onChange={(event) => setShowArchivedUsers(event.target.checked)}
              />
              <span>{t("users.showArchived")}</span>
            </label>
          </Card>
          <DataTable
            columns={userColumns}
            data={visibleUsers}
            getRowKey={(row) => row.id}
            rowActions={(row) => (
              <div className="tableActions">
                <IconButton ariaLabel={t("common.edit")} onClick={() => openUserModal(row.id)}>
                  <EditIcon />
                </IconButton>
                {row.isArchived ? (
                  <Button size="sm" variant="ghost" onClick={() => restoreUser(row.id)}>
                    {t("common.restore")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setArchiveUserConfirmId(row.id)}
                  >
                    {t("common.archive")}
                  </Button>
                )}
              </div>
            )}
          />
        </div>
      ) : null}

      {runtimeConfig.features.enableDiagnostics && tab === "diagnostics" ? (
        <Card>
          <div className="tableSection">
            <div className="sectionHeader">
              <h2 className="sectionTitle">{t("diagnostics.title")}</h2>
              <Button size="sm" variant="ghost" onClick={() => navigate("/help#admin-tools")}>
                {t("common.openHelp")}
              </Button>
            </div>
            <p className="placeholderText">{t("admin.integrity.description")}</p>
            {diagnosticsFindings.length ? (
              <DataTable
                columns={diagnosticsColumns}
                data={diagnosticsFindings}
                getRowKey={(row) => row.id}
                rowActions={(row) => (
                  <div className="tableActions diagnosticsActions">
                    {row.suggestedFixes.includes("archive") ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleFixArchive(row)}
                      >
                        {t("diagnostics.action.archive")}
                      </Button>
                    ) : null}
                    {row.suggestedFixes.includes("unlink") ? (
                      <Button size="sm" variant="ghost" onClick={() => handleFixUnlink(row)}>
                        {t("diagnostics.action.unlink")}
                      </Button>
                    ) : null}
                    {row.suggestedFixes.includes("reassign") && row.options?.length ? (
                      <div className="inlineMeta">
                        <Select
                          options={[
                            { value: "", label: t("diagnostics.action.reassign") },
                            ...row.options
                          ]}
                          value={reassignValues[row.id] ?? ""}
                          onChange={(event) =>
                            setReassignValues((prev) => ({
                              ...prev,
                              [row.id]: event.target.value
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleFixReassign(row)}
                        >
                          {t("diagnostics.action.apply")}
                        </Button>
                      </div>
                    ) : null}
                    {row.suggestedFixes.includes("markUnavailable") ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleFixMarkUnavailable(row)}
                      >
                        {t("diagnostics.action.markUnavailable")}
                      </Button>
                    ) : null}
                  </div>
                )}
              />
            ) : (
              <p className="placeholderText">{t("diagnostics.empty")}</p>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "data" ? (
        <Card>
          <div className="tableSection">
            <div className="sectionHeader">
              <h2 className="sectionTitle">{t("admin.dataManagement.title")}</h2>
              <Button size="sm" variant="ghost" onClick={() => navigate("/help#admin-tools")}>
                {t("common.openHelp")}
              </Button>
            </div>
            <p className="placeholderText">{t("admin.dataManagement.description")}</p>
            <p className="placeholderText">{t("admin.dataManagement.exportFilesHint")}</p>
            <p className="placeholderText">{t("admin.demo.description")}</p>
            <p className="placeholderText">
              {t("admin.dataManagement.lastTickAt").replace("{date}", lastTickAt || t("common.notAvailable"))}
            </p>
            <div className="inlineMeta">
              <Button onClick={handleExport}>{t("admin.dataManagement.export")}</Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("admin.dataManagement.import")}
              </Button>
              <Button variant="secondary" onClick={handleRunNotificationTick}>
                {t("admin.dataManagement.runTick")}
              </Button>
              <Button variant="secondary" onClick={() => setDemoConfirmOpen(true)}>
                {t("admin.dataManagement.generateDemoScenario")}
              </Button>
              <Button variant="secondary" onClick={handleCleanupTaskState}>
                {t("admin.dataManagement.cleanupTaskState")}
              </Button>
              <Button variant="secondary" onClick={() => setResetConfirmOpen(true)}>
                {t("admin.dataManagement.reset")}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="fileInputHidden"
              onChange={handleImportFile}
            />
            {importErrors.length ? (
              <ul className="validationList">
                {importErrors.map((message, index) => (
                  <li key={`${message.key}-${message.path ?? "none"}-${index}`} className="validationText">
                    {formatImportMessage(message)}
                  </li>
                ))}
              </ul>
            ) : null}
            {importWarnings.length ? (
              <ul className="warningList">
                {importWarnings.map((message, index) => (
                  <li key={`${message.key}-${message.path ?? "none"}-${index}`} className="placeholderText">
                    {formatImportMessage(message)}
                  </li>
                ))}
              </ul>
            ) : null}
            {dataManagementMessage ? (
              <p className="placeholderText">{dataManagementMessage}</p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Modal
        open={authorityModalOpen}
        onClose={() => {
          setAuthorityModalOpen(false);
          setEditingAuthorityId(null);
        }}
        closeAriaLabel={t("modal.close")}
        header={
          editingAuthorityId
            ? t("admin.authorities.modal.edit")
            : t("admin.authorities.modal.new")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setAuthorityModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveAuthority} disabled={isAuthoritySaveDisabled}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.authorities.form.name")}</span>
            <Input
              placeholder={t("admin.authorities.form.name")}
              value={authorityForm.name}
              onChange={(event) =>
                setAuthorityForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            {authorityNameError ? (
              <span className="validationText">{authorityNameError}</span>
            ) : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.authorities.form.shortName")}</span>
            <Input
              placeholder={t("admin.authorities.form.shortName")}
              value={authorityForm.shortName}
              onChange={(event) =>
                setAuthorityForm((prev) => ({ ...prev, shortName: event.target.value }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setEditingContactId(null);
        }}
        closeAriaLabel={t("modal.close")}
        header={editingContactId ? t("admin.contacts.modal.edit") : t("admin.contacts.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setContactModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveContact} disabled={isContactSaveDisabled}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.authority")}</span>
            <Select
              options={[
                { value: "", label: t("admin.contacts.form.authority") },
                ...authorityFormOptions
              ]}
              value={contactForm.authorityId}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, authorityId: event.target.value }))
              }
            />
            {contactAuthorityError ? (
              <span className="validationText">{contactAuthorityError}</span>
            ) : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.name")}</span>
            <Input
              placeholder={t("admin.contacts.form.name")}
              value={contactForm.name}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            {contactNameError ? <span className="validationText">{contactNameError}</span> : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.role")}</span>
            <Input
              placeholder={t("admin.contacts.form.role")}
              value={contactForm.roleTitle}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, roleTitle: event.target.value }))
              }
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.email")}</span>
            <Input
              placeholder={t("admin.contacts.form.email")}
              value={contactForm.email}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
            {contactEmailError ? (
              <span className="validationText">{contactEmailError}</span>
            ) : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.phone")}</span>
            <Input
              placeholder={t("admin.contacts.form.phone")}
              value={contactForm.phone}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={userModalOpen}
        onClose={() => {
          setUserModalOpen(false);
          setEditingUserId(null);
          setUserForm(emptyUserForm);
        }}
        closeAriaLabel={t("modal.close")}
        header={editingUserId ? t("users.edit") : t("users.add")}
        footer={
          <div className="modalFooter">
            <Button
              variant="secondary"
              onClick={() => {
                setUserModalOpen(false);
                setEditingUserId(null);
                setUserForm(emptyUserForm);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveUser} disabled={isUserSaveDisabled}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("users.firstName")}</span>
            <Input
              placeholder={t("users.firstName")}
              value={userForm.firstName}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, firstName: event.target.value }))
              }
            />
            {userFirstNameError ? <span className="validationText">{userFirstNameError}</span> : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("users.lastName")}</span>
            <Input
              placeholder={t("users.lastName")}
              value={userForm.lastName}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, lastName: event.target.value }))
              }
            />
            {userLastNameError ? <span className="validationText">{userLastNameError}</span> : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("users.companyRole")}</span>
            <Input
              placeholder={t("users.companyRole")}
              value={userForm.companyRole}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, companyRole: event.target.value }))
              }
            />
            {userCompanyRoleError ? <span className="validationText">{userCompanyRoleError}</span> : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("users.email")}</span>
            <Input
              placeholder={t("users.email")}
              value={userForm.email}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
            {userEmailRequiredError ? <span className="validationText">{userEmailRequiredError}</span> : null}
            {!userEmailRequiredError && userEmailFormatError ? (
              <span className="validationText">{userEmailFormatError}</span>
            ) : null}
            {!userEmailRequiredError && !userEmailFormatError && userUniqueEmailError ? (
              <span className="validationText">{userUniqueEmailError}</span>
            ) : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("users.phone")}</span>
            <Input
              placeholder={t("users.phone")}
              value={userForm.phone}
              onChange={(event) =>
                setUserForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.users.table.type")}</span>
            <Select
              options={[
                { value: "INTERNAL", label: t("users.internal") },
                { value: "EXTERNAL", label: t("users.external") }
              ]}
              value={userForm.isExternal ? "EXTERNAL" : "INTERNAL"}
              onChange={(event) =>
                setUserForm((prev) => ({
                  ...prev,
                  isExternal: event.target.value === "EXTERNAL"
                }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(archiveUserConfirmId)}
        onClose={() => setArchiveUserConfirmId(null)}
        closeAriaLabel={t("modal.close")}
        header={t("common.confirm")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setArchiveUserConfirmId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (archiveUserConfirmId) {
                  archiveUser(archiveUserConfirmId);
                }
                setArchiveUserConfirmId(null);
              }}
            >
              {t("common.archive")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">{t("users.archive.hint")}</p>
      </Modal>

      <Modal
        open={importConfirmOpen}
        onClose={() => {
          setImportConfirmOpen(false);
          setPendingImport(null);
        }}
        closeAriaLabel={t("modal.close")}
        header={t("admin.dataManagement.confirmImportTitle")}
        footer={
          <div className="modalFooter">
            <Button
              variant="secondary"
              onClick={() => {
                setImportConfirmOpen(false);
                setPendingImport(null);
                setImportWarnings([]);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmImport}>{t("common.confirm")}</Button>
          </div>
        }
      >
        <p className="placeholderText">{t("admin.dataManagement.confirmImportText")}</p>
        {importWarnings.length ? (
          <div className="tableSection">
            <p className="placeholderText">{t("admin.dataManagement.importWarningsTitle")}</p>
            <ul className="warningList">
              {importWarnings.map((message, index) => (
                <li key={`${message.key}-${message.path ?? "none"}-${index}`} className="placeholderText">
                  {formatImportMessage(message)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={t("admin.dataManagement.confirmResetTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setResetConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmReset}>{t("common.confirm")}</Button>
          </div>
        }
      >
        <p className="placeholderText">{t("admin.dataManagement.confirmResetText")}</p>
      </Modal>

      <Modal
        open={demoConfirmOpen}
        onClose={() => setDemoConfirmOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={t("admin.dataManagement.confirmDemoTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setDemoConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmDemoScenario}>{t("common.confirm")}</Button>
          </div>
        }
      >
        <div className="tableSection">
          <p className="placeholderText">{t("admin.dataManagement.confirmDemoText")}</p>
          <Select
            options={[
              { value: "replace", label: t("admin.dataManagement.demoMode.replace") },
              { value: "append", label: t("admin.dataManagement.demoMode.append") }
            ]}
            value={demoMode}
            onChange={(event) => setDemoMode(event.target.value as "append" | "replace")}
          />
        </div>
      </Modal>
    </div>
  );
}
