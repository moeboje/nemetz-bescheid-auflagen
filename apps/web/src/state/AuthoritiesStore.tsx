import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  authorities as initialAuthorities,
  contacts as initialContacts,
  Authority,
  AuthorityContact
} from "../data/authorities";
import {
  loadPersistedValue,
  makeStorageKey,
  savePersistedValue
} from "./persistence";

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
  addAuthority: (input: { name: string; shortName?: string }) => void;
  updateAuthority: (id: string, input: { name: string; shortName?: string }) => void;
  archiveAuthority: (id: string) => void;
  restoreAuthority: (id: string) => void;
  addContact: (input: {
    authorityId: string;
    name: string;
    email?: string;
    phone?: string;
    roleTitle?: string;
  }) => void;
  updateContact: (
    id: string,
    input: {
      authorityId: string;
      name: string;
      email?: string;
      phone?: string;
      roleTitle?: string;
    }
  ) => void;
  archiveContact: (id: string) => void;
  restoreContact: (id: string) => void;
  replaceAuthorities: (value: AuthoritiesSnapshot) => void;
  resetAuthorities: () => void;
  getAuthorityName: (authorityId?: string) => string;
  getContactsForAuthority: (authorityId?: string) => AuthorityContact[];
};

const AuthoritiesContext = createContext<AuthoritiesContextValue | undefined>(undefined);

export const AUTHORITIES_STORAGE_KEY = makeStorageKey("authorities");

function nowStamp() {
  return new Date().toISOString();
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
        Boolean(contact?.name) &&
        authorityIds.has(contact.authorityId)
    )
    .map((contact) => ({
      id: contact.id,
      authorityId: contact.authorityId,
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      roleTitle: contact.roleTitle ?? "",
      isArchived: Boolean(contact.isArchived),
      createdAt: contact.createdAt ?? fallbackTime,
      updatedAt: contact.updatedAt ?? contact.createdAt ?? fallbackTime
    }));

  return {
    authorities,
    contacts
  };
}

function createId(prefix: "auth" | "contact") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AuthoritiesProvider({ children }: { children: React.ReactNode }) {
  const [authorityData, setAuthorityData] = useState<AuthoritiesSnapshot>(() => {
    const fallback = createSeedAuthorities();
    const stored = loadPersistedValue<AuthoritiesSnapshot>(AUTHORITIES_STORAGE_KEY, fallback);
    return normalizeAuthorities(stored);
  });

  const { authorities, contacts } = authorityData;

  React.useEffect(() => {
    savePersistedValue(AUTHORITIES_STORAGE_KEY, authorityData);
  }, [authorityData]);

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

  const addAuthority = useCallback((input: { name: string; shortName?: string }) => {
    const timestamp = nowStamp();
    setAuthorityData((prev) => ({
      ...prev,
      authorities: [
        ...prev.authorities,
        {
          id: createId("auth"),
          name: input.name,
          shortName: input.shortName ?? "",
          isArchived: false,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      ]
    }));
  }, []);

  const updateAuthority = useCallback(
    (id: string, input: { name: string; shortName?: string }) => {
      const timestamp = nowStamp();
      setAuthorityData((prev) => ({
        ...prev,
        authorities: prev.authorities.map((authority) =>
          authority.id === id
            ? {
                ...authority,
                name: input.name,
                shortName: input.shortName ?? "",
                updatedAt: timestamp
              }
            : authority
        )
      }));
    },
    []
  );

  const archiveAuthority = useCallback((id: string) => {
    const timestamp = nowStamp();
    setAuthorityData((prev) => ({
      ...prev,
      authorities: prev.authorities.map((authority) =>
        authority.id === id ? { ...authority, isArchived: true, updatedAt: timestamp } : authority
      )
    }));
  }, []);

  const restoreAuthority = useCallback((id: string) => {
    const timestamp = nowStamp();
    setAuthorityData((prev) => ({
      ...prev,
      authorities: prev.authorities.map((authority) =>
        authority.id === id ? { ...authority, isArchived: false, updatedAt: timestamp } : authority
      )
    }));
  }, []);

  const addContact = useCallback(
    (input: {
      authorityId: string;
      name: string;
      email?: string;
      phone?: string;
      roleTitle?: string;
    }) => {
      const timestamp = nowStamp();
      setAuthorityData((prev) => ({
        ...prev,
        contacts: [
          ...prev.contacts,
          {
            id: createId("contact"),
            authorityId: input.authorityId,
            name: input.name,
            email: input.email ?? "",
            phone: input.phone ?? "",
            roleTitle: input.roleTitle ?? "",
            isArchived: false,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ]
      }));
    },
    []
  );

  const updateContact = useCallback(
    (
      id: string,
      input: {
        authorityId: string;
        name: string;
        email?: string;
        phone?: string;
        roleTitle?: string;
      }
    ) => {
      const timestamp = nowStamp();
      setAuthorityData((prev) => ({
        ...prev,
        contacts: prev.contacts.map((contact) =>
          contact.id === id
            ? {
                ...contact,
                authorityId: input.authorityId,
                name: input.name,
                email: input.email ?? "",
                phone: input.phone ?? "",
                roleTitle: input.roleTitle ?? "",
                updatedAt: timestamp
              }
            : contact
        )
      }));
    },
    []
  );

  const archiveContact = useCallback((id: string) => {
    const timestamp = nowStamp();
    setAuthorityData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) =>
        contact.id === id ? { ...contact, isArchived: true, updatedAt: timestamp } : contact
      )
    }));
  }, []);

  const restoreContact = useCallback((id: string) => {
    const timestamp = nowStamp();
    setAuthorityData((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) =>
        contact.id === id ? { ...contact, isArchived: false, updatedAt: timestamp } : contact
      )
    }));
  }, []);

  const replaceAuthorities = useCallback((value: AuthoritiesSnapshot) => {
    setAuthorityData(normalizeAuthorities(value));
  }, []);

  const resetAuthorities = useCallback(() => {
    setAuthorityData(createSeedAuthorities());
  }, []);

  const getAuthorityName = useCallback(
    (authorityId?: string) => {
      if (!authorityId) {
        return "";
      }
      return getAuthority(authorityId)?.name ?? "";
    },
    [getAuthority]
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

  const value = useMemo(
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
      getAuthorityName,
      getContactsForAuthority
    }),
    [
      addAuthority,
      addContact,
      archiveAuthority,
      archiveContact,
      authorities,
      contacts,
      getAuthority,
      getAuthorityName,
      getContacts,
      getContactsForAuthority,
      replaceAuthorities,
      resetAuthorities,
      restoreAuthority,
      restoreContact,
      updateAuthority,
      updateContact
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
