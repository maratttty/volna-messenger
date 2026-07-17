-- Web Push subscriptions — stage 1 of push notifications (subscribe/store
-- only; actual sending happens in a later Edge Function stage).
--
-- One row per user (primary key = user_id, upserted on conflict) — logging
-- in from a second device replaces the subscription rather than adding a
-- second one. True multi-device fan-out would need endpoint-based
-- uniqueness instead of user_id-based; out of scope for this stage.
create table push_subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Client-side access is limited to the user's own row. The future sending
-- Edge Function will use the service-role key, which bypasses RLS entirely.
create policy "users manage their own push subscription"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
