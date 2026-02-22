import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Modal,
  Select
} from "@nemetz/ui";
import { t } from "../i18n";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import {
  AuthoritiesSnapshot,
  useAuthorities
} from "../state/AuthoritiesStore";
import {
  clearPersistedValue,
  parsePersistedPayload,
  STORAGE_KEYS,
  STORAGE_VERSION
} from "../state/persistence";
import {
  ScopesSnapshot,
  useScopes
} from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";
import { useProjects } from "../state/ProjectsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useTaskState } from "../state/TaskStateStore";
import { useAuditLog } from "../state/AuditLogStore";
import type { Project } from "../data/projects";
import type { LegalDoc } from "../data/legalDocs";
import type { Obligation } from "../state/ObligationsStore";
import type { Deadline } from "../state/DeadlinesStore";
import type { AuditLogEntry } from "../state/AuditLogStore";
import type { TaskStateMap } from "../state/TaskStateStore";
import type { UserStub } from "../data/users";

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

type AdminDataImport = {
  version: number;
  exportedAt: string;
  scopes: ScopesSnapshot;
  authorities: AuthoritiesSnapshot;
  projects: Project[];
  legalDocs: LegalDoc[];
  obligations: Obligation[];
  deadlines: Deadline[];
  taskState: TaskStateMap;
  auditLog?: AuditLogEntry[];
  users?: UserStub[];
};

function isValidEmail(value: string) {
  if (!value) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function AdminPage() {
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
  const { users, replaceUsers, resetUsers } = useUsers();
  const { projects, replaceProjects, resetProjects } = useProjects();
  const { legalDocs, replaceLegalDocs, resetLegalDocs } = useLegalDocs();
  const { obligations, replaceObligations, resetObligations } = useObligations();
  const { deadlines, replaceDeadlines, resetDeadlines } = useDeadlines();
  const { taskState, replaceTaskState, resetTaskState, cleanupOld } = useTaskState();
  const { entries, replaceAuditLog, resetAuditLog } = useAuditLog();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState("authorities");
  const [showArchivedAuthorities, setShowArchivedAuthorities] = useState(false);
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);

  const [authorityModalOpen, setAuthorityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [editingAuthorityId, setEditingAuthorityId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const [authorityForm, setAuthorityForm] = useState(emptyAuthorityForm);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [contactAuthorityFilter, setContactAuthorityFilter] = useState("");

  const [pendingImport, setPendingImport] = useState<AdminDataImport | null>(null);
  const [importError, setImportError] = useState("");
  const [dataManagementMessage, setDataManagementMessage] = useState("");

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
      key: "displayName",
      header: t("admin.users.table.name"),
      render: (row: (typeof users)[number]) => row.displayName
    },
    {
      key: "email",
      header: t("admin.users.table.email"),
      render: (row: (typeof users)[number]) => row.email || t("common.notAvailable")
    },
    {
      key: "role",
      header: t("admin.users.table.role"),
      render: (row: (typeof users)[number]) => row.roleLabel || t("common.notAvailable")
    },
    {
      key: "type",
      header: t("admin.users.table.type"),
      render: (row: (typeof users)[number]) =>
        row.isExternal ? t("admin.users.external") : t("admin.users.internal")
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

  const isAuthoritySaveDisabled = Boolean(authorityNameError);
  const isContactSaveDisabled = Boolean(
    contactAuthorityError || contactNameError || contactEmailError
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

  const handleExport = () => {
    const payload: AdminDataImport = {
      version: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
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
      users
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nemetz-compliance-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setDataManagementMessage(t("admin.dataManagement.exportSuccess"));
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setImportError("");
    setDataManagementMessage("");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? "{}"));
        const persistedPayload = parsePersistedPayload<AdminDataImport>(parsed);
        const payload = persistedPayload
          ? {
              ...persistedPayload.data,
              version: persistedPayload.version,
              exportedAt: persistedPayload.timestamp
            }
          : (parsed as Partial<AdminDataImport>);

        if (
          !payload ||
          payload.version !== STORAGE_VERSION ||
          !payload.scopes ||
          !payload.authorities ||
          !payload.projects ||
          !payload.legalDocs ||
          !payload.obligations ||
          !payload.deadlines ||
          !payload.taskState
        ) {
          setImportError(t("admin.dataManagement.importInvalid"));
          return;
        }
        setPendingImport({
          ...payload,
          auditLog: payload.auditLog ?? [],
          users: payload.users ?? users
        } as AdminDataImport);
        setImportConfirmOpen(true);
      } catch {
        setImportError(t("admin.dataManagement.importInvalid"));
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!pendingImport) {
      return;
    }

    replaceScopes(pendingImport.scopes);
    replaceAuthorities(pendingImport.authorities);
    replaceProjects(pendingImport.projects);
    replaceLegalDocs(pendingImport.legalDocs);
    replaceObligations(pendingImport.obligations);
    replaceDeadlines(pendingImport.deadlines);
    replaceTaskState(pendingImport.taskState);
    replaceAuditLog(pendingImport.auditLog ?? []);
    replaceUsers(pendingImport.users ?? users);

    setPendingImport(null);
    setImportConfirmOpen(false);
    setImportError("");
    setDataManagementMessage(t("admin.dataManagement.importSuccess"));
  };

  const handleConfirmReset = () => {
    Object.values(STORAGE_KEYS).forEach((key) => clearPersistedValue(key));
    resetScopes();
    resetAuthorities();
    resetProjects();
    resetLegalDocs();
    resetObligations();
    resetDeadlines();
    resetTaskState();
    resetAuditLog();
    resetUsers();

    setResetConfirmOpen(false);
    setImportError("");
    setDataManagementMessage(t("admin.dataManagement.resetSuccess"));
  };

  const handleCleanupTaskState = () => {
    const removed = cleanupOld(365);
    setDataManagementMessage(t("admin.dataManagement.cleanupTaskStateSuccess").replace("{count}", String(removed)));
  };

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
        <Card>
          <DataTable columns={userColumns} data={users} getRowKey={(row) => row.id} />
        </Card>
      ) : null}

      {tab === "data" ? (
        <Card>
          <div className="tableSection">
            <h2 className="sectionTitle">{t("admin.dataManagement.title")}</h2>
            <p className="placeholderText">{t("admin.dataManagement.description")}</p>
            <div className="inlineMeta">
              <Button onClick={handleExport}>{t("admin.dataManagement.export")}</Button>
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("admin.dataManagement.import")}
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
            {importError ? <p className="validationText">{importError}</p> : null}
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
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmImport}>{t("common.confirm")}</Button>
          </div>
        }
      >
        <p className="placeholderText">{t("admin.dataManagement.confirmImportText")}</p>
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
    </div>
  );
}
