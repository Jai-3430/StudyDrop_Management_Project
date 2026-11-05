-- StudyDrop Phase 5: allow owners to permanently delete documents from Recycle Bin.
-- Run once in Supabase SQL Editor after supabase-phase5-sharing.sql.
grant delete on public.documents to authenticated;
grant delete on storage.objects to authenticated;

drop policy if exists "Owners can permanently delete own documents" on public.documents;
create policy "Owners can permanently delete own documents"
on public.documents for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Owners can permanently delete own document files" on storage.objects;
create policy "Owners can permanently delete own document files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);


-- Allow verified StudyDrop admins to permanently remove any document and its file.
drop policy if exists "Admins can permanently delete any document" on public.documents;
create policy "Admins can permanently delete any document"
on public.documents for delete to authenticated
using ((select public.is_app_admin()));

drop policy if exists "Admins can permanently delete any document files" on storage.objects;
create policy "Admins can permanently delete any document files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (select public.is_app_admin())
);
