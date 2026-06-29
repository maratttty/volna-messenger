-- Run this once before re-running schema.sql, if a previous attempt left
-- partial tables/types behind. Safe only when the project has no real data yet.

drop table if exists story_views cascade;
drop table if exists stories cascade;
drop table if exists message_status cascade;
drop table if exists messages cascade;
drop table if exists invites cascade;
drop table if exists chat_members cascade;
drop table if exists chats cascade;
drop table if exists contacts cascade;
drop table if exists profiles cascade;

drop type if exists message_type;
drop type if exists member_role;
drop type if exists chat_type;
