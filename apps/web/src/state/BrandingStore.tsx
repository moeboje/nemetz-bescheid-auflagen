import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getBrandingConfig, type BrandingConfig } from "../api/branding";
import { useAuth } from "./AuthStore";

const emptyBranding: BrandingConfig = {
  hasLogo: false,
  hasIcon: false
};

export type BrandingContextValue = {
  branding: BrandingConfig;
  isLoading: boolean;
  reloadBranding: () => Promise<BrandingConfig>;
  setBranding: (branding: BrandingConfig) => void;
};

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [branding, setBrandingState] = useState<BrandingConfig>(emptyBranding);
  const [isLoading, setIsLoading] = useState(false);

  const setBranding = useCallback((nextBranding: BrandingConfig) => {
    setBrandingState(nextBranding);
  }, []);

  const reloadBranding = useCallback(async () => {
    if (!user) {
      setBrandingState(emptyBranding);
      return emptyBranding;
    }

    setIsLoading(true);
    try {
      const nextBranding = await getBrandingConfig();
      setBrandingState(nextBranding);
      return nextBranding;
    } catch {
      return emptyBranding;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setBrandingState(emptyBranding);
      return;
    }

    void reloadBranding();
  }, [reloadBranding, user]);

  const value = useMemo<BrandingContextValue>(
    () => ({
      branding,
      isLoading,
      reloadBranding,
      setBranding
    }),
    [branding, isLoading, reloadBranding, setBranding]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within BrandingProvider");
  }
  return context;
}
