import { useEffect, useMemo, useRef, useState } from "react";
import { loadServerState, saveServerState } from "../api/state";
import { useScopes } from "../state/ScopesStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useProjects } from "../state/ProjectsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useTaskState } from "../state/TaskStateStore";

const SAVE_DEBOUNCE_MS = 1500;
const LOAD_RETRY_MS = 5000;

function normalizeScopes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      companies: [],
      sites: [],
      facilities: []
    };
  }

  const data = value as {
    companies?: unknown;
    sites?: unknown;
    facilities?: unknown;
  };

  return {
    companies: Array.isArray(data.companies) ? data.companies : [],
    sites: Array.isArray(data.sites) ? data.sites : [],
    facilities: Array.isArray(data.facilities) ? data.facilities : []
  };
}

function normalizeAuthorities(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      authorities: [],
      contacts: []
    };
  }

  const data = value as {
    authorities?: unknown;
    contacts?: unknown;
  };

  return {
    authorities: Array.isArray(data.authorities) ? data.authorities : [],
    contacts: Array.isArray(data.contacts) ? data.contacts : []
  };
}

function normalizeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizeObject<T extends Record<string, unknown>>(value: unknown): T {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as T)
    : ({} as T);
}

export function ServerStateSync() {
  const {
    companies,
    sites,
    facilities,
    replaceScopes
  } = useScopes();

  const {
    authorities,
    contacts,
    replaceAuthorities
  } = useAuthorities();

  const { projects, replaceProjects } = useProjects();
  const { legalDocs, replaceLegalDocs } = useLegalDocs();
  const { obligations, replaceObligations } = useObligations();
  const { deadlines, replaceDeadlines } = useDeadlines();
  const { taskState, replaceTaskState } = useTaskState();

  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const snapshot = useMemo(
    () => ({
      scopes: {
        companies,
        sites,
        facilities
      },
      authorities: {
        authorities,
        contacts
      },
      projects,
      legalDocs,
      obligations,
      deadlines,
      taskState
    }),
    [
      companies,
      sites,
      facilities,
      authorities,
      contacts,
      projects,
      legalDocs,
      obligations,
      deadlines,
      taskState
    ]
  );

  useEffect(() => {
    let cancelled = false;
    let retryHandle: number | null = null;

    const tryHydrate = async () => {
      try {
        const result = await loadServerState();

        if (cancelled) return;

        const data = result?.data ?? null;

        replaceScopes(normalizeScopes(data?.scopes));
        replaceAuthorities(normalizeAuthorities(data?.authorities));
        replaceProjects(normalizeArray(data?.projects));
        replaceLegalDocs(normalizeArray(data?.legalDocs));
        replaceObligations(normalizeArray(data?.obligations));
        replaceDeadlines(normalizeArray(data?.deadlines));
        replaceTaskState(normalizeObject(data?.taskState));

        hydratedRef.current = true;
        setHydrated(true);

        if (retryHandle) {
          window.clearInterval(retryHandle);
          retryHandle = null;
        }
      } catch (error: any) {
        if (error?.status !== 401) {
          console.error("Failed to load server state", error);
        }
      }
    };

    void tryHydrate();

    retryHandle = window.setInterval(() => {
      if (!hydratedRef.current) {
        void tryHydrate();
      }
    }, LOAD_RETRY_MS);

    return () => {
      cancelled = true;
      if (retryHandle) {
        window.clearInterval(retryHandle);
      }
    };
  }, [
    replaceScopes,
    replaceAuthorities,
    replaceProjects,
    replaceLegalDocs,
    replaceObligations,
    replaceDeadlines,
    replaceTaskState
  ]);

  useEffect(() => {
    if (!hydrated) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveServerState(snapshot).catch((error: any) => {
        if (error?.status !== 401) {
          console.error("Failed to save server state", error);
        }
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [snapshot, hydrated]);

  return null;
}
