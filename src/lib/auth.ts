import { supabase } from './supabase';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function createProfile(userId: string, username: string, displayName: string) {
  const { error } = await supabase.from('profiles').insert({
    id: userId,
    username: username.toLowerCase().trim(),
    display_name: displayName.trim(),
  });
  if (error) throw error;
}

export async function checkUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase().trim())
    .maybeSingle();
  return data === null || data.id === excludeUserId;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function updateProfile(
  userId: string,
  fields: { username?: string; displayName?: string; avatarUrl?: string; bio?: string },
): Promise<void> {
  const update: Record<string, string> = {};
  if (fields.username !== undefined) update.username = fields.username.toLowerCase().trim();
  if (fields.displayName !== undefined) update.display_name = fields.displayName.trim();
  if (fields.avatarUrl !== undefined) update.avatar_url = fields.avatarUrl;
  if (fields.bio !== undefined) update.bio = fields.bio.trim();

  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  if (error) throw error;
}
