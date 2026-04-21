import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, IconButton, Input, Modal, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import { t } from "../i18n";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import AdminSubnav from "../components/AdminSubnav";
import HelpHintCard from "../components/HelpHintCard";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";
import { useAuthorization } from "../state/AuthorizationStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import type { Authority, AuthorityContact } from "../data/authorities";

type AuthorityFormState = {
  name: string;
  shortName: string;
};

type ContactFormState = {
  authorityId: string;
  name: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  department: string;
  email: string;
  phone: string;
  mobile: string;
  notes: string;
  isPrimary: boolean;
};

type ConfirmationState =
  | {
      entity: "authority";
      id: string;
      label: string;
      mode: "archive" | "restore";
    }
  | {
      entity: "contact";
      id: string;
      label: string;
      mode: "archive" | "restore";
    };

const emptyAuthorityForm: AuthorityFormState = {
  name: "",
  shortName: ""
};

const emptyContactForm: ContactFormState = {
  authorityId: "",
  name: "",
  firstName: "",
  lastName: "",
  roleTitle: "",
  department: "",
  email: "",
  phone: "",
  mobile: "",
  notes: "",
  isPrimary: false
};

function isValidEmail(value: string) {
  if (!value.trim()) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function extractApiErrorMessage(error: unknown, fallbackKey: string) {
  if (error instanceof ApiError && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  return t(fallbackKey);
}

export default function AdminAuthoritiesPage() {
  const runtimeConfig = useRuntimeConfig();
  const { permissions } = useAuthorization();
  const canManageAuthorities = permissions.canManageAuthoritiesAdmin;
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
    restoreContact
  } = useAuthorities();

  const [showArchivedAuthorities, setShowArchivedAuthorities] = useState(false);
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);
  const [selectedAuthorityId, setSelectedAuthorityId] = useState("");

  const [authorityModalOpen, setAuthorityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingAuthorityId, setEditingAuthorityId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const [authorityForm, setAuthorityForm] = useState<AuthorityFormState>(emptyAuthorityForm);
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);

  const visibleAuthorities = useMemo(
    () => authorities.filter((authority) => (showArchivedAuthorities ? true : !authority.isArchived)),
    [authorities, showArchivedAuthorities]
  );

  useEffect(() => {
    if (selectedAuthorityId && visibleAuthorities.some((authority) => authority.id === selectedAuthorityId)) {
      return;
    }

    setSelectedAuthorityId(visibleAuthorities[0]?.id ?? "");
  }, [selectedAuthorityId, visibleAuthorities]);

  const selectedAuthority = useMemo(
    () => authorities.find((authority) => authority.id === selectedAuthorityId) ?? null,
    [authorities, selectedAuthorityId]
  );

  const visibleContacts = useMemo(() => {
    if (!selectedAuthorityId) {
      return [];
    }

    return getContacts(selectedAuthorityId, { includeArchived: showArchivedContacts });
  }, [getContacts, selectedAuthorityId, showArchivedContacts]);

  const authorityOptions = useMemo(
    () =>
      authorities
        .filter((authority) => !authority.isArchived || authority.id === contactForm.authorityId)
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities, contactForm.authorityId]
  );

  const authorityNameError = !authorityForm.name.trim() ? t("admin.validation.authorityName") : "";
  const derivedContactName = [contactForm.firstName.trim(), contactForm.lastName.trim()].filter(Boolean).join(" ");
  const contactAuthorityError = !contactForm.authorityId ? t("admin.validation.contactAuthority") : "";
  const contactNameError = !(contactForm.name.trim() || derivedContactName) ? t("admin.validation.contactName") : "";
  const contactEmailError = !isValidEmail(contactForm.email) ? t("admin.validation.contactEmail") : "";

  const authorityColumns = [
    {
      key: "name",
      header: t("admin.authorities.table.name"),
      render: (row: Authority) => row.name
    },
    {
      key: "shortName",
      header: t("admin.authorities.table.shortName"),
      render: (row: Authority) => row.shortName || t("common.notAvailable")
    },
    {
      key: "contacts",
      header: t("admin.authorities.table.contactsCount"),
      align: "right" as const,
      render: (row: Authority) =>
        contacts.filter((contact) => contact.authorityId === row.id && !contact.isArchived).length
    },
    {
      key: "status",
      header: t("admin.users.table.status"),
      render: (row: Authority) =>
        row.isArchived ? (
          <Badge variant="warning">{t("users.status.archived")}</Badge>
        ) : (
          <Badge variant="success">{t("users.status.active")}</Badge>
        )
    }
  ];

  const contactColumns = [
    {
      key: "name",
      header: t("admin.contacts.table.name"),
      render: (row: AuthorityContact) => (
        <div className="inlineMeta">
          <span>{row.name}</span>
          {row.isPrimary ? <Badge variant="success">{t("admin.contacts.form.isPrimary")}</Badge> : null}
        </div>
      )
    },
    {
      key: "roleTitle",
      header: t("admin.contacts.table.role"),
      render: (row: AuthorityContact) => row.roleTitle || t("common.notAvailable")
    },
    {
      key: "email",
      header: t("admin.contacts.table.email"),
      render: (row: AuthorityContact) => row.email || t("common.notAvailable")
    },
    {
      key: "phone",
      header: t("admin.contacts.table.phone"),
      render: (row: AuthorityContact) => row.phone || t("common.notAvailable")
    },
    {
      key: "mobile",
      header: t("admin.contacts.table.mobile"),
      render: (row: AuthorityContact) => row.mobile || t("common.notAvailable")
    }
  ];

  const closeAuthorityModal = () => {
    setAuthorityModalOpen(false);
    setEditingAuthorityId(null);
    setAuthorityForm(emptyAuthorityForm);
    setFormError("");
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setEditingContactId(null);
    setContactForm(emptyContactForm);
    setFormError("");
  };

  const openCreateAuthorityModal = () => {
    if (!canManageAuthorities) {
      return;
    }
    setPageError("");
    setSuccessMessage("");
    setAuthorityForm(emptyAuthorityForm);
    setEditingAuthorityId(null);
    setFormError("");
    setAuthorityModalOpen(true);
  };

  const openEditAuthorityModal = (authorityId: string) => {
    if (!canManageAuthorities) {
      return;
    }
    const authority = authorities.find((entry) => entry.id === authorityId);
    if (!authority) {
      return;
    }

    setPageError("");
    setSuccessMessage("");
    setAuthorityForm({
      name: authority.name,
      shortName: authority.shortName ?? ""
    });
    setEditingAuthorityId(authority.id);
    setFormError("");
    setAuthorityModalOpen(true);
  };

  const openCreateContactModal = () => {
    if (!canManageAuthorities) {
      return;
    }
    setPageError("");
    setSuccessMessage("");
    setContactForm({
      ...emptyContactForm,
      authorityId: selectedAuthorityId
    });
    setEditingContactId(null);
    setFormError("");
    setContactModalOpen(true);
  };

  const openEditContactModal = (contactId: string) => {
    if (!canManageAuthorities) {
      return;
    }
    const contact = contacts.find((entry) => entry.id === contactId);
    if (!contact) {
      return;
    }

    setPageError("");
    setSuccessMessage("");
    setSelectedAuthorityId(contact.authorityId);
    setContactForm({
      authorityId: contact.authorityId,
      name: contact.name,
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      roleTitle: contact.roleTitle ?? "",
      department: contact.department ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      mobile: contact.mobile ?? "",
      notes: contact.notes ?? "",
      isPrimary: Boolean(contact.isPrimary)
    });
    setEditingContactId(contact.id);
    setFormError("");
    setContactModalOpen(true);
  };

  const handleSaveAuthority = async () => {
    if (!canManageAuthorities) {
      return;
    }
    if (authorityNameError) {
      setFormError(authorityNameError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    setPageError("");
    setSuccessMessage("");

    try {
      if (editingAuthorityId) {
        const updated = await updateAuthority(editingAuthorityId, {
          name: authorityForm.name.trim(),
          shortName: authorityForm.shortName.trim() || undefined
        });
        if (updated) {
          setSelectedAuthorityId(updated.id);
          setSuccessMessage(t("admin.authorities.success.updated"));
        }
      } else {
        const created = await addAuthority({
          name: authorityForm.name.trim(),
          shortName: authorityForm.shortName.trim() || undefined
        });
        setSelectedAuthorityId(created.id);
        setSuccessMessage(t("admin.authorities.success.created"));
      }

      closeAuthorityModal();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.authorities.error.save"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveContact = async () => {
    if (!canManageAuthorities) {
      return;
    }
    if (contactAuthorityError || contactNameError || contactEmailError) {
      setFormError(contactAuthorityError || contactNameError || contactEmailError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    setPageError("");
    setSuccessMessage("");

    try {
      if (editingContactId) {
        const updated = await updateContact(editingContactId, {
          authorityId: contactForm.authorityId,
          name: contactForm.name.trim() || undefined,
          firstName: contactForm.firstName.trim() || undefined,
          lastName: contactForm.lastName.trim() || undefined,
          roleTitle: contactForm.roleTitle.trim() || undefined,
          department: contactForm.department.trim() || undefined,
          email: contactForm.email.trim() || undefined,
          phone: contactForm.phone.trim() || undefined,
          mobile: contactForm.mobile.trim() || undefined,
          notes: contactForm.notes.trim() || undefined,
          isPrimary: contactForm.isPrimary
        });
        if (updated) {
          setSelectedAuthorityId(updated.authorityId);
          setSuccessMessage(t("admin.contacts.success.updated"));
        }
      } else {
        const created = await addContact({
          authorityId: contactForm.authorityId,
          name: contactForm.name.trim() || undefined,
          firstName: contactForm.firstName.trim() || undefined,
          lastName: contactForm.lastName.trim() || undefined,
          roleTitle: contactForm.roleTitle.trim() || undefined,
          department: contactForm.department.trim() || undefined,
          email: contactForm.email.trim() || undefined,
          phone: contactForm.phone.trim() || undefined,
          mobile: contactForm.mobile.trim() || undefined,
          notes: contactForm.notes.trim() || undefined,
          isPrimary: contactForm.isPrimary
        });
        setSelectedAuthorityId(created.authorityId);
        setSuccessMessage(t("admin.contacts.success.created"));
      }

      closeContactModal();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.contacts.error.save"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmArchiveRestore = async () => {
    if (!canManageAuthorities) {
      return;
    }
    if (!confirmation) {
      return;
    }

    setIsConfirmSubmitting(true);
    setPageError("");
    setSuccessMessage("");

    try {
      if (confirmation.entity === "authority") {
        if (confirmation.mode === "archive") {
          await archiveAuthority(confirmation.id);
          setSuccessMessage(t("admin.authorities.success.archived"));
        } else {
          await restoreAuthority(confirmation.id);
          setSelectedAuthorityId(confirmation.id);
          setSuccessMessage(t("admin.authorities.success.restored"));
        }
      }

      if (confirmation.entity === "contact") {
        if (confirmation.mode === "archive") {
          await archiveContact(confirmation.id);
          setSuccessMessage(t("admin.contacts.success.archived"));
        } else {
          await restoreContact(confirmation.id);
          setSuccessMessage(t("admin.contacts.success.restored"));
        }
      }

      setConfirmation(null);
    } catch (error) {
      setPageError(
        extractApiErrorMessage(
          error,
          confirmation.entity === "authority" ? "admin.authorities.error.action" : "admin.contacts.error.action"
        )
      );
    } finally {
      setIsConfirmSubmitting(false);
    }
  };

  if (!permissions.canViewAuthoritiesAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">{t("admin.authorities.title")}</h1>
      </div>

      <AdminSubnav />

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.adminAuthorities"
          title="Behoerden und Ansprechpartner sauber pflegen"
          bullets={[
            "Diese Stammdaten sind die belastbare Referenzbasis fuer Projekte und Rechtsdokumente.",
            "Primary Contacts sollten nur bewusst gesetzt werden.",
            "Archivieren Sie Kontakte oder Behoerden nicht unbemerkt, wenn sie in aktiven Projekten noch referenziert sind."
          ]}
          link={{
            label: "Passenden Hilfeartikel oeffnen",
            to: getHelpHref(HELP_CONTEXT_SLUGS.adminAuthorities)
          }}
        />
      ) : null}

      {pageError ? (
        <Card>
          <p className="validationText">{pageError}</p>
        </Card>
      ) : null}

      {successMessage ? (
        <Card>
          <p className="placeholderText">{successMessage}</p>
        </Card>
      ) : null}

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
            {canManageAuthorities ? <Button onClick={openCreateAuthorityModal}>{t("admin.authorities.action.new")}</Button> : null}
          </div>
        </div>

        {visibleAuthorities.length === 0 ? (
          <Card>
            <p className="placeholderText">{t("admin.authorities.empty")}</p>
          </Card>
        ) : (
          <DataTable
            columns={authorityColumns}
            data={visibleAuthorities}
            getRowKey={(row) => row.id}
            rowActions={(row) => (
              <div className="tableActions">
                <Button
                  size="sm"
                  variant={row.id === selectedAuthorityId ? "secondary" : "ghost"}
                  onClick={() => setSelectedAuthorityId(row.id)}
                >
                  {t("admin.authorities.action.showContacts")}
                </Button>
                {canManageAuthorities ? (
                  <>
                    <IconButton ariaLabel={t("common.edit")} onClick={() => openEditAuthorityModal(row.id)}>
                      <EditIcon />
                    </IconButton>
                    {row.isArchived ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setConfirmation({
                            entity: "authority",
                            id: row.id,
                            label: row.name,
                            mode: "restore"
                          })
                        }
                      >
                        {t("common.restore")}
                      </Button>
                    ) : (
                      <IconButton
                        ariaLabel={t("common.archive")}
                        onClick={() =>
                          setConfirmation({
                            entity: "authority",
                            id: row.id,
                            label: row.name,
                            mode: "archive"
                          })
                        }
                      >
                        <ArchiveIcon />
                      </IconButton>
                    )}
                  </>
                ) : null}
              </div>
            )}
          />
        )}
      </div>

      <div className="tableSection">
        <div className="sectionHeader">
          <div>
            <h2 className="sectionTitle">{t("admin.contacts.title")}</h2>
            <p className="placeholderText">
              {selectedAuthority
                ? `${selectedAuthority.name}${selectedAuthority.shortName ? ` (${selectedAuthority.shortName})` : ""}`
                : t("admin.contacts.emptySelection")}
            </p>
          </div>
          <div className="inlineMeta">
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={showArchivedContacts}
                onChange={(event) => setShowArchivedContacts(event.target.checked)}
                disabled={!selectedAuthority}
              />
              <span>{t("admin.contacts.showArchived")}</span>
            </label>
            {canManageAuthorities ? (
              <Button onClick={openCreateContactModal} disabled={!selectedAuthority || Boolean(selectedAuthority?.isArchived)}>
                {t("admin.contacts.action.new")}
              </Button>
            ) : null}
          </div>
        </div>

        {!selectedAuthority ? (
          <Card>
            <p className="placeholderText">{t("admin.contacts.emptySelection")}</p>
          </Card>
        ) : visibleContacts.length === 0 ? (
          <Card>
            <p className="placeholderText">{t("admin.contacts.empty")}</p>
          </Card>
        ) : (
          <DataTable
            columns={contactColumns}
            data={visibleContacts}
            getRowKey={(row) => row.id}
            rowActions={(row) => (
              canManageAuthorities ? (
                <div className="tableActions">
                  <IconButton ariaLabel={t("common.edit")} onClick={() => openEditContactModal(row.id)}>
                    <EditIcon />
                  </IconButton>
                  {row.isArchived ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirmation({
                          entity: "contact",
                          id: row.id,
                          label: row.name,
                          mode: "restore"
                        })
                      }
                    >
                      {t("common.restore")}
                    </Button>
                  ) : (
                    <IconButton
                      ariaLabel={t("common.archive")}
                      onClick={() =>
                        setConfirmation({
                          entity: "contact",
                          id: row.id,
                          label: row.name,
                          mode: "archive"
                        })
                      }
                    >
                      <ArchiveIcon />
                    </IconButton>
                  )}
                </div>
              ) : null
            )}
          />
        )}
      </div>

      <Modal
        open={canManageAuthorities && authorityModalOpen}
        onClose={closeAuthorityModal}
        closeAriaLabel={t("modal.close")}
        header={editingAuthorityId ? t("admin.authorities.modal.edit") : t("admin.authorities.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeAuthorityModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveAuthority} disabled={Boolean(authorityNameError) || isSubmitting}>
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
              onChange={(event) => setAuthorityForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.authorities.form.shortName")}</span>
            <Input
              placeholder={t("admin.authorities.form.shortName")}
              value={authorityForm.shortName}
              onChange={(event) => setAuthorityForm((prev) => ({ ...prev, shortName: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={canManageAuthorities && contactModalOpen}
        onClose={closeContactModal}
        closeAriaLabel={t("modal.close")}
        header={editingContactId ? t("admin.contacts.modal.edit") : t("admin.contacts.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeContactModal}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveContact}
              disabled={Boolean(contactAuthorityError || contactNameError || contactEmailError) || isSubmitting}
            >
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
                ...authorityOptions
              ]}
              value={contactForm.authorityId}
              onChange={(event) => setContactForm((prev) => ({ ...prev, authorityId: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.name")}</span>
            <Input
              placeholder={t("admin.contacts.form.name")}
              value={contactForm.name}
              onChange={(event) => setContactForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("users.firstName")}</span>
            <Input
              placeholder={t("users.firstName")}
              value={contactForm.firstName}
              onChange={(event) => setContactForm((prev) => ({ ...prev, firstName: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("users.lastName")}</span>
            <Input
              placeholder={t("users.lastName")}
              value={contactForm.lastName}
              onChange={(event) => setContactForm((prev) => ({ ...prev, lastName: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.role")}</span>
            <Input
              placeholder={t("admin.contacts.form.role")}
              value={contactForm.roleTitle}
              onChange={(event) => setContactForm((prev) => ({ ...prev, roleTitle: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.department")}</span>
            <Input
              placeholder={t("admin.contacts.form.department")}
              value={contactForm.department}
              onChange={(event) => setContactForm((prev) => ({ ...prev, department: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.email")}</span>
            <Input
              placeholder={t("admin.contacts.form.email")}
              value={contactForm.email}
              onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.phone")}</span>
            <Input
              placeholder={t("admin.contacts.form.phone")}
              value={contactForm.phone}
              onChange={(event) => setContactForm((prev) => ({ ...prev, phone: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.mobile")}</span>
            <Input
              placeholder={t("admin.contacts.form.mobile")}
              value={contactForm.mobile}
              onChange={(event) => setContactForm((prev) => ({ ...prev, mobile: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.contacts.form.notes")}</span>
            <textarea
              className="textarea"
              rows={3}
              value={contactForm.notes}
              onChange={(event) => setContactForm((prev) => ({ ...prev, notes: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>
          <div className="formField">
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={contactForm.isPrimary}
                onChange={(event) => setContactForm((prev) => ({ ...prev, isPrimary: event.target.checked }))}
                disabled={isSubmitting}
              />
              <span>{t("admin.contacts.form.isPrimary")}</span>
            </label>
          </div>
          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={canManageAuthorities && Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        closeAriaLabel={t("modal.close")}
        header={
          confirmation?.entity === "authority"
            ? confirmation.mode === "archive"
              ? t("admin.authorities.confirm.archive.title")
              : t("admin.authorities.confirm.restore.title")
            : confirmation?.mode === "archive"
              ? t("admin.contacts.confirm.archive.title")
              : t("admin.contacts.confirm.restore.title")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmArchiveRestore} disabled={isConfirmSubmitting}>
              {isConfirmSubmitting ? t("admin.authorities.confirm.pending") : t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">
          {confirmation?.entity === "authority"
            ? confirmation.mode === "archive"
              ? t("admin.authorities.confirm.archive.text").replace("{name}", confirmation.label)
              : t("admin.authorities.confirm.restore.text").replace("{name}", confirmation.label)
            : confirmation?.mode === "archive"
              ? t("admin.contacts.confirm.archive.text").replace("{name}", confirmation?.label ?? "")
              : t("admin.contacts.confirm.restore.text").replace("{name}", confirmation?.label ?? "")}
        </p>
      </Modal>
    </div>
  );
}
