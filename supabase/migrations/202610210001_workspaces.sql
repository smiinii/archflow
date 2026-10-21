-- A private, atomic workspace snapshot. Folder/project IDs are scoped inside data.
-- CAS prevents silently overwriting edits from another tab/device.
create table if not exists public.workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'schemaVersion' = '1' and pg_column_size(data) <= 20000000),
  updated_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;
create policy "Read own workspace" on public.workspaces for select to authenticated using ((select auth.uid()) = owner_id);
-- Writes only through the CAS function: clients cannot bypass revision checks.
revoke all on public.workspaces from anon, authenticated;
grant select on public.workspaces to authenticated;
create or replace function public.save_workspace(expected_revision bigint, payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare user_id uuid := auth.uid(); result_revision bigint;
begin
  if user_id is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(payload) <> 'object' or payload ->> 'schemaVersion' is distinct from '1'
    or jsonb_typeof(payload -> 'projects') is distinct from 'array'
    or jsonb_typeof(payload -> 'folders') is distinct from 'array'
    or jsonb_array_length(payload -> 'projects') not between 1 and 100
    or jsonb_array_length(payload -> 'folders') > 200
    or octet_length(payload::text) > 20000000 then raise exception 'invalid_workspace'; end if;
  if expected_revision = 0 then
    insert into public.workspaces(owner_id,revision,data) values(user_id,1,payload)
      on conflict (owner_id) do nothing returning revision into result_revision;
  else
    update public.workspaces set data=payload,revision=revision+1,updated_at=now()
      where owner_id=user_id and revision=expected_revision returning revision into result_revision;
  end if;
  if result_revision is null then raise exception 'revision_conflict'; end if;
  return result_revision;
end;
$$;
revoke all on function public.save_workspace(bigint,jsonb) from public, anon;
grant execute on function public.save_workspace(bigint,jsonb) to authenticated;
