import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { scopes as initialScopes } from "../data/scopes";
import {
  loadPersistedValue,
  makeStorageKey,
  savePersistedValue
} from "./persistence";

export type ScopeCompany = {
  id: string;
  name: string;
  shortName?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScopeSite = {
  id: string;
  companyId: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScopeFacility = {
  id: string;
  companyId: string;
  siteId: string;
  name: string;
  type?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScopesSnapshot = {
  companies: ScopeCompany[];
  sites: ScopeSite[];
  facilities: ScopeFacility[];
};

type ScopeFilterOptions = {
  includeArchived?: boolean;
};

type ScopeLabelInput = {
  companyId: string;
  siteId?: string;
  facilityId?: string;
};

type ScopesContextValue = ScopesSnapshot & {
  companies: ScopeCompany[];
  sites: ScopeSite[];
  facilities: ScopeFacility[];
  getCompany: (id: string) => ScopeCompany | undefined;
  getSites: (companyId: string, options?: ScopeFilterOptions) => ScopeSite[];
  getFacilities: (siteId: string, options?: ScopeFilterOptions) => ScopeFacility[];
  addCompany: (input: { name: string; shortName?: string }) => void;
  updateCompany: (id: string, input: { name: string; shortName?: string }) => void;
  archiveCompany: (id: string) => void;
  restoreCompany: (id: string) => void;
  addSite: (input: { companyId: string; name: string }) => string;
  updateSite: (id: string, input: { companyId: string; name: string }) => void;
  archiveSite: (id: string) => void;
  restoreSite: (id: string) => void;
  addFacility: (input: { companyId: string; siteId: string; name: string; type?: string }) => string;
  updateFacility: (
    id: string,
    input: { companyId: string; siteId: string; name: string; type?: string }
  ) => void;
  archiveFacility: (id: string) => void;
  restoreFacility: (id: string) => void;
  replaceScopes: (value: ScopesSnapshot) => void;
  resetScopes: () => void;
  getScopeLabel: (
    companyIdOrInput: string | ScopeLabelInput,
    siteId?: string,
    facilityId?: string
  ) => string;
};

const ScopesContext = createContext<ScopesContextValue | undefined>(undefined);

export const SCOPES_STORAGE_KEY = makeStorageKey("scopes");

function nowStamp() {
  return new Date().toISOString();
}

function createSeedScopes(): ScopesSnapshot {
  const seedTime = nowStamp();

  const companies: ScopeCompany[] = initialScopes.map((company) => ({
    id: company.id,
    name: company.name,
    shortName: "",
    isArchived: false,
    createdAt: seedTime,
    updatedAt: seedTime
  }));

  const sites: ScopeSite[] = initialScopes.flatMap((company) =>
    company.sites.map((site) => ({
      id: site.id,
      companyId: company.id,
      name: site.name,
      isArchived: false,
      createdAt: seedTime,
      updatedAt: seedTime
    }))
  );

  const facilities: ScopeFacility[] = initialScopes.flatMap((company) =>
    company.sites.flatMap((site) =>
      site.facilities.map((facility) => ({
        id: facility.id,
        companyId: company.id,
        siteId: site.id,
        name: facility.name,
        type: "",
        isArchived: false,
        createdAt: seedTime,
        updatedAt: seedTime
      }))
    )
  );

  return { companies, sites, facilities };
}

function normalizeScopes(value: ScopesSnapshot): ScopesSnapshot {
  const fallbackTime = nowStamp();

  const companies = value.companies
    .filter((company) => Boolean(company?.id) && Boolean(company?.name))
    .map((company) => ({
      id: company.id,
      name: company.name,
      shortName: company.shortName ?? "",
      isArchived: Boolean(company.isArchived),
      createdAt: company.createdAt ?? fallbackTime,
      updatedAt: company.updatedAt ?? company.createdAt ?? fallbackTime
    }));

  const companyIds = new Set(companies.map((company) => company.id));

  const sites = value.sites
    .filter(
      (site) =>
        Boolean(site?.id) &&
        Boolean(site?.name) &&
        Boolean(site?.companyId) &&
        companyIds.has(site.companyId)
    )
    .map((site) => ({
      id: site.id,
      companyId: site.companyId,
      name: site.name,
      isArchived: Boolean(site.isArchived),
      createdAt: site.createdAt ?? fallbackTime,
      updatedAt: site.updatedAt ?? site.createdAt ?? fallbackTime
    }));

  const siteById = new Map(sites.map((site) => [site.id, site] as const));

  const facilities = value.facilities
    .filter(
      (facility) =>
        Boolean(facility?.id) &&
        Boolean(facility?.siteId) &&
        Boolean(facility?.name) &&
        siteById.has(facility.siteId)
    )
    .map((facility) => {
      const parentSite = siteById.get(facility.siteId);
      return {
        id: facility.id,
        companyId: facility.companyId || parentSite?.companyId || "",
        siteId: facility.siteId,
        name: facility.name,
        type: facility.type ?? "",
        isArchived: Boolean(facility.isArchived),
        createdAt: facility.createdAt ?? fallbackTime,
        updatedAt: facility.updatedAt ?? facility.createdAt ?? fallbackTime
      };
    });

  return {
    companies,
    sites,
    facilities
  };
}

function createId(prefix: "c" | "s" | "f") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ScopesProvider({ children }: { children: React.ReactNode }) {
  const [scopeData, setScopeData] = useState<ScopesSnapshot>(() => {
    const fallback = createSeedScopes();
    const stored = loadPersistedValue<ScopesSnapshot>(SCOPES_STORAGE_KEY, fallback);
    return normalizeScopes(stored);
  });

  const { companies, sites, facilities } = scopeData;

  React.useEffect(() => {
    savePersistedValue(SCOPES_STORAGE_KEY, scopeData);
  }, [scopeData]);

  const getCompany = useCallback(
    (id: string) => companies.find((company) => company.id === id),
    [companies]
  );

  const getSites = useCallback(
    (companyId: string, options?: ScopeFilterOptions) =>
      sites.filter(
        (site) =>
          site.companyId === companyId &&
          (options?.includeArchived ? true : !site.isArchived)
      ),
    [sites]
  );

  const getFacilities = useCallback(
    (siteId: string, options?: ScopeFilterOptions) =>
      facilities.filter(
        (facility) =>
          facility.siteId === siteId &&
          (options?.includeArchived ? true : !facility.isArchived)
      ),
    [facilities]
  );

  const addCompany = useCallback((input: { name: string; shortName?: string }) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      companies: [
        ...prev.companies,
        {
          id: createId("c"),
          name: input.name,
          shortName: input.shortName ?? "",
          isArchived: false,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ]
    }));
  }, []);

  const updateCompany = useCallback((id: string, input: { name: string; shortName?: string }) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      companies: prev.companies.map((company) =>
        company.id === id
          ? {
              ...company,
              name: input.name,
              shortName: input.shortName ?? "",
              updatedAt: timestamp
            }
          : company
      )
    }));
  }, []);

  const archiveCompany = useCallback((id: string) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      companies: prev.companies.map((company) =>
        company.id === id ? { ...company, isArchived: true, updatedAt: timestamp } : company
      )
    }));
  }, []);

  const restoreCompany = useCallback((id: string) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      companies: prev.companies.map((company) =>
        company.id === id ? { ...company, isArchived: false, updatedAt: timestamp } : company
      )
    }));
  }, []);

  const addSite = useCallback((input: { companyId: string; name: string }) => {
    const timestamp = nowStamp();
    const id = createId("s");
    setScopeData((prev) => ({
      ...prev,
      sites: [
        ...prev.sites,
        {
          id,
          companyId: input.companyId,
          name: input.name,
          isArchived: false,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ]
    }));
    return id;
  }, []);

  const updateSite = useCallback((id: string, input: { companyId: string; name: string }) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      companies: prev.companies,
      sites: prev.sites.map((site) =>
        site.id === id
          ? {
              ...site,
              companyId: input.companyId,
              name: input.name,
              updatedAt: timestamp
            }
          : site
      ),
      facilities: prev.facilities.map((facility) =>
        facility.siteId === id
          ? {
              ...facility,
              companyId: input.companyId,
              updatedAt: timestamp
            }
          : facility
      )
    }));
  }, []);

  const archiveSite = useCallback((id: string) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      sites: prev.sites.map((site) =>
        site.id === id ? { ...site, isArchived: true, updatedAt: timestamp } : site
      )
    }));
  }, []);

  const restoreSite = useCallback((id: string) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      sites: prev.sites.map((site) =>
        site.id === id ? { ...site, isArchived: false, updatedAt: timestamp } : site
      )
    }));
  }, []);

  const addFacility = useCallback(
    (input: { companyId: string; siteId: string; name: string; type?: string }) => {
      const timestamp = nowStamp();
      const id = createId("f");
      setScopeData((prev) => ({
        ...prev,
        facilities: [
          ...prev.facilities,
          {
            id,
            companyId: input.companyId,
            siteId: input.siteId,
            name: input.name,
            type: input.type ?? "",
            isArchived: false,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      }));
      return id;
    },
    []
  );

  const updateFacility = useCallback(
    (id: string, input: { companyId: string; siteId: string; name: string; type?: string }) => {
      const timestamp = nowStamp();
      setScopeData((prev) => ({
        ...prev,
        facilities: prev.facilities.map((facility) =>
          facility.id === id
            ? {
                ...facility,
                companyId: input.companyId,
                siteId: input.siteId,
                name: input.name,
                type: input.type ?? "",
                updatedAt: timestamp
              }
            : facility
        )
      }));
    },
    []
  );

  const archiveFacility = useCallback((id: string) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      facilities: prev.facilities.map((facility) =>
        facility.id === id ? { ...facility, isArchived: true, updatedAt: timestamp } : facility
      )
    }));
  }, []);

  const restoreFacility = useCallback((id: string) => {
    const timestamp = nowStamp();
    setScopeData((prev) => ({
      ...prev,
      facilities: prev.facilities.map((facility) =>
        facility.id === id ? { ...facility, isArchived: false, updatedAt: timestamp } : facility
      )
    }));
  }, []);

  const replaceScopes = useCallback((value: ScopesSnapshot) => {
    setScopeData(normalizeScopes(value));
  }, []);

  const resetScopes = useCallback(() => {
    setScopeData(createSeedScopes());
  }, []);

  const getScopeLabel = useCallback(
    (companyIdOrInput: string | ScopeLabelInput, siteIdInput?: string, facilityIdInput?: string) => {
      const companyId =
        typeof companyIdOrInput === "string" ? companyIdOrInput : companyIdOrInput.companyId;
      const siteId =
        typeof companyIdOrInput === "string" ? siteIdInput : companyIdOrInput.siteId;
      const facilityId =
        typeof companyIdOrInput === "string" ? facilityIdInput : companyIdOrInput.facilityId;

      const facility = facilityId
        ? facilities.find((item) => item.id === facilityId)
        : undefined;
      const site = siteId
        ? sites.find((item) => item.id === siteId)
        : facility
        ? sites.find((item) => item.id === facility.siteId)
        : undefined;
      const company =
        companies.find((item) => item.id === companyId) ||
        (facility ? companies.find((item) => item.id === facility.companyId) : undefined);

      if (!company) {
        return "";
      }
      if (facility && site) {
        return `${company.name} / ${site.name} / ${facility.name}`;
      }
      if (facility) {
        return `${company.name} / ${facility.name}`;
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
      getCompany,
      getSites,
      getFacilities,
      addCompany,
      updateCompany,
      archiveCompany,
      restoreCompany,
      addSite,
      updateSite,
      archiveSite,
      restoreSite,
      addFacility,
      updateFacility,
      archiveFacility,
      restoreFacility,
      replaceScopes,
      resetScopes,
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
      getCompany,
      getFacilities,
      getSites,
      getScopeLabel,
      replaceScopes,
      resetScopes,
      restoreCompany,
      restoreFacility,
      restoreSite,
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
