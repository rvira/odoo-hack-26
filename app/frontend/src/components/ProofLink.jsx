import { useState } from 'react';
import { apiBlob } from '../api.js';
import { useToast } from './Toast.jsx';

/**
 * Clickable proof filename — fetches the proof-file endpoint as a blob with
 * the auth header and opens the object URL in a new tab. A missing proof
 * (404) or access error surfaces the server's `detail` as a toast.
 */
export default function ProofLink({ path, name }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    // Open the tab synchronously (user gesture) and navigate it after the
    // authenticated fetch resolves, so popup blockers stay quiet.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const blob = await apiBlob(path);
      const url = URL.createObjectURL(blob);
      if (win) win.location = url;
      else window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (win) win.close();
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="prooflink" disabled={busy}
      title="Open proof in a new tab" onClick={open}>
      📎 {name}
    </button>
  );
}
