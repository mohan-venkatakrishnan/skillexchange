import { useState, useEffect, useCallback, useRef } from 'react';

/* Module-level cache, keyed by the caller. Navigating back to a page you've
   already loaded should NOT throw the full-page Loader up again — that flash
   on every navigation is what made the app feel like it was constantly
   re-loading. Cached data renders instantly and is revalidated in the
   background; the Loader is only for a genuinely cold view. */
const cache = new Map();

export function invalidate(key) {
  if (key) cache.delete(key); else cache.clear();
}

export default function useFetch(fn, deps = [], { key, ttl = 60_000 } = {}) {
  const cached = key ? cache.get(key) : undefined;
  const fresh = cached && Date.now() - cached.at < ttl;

  const [state, setState] = useState(() => ({
    data: cached?.data ?? null,
    loading: !cached,          // never show the Loader when we already have data
    error: null,
  }));
  const version = useRef(0);

  const run = useCallback((background = false) => {
    const v = ++version.current;
    setState(s => ({ ...s, loading: background ? false : !s.data, error: null }));
    fn().then(
      data => {
        if (version.current !== v) return; // a newer request won; discard this
        if (key) cache.set(key, { data, at: Date.now() });
        setState({ data, loading: false, error: null });
      },
      err => {
        if (version.current !== v) return;
        // A background refresh that fails must not blank out good data.
        setState(s => (background && s.data
          ? s
          : { data: null, loading: false, error: err.message || 'Something went wrong.' }));
      },
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fresh) return;        // cached and recent — nothing to do
    run(!!cached);            // have stale data? refresh quietly behind it
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, retry: () => run(false) };
}
