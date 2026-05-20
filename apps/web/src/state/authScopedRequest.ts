export type AuthScopedUser = {
  id?: string | null;
} | null | undefined;

export type AuthRequestScope = {
  generation: number;
  userId: string;
};

export type AuthScopeState = {
  generation: number;
  userId: string | null;
  hasSeenAuthenticatedUser: boolean;
};

export type AuthScopeSyncResult = {
  shouldClearStore: boolean;
  transition: "unchanged" | "initial-hydration" | "login-after-logout" | "logout" | "user-switch";
};

export function createAuthScopeState(): AuthScopeState {
  return {
    generation: 0,
    userId: null,
    hasSeenAuthenticatedUser: false
  };
}

export function getAuthUserId(user: AuthScopedUser) {
  return typeof user?.id === "string" && user.id.trim() ? user.id : null;
}

export function syncAuthScopeState(
  state: AuthScopeState,
  nextUser: AuthScopedUser
): AuthScopeSyncResult {
  const nextUserId = getAuthUserId(nextUser);
  const previousUserId = state.userId;

  if (previousUserId === nextUserId) {
    return { shouldClearStore: false, transition: "unchanged" };
  }

  if (!nextUserId) {
    state.userId = null;
    if (previousUserId) {
      state.generation += 1;
      return { shouldClearStore: true, transition: "logout" };
    }
    return { shouldClearStore: false, transition: "unchanged" };
  }

  if (!state.hasSeenAuthenticatedUser && !previousUserId) {
    state.userId = nextUserId;
    state.hasSeenAuthenticatedUser = true;
    return { shouldClearStore: false, transition: "initial-hydration" };
  }

  state.hasSeenAuthenticatedUser = true;
  state.userId = nextUserId;
  if (previousUserId && previousUserId !== nextUserId) {
    state.generation += 1;
    return { shouldClearStore: true, transition: "user-switch" };
  }

  return { shouldClearStore: false, transition: "login-after-logout" };
}

export function getCurrentAuthRequestScope(state: AuthScopeState): AuthRequestScope | null {
  if (!state.userId) {
    return null;
  }
  return {
    generation: state.generation,
    userId: state.userId
  };
}

export function getAuthScopedRequestKey(scope: AuthRequestScope, key: string) {
  return `${scope.generation}:${scope.userId}:${key}`;
}

export function isAuthRequestScopeCurrent(state: AuthScopeState, scope: AuthRequestScope) {
  return state.generation === scope.generation && state.userId === scope.userId;
}

export function canApplyAuthScopedResponse(
  state: AuthScopeState,
  scope: AuthRequestScope,
  latestSeq: number | undefined,
  requestSeq: number
) {
  return isAuthRequestScopeCurrent(state, scope) && (latestSeq === undefined || latestSeq === requestSeq);
}
