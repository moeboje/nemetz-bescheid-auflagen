import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import type { ExternalParticipant } from "../data/projects";
import { getUserDisplayName } from "../data/users";
import { useAuthorization } from "../state/AuthorizationStore";
import { useExternalOrgs } from "../state/ExternalOrgsStore";
import { useUsers } from "../state/UsersStore";

const emptyForm = {
  type: "LAWYER" as ExternalParticipant["type"],
  externalOrgId: "",
  externalUserId: "",
  accessStatus: "LEGACY_ONLY" as NonNullable<ExternalParticipant["accessStatus"]>,
  organization: "",
  name: "",
  email: "",
  phone: "",
  notes: ""
};

type ExternalParticipantModalProps = {
  open: boolean;
  onClose: () => void;
  participant?: ExternalParticipant;
  onSave: (
    input: Omit<ExternalParticipant, "id" | "createdAt" | "updatedAt">
  ) => boolean | Promise<boolean>;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ExternalParticipantModal({
  open,
  onClose,
  participant,
  onSave
}: ExternalParticipantModalProps) {
  const { permissions } = useAuthorization();
  const { externalOrgs } = useExternalOrgs();
  const { addUser, listActiveUsers, loadAdminUsers } = useUsers();
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setSaveError("");
    if (participant) {
      setForm({
        type: participant.type,
        externalOrgId: participant.externalOrgId ?? "",
        externalUserId: participant.externalUserId ?? "",
        accessStatus: participant.accessStatus ?? (participant.externalUserId ? "LINKED" : "LEGACY_ONLY"),
        organization: participant.organization ?? "",
        name: participant.name,
        email: participant.email ?? "",
        phone: participant.phone ?? "",
        notes: participant.notes ?? ""
      });
      return;
    }
    setForm(emptyForm);
  }, [open, participant]);

  const externalUsers = listActiveUsers({ includeExternal: true, includeInternal: false });
  const externalOrgOptions = useMemo(
    () =>
      externalOrgs
        .filter((org) => !org.isArchived || org.id === form.externalOrgId)
        .map((org) => ({ value: org.id, label: org.name })),
    [externalOrgs, form.externalOrgId]
  );
  const externalUserOptions = useMemo(
    () =>
      externalUsers
        .filter(
          (user) =>
            !form.externalOrgId ||
            user.externalOrgId === form.externalOrgId ||
            user.id === form.externalUserId
        )
        .map((user) => ({ value: user.id, label: getUserDisplayName(user) })),
    [externalUsers, form.externalOrgId, form.externalUserId]
  );

  const hasEmailError = form.email ? !emailPattern.test(form.email) : false;
  const isSaveDisabled = !form.type || !form.name || hasEmailError;

  const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return { firstName: parts[0] || name.trim(), lastName: "-" };
    }
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts[parts.length - 1] ?? "-"
    };
  };

  const handleSave = async () => {
    if (isSaveDisabled) {
      return;
    }

    setSaveError("");

    let externalUserId = form.externalUserId || undefined;
    let externalOrgId = form.externalOrgId || undefined;
    let accessStatus = form.accessStatus;
    let organization = form.organization || undefined;
    let name = form.name;
    let email = form.email || undefined;
    const normalizedEmail = form.email.trim().toLowerCase();

    const applyUser = (user: (typeof externalUsers)[number]) => {
      externalUserId = user.id;
      externalOrgId = user.externalOrgId ?? externalOrgId;
      name = getUserDisplayName(user) || name;
      email = user.email || email;
      accessStatus = "LINKED";
    };

    const selectedUser = externalUserId
      ? externalUsers.find((user) => user.id === externalUserId)
      : undefined;
    if (selectedUser) {
      applyUser(selectedUser);
    }

    if (normalizedEmail && !externalUserId) {
      const localMatch = externalUsers.find(
        (user) => (user.email || "").toLowerCase() === normalizedEmail
      );
      if (localMatch) {
        applyUser(localMatch);
      } else if (permissions.canManageUsersAdmin) {
        if (!externalOrgId) {
          setSaveError(t("projects.external.validation.externalOrgRequired"));
          return;
        }

        const adminLookup = await loadAdminUsers({
          q: normalizedEmail,
          type: "EXTERNAL",
          archived: "false",
          page: 1,
          pageSize: 10
        });
        const existingUser = adminLookup.items.find(
          (user) => (user.email || "").toLowerCase() === normalizedEmail
        );

        if (existingUser) {
          applyUser(existingUser);
        } else {
          const nameParts = splitName(form.name);
          try {
            const created = await addUser({
              firstName: nameParts.firstName,
              lastName: nameParts.lastName,
              email: normalizedEmail,
              phone: form.phone || undefined,
              role: "EXTERNAL",
              type: "EXTERNAL",
              externalOrgId,
              passwordMode: "link"
            });
            externalUserId = created.user.id;
            externalOrgId = created.user.externalOrgId ?? externalOrgId;
            name = getUserDisplayName(created.user) || name;
            email = created.user.email || email;
            accessStatus =
              created.notificationStatus === "FAILED" ? "RESET_REQUIRED" : "INVITE_SENT";
          } catch (error) {
            setSaveError(
              error instanceof Error
                ? error.message
                : t("projects.external.validation.portalUserCreateFailed")
            );
            return;
          }
        }
      } else {
        setSaveError(t("projects.external.validation.portalUserRequired"));
        return;
      }
    }

    if (externalOrgId && !organization) {
      organization =
        externalOrgs.find((org) => org.id === externalOrgId)?.name || undefined;
    }

    const saved = await onSave({
      type: form.type,
      externalOrgId,
      externalUserId,
      accessStatus,
      organization,
      name,
      email,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      archivedAt: participant?.archivedAt,
      isArchived: participant?.isArchived ?? false
    });
    if (saved) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={participant ? t("projects.external.edit") : t("projects.external.add")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaveDisabled}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        {saveError ? <p className="validationText">{saveError}</p> : null}
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.type")}</span>
          <Select
            options={[
              { value: "LAWYER", label: t("projects.external.type.lawyer") },
              {
                value: "ENGINEERING_OFFICE",
                label: t("projects.external.type.engineeringOffice")
              },
              { value: "CONSULTANT", label: t("projects.external.type.consultant") },
              { value: "OTHER", label: t("projects.external.type.other") }
            ]}
            value={form.type}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                type: event.target.value as ExternalParticipant["type"]
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.externalOrg")}</span>
          <Select
            options={[{ value: "", label: t("projects.external.externalOrg") }, ...externalOrgOptions]}
            value={form.externalOrgId}
            onChange={(event) => {
              const externalOrgId = event.target.value;
              const selected = externalOrgs.find((org) => org.id === externalOrgId);
              setForm((prev) => ({
                ...prev,
                externalOrgId,
                externalUserId: "",
                organization: selected?.name ?? prev.organization
              }));
            }}
          />
          <span className="helperText">{t("projects.external.externalOrgHint")}</span>
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.externalUser")}</span>
          <Select
            options={[{ value: "", label: t("projects.external.externalUser") }, ...externalUserOptions]}
            value={form.externalUserId}
            onChange={(event) => {
              const externalUserId = event.target.value;
              const selectedUser = externalUsers.find((user) => user.id === externalUserId);
              setForm((prev) => ({
                ...prev,
                externalUserId,
                externalOrgId: selectedUser?.externalOrgId ?? prev.externalOrgId,
                accessStatus: externalUserId ? "LINKED" : "LEGACY_ONLY",
                name: selectedUser ? getUserDisplayName(selectedUser) : prev.name,
                email: selectedUser?.email || prev.email
              }));
            }}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.name")}</span>
          <Input
            placeholder={t("projects.external.name")}
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.organization")}</span>
          <Input
            placeholder={t("projects.external.organization")}
            value={form.organization}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, organization: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.email")}</span>
          <Input
            placeholder={t("projects.external.email")}
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          {hasEmailError ? (
            <span className="validationText">{t("projects.external.validation.email")}</span>
          ) : null}
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.phone")}</span>
          <Input
            placeholder={t("projects.external.phone")}
            value={form.phone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, phone: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.notes")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={form.notes}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notes: event.target.value }))
            }
          />
        </div>
      </div>
    </Modal>
  );
}
