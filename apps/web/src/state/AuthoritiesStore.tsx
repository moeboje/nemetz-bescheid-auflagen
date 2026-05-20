import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  authorities as initialAuthorities,
  contacts as initialContacts,
  type Authority,
  type AuthorityContact
} from "../data/authorities";
import { useAuth } from "./AuthStore";
import { clearPersistedValue, makeStorageKey } from "./persistence";
import { shouldAutoLoadDomainStore } from "./routeLoading";
import {
  archiveAuthority as apiArchiveAuthority,
  archiveAuthorityContact as apiArchiveAuthorityContact,
  bulkReplaceAuthorities,
  createAuthority as apiCreateAuthority,
  createAuthorityContact as apiCreateAuthorityContact,
  listAuthorities,
  restoreAuthority as apiRestoreAuthority,
  restoreAuthorityContact as apiRestoreAuthorityContact,
  updateAuthority as apiUpdateAuthority,
  updateAuthorityContact as apiUpdateAuthorityContact
} from "../api/authorities";

type FilterOptions = {
  includeArchived?: boolean;
};

export type AuthoritiesSnapshot = {
  authorities: Authority[];
  contacts: AuthorityContact[];
};

export type AuthoritiesContextValue = {
  authorities: Authority[];
  contacts: AuthorityContact[];
  getAuthority: (authorityId: string) => Authority | undefined;
  getContacts: (authorityId: string, options?: FilterOptions) => AuthorityContact[];
  addAuthority: (input: { id?: string; name: string; shortName?: string }) => Promise<Authority>;
  updateAuthority: (id: string, input: { name: string; shortName?: string }) => Promise<Authority | null>;
  archiveAuthority: (id: string) => Promise<Authority | null>;
  restoreAuthority: (id: string) => Promise<Authority | null>;
  addContact: (input: {
    id?: string;
    authorityId: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    roleTitle?: string;
    notes?: string;
    department?: string;
    isPrimary?: boolean;
  }) => Promise<AuthorityContact>;
  updateContact: (
    id: string,
    input: {
      authorityId: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      roleTitle?: string;
      notes?: string;
      department?: string;
      isPrimary?: boolean;
    }
  ) => Promise<AuthorityContact | null>;
  archiveContact: (id: string) => Promise<AuthorityContact | null>;
  restoreContact: (id: string) => Promise<AuthorityContact | null>;
  replaceAuthorities: (value: AuthoritiesSnapshot) => Promise<void>;
  resetAuthorities: () => Promise<void>;
  reloadAuthorities: () => Promise<AuthoritiesSnapshot>;
  getAuthorityName: (authorityId?: string) => string;
  getContactsForAuthority: (authorityId?: string) => AuthorityContact[];
};

const AuthoritiesContext = createContext<AuthoritiesContextValue | undefined>(undefined);

export const AUTHORITIES_STORAGE_KEY = makeStorageKey("authorities");

function nowStamp() {
  return new Date().toISOString();
}

function toTrimmedOptionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function deriveContactName(input: { name?: string; firstName?: string; lastName?: string }) {
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  if (combinedName) {
    return combinedName;
  }

  return input.name?.trim() ?? "";
}

function createSeedAuthorities(): AuthoritiesSnapshot {
  const seedTime = nowStamp();

  return {
    authorities: initialAuthorities.map((authority) => ({
      ...authority,
      createdAt: authority.createdAt ?? seedTime,
      updatedAt: authority.updatedAt ?? authority.createdAt ?? seedTime
    })),
    contacts: initialContacts.map((contact) => ({
      ...contact,
      createdAt: contact.createdAt ?? seedTime,
      updatedAt: contact.updatedAt ?? contact.createdAt ?? seedTime
    }))
  };
}

function normalizeAuthorities(value: AuthoritiesSnapshot): AuthoritiesSnapshot {
  const fallbackTime = nowStamp();
  const authorities = value.authorities
    .filter((authority) => Boolean(authority?.id) && Boolean(authority?.name))
    .map((authority) => ({
      id: authority.id,
      name: authority.name,
      shortName: authority.shortName ?? "",
      isArchived: Boolean(authority.isArchived),
      createdAt: authority.createdAt ?? fallbackTime,
      updatedAt: authority.updatedAt ?? authority.createdAt ?? fallbackTime
    }));

  const authorityIds = new Set(authorities.map((authority) => authority.id));

  const contacts = value.contacts
    .filter(
      (contact) =>
        Boolean(contact?.id) &&
        Boolean(contact?.authorityId) &&
        authorityIds.has(contact.authorityId)
    )
    .map((contact) => ({
      id: contact.id,
      authorityId: contact.authorityId,
      name: deriveContactName(contact),
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      mobile: contact.mobile ?? "",
      roleTitle: contact.roleTitle ?? "",
      notes: contact.notes ?? "",
      department: contact.department ?? "",
      isPrimary: Boolean(contact.isPrimary),
      isArchived: Boolean(contact.isArchived),
      createdAt: contact.createdAt ?? fallbackTime,
      updatedAt: contact.updatedAt ?? contact.createdAt ?? fallbackTime
    }))
    .filter((contact) => Boolean(contact.name));

  return {
    authorities,
    contacts
  };
}

