-- StudyDrop Advanced Security Hardening
-- Run once in Supabase SQL Editor after Phase 4 and Phase 5 migrations.
-- This migration does not expose service-role credentials or weaken existing RLS.

-- 1) Keep the documents bucket private and enforce the app's 50 MB upload limit.
update storage.buckets
set public = false, file_size_limit = 52428800
where id = 'documents';

-- 2) Prevent accidental or malicious reassignment of a document to another account,
-- and prevent changing the storage object path through a metadata update.
create or replace function public.studydrop_guard_document_integrity()
returns trigger
language plpgsql
security invoker
set search_path = public, storage, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'Document ID cannot be changed.';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Document ownership cannot be changed.';
    end if;
    if new.storage_path is distinct from old.storage_path then
      raise exception 'Document storage path cannot be changed.';
    end if;
    new.created_at := old.created_at;
  end if;

  if new.storage_path is null
     or (storage.foldername(new.storage_path))[1] is distinct from new.user_id::text then
    raise exception 'Document storage path must be inside its owner folder.';
  end if;

  return new;
end;
$$;

revoke all on function public.studydrop_guard_document_integrity() from public, anon, authenticated;
drop trigger if exists studydrop_document_integrity_guard on public.documents;
create trigger studydrop_document_integrity_guard
before insert or update on public.documents
for each row execute function public.studydrop_guard_document_integrity();

-- 3) Rate-limit the account lookup used by document sharing.
-- The counter table is private: clients cannot read or write it directly.
create table if not exists public.studydrop_share_lookup_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);
alter table public.studydrop_share_lookup_limits enable row level security;
revoke all on public.studydrop_share_lookup_limits from public, anon, authenticated;

create or replace function public.find_studydrop_user_by_email(lookup_email text)
returns table(id uuid, email text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  normalized_email text := lower(trim(coalesce(lookup_email, '')));
  current_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required.';
  end if;

  if length(normalized_email) < 5 or length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  insert into public.studydrop_share_lookup_limits(user_id, window_started_at, request_count)
  values (caller_id, now(), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.studydrop_share_lookup_limits.window_started_at < now() - interval '1 hour'
          then now()
          else public.studydrop_share_lookup_limits.window_started_at
        end,
        request_count = case
          when public.studydrop_share_lookup_limits.window_started_at < now() - interval '1 hour'
          then 1
          else public.studydrop_share_lookup_limits.request_count + 1
        end
  returning request_count into current_count;

  if current_count > 20 then
    raise exception 'Too many sharing lookups. Please try again later.';
  end if;

  return query
    select p.id, p.email
    from public.profiles p
    where lower(p.email) = normalized_email
    limit 1;
end;
$$;

revoke all on function public.find_studydrop_user_by_email(text) from public, anon;
grant execute on function public.find_studydrop_user_by_email(text) to authenticated;

-- 4) Reassert private table access boundaries for account and admin metadata.
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.app_admin_emails enable row level security;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.app_admin_emails from anon, authenticated;
grant select on public.profiles to authenticated;

-- 5) Verify the key protections after running this migration:
-- - documents: RLS remains enabled; owner/admin/share policies remain in force.
-- - storage.objects: bucket 'documents' remains private; existing folder policies remain in force.
-- - admin_users/app_admin_emails: no direct client privileges.
-- - share lookup: authenticated only, maximum 20 lookups per user per rolling hour.
