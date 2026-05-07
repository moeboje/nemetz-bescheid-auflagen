import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { scopes as initialScopes } from "../data/scopes";
import { useAuth } from "./AuthStore";
import { clearPersistedValue, makeStorageKey } from "./persistence";
import { shouldAutoLoadDomainStore } from "./routeLoading";
import {
  archiveCompany as apiArchiveCompany,
  archiveFacility as apiArchiveFacility,
  archiveSite as apiArchiveSite,
  bulkReplaceScopes,
  createCompany as apiCreateCompany,
  createFacility as apiCreateFacility,
  createSite as apiCreateSite,
  listScopes,
  restoreCompany as apiRestoreCompany,
  restoreFacility as apiRestoreFacility,
  restoreSite as apiRestoreSite,
  updateCompany as apiUpdateCompany,
  updateFacility as apiUpdateFacility,
  updateSite as apiUpdateSite
} from "../api/scopes";

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
  addCompany: (input: { id?: string; name: string; shortName?: string }) => Promise<ScopeCompany>;
  updateCompany: (id: string, input: { name: string; shortName?: string }) => Promise<ScopeCompany | null>;
  archiveCompany: (id: string) => Promise<ScopeCompany | null>;
  restoreCompany: (id: string) => Promise<ScopeCompany | null>;
  addSite: (input: { id?: string; companyId: string; name: string }) => Promise<string>;
  updateSite: (id: string, input: { companyId: string; name: string }) => Promise<ScopeSite | null>;
  archiveSite: (id: string) => Promise<ScopeSite | null>;
  restoreSite: (id: string) => Promise<ScopeSite | null>;
  addFacility: (input: {
    id?: string;
    companyId: string;
    siteId: string;
    name: string;
    type?: string;
  }) => Promise<string>;
  updateFacility: (
    id: string,
    input: { companyId: string; siteId: string; name: string; type?: string }
  ) => Promise<ScopeFacility | null>;
  archiveFacility: (id: string) => Promise<ScopeFacility | null>;
  restoreFacility: (id: string) => Promise<ScopeFacility | null>;
  replaceScopes: (value: ScopesSnapshot) => Promise<void>;
  resetScopes: () => Promise<void>;
  reloadScopes: () => Promise<ScopesSnapshot>;
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

function mergeCompany(existing: ScopeCompany, incoming: ScopeCompany) {
  return {
    ...existing,
    ...incoming,
    shortName: incoming.shortName ?? existing.shortName ?? ""
  };
}

function mergeSite(existing: ScopeSite, incoming: ScopeSite) {
  return {
    ...existing,
    ...incoming
  };
}

function mergeFacility(existing: ScopeFacility, incoming: ScopeFacility) {
  return {
    ...existing,
    ...incoming,
    type: incoming.type ?? existing.type ?? ""
  };
}

