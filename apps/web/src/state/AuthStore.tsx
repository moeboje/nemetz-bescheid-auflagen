import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "../data/users";
import { changePassword, forgotPassword, login, logout, me, resetPassword, verifyMfa } from "../api/auth";
import { ApiError } from "../api/client";

export type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ mfaRequired: true; mfaToken: string } | { mfaRequired: false; user: User }>;
  verifyMfa: (mfaToken: string, codeOrRecovery: string) => Promise<User>;
  logout: () => Promise<void>;
  loadMe: () => Promise<User | null>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<User>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
let loadMeInFlight: Promise<User | null> | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMe = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!loadMeInFlight) {
        loadMeInFlight = me().finally(() => {
          loadMeInFlight = null;
        });
      }
      const nextUser = await loadMeInFlight;
      setUser(nextUser);
      return nextUser;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMe().catch(() => {
      setUser(null);
    });
  }, [loadMe]);

  const loginUser = useCallback(async (email: string, password: string) => {
    const result = await login({ email, password });
    if (result.mfaRequired) {
      return result;
    }
    setUser(result.user);
    return result;
  }, []);

  const verifyMfaChallenge = useCallback(async (mfaToken: string, codeOrRecovery: string) => {
    const nextUser = await verifyMfa({ mfaToken, codeOrRecovery });
    setUser(nextUser);
    return nextUser;
  }, []);

  const logoutUser = useCallback(async () => {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }, []);

  const forgotUserPassword = useCallback(async (email: string) => {
    await forgotPassword({ email });
  }, []);

  const resetUserPassword = useCallback(async (token: string, newPassword: string) => {
    await resetPassword({ token, newPassword });
  }, []);

  const changeOwnPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const nextUser = await changePassword({ currentPassword, newPassword });
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: loginUser,
      verifyMfa: verifyMfaChallenge,
      logout: logoutUser,
      loadMe,
      forgotPassword: forgotUserPassword,
      resetPassword: resetUserPassword,
      changePassword: changeOwnPassword
    }),
    [changeOwnPassword, forgotUserPassword, isLoading, loadMe, loginUser, logoutUser, resetUserPassword, user, verifyMfaChallenge]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
