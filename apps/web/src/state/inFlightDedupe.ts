export function getOrCreateInFlight<K, V>(
  inFlight: Map<K, Promise<V>>,
  key: K,
  create: () => Promise<V>
) {
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  let request: Promise<V>;
  request = Promise.resolve()
    .then(create)
    .finally(() => {
      if (inFlight.get(key) === request) {
        inFlight.delete(key);
      }
    });
  inFlight.set(key, request);
  return request;
}
