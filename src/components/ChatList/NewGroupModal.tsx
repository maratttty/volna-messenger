import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import { searchUsers, createGroup } from '../../lib/chats';
import { MAX_GROUP_MEMBERS } from '../../config';
import type { Profile } from '../../types/database';

interface NewGroupModalProps {
  currentUserId: string;
  onCreated: (chatId: string) => void;
  onClose: () => void;
}

export function NewGroupModal({ currentUserId, onCreated, onClose }: NewGroupModalProps) {
  const [title, setTitle] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Map<string, Profile>>(new Map());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchUsers(query, currentUserId).then((users) => !cancelled && setResults(users));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, currentUserId]);

  const visibleResults = useMemo(() => results.filter((u) => !selected.has(u.id)), [results, selected]);

  function toggleSelect(user: Profile) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(user.id)) next.delete(user.id);
      else next.set(user.id, user);
      return next;
    });
  }

  async function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed || selected.size === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const chatId = await createGroup(currentUserId, trimmed, Array.from(selected.keys()));
      onCreated(chatId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать группу');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="Новая группа" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название группы"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selected.values()).map((u) => (
              <button
                key={u.id}
                onClick={() => toggleSelect(u)}
                className="flex items-center gap-1.5 rounded-full bg-surface-hover px-2 py-1 text-xs text-text"
              >
                {u.display_name} <span className="text-text-muted">✕</span>
              </button>
            ))}
          </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Добавить участников по @username"
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <div className="max-h-48 overflow-y-auto">
          {visibleResults.map((user) => (
            <button
              key={user.id}
              onClick={() => {
                toggleSelect(user);
                setQuery('');
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-hover"
            >
              <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{user.display_name}</p>
                <p className="truncate text-xs text-text-muted">@{user.username}</p>
              </div>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {selected.size >= MAX_GROUP_MEMBERS && (
          <p className="text-xs text-red-400">Максимум {MAX_GROUP_MEMBERS} участников</p>
        )}

        <button
          onClick={() => void handleCreate()}
          disabled={!title.trim() || selected.size === 0 || creating}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
        >
          {creating ? 'Создаём…' : 'Создать группу'}
        </button>
      </div>
    </Modal>
  );
}
