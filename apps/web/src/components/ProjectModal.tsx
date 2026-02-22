import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useScopes } from "../state/ScopesStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useUsers } from "../state/UsersStore";
import { useProjects } from "../state/ProjectsStore";
import { useAuthorization } from "../state/AuthorizationStore";
import FileUploadStub, { UploadItem } from "./FileUploadStub";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import type { Project } from "../data/projects";

const emptyForm = {
  title: "",
  shortDescription: "",
  companyId: "",
  siteId: "",
  facilityId: "",
  authorityId: "",
  authorityContactId: "",
  authorityRef: "",
  ownerUserId: "",
  deputyUserId: "",
  participantUserIds: [] as string[],
  attachments: [] as UploadItem[]
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function createAttachment(file: File): UploadItem {
  return {
    id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    addedAt: todayStamp()
  };
}

function getParticipantUserIds(project: Project) {
  if (project.internalParticipants?.length) {
    return project.internalParticipants.map((participant) => participant.userId);
  }
  return project.participantUserIds ?? [];
}

type ProjectModalProps = {
  open: boolean;
  onClose: () => void;
  project?: Project;
};

export default function ProjectModal({ open, onClose, project }: ProjectModalProps) {
  const { actor } = useAuthorization();
  const { companies, sites, facilities } = useScopes();
  const { authorities, getContactsForAuthority } = useAuthorities();
  const { users } = useUsers();
  const { addProject, updateProject } = useProjects();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (project) {
      setForm({
        title: project.title,
        shortDescription: project.shortDescription ?? "",
        companyId: project.companyId,
        siteId: project.siteId ?? "",
        facilityId: project.facilityId ?? "",
        authorityId: project.authorityId ?? "",
        authorityContactId: project.authorityContactId ?? "",
        authorityRef: project.authorityRef ?? "",
        ownerUserId: project.ownerUserId ?? "",
        deputyUserId: project.deputyUserId ?? "",
        participantUserIds: getParticipantUserIds(project),
        attachments: project.attachments ?? []
      });
      return;
    }
    setForm(emptyForm);
  }, [open, project]);

  const activeCompanies = useMemo(
    () => companies.filter((company) => !company.isArchived),
    [companies]
  );
  const activeSites = useMemo(
    () =>
      sites.filter((site) =>
        !site.isArchived && activeCompanies.some((company) => company.id === site.companyId)
      ),
    [activeCompanies, sites]
  );
  const activeFacilities = useMemo(
    () =>
      facilities.filter((facility) =>
        !facility.isArchived &&
        activeCompanies.some((company) => company.id === facility.companyId) &&
        activeSites.some((site) => site.id === facility.siteId)
      ),
    [activeCompanies, activeSites, facilities]
  );

  const companyOptions = useMemo(
    () => activeCompanies.map((company) => ({ value: company.id, label: company.name })),
    [activeCompanies]
  );

  const siteOptions = useMemo(
    () =>
      activeSites
        .filter((site) => site.companyId === form.companyId)
        .map((site) => ({ value: site.id, label: site.name })),
    [activeSites, form.companyId]
  );

  const facilityOptions = useMemo(() => {
    const base = activeFacilities.filter((facility) => facility.companyId === form.companyId);
    const filtered = form.siteId
      ? base.filter((facility) => facility.siteId === form.siteId)
      : base;
    return filtered.map((facility) => ({ value: facility.id, label: facility.name }));
  }, [activeFacilities, form.companyId, form.siteId]);

  const authorityOptions = useMemo(
    () =>
      authorities
        .filter((authority) => !authority.isArchived)
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities]
  );

  const contactOptions = useMemo(
    () =>
      getContactsForAuthority(form.authorityId).map((contact) => ({
        value: contact.id,
        label: contact.name
      })),
    [form.authorityId, getContactsForAuthority]
  );

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: user.displayName })),
    [users]
  );

  const canSave = project
    ? ProjectPolicy.update(actor, project)
    : ProjectPolicy.create(actor);
  const isSaveDisabled = !canSave || !form.title.trim() || !form.companyId;

  const handleSave = () => {
    if (isSaveDisabled) {
      return;
    }

    const internalParticipants = form.participantUserIds.map((userId) => ({ userId }));
    let saveSucceeded = false;

    if (project) {
      saveSucceeded = updateProject(project.id, {
        title: form.title,
        shortDescription: form.shortDescription,
        companyId: form.companyId,
        siteId: form.siteId || undefined,
        facilityId: form.facilityId || undefined,
        authorityId: form.authorityId || undefined,
        authorityContactId: form.authorityContactId || undefined,
        authorityRef: form.authorityRef,
        ownerUserId: form.ownerUserId || undefined,
        deputyUserId: form.deputyUserId || undefined,
        internalParticipants,
        participantUserIds: internalParticipants.map((participant) => participant.userId),
        attachments: form.attachments
      });
    } else {
      saveSucceeded = addProject({
        title: form.title,
        shortDescription: form.shortDescription,
        companyId: form.companyId,
        siteId: form.siteId || undefined,
        facilityId: form.facilityId || undefined,
        authorityId: form.authorityId || undefined,
        authorityContactId: form.authorityContactId || undefined,
        authorityRef: form.authorityRef,
        ownerUserId: form.ownerUserId || undefined,
        deputyUserId: form.deputyUserId || undefined,
        internalParticipants,
        participantUserIds: internalParticipants.map((participant) => participant.userId),
        attachments: form.attachments
      });
    }

    if (saveSucceeded) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      header={project ? t("projects.modal.editTitle") : t("projects.modal.title")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.title")}</span>
          <Input
            placeholder={t("projects.form.title")}
            value={form.title}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.shortDescription")}</span>
          <Input
            placeholder={t("projects.form.shortDescription")}
            value={form.shortDescription}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, shortDescription: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.company")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.company") }, ...companyOptions]}
            value={form.companyId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                companyId: event.target.value,
                siteId: "",
                facilityId: ""
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.site")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.site") }, ...siteOptions]}
            value={form.siteId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, siteId: event.target.value, facilityId: "" }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.facility")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.facility") }, ...facilityOptions]}
            value={form.facilityId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, facilityId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.authority")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.authority") }, ...authorityOptions]}
            value={form.authorityId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                authorityId: event.target.value,
                authorityContactId: ""
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.authorityContact")}</span>
          <Select
            options={[
              { value: "", label: t("projects.form.authorityContact") },
              ...contactOptions
            ]}
            value={form.authorityContactId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, authorityContactId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.authorityRef")}</span>
          <Input
            placeholder={t("projects.form.authorityRef")}
            value={form.authorityRef}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, authorityRef: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.owner")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.owner") }, ...userOptions]}
            value={form.ownerUserId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.deputy")}</span>
          <Select
            options={[{ value: "", label: t("projects.form.deputy") }, ...userOptions]}
            value={form.deputyUserId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, deputyUserId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.form.participants")}</span>
          <Select
            multiple
            options={userOptions}
            value={form.participantUserIds}
            onChange={(event) => {
              const values = Array.from(event.currentTarget.selectedOptions).map(
                (option) => option.value
              );
              setForm((prev) => ({ ...prev, participantUserIds: values }));
            }}
          />
        </div>
        <FileUploadStub
          label={t("projects.form.attachments")}
          selectLabel={t("common.selectFile")}
          removeLabel={t("common.remove")}
          disabled={!canSave}
          items={form.attachments}
          onAddFiles={(files) =>
            setForm((prev) => ({
              ...prev,
              attachments: [...prev.attachments, ...files.map(createAttachment)]
            }))
          }
          onRemove={(id) =>
            setForm((prev) => ({
              ...prev,
              attachments: prev.attachments.filter((item) => item.id !== id)
            }))
          }
        />
      </div>
    </Modal>
  );
}
