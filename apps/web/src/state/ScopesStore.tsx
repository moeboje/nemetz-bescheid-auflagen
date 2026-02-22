import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { scopes as initialScopes } from "../data/scopes";

export type ScopeCompany = {
  id: string;
  name: string;
  shortName?: string;
  isArchived: boolean;
};

export type ScopeSite = {
  id: string;
  companyId: string;
  name: string;
  isArchived: boolean;
  projects: number;
  documents: number;
  openTasks: number;
  overdue: number;
};

export type ScopeFacility = {
  id: string;
  companyId: string;
  siteId: string;
  name: string;
  type?: string;
  isArchived: boolean;
  projects: number;
  documents: number;
  openTasks: number;
  overdue: number;
};

type ScopesContextValue = {
  companies: ScopeCompany[];
  sites: ScopeSite[];
  facilities: ScopeFacility[];
  addCompany: (input: { name: string; shortName?: string }) => void;
  updateCompany: (id: string, input: { name: string; shortName?: string }) => void;
  archiveCompany: (id: string) => void;
  addSite: (input: { companyId: string; name: string }) => void;
  updateSite: (id: string, input: { companyId: string; name: string }) => void;
  archiveSite: (id: string) => void;
  addFacility: (input: { companyId: string; siteId: string; name: string; type?: string }) => void;
  updateFacility: (
    id: string,
    input: { companyId: string; siteId: string; name: string; type?: string }
  ) => void;
  archiveFacility: (id: string) => void;
  getScopeLabel: (companyId: string, siteId?: string, facilityId?: string) => string;
};

const ScopesContext = createContext<ScopesContextValue | undefined>(undefined);

const initialCompanies: ScopeCompany[] = initialScopes.map((company) => ({
  id: company.id,
  name: company.name,
  shortName: "",
  isArchived: false
}));

const initialSites: ScopeSite[] = initialScopes.flatMap((company) =>
  company.sites.map((site) => ({
    id: site.id,
    companyId: company.id,
    name: site.name,
    isArchived: false,
    projects: site.projects,
    documents: site.documents,
    openTasks: site.openTasks,
    overdue: site.overdue
  }))
);

const initialFacilities: ScopeFacility[] = initialScopes.flatMap((company) =>
  company.sites.flatMap((site) =>
    site.facilities.map((facility) => ({
      id: facility.id,
      companyId: company.id,
      siteId: site.id,
      name: facility.name,
      type: "",
      isArchived: false,
      projects: facility.projects,
      documents: facility.documents,
      openTasks: facility.openTasks,
      overdue: facility.overdue
    }))
  )
);

function createId(prefix: "c" | "s" | "f") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ScopesProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<ScopeCompany[]>(initialCompanies);
  const [sites, setSites] = useState<ScopeSite[]>(initialSites);
  const [facilities, setFacilities] = useState<ScopeFacility[]>(initialFacilities);

  const addCompany = useCallback((input: { name: string; shortName?: string }) => {
    setCompanies((prev) => [
      ...prev,
      {
        id: createId("c"),
        name: input.name,
        shortName: input.shortName ?? "",
        isArchived: false
      }
    ]);
  }, []);

  const updateCompany = useCallback((id: string, input: { name: string; shortName?: string }) => {
    setCompanies((prev) =>
      prev.map((company) =>
        company.id === id
          ? { ...company, name: input.name, shortName: input.shortName ?? "" }
          : company
      )
    );
  }, []);

  const archiveCompany = useCallback((id: string) => {
    setCompanies((prev) =>
      prev.map((company) => (company.id === id ? { ...company, isArchived: true } : company))
    );
  }, []);

  const addSite = useCallback((input: { companyId: string; name: string }) => {
    setSites((prev) => [
      ...prev,
      {
        id: createId("s"),
        companyId: input.companyId,
        name: input.name,
        isArchived: false,
        projects: 0,
        documents: 0,
        openTasks: 0,
        overdue: 0
      }
    ]);
  }, []);

  const updateSite = useCallback((id: string, input: { companyId: string; name: string }) => {
    setSites((prev) => {
      const currentSite = prev.find((site) => site.id === id);
      const nextSites = prev.map((site) =>
        site.id === id ? { ...site, companyId: input.companyId, name: input.name } : site
      );

      if (currentSite && currentSite.companyId !== input.companyId) {
        setFacilities((currentFacilities) =>
          currentFacilities.map((facility) =>
            facility.siteId === id ? { ...facility, companyId: input.companyId } : facility
          )
        );
      }

      return nextSites;
    });
  }, []);

  const archiveSite = useCallback((id: string) => {
    setSites((prev) => prev.map((site) => (site.id === id ? { ...site, isArchived: true } : site)));
  }, []);

  const addFacility = useCallback(
    (input: { companyId: string; siteId: string; name: string; type?: string }) => {
      setFacilities((prev) => [
        ...prev,
        {
          id: createId("f"),
          companyId: input.companyId,
          siteId: input.siteId,
          name: input.name,
          type: input.type ?? "",
          isArchived: false,
          projects: 0,
          documents: 0,
          openTasks: 0,
          overdue: 0
        }
      ]);
    },
    []
  );

  const updateFacility = useCallback(
    (id: string, input: { companyId: string; siteId: string; name: string; type?: string }) => {
      setFacilities((prev) =>
        prev.map((facility) =>
          facility.id === id
            ? {
                ...facility,
                companyId: input.companyId,
                siteId: input.siteId,
                name: input.name,
                type: input.type ?? ""
              }
            : facility
        )
      );
    },
    []
  );

  const archiveFacility = useCallback((id: string) => {
    setFacilities((prev) =>
      prev.map((facility) => (facility.id === id ? { ...facility, isArchived: true } : facility))
    );
  }, []);

  const getScopeLabel = useCallback(
    (companyId: string, siteId?: string, facilityId?: string) => {
      const company = companies.find((item) => item.id === companyId);
      const site = siteId ? sites.find((item) => item.id === siteId) : undefined;
      const facility = facilityId ? facilities.find((item) => item.id === facilityId) : undefined;

      if (!company) {
        return "";
      }
      if (facility && site) {
        return `${company.name} / ${site.name} / ${facility.name}`;
      }
      if (site) {
        return `${company.name} / ${site.name}`;
      }
      return company.name;
    },
    [companies, facilities, sites]
  );

  const value = useMemo(
    () => ({
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
    }),
    [
      addCompany,
      addFacility,
      addSite,
      archiveCompany,
      archiveFacility,
      archiveSite,
      companies,
      facilities,
      getScopeLabel,
      sites,
      updateCompany,
      updateFacility,
      updateSite
    ]
  );

  return <ScopesContext.Provider value={value}>{children}</ScopesContext.Provider>;
}

export function useScopes() {
  const context = useContext(ScopesContext);
  if (!context) {
    throw new Error("useScopes must be used within ScopesProvider");
  }
  return context;
}
