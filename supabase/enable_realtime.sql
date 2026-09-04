-- Run this in your Supabase SQL Editor to enable Realtime notifications for the chat!

-- Enable realtime for the staff_notes table
alter publication supabase_realtime add table public.staff_notes;
