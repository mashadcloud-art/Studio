-- Allow staff to delete messages in their own thread or messages they sent
DROP POLICY IF EXISTS "staff_notes_delete" ON public.staff_notes;

CREATE POLICY "staff_notes_delete" ON public.staff_notes
  FOR DELETE USING (
    public.is_admin() 
    OR staff_id = auth.uid() 
    OR sender_id = auth.uid()
  );
