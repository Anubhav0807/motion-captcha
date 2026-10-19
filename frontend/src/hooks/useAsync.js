import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader and tracks { data, loading, error }.
 * Re-runs when `deps` change; ignores stale responses.
 */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const callId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const id = ++callId.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await run();
      if (id === callId.current) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (id === callId.current) setState((s) => ({ ...s, loading: false, error }));
      return undefined;
    }
  }, [run]);

  useEffect(() => { reload(); }, [reload]);

  const setData = useCallback((updater) =>
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);

  return { ...state, reload, setData };
}