function mergeAuthority(existing: Authority, incoming: Authority) {
  return {
    ...existing,
    ...incoming,
    shortName: incoming.shortName ?? existing.shortName ?? ""
  };
}

function mergeContact(existing: AuthorityContact, incoming: AuthorityContact) {
  return {
    ...existing,
    ...incoming,
    name: deriveContactName(incoming),
    firstName: incoming.firstName ?? existing.firstName ?? "",
    lastName: incoming.lastName ?? existing.lastName ?? "",
    email: incoming.email ?? existing.email ?? "",
    phone: incoming.phone ?? existing.phone ?? "",
    mobile: incoming.mobile ?? existing.mobile ?? "",
    roleTitle: incoming.roleTitle ?? existing.roleTitle ?? "",
    notes: incoming.notes ?? existing.notes ?? "",
    department: incoming.department ?? existing.department ?? "",
    isPrimary: incoming.isPrimary ?? existing.isPrimary ?? false
  };
}

export function AuthoritiesProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const [authorityData, setAuthorityData] = useState<AuthoritiesSnapshot>({
    authorities: [],
    contacts: []
  });

  const { authorities, contacts } = authorityData;
  const shouldAutoLoad = shouldAutoLoadDomainStore(location.pathname, "authorities");

  const reloadAuthorities = useCallback(async () => {
    if (!authUser || authUser.type === "EXTERNAL") {
      const empty = { authorities: [], contacts: [] } satisfies AuthoritiesSnapshot;
      setAuthorityData(empty);
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return empty;
    }

    const next = normalizeAuthorities(await listAuthorities());
    setAuthorityData(next);
    clearPersistedValue(AUTHORITIES_STORAGE_KEY);
    return next;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setAuthorityData({ authorities: [], contacts: [] });
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return;
    }
    if (!shouldAutoLoad) {
      return;
    }

    void reloadAuthorities().catch(() => {
      setAuthorityData({ authorities: [], contacts: [] });
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
    });
  }, [authUser, reloadAuthorities, shouldAutoLoad]);

  const getAuthority = useCallback(
    (authorityId: string) => authorities.find((authority) => authority.id === authorityId),
    [authorities]
  );

  const getContacts = useCallback(
    (authorityId: string, options?: FilterOptions) => {
      const authority = authorities.find((item) => item.id === authorityId);
      if (!authority) {
        return [];
      }
      if (authority.isArchived && !options?.includeArchived) {
        return [];
      }
      return contacts.filter(
        (contact) =>
          contact.authorityId === authorityId &&
          (options?.includeArchived ? true : !contact.isArchived)
      );
    },
    [authorities, contacts]
  );

  const addAuthority = useCallback(async (input: { id?: string; name: string; shortName?: string }) => {
    const createdAuthority = await apiCreateAuthority({
      id: input.id,
      name: input.name.trim(),
      shortName: input.shortName?.trim() || undefined
    });

    setAuthorityData((prev) => ({
      ...prev,
      authorities: [...prev.authorities, createdAuthority]
    }));
    clearPersistedValue(AUTHORITIES_STORAGE_KEY);
    return createdAuthority;
  }, []);

  const updateAuthority = useCallback(
    async (id: string, input: { name: string; shortName?: string }) => {
      const existing = authorities.find((authority) => authority.id === id);
      if (!existing) {
        return null;
      }

      const updatedAuthority = await apiUpdateAuthority(id, {
        name: input.name.trim(),
        shortName: input.shortName?.trim() || undefined
      });

      setAuthorityData((prev) => ({
        ...prev,
        authorities: prev.authorities.map((authority) =>
          authority.id === id ? mergeAuthority(authority, updatedAuthority) : authority
        )
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return updatedAuthority;
    },
    [authorities]
  );

  const archiveAuthority = useCallback(
    async (id: string) => {
      const existing = authorities.find((authority) => authority.id === id);
      if (!existing) {
        return null;
      }

      const updatedAuthority = await apiArchiveAuthority(id);
      setAuthorityData((prev) => ({
        ...prev,
        authorities: prev.authorities.map((authority) =>
          authority.id === id ? mergeAuthority(authority, updatedAuthority) : authority
        )
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return updatedAuthority;
    },
    [authorities]
  );

  const restoreAuthority = useCallback(
    async (id: string) => {
      const existing = authorities.find((authority) => authority.id === id);
      if (!existing) {
        return null;
      }

      const updatedAuthority = await apiRestoreAuthority(id);
      setAuthorityData((prev) => ({
        ...prev,
        authorities: prev.authorities.map((authority) =>
          authority.id === id ? mergeAuthority(authority, updatedAuthority) : authority
        )
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return updatedAuthority;
    },
    [authorities]
  );

  const addContact = useCallback(
    async (input: {
      id?: string;
      authorityId: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      mobile?: string;
      roleTitle?: string;
      notes?: string;
      department?: string;
      isPrimary?: boolean;
    }) => {
      const createdContact = await apiCreateAuthorityContact({
        id: input.id,
        authorityId: input.authorityId,
        name: deriveContactName(input) || undefined,
        firstName: toTrimmedOptionalString(input.firstName),
        lastName: toTrimmedOptionalString(input.lastName),
        email: toTrimmedOptionalString(input.email),
        phone: toTrimmedOptionalString(input.phone),
        mobile: toTrimmedOptionalString(input.mobile),
        roleTitle: toTrimmedOptionalString(input.roleTitle),
        notes: toTrimmedOptionalString(input.notes),
        department: toTrimmedOptionalString(input.department),
        isPrimary: input.isPrimary
      });

      setAuthorityData((prev) => ({
        ...prev,
        contacts: [...prev.contacts, createdContact]
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return createdContact;
    },
    []
  );

  const updateContact = useCallback(
    async (
      id: string,
      input: {
        authorityId: string;
        name?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        mobile?: string;
        roleTitle?: string;
        notes?: string;
        department?: string;
        isPrimary?: boolean;
      }
    ) => {
      const existing = contacts.find((contact) => contact.id === id);
      if (!existing) {
        return null;
      }

      const updatedContact = await apiUpdateAuthorityContact(id, {
        authorityId: input.authorityId,
        name: deriveContactName(input) || undefined,
        firstName: toTrimmedOptionalString(input.firstName),
        lastName: toTrimmedOptionalString(input.lastName),
        email: toTrimmedOptionalString(input.email),
        phone: toTrimmedOptionalString(input.phone),
        mobile: toTrimmedOptionalString(input.mobile),
        roleTitle: toTrimmedOptionalString(input.roleTitle),
        notes: toTrimmedOptionalString(input.notes),
        department: toTrimmedOptionalString(input.department),
        isPrimary: input.isPrimary
      });

      setAuthorityData((prev) => ({
        ...prev,
        contacts: prev.contacts.map((contact) =>
          contact.id === id ? mergeContact(contact, updatedContact) : contact
        )
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return updatedContact;
    },
    [contacts]
  );

  const archiveContact = useCallback(
    async (id: string) => {
      const existing = contacts.find((contact) => contact.id === id);
      if (!existing) {
        return null;
      }

      const updatedContact = await apiArchiveAuthorityContact(id);
      setAuthorityData((prev) => ({
        ...prev,
        contacts: prev.contacts.map((contact) =>
          contact.id === id ? mergeContact(contact, updatedContact) : contact
        )
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return updatedContact;
    },
    [contacts]
  );

  const restoreContact = useCallback(
    async (id: string) => {
      const existing = contacts.find((contact) => contact.id === id);
      if (!existing) {
        return null;
      }

      const updatedContact = await apiRestoreAuthorityContact(id);
      setAuthorityData((prev) => ({
        ...prev,
        contacts: prev.contacts.map((contact) =>
          contact.id === id ? mergeContact(contact, updatedContact) : contact
        )
      }));
      clearPersistedValue(AUTHORITIES_STORAGE_KEY);
      return updatedContact;
    },
    [contacts]
  );

  const replaceAuthorities = useCallback(async (value: AuthoritiesSnapshot) => {
    const replaced = normalizeAuthorities(await bulkReplaceAuthorities(value));
    setAuthorityData(replaced);
    clearPersistedValue(AUTHORITIES_STORAGE_KEY);
  }, []);

  const resetAuthorities = useCallback(async () => {
    const seed = createSeedAuthorities();
    const replaced = normalizeAuthorities(await bulkReplaceAuthorities(seed));
    setAuthorityData(replaced);
    clearPersistedValue(AUTHORITIES_STORAGE_KEY);
  }, []);

  const getAuthorityName = useCallback(
    (authorityId?: string) => {
      if (!authorityId) {
        return "";
      }

      return authorities.find((authority) => authority.id === authorityId)?.name ?? "";
    },
    [authorities]
  );

  const getContactsForAuthority = useCallback(
    (authorityId?: string) => {
      if (!authorityId) {
        return [];
      }
      return getContacts(authorityId);
    },
    [getContacts]
  );

  const value = useMemo<AuthoritiesContextValue>(
    () => ({
      authorities,
      contacts,
      getAuthority,
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
      resetAuthorities,
      reloadAuthorities,
      getAuthorityName,
      getContactsForAuthority
    }),
    [
      authorities,
      contacts,
      getAuthority,
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
      resetAuthorities,
      reloadAuthorities,
      getAuthorityName,
      getContactsForAuthority
    ]
  );

  return <AuthoritiesContext.Provider value={value}>{children}</AuthoritiesContext.Provider>;
}

export function useAuthorities() {
  const context = useContext(AuthoritiesContext);
  if (!context) {
    throw new Error("useAuthorities must be used within AuthoritiesProvider");
  }
  return context;
}
