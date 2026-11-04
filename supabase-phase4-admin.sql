-- StudyDrop Phase 4: Admin access, cross-user document management, recycle bin and activity history.
-- Run this complete script in Supabase Dashboard -> SQL Editor.
-- Admin email supplied by the project owner: rj8756544@gmail.com

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.app_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_admin_emails enable row level security;
alter table public.admin_users enable row level security;

revoke all on public.app_admin_emails from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.handle_new_studydrop_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end;

  if exists (select 1 from public.app_admin_emails where email = lower(coalesce(new.email, ''))) then
    insert into public.admin_users (user_id, role) values (new.id, 'admin')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_studydrop on auth.users;
create trigger on_auth_user_created_studydrop
after insert or update of email on auth.users
for each row execute function public.handle_new_studydrop_user();

insert into public.app_admin_emails(email)
values ('rj8756544@gmail.com')
on conflict (email) do nothing;

insert into public.profiles (id, email, full_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data->>'full_name', '')
from auth.users
on conflict (id) do update set email = excluded.email;

insert into public.admin_users(user_id, role)
select id, 'admin' from auth.users
where lower(email) = 'rj8756544@gmail.com'
on conflict (user_id) do nothing;

drop policy if exists "Profiles: owner or admin can read" on public.profiles;
create policy "Profiles: owner or admin can read"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_app_admin()));

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

alter table public.documents
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

drop policy if exists "Users can read their own documents" on public.documents;
create policy "Users can read their own documents"
on public.documents for select to authenticated
using ((select auth.uid()) = user_id or (select public.is_app_admin()));

drop policy if exists "Admins can update any document" on public.documents;
create policy "Admins can update any document"
on public.documents for update to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  document_id uuid,
  action text not null check (action in ('upload','update','delete','restore')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_created_idx
  on public.activity_logs(user_id, created_at desc);
alter table public.activity_logs enable row level security;
grant select on public.activity_logs to authenticated;

drop policy if exists "Users and admins can read activity" on public.activity_logs;
create policy "Users and admins can read activity"
on public.activity_logs for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_app_admin()));

create or replace function public.track_studydrop_document_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_action text;
  owner_id uuid;
  doc_id uuid;
  doc_name text;
begin
  if tg_op = 'INSERT' then
    event_action := 'upload';
    owner_id := new.user_id;
    doc_id := new.id;
    doc_name := new.name;
  else
    owner_id := new.user_id;
    doc_id := new.id;
    doc_name := new.name;
    if old.deleted_at is null and new.deleted_at is not null then
      event_action := 'delete';
    elsif old.deleted_at is not null and new.deleted_at is null then
      event_action := 'restore';
    else
      event_action := 'update';
    end if;
  end if;

  insert into public.activity_logs(user_id, actor_id, document_id, action, details)
  values (owner_id, auth.uid(), doc_id, event_action, jsonb_build_object('name', doc_name));
  return coalesce(new, old);
end;
$$;

create or replace function public.prepare_studydrop_document_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists studydrop_document_prepare_update on public.documents;
create trigger studydrop_document_prepare_update
before update on public.documents
for each row execute function public.prepare_studydrop_document_update();

drop trigger if exists studydrop_document_activity on public.documents;
create trigger studydrop_document_activity
after insert or update on public.documents
for each row execute function public.track_studydrop_document_activity();

drop policy if exists "Users can read files in their own folder" on storage.objects;
create policy "Users can read files in their own folder"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_app_admin())
  )
);
