import { Modal } from '../ui/Modal';

interface ConfirmDeleteModalProps {
  isOwn: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({ isOwn, onDeleteForMe, onDeleteForEveryone, onClose }: ConfirmDeleteModalProps) {
  return (
    <Modal title="Удалить сообщение?" onClose={onClose}>
      <p className="mb-4 text-sm text-text-muted">
        {isOwn
          ? 'Сообщение можно удалить только у себя или для всех участников чата.'
          : 'Сообщение будет скрыто только в вашей переписке — у остальных участников оно останется.'}
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={onDeleteForMe}
          className="rounded-lg px-4 py-2 text-left text-sm font-medium text-text transition hover:bg-surface-hover"
        >
          Удалить у себя
        </button>
        {isOwn && (
          <button
            onClick={onDeleteForEveryone}
            className="rounded-lg bg-red-500 px-4 py-2 text-left text-sm font-medium text-white transition hover:bg-red-600"
          >
            Удалить у всех
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-left text-sm text-text-muted transition hover:bg-surface-hover hover:text-text"
        >
          Отмена
        </button>
      </div>
    </Modal>
  );
}