export function ScopesProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const [scopeData, setScopeData] = useState<ScopesSnapshot>({
    companies: [],
    sites: [],
    facilities: []
  });

  const { companies, sites, facilities } = scopeData;
  const shouldAutoLoad = shouldAutoLoadDomainStore(location.pathname);

  const reloadScopes = useCallback(async () => {
    if (!authUser || authUser.type === "EXTERNAL") {
      const empty = { companies: [], sites: [], facilities: [] } satisfies ScopesSnapshot;
      setScopeData(empty);
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return empty;
    }

    const next = normalizeScopes(await listScopes());
    setScopeData(next);
    clearPersistedValue(SCOPES_STORAGE_KEY);
    return next;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setScopeData({ companies: [], sites: [], facilities: [] });
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return;
    }
    if (!shouldAutoLoad) {
      return;
    }

    void reloadScopes().catch(() => {
      setScopeData({ companies: [], sites: [], facilities: [] });
      clearPersistedValue(SCOPES_STORAGE_KEY);
    });
  }, [authUser, reloadScopes, shouldAutoLoad]);

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

  const addCompany = useCallback(async (input: { id?: string; name: string; shortName?: string }) => {
    const createdCompany = await apiCreateCompany({
      id: input.id,
      name: input.name.trim(),
      shortName: input.shortName?.trim() || undefined
    });

    setScopeData((prev) => ({
      ...prev,
      companies: [...prev.companies, createdCompany]
    }));
    clearPersistedValue(SCOPES_STORAGE_KEY);
    return createdCompany;
  }, []);

  const updateCompany = useCallback(
    async (id: string, input: { name: string; shortName?: string }) => {
      const existing = companies.find((company) => company.id === id);
      if (!existing) {
        return null;
      }

      const updatedCompany = await apiUpdateCompany(id, {
        name: input.name.trim(),
        shortName: input.shortName?.trim() || undefined
      });

      setScopeData((prev) => ({
        ...prev,
        companies: prev.companies.map((company) =>
          company.id === id ? mergeCompany(company, updatedCompany) : company
        )
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedCompany;
    },
    [companies]
  );

  const archiveCompany = useCallback(
    async (id: string) => {
      const existing = companies.find((company) => company.id === id);
      if (!existing) {
        return null;
      }

      const updatedCompany = await apiArchiveCompany(id);
      setScopeData((prev) => ({
        ...prev,
        companies: prev.companies.map((company) =>
          company.id === id ? mergeCompany(company, updatedCompany) : company
        )
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedCompany;
    },
    [companies]
  );

  const restoreCompany = useCallback(
    async (id: string) => {
      const existing = companies.find((company) => company.id === id);
      if (!existing) {
        return null;
      }

      const updatedCompany = await apiRestoreCompany(id);
      setScopeData((prev) => ({
        ...prev,
        companies: prev.companies.map((company) =>
          company.id === id ? mergeCompany(company, updatedCompany) : company
        )
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedCompany;
    },
    [companies]
  );

  const addSite = useCallback(async (input: { id?: string; companyId: string; name: string }) => {
    const createdSite = await apiCreateSite({
      id: input.id,
      companyId: input.companyId,
      name: input.name.trim()
    });

    setScopeData((prev) => ({
      ...prev,
      sites: [...prev.sites, createdSite]
    }));
    clearPersistedValue(SCOPES_STORAGE_KEY);
    return createdSite.id;
  }, []);

  const updateSite = useCallback(
    async (id: string, input: { companyId: string; name: string }) => {
      const existing = sites.find((site) => site.id === id);
      if (!existing) {
        return null;
      }

      const updatedSite = await apiUpdateSite(id, {
        companyId: input.companyId,
        name: input.name.trim()
      });

      setScopeData((prev) => ({
        ...prev,
        sites: prev.sites.map((site) => (site.id === id ? mergeSite(site, updatedSite) : site))
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedSite;
    },
    [sites]
  );

  const archiveSite = useCallback(
    async (id: string) => {
      const existing = sites.find((site) => site.id === id);
      if (!existing) {
        return null;
      }

      const updatedSite = await apiArchiveSite(id);
      setScopeData((prev) => ({
        ...prev,
        sites: prev.sites.map((site) => (site.id === id ? mergeSite(site, updatedSite) : site))
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedSite;
    },
    [sites]
  );

  const restoreSite = useCallback(
    async (id: string) => {
      const existing = sites.find((site) => site.id === id);
      if (!existing) {
        return null;
      }

      const updatedSite = await apiRestoreSite(id);
      setScopeData((prev) => ({
        ...prev,
        sites: prev.sites.map((site) => (site.id === id ? mergeSite(site, updatedSite) : site))
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedSite;
    },
    [sites]
  );

  const addFacility = useCallback(
    async (input: {
      id?: string;
      companyId: string;
      siteId: string;
      name: string;
      type?: string;
    }) => {
      const createdFacility = await apiCreateFacility({
        id: input.id,
        companyId: input.companyId,
        siteId: input.siteId,
        name: input.name.trim(),
        type: input.type?.trim() || undefined
      });

      setScopeData((prev) => ({
        ...prev,
        facilities: [...prev.facilities, createdFacility]
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return createdFacility.id;
    },
    []
  );

  const updateFacility = useCallback(
    async (
      id: string,
      input: { companyId: string; siteId: string; name: string; type?: string }
    ) => {
      const existing = facilities.find((facility) => facility.id === id);
      if (!existing) {
        return null;
      }

      const updatedFacility = await apiUpdateFacility(id, {
        companyId: input.companyId,
        siteId: input.siteId,
        name: input.name.trim(),
        type: input.type?.trim() || undefined
      });

      setScopeData((prev) => ({
        ...prev,
        facilities: prev.facilities.map((facility) =>
          facility.id === id ? mergeFacility(facility, updatedFacility) : facility
        )
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedFacility;
    },
    [facilities]
  );

  const archiveFacility = useCallback(
    async (id: string) => {
      const existing = facilities.find((facility) => facility.id === id);
      if (!existing) {
        return null;
      }

      const updatedFacility = await apiArchiveFacility(id);
      setScopeData((prev) => ({
        ...prev,
        facilities: prev.facilities.map((facility) =>
          facility.id === id ? mergeFacility(facility, updatedFacility) : facility
        )
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedFacility;
    },
    [facilities]
  );

  const restoreFacility = useCallback(
    async (id: string) => {
      const existing = facilities.find((facility) => facility.id === id);
      if (!existing) {
        return null;
      }

      const updatedFacility = await apiRestoreFacility(id);
      setScopeData((prev) => ({
        ...prev,
        facilities: prev.facilities.map((facility) =>
          facility.id === id ? mergeFacility(facility, updatedFacility) : facility
        )
      }));
      clearPersistedValue(SCOPES_STORAGE_KEY);
      return updatedFacility;
    },
    [facilities]
  );

  const replaceScopes = useCallback(async (value: ScopesSnapshot) => {
    const replaced = normalizeScopes(await bulkReplaceScopes(value));
    setScopeData(replaced);
    clearPersistedValue(SCOPES_STORAGE_KEY);
  }, []);

  const resetScopes = useCallback(async () => {
    const seed = createSeedScopes();
    const replaced = normalizeScopes(await bulkReplaceScopes(seed));
    setScopeData(replaced);
    clearPersistedValue(SCOPES_STORAGE_KEY);
  }, []);

  const getScopeLabel = useCallback(
    (
      companyIdOrInput: string | ScopeLabelInput,
      siteId?: string,
      facilityId?: string
    ) => {
      const input =
        typeof companyIdOrInput === "string"
          ? { companyId: companyIdOrInput, siteId, facilityId }
          : companyIdOrInput;

      const company = companies.find((item) => item.id === input.companyId);
      const companyName = company?.name ?? input.companyId;

      if (!input.siteId) {
        return companyName;
      }

      const site = sites.find((item) => item.id === input.siteId);
      const siteName = site?.name ?? input.siteId;

      if (!input.facilityId) {
        return `${companyName} / ${siteName}`;
      }

      const facility = facilities.find((item) => item.id === input.facilityId);
      const facilityName = facility?.name ?? input.facilityId;

      return `${companyName} / ${siteName} / ${facilityName}`;
    },
    [companies, facilities, sites]
  );

  const value = useMemo<ScopesContextValue>(
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
      reloadScopes,
      getScopeLabel
    }),
    [
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
      reloadScopes,
      getScopeLabel
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
