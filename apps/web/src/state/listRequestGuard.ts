export type ListRequestOptions = {
  force?: boolean;
  reason?: string;
};

export type ListRequestEntry<T> = {
  queryKey: string;
  requestSeq: number;
  mutationEpochAtStart: number;
  promise: Promise<T>;
};

export type ListRequestState<T> = {
  inFlight: Map<string, ListRequestEntry<T>>;
  latestRequestSeqByQueryKey: Map<string, number>;
  mutationEpoch: number;
  nextRequestSeq: number;
};

export function createListRequestState<T>(): ListRequestState<T> {
  return {
    inFlight: new Map<string, ListRequestEntry<T>>(),
    latestRequestSeqByQueryKey: new Map<string, number>(),
    mutationEpoch: 0,
    nextRequestSeq: 0
  };
}

export function invalidateListRequests<T>(state: ListRequestState<T>) {
  state.mutationEpoch += 1;
  state.inFlight.clear();
  state.latestRequestSeqByQueryKey.clear();
}

export function resetListRequestState<T>(state: ListRequestState<T>) {
  invalidateListRequests(state);
  state.nextRequestSeq = 0;
}

export function getOrStartListRequest<T>(
  state: ListRequestState<T>,
  queryKey: string,
  create: () => Promise<T>,
  options: ListRequestOptions = {}
) {
  const existing = state.inFlight.get(queryKey);
  if (existing && !options.force && existing.mutationEpochAtStart === state.mutationEpoch) {
    return existing;
  }

  if (existing) {
    state.inFlight.delete(queryKey);
  }

  const requestSeq = state.nextRequestSeq + 1;
  state.nextRequestSeq = requestSeq;
  const mutationEpochAtStart = state.mutationEpoch;
  let entry: ListRequestEntry<T>;
  const promise = Promise.resolve()
    .then(create)
    .finally(() => {
      if (state.inFlight.get(queryKey) === entry) {
        state.inFlight.delete(queryKey);
      }
    });

  entry = {
    queryKey,
    requestSeq,
    mutationEpochAtStart,
    promise
  };
  state.latestRequestSeqByQueryKey.set(queryKey, requestSeq);
  state.inFlight.set(queryKey, entry);
  return entry;
}

export function canApplyListRequest<T>(state: ListRequestState<T>, entry: ListRequestEntry<T>) {
  return (
    entry.mutationEpochAtStart === state.mutationEpoch &&
    state.latestRequestSeqByQueryKey.get(entry.queryKey) === entry.requestSeq
  );
}
