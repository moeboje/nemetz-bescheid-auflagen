import React, { createContext, useContext, useMemo } from "react";
import type { ProjectActor } from "../policies/ProjectPolicy";

export type AuthorizationContextValue = {
  actor: ProjectActor;
};

const AuthorizationContext = createContext<AuthorizationContextValue | undefined>(undefined);

type AuthorizationProviderProps = {
  children: React.ReactNode;
  actor: ProjectActor;
};

export function AuthorizationProvider({ children, actor }: AuthorizationProviderProps) {
  const value = useMemo(() => ({ actor }), [actor]);
  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization() {
  const context = useContext(AuthorizationContext);
  if (!context) {
    throw new Error("useAuthorization must be used within AuthorizationProvider");
  }
  return context;
}

