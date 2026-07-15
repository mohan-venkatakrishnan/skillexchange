import { useState, useEffect, useCallback, useRef } from 'react';

// Every fetch ships three states: loading, error (+Retry), data.
// Version-guarded: a stale response never overwrites a newer request's state.
export default function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const version = useRef(0);

  const run = useCallback(() => {
    const v = ++version.current;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(
      data => { if (version.current === v) setState({ data, loading: false, error: null }); },
      err => { if (version.current === v) setState({ data: null, loading: false, error: err.message || 'Something went wrong.' }); },
    );
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(); }, [run]);
  return { ...state, retry: run };
}
