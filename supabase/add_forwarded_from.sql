-- Adds support for forwarding messages. forwarded_from_name is a snapshot of
-- the original sender's display name taken at forward time (same convention
-- as attachment_meta.name for uploads) so the label still reads correctly
-- even if the profile is later renamed or deleted. forwarded_from_id is kept
-- alongside it as a real reference, for any future "open original sender's
-- profile" action. Forwarding a message that was itself already forwarded
-- chains back to this same original sender/name, never to the last forwarder.
alter table messages add column if not exists forwarded_from_id uuid references profiles(id) on delete set null;
alter table messages add column if not exists forwarded_from_name text;
