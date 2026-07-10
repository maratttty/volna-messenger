import { useRef, useState } from 'react';
import { Crown, Shield, X, LogOut, Link as LinkIcon, Check, Camera } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import type { MemberWithProfile, MemberRole, Profile } from '../../types/database';
import { updateMemberRole, removeMember, getOrCreateInvite, postSystemMessage, updateChatInfo } from '../../lib/chats';
import { uploadAttachment } from '../../lib/storage';
import { useChatStore } from '../../store/chat-store';

interface GroupMembersPanelProps {
  chatId: string;
  chatTitle: string;
  chatAvatarUrl: string | null;
  members: MemberWithProfile[];
  currentUserId: string;
  myRole: MemberRole;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
  onOpenProfile: (profile: Profile) => void;
}

function roleLabel(role: MemberRole): string {
  if (role === 'owner') return 'Владелец';
  if (role === 'admin') return 'Админ';
  return 'Участник';
}

export function GroupMembersPanel({
  chatId,
  chatTitle,
  chatAvatarUrl,
  members,
  currentUserId,
  myRole,
  onClose,
  onChanged,
  onLeft,
  onOpenProfile,
}: GroupMembersPanelProps) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(chatTitle);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(chatAvatarUrl);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const canManage = myRole === 'owner' || myRole === 'admin';
  const titleDirty = title.trim() !== chatTitle || pendingAvatarFile !== null;

  function handleAvatarPick(file: File | undefined) {
    if (!file) return;
    setPendingAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSaveGroupInfo() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSavingInfo(true);
    setError(null);
    try {
      let avatarUrl = chatAvatarUrl ?? undefined;
      if (pendingAvatarFile) {
        const uploaded = await uploadAttachment('avatars', currentUserId, pendingAvatarFile);
        avatarUrl = uploaded.url;
      }
      await updateChatInfo(chatId, { title: trimmed, avatarUrl });
      useChatStore.getState().patchChat(chatId, { title: trimmed, avatar_url: avatarUrl ?? null });
      if (trimmed !== chatTitle) {
        await postSystemMessage(chatId, currentUserId, `Название группы изменено на «${trimmed}»`);
      }
      setPendingAvatarFile(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleGetInviteLink() {
    setError(null);
    try {
      const token = await getOrCreateInvite(chatId, currentUserId);
      setInviteLink(`${window.location.origin}/invite/${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать ссылку');
    }
  }

  async function handleCopy() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleToggleAdmin(member: MemberWithProfile) {
    setBusyUserId(member.user_id);
    setError(null);
    try {
      const nextRole: MemberRole = member.role === 'admin' ? 'member' : 'admin';
      await updateMemberRole(chatId, member.user_id, nextRole);
      await postSystemMessage(
        chatId,
        currentUserId,
        nextRole === 'admin'
          ? `${member.profile.display_name} теперь админ`
          : `${member.profile.display_name} больше не админ`,
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить роль');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(member: MemberWithProfile) {
    setBusyUserId(member.user_id);
    setError(null);
    try {
      await removeMember(chatId, member.user_id);
      await postSystemMessage(chatId, currentUserId, `${member.profile.display_name} удалён из группы`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить участника');
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleLeave() {
    const me = members.find((m) => m.user_id === currentUserId);
    setBusyUserId(currentUserId);
    setError(null);
    try {
      await removeMember(chatId, currentUserId);
      if (me) await postSystemMessage(chatId, currentUserId, `${me.profile.display_name} покинул группу`);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось покинуть группу');
      setBusyUserId(null);
    }
  }

  return (
    <Modal title={`Участники (${members.length})`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {canManage && (
          <div className="flex items-center gap-3">
            <button onClick={() => avatarInputRef.current?.click()} className="group relative shrink-0">
              <Avatar name={title || 'Группа'} src={avatarPreview} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
                <Camera size={14} className="text-white" />
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleAvatarPick(e.target.files?.[0])}
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={64}
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {titleDirty && (
              <button
                onClick={() => void handleSaveGroupInfo()}
                disabled={savingInfo || !title.trim()}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-bg transition hover:bg-accent-hover disabled:opacity-50"
              >
                {savingInfo ? 'Сохраняем…' : 'Сохранить'}
              </button>
            )}
          </div>
        )}

        {canManage && (
          <div className="rounded-lg bg-bg px-3 py-2">
            {inviteLink ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate text-xs text-text-muted">{inviteLink}</p>
                <button
                  onClick={() => void handleCopy()}
                  className="shrink-0 text-xs font-medium text-accent"
                >
                  {copied ? <Check size={14} /> : 'Скопировать'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => void handleGetInviteLink()}
                className="flex items-center gap-2 text-sm text-accent"
              >
                <LinkIcon size={16} /> Пригласить по ссылке
              </button>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="-mx-5 max-h-72 overflow-y-auto">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const canModerate = canManage && !isSelf && member.role !== 'owner';
            return (
              <div key={member.user_id} className="flex items-center gap-3 px-5 py-2">
                <button
                  onClick={() => onOpenProfile(member.profile)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 text-left transition hover:bg-surface-hover"
                >
                  <Avatar name={member.profile.display_name} src={member.profile.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text">
                      {member.profile.display_name}
                      {isSelf && ' (вы)'}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-text-muted">
                      {member.role === 'owner' && <Crown size={12} />}
                      {member.role === 'admin' && <Shield size={12} />}
                      {roleLabel(member.role)}
                    </p>
                  </div>
                </button>
                {canModerate && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void handleToggleAdmin(member)}
                      disabled={busyUserId === member.user_id}
                      title={member.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                      className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-text disabled:opacity-50"
                    >
                      <Shield size={15} />
                    </button>
                    <button
                      onClick={() => void handleRemove(member)}
                      disabled={busyUserId === member.user_id}
                      title="Удалить из группы"
                      className="rounded-md p-1.5 text-text-muted transition hover:bg-surface-hover hover:text-red-400 disabled:opacity-50"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => void handleLeave()}
          disabled={busyUserId === currentUserId}
          className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          <LogOut size={16} /> Покинуть группу
        </button>
      </div>
    </Modal>
  );
}
