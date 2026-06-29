-- Adds voice messages and round video notes ("кружочки") to the message_type enum.
alter type message_type add value if not exists 'voice';
alter type message_type add value if not exists 'video_note';
