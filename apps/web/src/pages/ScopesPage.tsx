import React, { useEffect, useMemo, useState } from "react";
import {
  Breadcrumbs,
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  Select
} from "@nemetz/ui";
import { t } from "../i18n";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import { useScopes } from "../state/ScopesStore";

type ScopeLevel = "company" | "site" | "facility";

type ActiveScope = {
  level: ScopeLevel;
  id: string;
};

type ScopeSummary = {
  label: string;
  projects: number;
  documents: number;
  openTasks: number;
  overdue: number;
};

type ArchiveTarget = {
  level: ScopeLevel;
  id: string;
  label: string;
  warning?: string;
};

const emptyCompanyForm = {
  name: "",
  shortName: ""
};

const emptySiteForm = {
  companyId: "",
  name: ""
};

const emptyFacilityForm = {
  companyId: "",
  siteId: "",
  name: "",
  type: ""
};

export default function ScopesPage() {
  const {
    companies,
    sites,
    facilities,
    addCompany,
    updateCompany,
    archiveCompany,
    addSite,
    updateSite,
    archiveSite,
    addFacility,
    updateFacility,
    archiveFacility,
    getScopeLabel
  } = useScopes();

  const [showArchived, setShowArchived] = useState(false);
  const [activeScope, setActiveScope] = useState<ActiveScope | null>(null);

  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null);

  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null);

  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [siteForm, setSiteForm] = useState(emptySiteForm);
  const [facilityForm, setFacilityForm] = useState(emptyFacilityForm);

  const visibleCompanies = useMemo(
    () => companies.filter((company) => (showArchived ? true : !company.isArchived)),
    [companies, showArchived]
  );

  const visibleSites = useMemo(
    () =>
      sites.filter((site) => {
        const parentCompany = visibleCompanies.find((company) => company.id === site.companyId);
        if (!parentCompany) {
          return false;
        }
        return showArchived ? true : !site.isArchived;
      }),
    [showArchived, sites, visibleCompanies]
  );

  const visibleFacilities = useMemo(
    () =>
      facilities.filter((facility) => {
        const parentCompany = visibleCompanies.find(
          (company) => company.id === facility.companyId
        );
        const parentSite = visibleSites.find((site) => site.id === facility.siteId);
        if (!parentCompany || !parentSite) {
          return false;
        }
        return showArchived ? true : !facility.isArchived;
      }),
    [facilities, showArchived, visibleCompanies, visibleSites]
  );

  const visibleScopeIds = useMemo(
    () =>
      new Set([
        ...visibleCompanies.map((company) => company.id),
        ...visibleSites.map((site) => site.id),
        ...visibleFacilities.map((facility) => facility.id)
      ]),
    [visibleCompanies, visibleFacilities, visibleSites]
  );

  useEffect(() => {
    if (activeScope && visibleScopeIds.has(activeScope.id)) {
      return;
    }

    const firstFacility = visibleFacilities[0];
    if (firstFacility) {
      setActiveScope({ level: "facility", id: firstFacility.id });
      return;
    }

    const firstSite = visibleSites[0];
    if (firstSite) {
      setActiveScope({ level: "site", id: firstSite.id });
      return;
    }

    const firstCompany = visibleCompanies[0];
    if (firstCompany) {
      setActiveScope({ level: "company", id: firstCompany.id });
      return;
    }

    setActiveScope(null);
  }, [activeScope, visibleCompanies, visibleFacilities, visibleScopeIds, visibleSites]);

  const activeSummary = useMemo<ScopeSummary>(() => {
    if (!activeScope) {
      return {
        label: t("scopes.empty"),
        projects: 0,
        documents: 0,
        openTasks: 0,
        overdue: 0
      };
    }

    if (activeScope.level === "company") {
      const company = companies.find((item) => item.id === activeScope.id);
      if (!company) {
        return {
          label: t("scopes.empty"),
          projects: 0,
          documents: 0,
          openTasks: 0,
          overdue: 0
        };
      }

      const companySites = sites.filter((site) => site.companyId === company.id);
      return {
        label: getScopeLabel(company.id),
        projects: companySites.reduce((sum, site) => sum + site.projects, 0),
        documents: companySites.reduce((sum, site) => sum + site.documents, 0),
        openTasks: companySites.reduce((sum, site) => sum + site.openTasks, 0),
        overdue: companySites.reduce((sum, site) => sum + site.overdue, 0)
      };
    }

    if (activeScope.level === "site") {
      const site = sites.find((item) => item.id === activeScope.id);
      if (!site) {
        return {
          label: t("scopes.empty"),
          projects: 0,
          documents: 0,
          openTasks: 0,
          overdue: 0
        };
      }

      return {
        label: getScopeLabel(site.companyId, site.id),
        projects: site.projects,
        documents: site.documents,
        openTasks: site.openTasks,
        overdue: site.overdue
      };
    }

    const facility = facilities.find((item) => item.id === activeScope.id);
    if (!facility) {
      return {
        label: t("scopes.empty"),
        projects: 0,
        documents: 0,
        openTasks: 0,
        overdue: 0
      };
    }

    return {
      label: getScopeLabel(facility.companyId, facility.siteId, facility.id),
      projects: facility.projects,
      documents: facility.documents,
      openTasks: facility.openTasks,
      overdue: facility.overdue
    };
  }, [activeScope, companies, facilities, getScopeLabel, sites]);

  const companyOptions = useMemo(
    () =>
      companies
        .filter((company) => !company.isArchived || company.id === siteForm.companyId || company.id === facilityForm.companyId)
        .map((company) => ({ value: company.id, label: company.name })),
    [companies, facilityForm.companyId, siteForm.companyId]
  );

  const facilityCompanyOptions = useMemo(
    () =>
      companies
        .filter((company) => !company.isArchived || company.id === facilityForm.companyId)
        .map((company) => ({ value: company.id, label: company.name })),
    [companies, facilityForm.companyId]
  );

  const siteOptions = useMemo(() => {
    if (!facilityForm.companyId) {
      return [];
    }
    return sites
      .filter(
        (site) =>
          site.companyId === facilityForm.companyId &&
          (!site.isArchived || site.id === facilityForm.siteId)
      )
      .map((site) => ({ value: site.id, label: site.name }));
  }, [facilityForm.companyId, facilityForm.siteId, sites]);

  const openNewCompanyModal = () => {
    setEditingCompanyId(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyModalOpen(true);
  };

  const openEditCompanyModal = (companyId: string) => {
    const company = companies.find((item) => item.id === companyId);
    if (!company) {
      return;
    }
    setEditingCompanyId(company.id);
    setCompanyForm({
      name: company.name,
      shortName: company.shortName ?? ""
    });
    setCompanyModalOpen(true);
  };

  const openNewSiteModal = () => {
    const defaultCompanyId = visibleCompanies.find((company) => !company.isArchived)?.id ?? "";
    setEditingSiteId(null);
    setSiteForm({
      ...emptySiteForm,
      companyId: defaultCompanyId
    });
    setSiteModalOpen(true);
  };

  const openEditSiteModal = (siteId: string) => {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }
    setEditingSiteId(site.id);
    setSiteForm({
      companyId: site.companyId,
      name: site.name
    });
    setSiteModalOpen(true);
  };

  const openNewFacilityModal = () => {
    const defaultCompanyId = visibleCompanies.find((company) => !company.isArchived)?.id ?? "";
    const defaultSiteId =
      sites.find((site) => site.companyId === defaultCompanyId && !site.isArchived)?.id ?? "";

    setEditingFacilityId(null);
    setFacilityForm({
      ...emptyFacilityForm,
      companyId: defaultCompanyId,
      siteId: defaultSiteId
    });
    setFacilityModalOpen(true);
  };

  const openEditFacilityModal = (facilityId: string) => {
    const facility = facilities.find((item) => item.id === facilityId);
    if (!facility) {
      return;
    }
    setEditingFacilityId(facility.id);
    setFacilityForm({
      companyId: facility.companyId,
      siteId: facility.siteId,
      name: facility.name,
      type: facility.type ?? ""
    });
    setFacilityModalOpen(true);
  };

  const askArchiveCompany = (companyId: string) => {
    const company = companies.find((item) => item.id === companyId);
    if (!company) {
      return;
    }
    const hasSites = sites.some((site) => site.companyId === companyId && !site.isArchived);
    const hasFacilities = facilities.some(
      (facility) => facility.companyId === companyId && !facility.isArchived
    );
    setArchiveTarget({
      level: "company",
      id: companyId,
      label: company.name,
      warning: hasSites || hasFacilities ? t("scopes.archive.companyWarning") : undefined
    });
  };

  const askArchiveSite = (siteId: string) => {
    const site = sites.find((item) => item.id === siteId);
    if (!site) {
      return;
    }
    const hasFacilities = facilities.some(
      (facility) => facility.siteId === siteId && !facility.isArchived
    );
    setArchiveTarget({
      level: "site",
      id: siteId,
      label: site.name,
      warning: hasFacilities ? t("scopes.archive.siteWarning") : undefined
    });
  };

  const askArchiveFacility = (facilityId: string) => {
    const facility = facilities.find((item) => item.id === facilityId);
    if (!facility) {
      return;
    }
    setArchiveTarget({
      level: "facility",
      id: facilityId,
      label: facility.name
    });
  };

  const handleConfirmArchive = () => {
    if (!archiveTarget) {
      return;
    }

    if (archiveTarget.level === "company") {
      archiveCompany(archiveTarget.id);
      if (
        activeScope?.level === "company" &&
        activeScope.id === archiveTarget.id
      ) {
        setActiveScope(null);
      }
      if (
        activeScope?.level === "site" &&
        sites.some((site) => site.id === activeScope.id && site.companyId === archiveTarget.id)
      ) {
        setActiveScope(null);
      }
      if (
        activeScope?.level === "facility" &&
        facilities.some(
          (facility) => facility.id === activeScope.id && facility.companyId === archiveTarget.id
        )
      ) {
        setActiveScope(null);
      }
    }

    if (archiveTarget.level === "site") {
      archiveSite(archiveTarget.id);
      if (activeScope?.level === "site" && activeScope.id === archiveTarget.id) {
        setActiveScope(null);
      }
      if (
        activeScope?.level === "facility" &&
        facilities.some(
          (facility) => facility.id === activeScope.id && facility.siteId === archiveTarget.id
        )
      ) {
        setActiveScope(null);
      }
    }

    if (archiveTarget.level === "facility") {
      archiveFacility(archiveTarget.id);
      if (activeScope?.level === "facility" && activeScope.id === archiveTarget.id) {
        setActiveScope(null);
      }
    }

    setArchiveTarget(null);
  };

  const handleSaveCompany = () => {
    const name = companyForm.name.trim();
    if (!name) {
      return;
    }
    if (editingCompanyId) {
      updateCompany(editingCompanyId, {
        name,
        shortName: companyForm.shortName.trim()
      });
    } else {
      addCompany({
        name,
        shortName: companyForm.shortName.trim()
      });
    }
    setCompanyModalOpen(false);
    setCompanyForm(emptyCompanyForm);
    setEditingCompanyId(null);
  };

  const handleSaveSite = () => {
    const name = siteForm.name.trim();
    if (!siteForm.companyId || !name) {
      return;
    }
    if (editingSiteId) {
      updateSite(editingSiteId, {
        companyId: siteForm.companyId,
        name
      });
    } else {
      addSite({
        companyId: siteForm.companyId,
        name
      });
    }
    setSiteModalOpen(false);
    setSiteForm(emptySiteForm);
    setEditingSiteId(null);
  };

  const handleSaveFacility = () => {
    const name = facilityForm.name.trim();
    if (!facilityForm.companyId || !facilityForm.siteId || !name) {
      return;
    }
    if (editingFacilityId) {
      updateFacility(editingFacilityId, {
        companyId: facilityForm.companyId,
        siteId: facilityForm.siteId,
        name,
        type: facilityForm.type.trim()
      });
    } else {
      addFacility({
        companyId: facilityForm.companyId,
        siteId: facilityForm.siteId,
        name,
        type: facilityForm.type.trim()
      });
    }
    setFacilityModalOpen(false);
    setFacilityForm(emptyFacilityForm);
    setEditingFacilityId(null);
  };

  const isCompanySaveDisabled = !companyForm.name.trim();
  const isSiteSaveDisabled = !siteForm.companyId || !siteForm.name.trim();
  const isFacilitySaveDisabled =
    !facilityForm.companyId || !facilityForm.siteId || !facilityForm.name.trim();

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "scopes", label: t("breadcrumb.scopes") }
            ]}
          />
          <h1 className="pageTitle">{t("scopes.title")}</h1>
        </div>
        <div className="scopeHeaderActions">
          <Button onClick={openNewCompanyModal}>{t("scopes.addCompany")}</Button>
          <Button variant="secondary" onClick={openNewSiteModal}>
            {t("scopes.addSite")}
          </Button>
          <Button variant="secondary" onClick={openNewFacilityModal}>
            {t("scopes.addFacility")}
          </Button>
        </div>
      </div>

      <Card>
        <label className="scopesArchiveToggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          <span>{t("scopes.showArchived")}</span>
        </label>
      </Card>

      <div className="scopesLayout">
        <Card>
          <div className="scopeTree">
            {visibleCompanies.length === 0 ? (
              <div className="placeholderText">{t("scopes.emptyTree")}</div>
            ) : (
              visibleCompanies.map((company) => {
                const companySites = visibleSites.filter((site) => site.companyId === company.id);
                return (
                  <div key={company.id} className="scopeTreeGroup">
                    <div className="scopeTreeRow">
                      <button
                        type="button"
                        className={`scopeTreeButton scopeTreeButtonCompany ${
                          activeScope?.id === company.id ? "scopeTreeButtonActive" : ""
                        }`}
                        onClick={() => setActiveScope({ level: "company", id: company.id })}
                      >
                        {company.name}
                        {company.shortName ? (
                          <span className="scopeTreeMeta">({company.shortName})</span>
                        ) : null}
                        {company.isArchived ? (
                          <span className="scopeTreeArchivedTag">{t("scopes.archived")}</span>
                        ) : null}
                      </button>
                      <div className="scopeTreeActions">
                        <IconButton
                          ariaLabel={t("common.edit")}
                          onClick={() => openEditCompanyModal(company.id)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          ariaLabel={t("common.archive")}
                          onClick={() => askArchiveCompany(company.id)}
                        >
                          <ArchiveIcon />
                        </IconButton>
                      </div>
                    </div>

                    <div className="scopeTreeSites">
                      {companySites.map((site) => {
                        const siteFacilities = visibleFacilities.filter(
                          (facility) => facility.siteId === site.id
                        );
                        return (
                          <div key={site.id} className="scopeTreeSite">
                            <div className="scopeTreeRow">
                              <button
                                type="button"
                                className={`scopeTreeButton scopeTreeButtonSite ${
                                  activeScope?.id === site.id ? "scopeTreeButtonActive" : ""
                                }`}
                                onClick={() => setActiveScope({ level: "site", id: site.id })}
                              >
                                {site.name}
                                {site.isArchived ? (
                                  <span className="scopeTreeArchivedTag">{t("scopes.archived")}</span>
                                ) : null}
                              </button>
                              <div className="scopeTreeActions">
                                <IconButton
                                  ariaLabel={t("common.edit")}
                                  onClick={() => openEditSiteModal(site.id)}
                                >
                                  <EditIcon />
                                </IconButton>
                                <IconButton
                                  ariaLabel={t("common.archive")}
                                  onClick={() => askArchiveSite(site.id)}
                                >
                                  <ArchiveIcon />
                                </IconButton>
                              </div>
                            </div>
                            <div className="scopeTreeFacilities">
                              {siteFacilities.map((facility) => (
                                <div key={facility.id} className="scopeTreeRow">
                                  <button
                                    type="button"
                                    className={`scopeTreeButton scopeTreeButtonFacility ${
                                      activeScope?.id === facility.id
                                        ? "scopeTreeButtonActive"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      setActiveScope({ level: "facility", id: facility.id })
                                    }
                                  >
                                    {facility.name}
                                    {facility.type ? (
                                      <span className="scopeTreeMeta">({facility.type})</span>
                                    ) : null}
                                    {facility.isArchived ? (
                                      <span className="scopeTreeArchivedTag">{t("scopes.archived")}</span>
                                    ) : null}
                                  </button>
                                  <div className="scopeTreeActions">
                                    <IconButton
                                      ariaLabel={t("common.edit")}
                                      onClick={() => openEditFacilityModal(facility.id)}
                                    >
                                      <EditIcon />
                                    </IconButton>
                                    <IconButton
                                      ariaLabel={t("common.archive")}
                                      onClick={() => askArchiveFacility(facility.id)}
                                    >
                                      <ArchiveIcon />
                                    </IconButton>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <h2 className="sectionTitle">{t("scopes.summary.title")}</h2>
          <div className="metaLabel">{t("scopes.summary.active")}</div>
          <div className="metaValue">{activeSummary.label}</div>
          <div className="summaryGrid">
            <div className="summaryItem">
              <div className="metaLabel">{t("scopes.summary.projects")}</div>
              <div className="summaryValue">{activeSummary.projects}</div>
            </div>
            <div className="summaryItem">
              <div className="metaLabel">{t("scopes.summary.documents")}</div>
              <div className="summaryValue">{activeSummary.documents}</div>
            </div>
            <div className="summaryItem">
              <div className="metaLabel">{t("scopes.summary.openTasks")}</div>
              <div className="summaryValue">{activeSummary.openTasks}</div>
            </div>
            <div className="summaryItem">
              <div className="metaLabel">{t("scopes.summary.overdue")}</div>
              <div className="summaryValue">{activeSummary.overdue}</div>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        open={companyModalOpen}
        onClose={() => {
          setCompanyModalOpen(false);
          setEditingCompanyId(null);
        }}
        closeAriaLabel={t("modal.close")}
        header={
          editingCompanyId
            ? t("scopes.modal.company.titleEdit")
            : t("scopes.modal.company.titleNew")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setCompanyModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveCompany} disabled={isCompanySaveDisabled}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.companyName")}</span>
            <Input
              placeholder={t("scopes.form.companyName")}
              value={companyForm.name}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            {!companyForm.name.trim() ? (
              <span className="validationText">{t("scopes.validation.companyName")}</span>
            ) : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.companyShortName")}</span>
            <Input
              placeholder={t("scopes.form.companyShortName")}
              value={companyForm.shortName}
              onChange={(event) =>
                setCompanyForm((prev) => ({ ...prev, shortName: event.target.value }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={siteModalOpen}
        onClose={() => {
          setSiteModalOpen(false);
          setEditingSiteId(null);
        }}
        closeAriaLabel={t("modal.close")}
        header={
          editingSiteId ? t("scopes.modal.site.titleEdit") : t("scopes.modal.site.titleNew")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setSiteModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveSite} disabled={isSiteSaveDisabled}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.company")}</span>
            <Select
              options={[{ value: "", label: t("scopes.form.company") }, ...companyOptions]}
              value={siteForm.companyId}
              onChange={(event) =>
                setSiteForm((prev) => ({ ...prev, companyId: event.target.value }))
              }
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.siteName")}</span>
            <Input
              placeholder={t("scopes.form.siteName")}
              value={siteForm.name}
              onChange={(event) =>
                setSiteForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            {!siteForm.name.trim() ? (
              <span className="validationText">{t("scopes.validation.siteName")}</span>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={facilityModalOpen}
        onClose={() => {
          setFacilityModalOpen(false);
          setEditingFacilityId(null);
        }}
        closeAriaLabel={t("modal.close")}
        header={
          editingFacilityId
            ? t("scopes.modal.facility.titleEdit")
            : t("scopes.modal.facility.titleNew")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setFacilityModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveFacility} disabled={isFacilitySaveDisabled}>
              {t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.company")}</span>
            <Select
              options={[
                { value: "", label: t("scopes.form.company") },
                ...facilityCompanyOptions
              ]}
              value={facilityForm.companyId}
              onChange={(event) =>
                setFacilityForm((prev) => ({ ...prev, companyId: event.target.value, siteId: "" }))
              }
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.site")}</span>
            <Select
              options={[{ value: "", label: t("scopes.form.site") }, ...siteOptions]}
              value={facilityForm.siteId}
              onChange={(event) =>
                setFacilityForm((prev) => ({ ...prev, siteId: event.target.value }))
              }
            />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.facilityName")}</span>
            <Input
              placeholder={t("scopes.form.facilityName")}
              value={facilityForm.name}
              onChange={(event) =>
                setFacilityForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            {!facilityForm.name.trim() ? (
              <span className="validationText">{t("scopes.validation.facilityName")}</span>
            ) : null}
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("scopes.form.facilityType")}</span>
            <Input
              placeholder={t("scopes.form.facilityType")}
              value={facilityForm.type}
              onChange={(event) =>
                setFacilityForm((prev) => ({ ...prev, type: event.target.value }))
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        closeAriaLabel={t("modal.close")}
        header={t("scopes.archive.title")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmArchive}>{t("common.confirm")}</Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">
            {t("scopes.archive.confirmText")} <strong>{archiveTarget?.label}</strong>?
          </p>
          {archiveTarget?.warning ? (
            <p className="scopeArchiveWarning">{archiveTarget.warning}</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
