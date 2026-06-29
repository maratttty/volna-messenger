import type { ChatWithMeta } from '../../types/database';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';

interface ForwardModalProps {
  chats: ChatWithMeta[];
  onSelect: (chatId: string) => void;
  onClose: () => void;
}

function chatTitle(chat: ChatWithMeta): string {
  return chat.type === 'direct' ? chat.otherUser?.display_name ?? '…' : chat.title ?? 'Группа';
}

export function ForwardModal({ chats, onSelect, onClose }: ForwardModalProps) {
  return (
    <Modal title="Переслать сообщение" onClose={onClose}>
      <div className="-mx-5 -mb-5 max-h-80 overflow-y-auto">
        {chats.length === 0 && <p className="px-5 py-4 text-sm text-text-muted">Нет доступных чатов</p>}
        {chats.map((chat) => {
          const title = chatTitle(chat);
          const avatarSrc = chat.type === 'direct' ? chat.otherUser?.avatar_url : chat.avatar_url;
          return (
            <button
              key={chat.id}
              onClick={() => onSelect(chat.id)}
              className="flex w-full items-center gap-3 px-5 py-2 text-left transition hover:bg-surface-hover"
            >
              <Avatar name={title} src={avatarSrc} />
              <span className="truncate text-sm text-text">{title}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
