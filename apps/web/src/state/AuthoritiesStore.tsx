import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  authorities as initialAuthorities,
  contacts as initialContacts,
  Authority,
  AuthorityContact
} from "../data/authorities";

export type AuthoritiesContextValue = {
  authorities: Authority[];
  contacts: AuthorityContact[];
  addAuthority: (input: { name: string; shortName?: string }) => void;
  updateAuthority: (id: string, input: { name: string; shortName?: string }) => void;
  archiveAuthority: (id: string) => void;
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
  getAuthorityName: (authorityId?: string) => string;
  getContactsForAuthority: (authorityId?: string) => AuthorityContact[];
};

const AuthoritiesContext = createContext<AuthoritiesContextValue | undefined>(undefined);

function createId(prefix: "auth" | "contact") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AuthoritiesProvider({ children }: { children: React.ReactNode }) {
  const [authorities, setAuthorities] = useState<Authority[]>(initialAuthorities);
  const [contacts, setContacts] = useState<AuthorityContact[]>(initialContacts);

  const addAuthority = useCallback((input: { name: string; shortName?: string }) => {
    setAuthorities((prev) => [
      ...prev,
      {
        id: createId("auth"),
        name: input.name,
        shortName: input.shortName ?? "",
        isArchived: false
      }
    ]);
  }, []);

  const updateAuthority = useCallback(
    (id: string, input: { name: string; shortName?: string }) => {
      setAuthorities((prev) =>
        prev.map((authority) =>
          authority.id === id
            ? { ...authority, name: input.name, shortName: input.shortName ?? "" }
            : authority
        )
      );
    },
    []
  );

  const archiveAuthority = useCallback((id: string) => {
    setAuthorities((prev) =>
      prev.map((authority) =>
        authority.id === id ? { ...authority, isArchived: true } : authority
      )
    );
  }, []);

  const addContact = useCallback(
    (input: {
      authorityId: string;
      name: string;
      email?: string;
      phone?: string;
      roleTitle?: string;
    }) => {
      setContacts((prev) => [
        ...prev,
        {
          id: createId("contact"),
          authorityId: input.authorityId,
          name: input.name,
          email: input.email ?? "",
          phone: input.phone ?? "",
          roleTitle: input.roleTitle ?? "",
          isArchived: false
        }
      ]);
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
      setContacts((prev) =>
        prev.map((contact) =>
          contact.id === id
            ? {
                ...contact,
                authorityId: input.authorityId,
                name: input.name,
                email: input.email ?? "",
                phone: input.phone ?? "",
                roleTitle: input.roleTitle ?? ""
              }
            : contact
        )
      );
    },
    []
  );

  const archiveContact = useCallback((id: string) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === id ? { ...contact, isArchived: true } : contact
      )
    );
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
      return contacts.filter(
        (contact) => contact.authorityId === authorityId && !contact.isArchived
      );
    },
    [contacts]
  );

  const value = useMemo(
    () => ({
      authorities,
      contacts,
      addAuthority,
      updateAuthority,
      archiveAuthority,
      addContact,
      updateContact,
      archiveContact,
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
      getAuthorityName,
      getContactsForAuthority,
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
