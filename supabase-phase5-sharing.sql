-- StudyDrop Phase 5 Milestone 2: secure document sharing.
-- Run once in Supabase Dashboard -> SQL Editor after Phase 4 migrations.
create table if not exists public.document_shares (
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references public.documents(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 recipient_email text not null,
 permission text not null check(permission in ('view','download')),
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint document_shares_not_self check(owner_id <> recipient_id),
 constraint document_shares_document_recipient_unique unique(document_id,recipient_id)
);
create index if not exists document_shares_recipient_idx on public.document_shares(recipient_id,revoked_at);
create index if not exists document_shares_owner_idx on public.document_shares(owner_id,document_id);
alter table public.document_shares enable row level security;
grant select,insert,update,delete on public.document_shares to authenticated;

create or replace function public.studydrop_is_document_owner(p_document_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.documents d where d.id=p_document_id and d.user_id=(select auth.uid()));
$$;
create or replace function public.studydrop_can_access_shared_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.document_shares s join public.documents d on d.id=s.document_id
 where s.document_id=p_document_id and s.recipient_id=(select auth.uid()) and s.revoked_at is null and d.deleted_at is null);
$$;
create or replace function public.studydrop_can_access_shared_path(p_object_name text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.documents d join public.document_shares s on s.document_id=d.id
 where d.storage_path=p_object_name and d.deleted_at is null and s.recipient_id=(select auth.uid()) and s.revoked_at is null);
$$;
revoke all on function public.studydrop_is_document_owner(uuid) from public;
revoke all on function public.studydrop_can_access_shared_document(uuid) from public;
revoke all on function public.studydrop_can_access_shared_path(text) from public;
grant execute on function public.studydrop_is_document_owner(uuid) to authenticated;
grant execute on function public.studydrop_can_access_shared_document(uuid) to authenticated;
grant execute on function public.studydrop_can_access_shared_path(text) to authenticated;

drop policy if exists "Users and recipients can read document shares" on public.document_shares;
create policy "Users and recipients can read document shares" on public.document_shares for select to authenticated
using(owner_id=(select auth.uid()) or recipient_id=(select auth.uid()));
drop policy if exists "Owners can create document shares" on public.document_shares;
create policy "Owners can create document shares" on public.document_shares for insert to authenticated
with check(owner_id=(select auth.uid()) and public.studydrop_is_document_owner(document_id) and recipient_id<>(select auth.uid()));
drop policy if exists "Owners can update document shares" on public.document_shares;
create policy "Owners can update document shares" on public.document_shares for update to authenticated
using(owner_id=(select auth.uid()) and public.studydrop_is_document_owner(document_id))
with check(owner_id=(select auth.uid()) and public.studydrop_is_document_owner(document_id));
drop policy if exists "Owners can delete document shares" on public.document_shares;
create policy "Owners can delete document shares" on public.document_shares for delete to authenticated
using(owner_id=(select auth.uid()) and public.studydrop_is_document_owner(document_id));

create or replace function public.find_studydrop_user_by_email(lookup_email text)
returns table(id uuid,email text) language sql stable security definer set search_path=public as $$
 select p.id,p.email from public.profiles p where lower(p.email)=lower(trim(lookup_email)) limit 1;
$$;
revoke all on function public.find_studydrop_user_by_email(text) from public;
grant execute on function public.find_studydrop_user_by_email(text) to authenticated;

drop policy if exists "Users can read their own documents" on public.documents;
create policy "Users can read their own documents" on public.documents for select to authenticated
using(user_id=(select auth.uid()) or (select public.is_app_admin()) or (select public.studydrop_can_access_shared_document(id)));
drop policy if exists "Users can read files in their own folder" on storage.objects;
create policy "Users can read files in their own folder" on storage.objects for select to authenticated
using(bucket_id='documents' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_app_admin()) or (select public.studydrop_can_access_shared_path(name))));

alter table public.activity_logs drop constraint if exists activity_logs_action_check;
alter table public.activity_logs add constraint activity_logs_action_check check(action in ('upload','update','delete','restore','share','revoke_share'));
create or replace function public.track_studydrop_share_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare doc_name text; event_action text;
begin
 select name into doc_name from public.documents where id=new.document_id;
 if tg_op='UPDATE' and old.revoked_at is null and new.revoked_at is not null then event_action:='revoke_share'; else event_action:='share'; end if;
 insert into public.activity_logs(user_id,actor_id,document_id,action,details)
 values(new.owner_id,auth.uid(),new.document_id,event_action,jsonb_build_object('name',coalesce(doc_name,'Document'),'recipient_email',new.recipient_email,'permission',new.permission));
 return new;
end; $$;
drop trigger if exists studydrop_share_activity on public.document_shares;
create trigger studydrop_share_activity after insert or update on public.document_shares for each row execute function public.track_studydrop_share_activity();
create or replace function public.touch_studydrop_share_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at:=now(); return new; end; $$;
drop trigger if exists studydrop_share_touch on public.document_shares;
create trigger studydrop_share_touch before update on public.document_shares for each row execute function public.touch_studydrop_share_updated_at();
