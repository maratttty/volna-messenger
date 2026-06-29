-- Bootstrap problem (same shape as the chats/chat_members ones already
-- fixed): joining via an invite link requires reading the invites row
-- BEFORE you're a chat member, but the only existing policy
-- ("members can view invites for their chats") requires membership first.
--
-- The naive fix — "let any authenticated user select from invites" — would
-- leak chat_id for every group that ever had a link, to every logged-in
-- user, which combined with the chat_members self-insert bootstrap clause
-- would let anyone join any group that ever had an invite link generated,
-- valid or revoked. RLS policies can't restrict "only when filtered by the
-- exact token you already hold" — they evaluate per row, not per query.
--
-- So this resolves one token via a SECURITY DEFINER function instead of a
-- direct table grant: callers who already possess the (unguessable) token
-- can resolve it to a chat_id, but can never enumerate the table.
create or replace function get_invite_by_token(p_token text)
returns table (
  id uuid,
  chat_id uuid,
  created_by uuid,
  expires_at timestamptz,
  revoked boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select id, chat_id, created_by, expires_at, revoked, created_at
  from invites
  where token = p_token;
$$;

grant execute on function get_invite_by_token(text) to authenticated;
