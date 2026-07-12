import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/** GET `path` and expose {data, error, loading, reload}. Refetches when path
 *  changes. Pass a falsy path to skip fetching (data stays null). */
export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mySeq = ++seq.current;
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api(path);
      if (seq.current === mySeq) { setData(result); setLoading(false); }
    } catch (err) {
      if (seq.current === mySeq) { setError(err.message); setLoading(false); }
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  return { data, error, loading, reload: load };
}
