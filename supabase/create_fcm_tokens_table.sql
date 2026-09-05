-- Create table to store Firebase Cloud Messaging (FCM) tokens for each staff / device
CREATE TABLE IF NOT EXISTS public.staff_fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  device_info TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT staff_fcm_tokens_staff_id_key UNIQUE (staff_id)
);

ALTER TABLE public.staff_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Allow staff to manage their own tokens and admin to read all
CREATE POLICY "staff_fcm_tokens_manage_own" ON public.staff_fcm_tokens
  FOR ALL USING (auth.uid() = staff_id OR public.is_admin())
  WITH CHECK (auth.uid() = staff_id OR public.is_admin());

-- Allow anyone authenticated to insert/upsert their token
GRANT ALL ON public.staff_fcm_tokens TO authenticated;
