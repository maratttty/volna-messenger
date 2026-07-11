import { useState, useEffect, useCallback } from 'react';
import { fetchBlockStatus } from '../lib/chats';

// Actual enforcement lives server-side (messages insert RLS policy) — this
// hook is purely so the UI can proactively hide/disable composing instead of
// letting the user hit a failed send.
export function useBlockStatus(currentUserId: string, otherUserId: string | undefined) {
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!otherUserId) {
      setBlockedByMe(false);
      setBlockedMe(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const status = await fetchBlockStatus(currentUserId, otherUserId);
      setBlockedByMe(status.blockedByMe);
      setBlockedMe(status.blockedMe);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, otherUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { blockedByMe, blockedMe, loading, refresh };
}
