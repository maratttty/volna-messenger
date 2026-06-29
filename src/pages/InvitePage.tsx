import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { joinChatViaInvite, postSystemMessage } from '../lib/chats';
import { useChatStore } from '../store/chat-store';
import { Spinner } from '../components/ui/Spinner';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !session || !profile) return;
    let cancelled = false;

    joinChatViaInvite(token, session.user.id)
      .then(async ({ chatId, alreadyMember }) => {
        if (cancelled) return;
        if (!alreadyMember) {
          await postSystemMessage(chatId, session.user.id, `${profile.display_name} присоединился к группе`);
        }
        useChatStore.getState().setActiveChatId(chatId);
        navigate('/', { replace: true });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось присоединиться к группе');
      });

    return () => {
      cancelled = true;
    };
  }, [token, session, profile, navigate]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-text-muted">
        <p>{error}</p>
        <Link to="/" className="text-accent hover:underline">
          Вернуться в чаты
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-text-muted">
      <Spinner className="h-6 w-6" />
    </div>
  );
}
