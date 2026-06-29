import { Modal } from '../ui/Modal';

interface ConfirmDeleteModalProps {
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({ onConfirm, onClose }: ConfirmDeleteModalProps) {
  return (
    <Modal title="Удалить сообщение?" onClose={onClose}>
      <p className="mb-4 text-sm text-text-muted">Сообщение будет удалено для всех участников чата.</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-text-muted transition hover:bg-surface-hover hover:text-text"
        >
          Отмена
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
        >
          Удалить
        </button>
      </div>
    </Modal>
  );
}
