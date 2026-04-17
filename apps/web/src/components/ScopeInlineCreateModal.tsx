import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "@nemetz/ui";
import { t } from "../i18n";
import { useScopes } from "../state/ScopesStore";

export type ScopeInlineCreateMode = "SITE" | "FACILITY";

type ScopeInlineCreateResult = {
  siteId?: string;
  facilityId?: string;
};

type ScopeInlineCreateModalProps = {
  open: boolean;
  mode: ScopeInlineCreateMode;
  companyId: string;
  siteId?: string;
  onCancel: () => void;
  onCreated: (result: ScopeInlineCreateResult) => void;
};

const NAME_MIN_LENGTH = 2;

function normalizeScopeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export default function ScopeInlineCreateModal({
  open,
  mode,
  companyId,
  siteId,
  onCancel,
  onCreated
}: ScopeInlineCreateModalProps) {
  const {
    companies,
    sites,
    facilities,
    addSite,
    addFacility,
    restoreSite,
    restoreFacility
  } = useScopes();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setName("");
    setIsSubmitting(false);
  }, [companyId, mode, open, siteId]);

  const companyName = useMemo(
    () => companies.find((company) => company.id === companyId)?.name ?? t("common.none"),
    [companies, companyId]
  );

  const siteName = useMemo(
    () => (siteId ? sites.find((site) => site.id === siteId)?.name ?? t("common.none") : t("common.none")),
    [siteId, sites]
  );

  const trimmedName = name.trim();
  const normalizedName = useMemo(() => normalizeScopeName(name), [name]);

  const siteNameMatches = useMemo(() => {
    if (mode !== "SITE" || !companyId || !normalizedName) {
      return [];
    }
    return sites.filter(
      (site) =>
        site.companyId === companyId && normalizeScopeName(site.name) === normalizedName
    );
  }, [companyId, mode, normalizedName, sites]);

  const facilityNameMatches = useMemo(() => {
    if (mode !== "FACILITY" || !siteId || !normalizedName) {
      return [];
    }
    return facilities.filter(
      (facility) =>
        facility.siteId === siteId && normalizeScopeName(facility.name) === normalizedName
    );
  }, [facilities, mode, normalizedName, siteId]);

  const activeDuplicate = useMemo(() => {
    const matches = mode === "SITE" ? siteNameMatches : facilityNameMatches;
    return matches.find((candidate) => !candidate.isArchived);
  }, [facilityNameMatches, mode, siteNameMatches]);

  const archivedDuplicate = useMemo(() => {
    const matches = mode === "SITE" ? siteNameMatches : facilityNameMatches;
    return matches.find((candidate) => candidate.isArchived);
  }, [facilityNameMatches, mode, siteNameMatches]);

  const contextError = useMemo(() => {
    if (!companyId) {
      return t("projects.inlineCreate.hintSelectCompany");
    }
    if (mode === "FACILITY" && !siteId) {
      return t("projects.inlineCreate.hintSelectSite");
    }
    return "";
  }, [companyId, mode, siteId]);

  const nameError = useMemo(() => {
    if (!trimmedName) {
      return t("projects.inlineCreate.name.required");
    }
    if (trimmedName.length < NAME_MIN_LENGTH) {
      return t("projects.inlineCreate.name.min");
    }
    if (activeDuplicate) {
      return t("projects.inlineCreate.duplicateActive");
    }
    return "";
  }, [activeDuplicate, trimmedName]);

  const canRestore = Boolean(!contextError && !nameError && archivedDuplicate);
  const isCreateDisabled = Boolean(isSubmitting || contextError || nameError || archivedDuplicate);

  const handleCreate = async () => {
    if (isCreateDisabled) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "SITE") {
        const createdSiteId = await addSite({ companyId, name: trimmedName });
        onCreated({ siteId: createdSiteId });
        return;
      }

      if (!siteId) {
        return;
      }

      const createdFacilityId = await addFacility({ companyId, siteId, name: trimmedName });
      onCreated({ facilityId: createdFacilityId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!canRestore || !archivedDuplicate) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "SITE") {
        await restoreSite(archivedDuplicate.id);
        onCreated({ siteId: archivedDuplicate.id });
        return;
      }

      await restoreFacility(archivedDuplicate.id);
      onCreated({ facilityId: archivedDuplicate.id });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeAriaLabel={t("modal.close")}
      header={
        mode === "SITE"
          ? t("projects.inlineCreate.site.title")
          : t("projects.inlineCreate.facility.title")
      }
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={isCreateDisabled}>
            {t("projects.inlineCreate.create")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("projects.inlineCreate.company")}</span>
          <Input value={companyName} readOnly disabled />
        </div>
        {mode === "FACILITY" ? (
          <div className="formField">
            <span className="fieldLabel">{t("projects.inlineCreate.site")}</span>
            <Input value={siteName} readOnly disabled />
          </div>
        ) : null}
        <div className="formField">
          <span className="fieldLabel">{t("projects.inlineCreate.name.label")}</span>
          <Input
            autoFocus
            placeholder={t("projects.inlineCreate.name.placeholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {contextError ? <span className="validationText">{contextError}</span> : null}
          {nameError ? <span className="validationText">{nameError}</span> : null}
          {archivedDuplicate && !contextError && !nameError ? (
            <span className="validationText">{t("projects.inlineCreate.duplicateArchived")}</span>
          ) : null}
        </div>
        {canRestore ? (
          <div className="inlineCreateRestoreActions">
            <Button size="sm" variant="ghost" onClick={handleRestore} disabled={isSubmitting}>
              {t("projects.inlineCreate.restore")}
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
