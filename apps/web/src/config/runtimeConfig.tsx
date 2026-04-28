import React from "react";

export type RuntimeFeatures = {
  enableReports: boolean;
  enableDiagnostics: boolean;
  enableNotifications: boolean;
  enableEvidence: boolean;
  enableRbacDemo: boolean;
  enableCalendarExport: boolean;
  enableAiAnalysis: boolean;
  enableHelpHints: boolean;
  enableProjectChecklists: boolean;
};

export type RuntimeAiConfig = {
  provider: "azure" | "mock" | "disabled";
  proxyBaseUrl?: string;
};

export type RuntimeConfig = {
  appName: string;
  buildLabel?: string;
  features: RuntimeFeatures;
  ai?: RuntimeAiConfig;
};

const DEFAULT_FEATURES: RuntimeFeatures = {
  enableReports: true,
  enableDiagnostics: true,
  enableNotifications: true,
  enableEvidence: true,
  enableRbacDemo: true,
  enableCalendarExport: true,
  enableAiAnalysis: false,
  enableHelpHints: true,
  enableProjectChecklists: true
};

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  appName: "Nemetz Bescheid-Auflagen Prototype",
  buildLabel: "local",
  features: DEFAULT_FEATURES,
  ai: {
    provider: "disabled",
    proxyBaseUrl: ""
  }
};

type RuntimeConfigState = {
  config: RuntimeConfig;
  loaded: boolean;
};

const RuntimeConfigContext = React.createContext<RuntimeConfigState>({
  config: DEFAULT_RUNTIME_CONFIG,
  loaded: false
});

let runtimeConfigSnapshot: RuntimeConfig = DEFAULT_RUNTIME_CONFIG;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function normalizeFeatures(value: unknown): RuntimeFeatures {
  if (!isRecord(value)) {
    return DEFAULT_FEATURES;
  }

  return {
    enableReports: toBoolean(value.enableReports, DEFAULT_FEATURES.enableReports),
    enableDiagnostics: toBoolean(value.enableDiagnostics, DEFAULT_FEATURES.enableDiagnostics),
    enableNotifications: toBoolean(value.enableNotifications, DEFAULT_FEATURES.enableNotifications),
    enableEvidence: toBoolean(value.enableEvidence, DEFAULT_FEATURES.enableEvidence),
    enableRbacDemo: toBoolean(value.enableRbacDemo, DEFAULT_FEATURES.enableRbacDemo),
    enableCalendarExport: toBoolean(value.enableCalendarExport, DEFAULT_FEATURES.enableCalendarExport),
    enableAiAnalysis: toBoolean(value.enableAiAnalysis, DEFAULT_FEATURES.enableAiAnalysis),
    enableHelpHints: toBoolean(value.enableHelpHints, DEFAULT_FEATURES.enableHelpHints),
    enableProjectChecklists: toBoolean(
      value.enableProjectChecklists,
      DEFAULT_FEATURES.enableProjectChecklists
    )
  };
}

function normalizeAi(value: unknown): RuntimeAiConfig | undefined {
  if (!isRecord(value)) {
    return DEFAULT_RUNTIME_CONFIG.ai;
  }

  const provider =
    value.provider === "azure" || value.provider === "mock" || value.provider === "disabled"
      ? value.provider
      : DEFAULT_RUNTIME_CONFIG.ai?.provider ?? "disabled";

  return {
    provider,
    proxyBaseUrl: typeof value.proxyBaseUrl === "string" ? value.proxyBaseUrl : ""
  };
}

export function normalizeRuntimeConfig(value: unknown): RuntimeConfig {
  if (!isRecord(value)) {
    return DEFAULT_RUNTIME_CONFIG;
  }

  return {
    appName:
      typeof value.appName === "string" && value.appName.trim()
        ? value.appName
        : DEFAULT_RUNTIME_CONFIG.appName,
    buildLabel:
      typeof value.buildLabel === "string" && value.buildLabel.trim()
        ? value.buildLabel
        : DEFAULT_RUNTIME_CONFIG.buildLabel,
    features: normalizeFeatures(value.features),
    ai: normalizeAi(value.ai)
  };
}

export async function loadRuntimeConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_RUNTIME_CONFIG;
  }

  try {
    const response = await fetch("/config.json", { cache: "no-store" });
    if (!response.ok) {
      return DEFAULT_RUNTIME_CONFIG;
    }
    const parsed = (await response.json()) as unknown;
    return normalizeRuntimeConfig(parsed);
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
}

export function getRuntimeConfigSnapshot() {
  return runtimeConfigSnapshot;
}

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<RuntimeConfigState>({
    config: DEFAULT_RUNTIME_CONFIG,
    loaded: false
  });

  React.useEffect(() => {
    let active = true;
    loadRuntimeConfig().then((config) => {
      if (!active) {
        return;
      }
      runtimeConfigSnapshot = config;
      setState({ config, loaded: true });
    });

    return () => {
      active = false;
    };
  }, []);

  return <RuntimeConfigContext.Provider value={state}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig() {
  return React.useContext(RuntimeConfigContext).config;
}

export function useRuntimeConfigLoaded() {
  return React.useContext(RuntimeConfigContext).loaded;
}
