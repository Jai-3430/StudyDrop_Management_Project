-- Run in Supabase Dashboard -> SQL Editor -> New query.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size bigint not null default 0,
  type text not null default 'application/octet-stream',
  student text not null default 'Student',
  subject text not null default 'General',
  category text not null default 'notes' check (category in ('assignment','notes','project','media')),
  due_date date,
  tags text[] not null default '{}',
  note text not null default '',
  favorite boolean not null default false,
  storage_path text not null,
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
drop policy if exists "Users can read their own documents" on public.documents;
create policy "Users can read their own documents" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can add their own documents" on public.documents;
create policy "Users can add their own documents" on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own documents" on public.documents;
create policy "Users can update their own documents" on public.documents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own documents" on public.documents;
create policy "Users can delete their own documents" on public.documents for delete to authenticated using ((select auth.uid()) = user_id);
insert into storage.buckets (id,name,public,file_size_limit) values ('documents','documents',false,52428800) on conflict (id) do update set public=false,file_size_limit=52428800;
drop policy if exists "Users can read files in their own folder" on storage.objects;
create policy "Users can read files in their own folder" on storage.objects for select to authenticated using (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can upload files in their own folder" on storage.objects;
create policy "Users can upload files in their own folder" on storage.objects for insert to authenticated with check (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can update files in their own folder" on storage.objects;
create policy "Users can update files in their own folder" on storage.objects for update to authenticated using (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Users can delete files in their own folder" on storage.objects;
create policy "Users can delete files in their own folder" on storage.objects for delete to authenticated using (bucket_id='documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
