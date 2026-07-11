// Hand-written types mirroring supabase/schema.sql. If the schema evolves,
// regenerate with `supabase gen types typescript` and replace this file.

export type ChatType = 'direct' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';
export type MessageType = 'text' | 'image' | 'file' | 'voice' | 'video_note' | 'system';
export type MessageStatusValue = 'delivered' | 'read';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  last_seen_at: string;
  show_last_seen: boolean;
  privacy: { online: 'everyone' | 'contacts' | 'nobody'; avatar: 'everyone' | 'contacts' | 'nobody' };
  created_at: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  title: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  pinned_message_id: string | null;
}

export interface ChatMember {
  chat_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  muted: boolean;
  last_read_message_id: string | null;
  pinned_at: string | null;
  hidden_at: string | null;
  hidden_before_at: string | null;
}

export interface Message {
  id: string;
  client_id: string | null;
  chat_id: string;
  sender_id: string | null;
  type: MessageType;
  content: string | null;
  attachment_url: string | null;
  attachment_meta: {
    name?: string;
    size?: number;
    mime?: string;
    duration?: number; // seconds, for voice/video_note
    width?: number;
    height?: number;
    posterUrl?: string; // video_note first-frame thumbnail, captured client-side at record time
  } | null;
  reply_to_id: string | null;
  forwarded_from_id: string | null;
  forwarded_from_name: string | null;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
}

export interface PinEntry {
  messageId: string;
  message: Message;
  isPersonal: boolean;
  pinnedBy: string;
  pinnedAt: string;
}

export interface Invite {
  id: string;
  chat_id: string;
  token: string;
  created_by: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

export interface MemberWithProfile extends ChatMember {
  profile: Profile;
}

export interface MessageStatus {
  message_id: string;
  user_id: string;
  status: MessageStatusValue;
  updated_at: string;
}

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// Aggregated for display: one entry per distinct emoji present on a message.
export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface Story {
  id: string;
  author_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  expires_at: string;
}

export interface StoryView {
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}

// Enriched chat row used in the UI (last message preview + unread count)
export interface ChatWithMeta extends Chat {
  otherUser?: Profile;       // set for direct chats
  lastMessage?: Message;
  unreadCount: number;
  myRole: MemberRole;
  muted: boolean;
  pinned_at: string | null;           // from chat_members; null = not pinned
  last_read_message_id: string | null; // read cursor for this user
  lastMessageReadByOther?: boolean;    // true when the other participant has read my last message
  hidden_before_at?: string | null;   // messages older than this are hidden (soft-delete for me)
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; username: string; display_name: string }; Update: Partial<Profile> };
      contacts: { Row: { user_id: string; contact_id: string; created_at: string }; Insert: { user_id: string; contact_id: string }; Update: never };
      blocked_users: { Row: { blocker_id: string; blocked_id: string; created_at: string }; Insert: { blocker_id: string; blocked_id: string }; Update: never };
      chats: { Row: Chat; Insert: Partial<Chat> & { type: ChatType }; Update: Partial<Chat> };
      chat_members: { Row: ChatMember; Insert: Partial<ChatMember> & { chat_id: string; user_id: string }; Update: Partial<ChatMember> };
      invites: { Row: { id: string; chat_id: string; token: string; created_by: string | null; expires_at: string | null; revoked: boolean; created_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      messages: { Row: Message; Insert: Partial<Message> & { chat_id: string; sender_id: string }; Update: Partial<Message> };
      message_status: { Row: MessageStatus; Insert: MessageStatus; Update: Partial<MessageStatus> };
      message_reactions: { Row: MessageReaction; Insert: MessageReaction; Update: Partial<MessageReaction> };
      stories: { Row: Story; Insert: Partial<Story> & { author_id: string; media_url: string; media_type: 'image' | 'video' }; Update: Partial<Story> };
      story_views: { Row: StoryView; Insert: StoryView; Update: never };
    };
  };
}
