import React, { useMemo, useState } from "react";
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
import { useAuthorities } from "../state/AuthoritiesStore";
import { useUsers } from "../state/UsersStore";

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

export default function AdminPage() {
  const {
    authorities,
    contacts,
    addAuthority,
    updateAuthority,
    archiveAuthority,
    addContact,
    updateContact,
    archiveContact
  } = useAuthorities();
  const { users } = useUsers();
  const [tab, setTab] = useState("authorities");
  const [authorityModalOpen, setAuthorityModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingAuthorityId, setEditingAuthorityId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [authorityForm, setAuthorityForm] = useState(emptyAuthorityForm);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [contactAuthorityFilter, setContactAuthorityFilter] = useState("");

  const authorityOptions = useMemo(
    () =>
      authorities
        .filter((authority) => !authority.isArchived)
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities]
  );

  const visibleAuthorities = useMemo(
    () => authorities.filter((authority) => !authority.isArchived),
    [authorities]
  );

  const visibleContacts = useMemo(() => {
    return contacts.filter((contact) => {
      if (contact.isArchived) {
        return false;
      }
      if (!contactAuthorityFilter) {
        return true;
      }
      return contact.authorityId === contactAuthorityFilter;
    });
  }, [contactAuthorityFilter, contacts]);

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
    }
  ];

  const contactColumns = [
    {
      key: "name",
      header: t("admin.contacts.table.name"),
      render: (row: (typeof contacts)[number]) => row.name
    },
    {
      key: "authority",
      header: t("admin.contacts.table.authority"),
      render: (row: (typeof contacts)[number]) =>
        authorities.find((authority) => authority.id === row.authorityId)?.name ??
        t("common.notAvailable")
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
    },
    {
      key: "role",
      header: t("admin.contacts.table.role"),
      render: (row: (typeof contacts)[number]) => row.roleTitle || t("common.notAvailable")
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
        setAuthorityForm({ name: authority.name, shortName: authority.shortName ?? "" });
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

  const handleSaveAuthority = () => {
    if (editingAuthorityId) {
      updateAuthority(editingAuthorityId, authorityForm);
    } else {
      addAuthority(authorityForm);
    }
    setAuthorityModalOpen(false);
  };

  const handleSaveContact = () => {
    if (editingContactId) {
      updateContact(editingContactId, contactForm);
    } else {
      addContact(contactForm);
    }
    setContactModalOpen(false);
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
      </div>

      {tab === "authorities" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("admin.authorities.title")}</h2>
            <Button onClick={() => openAuthorityModal()}>{t("admin.authorities.action.new")}</Button>
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
                <IconButton
                  ariaLabel={t("common.archive")}
                  onClick={() => archiveAuthority(row.id)}
                >
                  <ArchiveIcon />
                </IconButton>
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
                  ...authorityOptions
                ]}
                value={contactAuthorityFilter}
                onChange={(event) => setContactAuthorityFilter(event.target.value)}
              />
              <Button onClick={() => openContactModal()}>{t("admin.contacts.action.new")}</Button>
            </div>
          </div>
          <DataTable
            columns={contactColumns}
            data={visibleContacts}
            getRowKey={(row) => row.id}
            rowActions={(row) => (
              <div className="tableActions">
                <IconButton ariaLabel={t("common.edit")} onClick={() => openContactModal(row.id)}>
                  <EditIcon />
                </IconButton>
                <IconButton ariaLabel={t("common.archive")} onClick={() => archiveContact(row.id)}>
                  <ArchiveIcon />
                </IconButton>
              </div>
            )}
          />
        </div>
      ) : null}

      {tab === "users" ? (
        <Card>
          <DataTable columns={userColumns} data={users} getRowKey={(row) => row.id} />
        </Card>
      ) : null}

      <Modal
        open={authorityModalOpen}
        onClose={() => setAuthorityModalOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={editingAuthorityId ? t("admin.authorities.modal.edit") : t("admin.authorities.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setAuthorityModalOpen(false)}>
              {t("modal.cancel")}
            </Button>
            <Button onClick={handleSaveAuthority} disabled={!authorityForm.name}>
              {t("modal.save")}
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
        onClose={() => setContactModalOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={editingContactId ? t("admin.contacts.modal.edit") : t("admin.contacts.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setContactModalOpen(false)}>
              {t("modal.cancel")}
            </Button>
            <Button
              onClick={handleSaveContact}
              disabled={!contactForm.name || !contactForm.authorityId}
            >
              {t("modal.save")}
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
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, authorityId: event.target.value }))
              }
            />
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
    </div>
  );
}
