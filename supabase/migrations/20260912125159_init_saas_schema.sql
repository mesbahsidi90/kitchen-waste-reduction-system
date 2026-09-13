-- Multi-tenant SaaS schema for the kitchen waste platform.
-- All public tables have RLS enabled and are exposed only through explicit grants.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('trial', 'active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  role text not null check (role in ('organization_owner', 'branch_manager', 'worker')),
  status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  constraint memberships_role_scope_check check (
    (role = 'organization_owner' and branch_id is null)
    or (role in ('branch_manager', 'worker') and branch_id is not null)
  )
);

create unique index memberships_owner_unique
  on public.memberships (user_id, organization_id)
  where branch_id is null;
create unique index memberships_branch_unique
  on public.memberships (user_id, organization_id, branch_id)
  where branch_id is not null;
create index memberships_user_scope_idx
  on public.memberships (user_id, organization_id, branch_id, role)
  where status = 'active';
create index memberships_organization_idx on public.memberships (organization_id);
create index memberships_branch_idx on public.memberships (branch_id) where branch_id is not null;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,64}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  api_key_hash text not null unique check (api_key_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('pending', 'active', 'disabled')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  unique (organization_id, branch_id, id),
  unique (organization_id, branch_id, code)
);
create index devices_branch_status_idx on public.devices (branch_id, status);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  color text not null default '#555555' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  unique (organization_id, branch_id, id),
  unique (organization_id, branch_id, name)
);
create index categories_branch_active_idx on public.categories (branch_id, is_active);

create table public.waste_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waste_reasons_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  unique (organization_id, branch_id, id),
  unique (organization_id, branch_id, name)
);
create index waste_reasons_branch_active_idx on public.waste_reasons (branch_id, is_active);

create table public.waste_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  device_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  client_event_id uuid not null,
  category_id uuid not null,
  reason_id uuid not null,
  weight_grams integer not null check (weight_grams > 0 and weight_grams <= 1000000),
  source text not null check (source in ('manual', 'serial')),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  constraint waste_events_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id),
  constraint waste_events_device_fk
    foreign key (organization_id, branch_id, device_id)
    references public.devices(organization_id, branch_id, id),
  constraint waste_events_category_fk
    foreign key (organization_id, branch_id, category_id)
    references public.categories(organization_id, branch_id, id),
  constraint waste_events_reason_fk
    foreign key (organization_id, branch_id, reason_id)
    references public.waste_reasons(organization_id, branch_id, id),
  constraint waste_events_actor_source_check check (
    (source = 'manual' and actor_user_id is not null)
    or (source = 'serial' and device_id is not null)
  ),
  unique (branch_id, client_event_id)
);
create index waste_events_branch_occurred_idx
  on public.waste_events (branch_id, occurred_at desc, id desc);
create index waste_events_org_occurred_idx
  on public.waste_events (organization_id, occurred_at desc);
create index waste_events_category_occurred_idx
  on public.waste_events (category_id, occurred_at desc);
create index waste_events_reason_idx on public.waste_events (reason_id);
create index waste_events_device_idx on public.waste_events (device_id) where device_id is not null;
create index waste_events_actor_idx on public.waste_events (actor_user_id) where actor_user_id is not null;

create table public.threshold_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  category_id uuid,
  period text not null check (period in ('day', 'week', 'month')),
  limit_grams bigint not null check (limit_grams > 0),
  cooldown_minutes integer not null default 60 check (cooldown_minutes between 5 and 10080),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint threshold_rules_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  constraint threshold_rules_category_fk
    foreign key (organization_id, branch_id, category_id)
    references public.categories(organization_id, branch_id, id)
);
create index threshold_rules_branch_active_idx
  on public.threshold_rules (branch_id, is_active);
create index threshold_rules_category_idx
  on public.threshold_rules (category_id) where category_id is not null;
create index threshold_rules_created_by_idx on public.threshold_rules (created_by);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  branch_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 3 and 120),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete set null,
  constraint audit_logs_branch_scope_check check (
    branch_id is null or organization_id is not null
  )
);
create index audit_logs_org_created_idx
  on public.audit_logs (organization_id, created_at desc);
create index audit_logs_branch_created_idx
  on public.audit_logs (branch_id, created_at desc) where branch_id is not null;
create index audit_logs_actor_idx on public.audit_logs (actor_user_id) where actor_user_id is not null;

-- RLS is mandatory for every table exposed through the Data API.
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.devices enable row level security;
alter table public.categories enable row level security;
alter table public.waste_reasons enable row level security;
alter table public.waste_events enable row level security;
alter table public.threshold_rules enable row level security;
alter table public.audit_logs enable row level security;

create policy memberships_select_self on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy organizations_select_member on public.organizations
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid()) and m.status = 'active'
  ));

create policy branches_select_member on public.branches
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = branches.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.branch_id is null or m.branch_id = branches.id)
  ));

create policy devices_select_manager on public.devices
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = devices.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role = 'organization_owner' or (m.role = 'branch_manager' and m.branch_id = devices.branch_id))
  ));

create policy categories_select_member on public.categories
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = categories.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.branch_id is null or m.branch_id = categories.branch_id)
  ));

create policy waste_reasons_select_member on public.waste_reasons
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = waste_reasons.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.branch_id is null or m.branch_id = waste_reasons.branch_id)
  ));

create policy waste_events_select_member on public.waste_events
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = waste_events.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.branch_id is null or m.branch_id = waste_events.branch_id)
  ));

create policy waste_events_insert_worker on public.waste_events
  for insert to authenticated
  with check (
    actor_user_id = (select auth.uid()) and source = 'manual'
    and exists (
      select 1 from public.memberships m
      where m.organization_id = waste_events.organization_id
        and m.user_id = (select auth.uid()) and m.status = 'active'
        and (m.branch_id is null or m.branch_id = waste_events.branch_id)
    )
  );

create policy threshold_rules_select_member on public.threshold_rules
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = threshold_rules.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.branch_id is null or m.branch_id = threshold_rules.branch_id)
  ));

create policy audit_logs_select_manager on public.audit_logs
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.organization_id = audit_logs.organization_id
      and m.user_id = (select auth.uid()) and m.status = 'active'
      and (m.role = 'organization_owner' or (m.role = 'branch_manager' and m.branch_id = audit_logs.branch_id))
  ));

-- Invoker rights ensure waste_events RLS is applied to summary queries.
create function public.get_waste_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total_weight_kg', coalesce(sum(e.weight_grams), 0)::numeric / 1000,
    'total_count', count(e.id),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', grouped.name,
        'weight_kg', grouped.weight_grams::numeric / 1000,
        'count', grouped.event_count
      ) order by grouped.weight_grams desc)
      from (
        select c.name, sum(we.weight_grams) as weight_grams, count(*) as event_count
        from public.waste_events we
        join public.categories c on c.id = we.category_id
        group by c.id, c.name
      ) grouped
    ), '[]'::jsonb)
  )
  from public.waste_events e;
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.get_waste_summary() from public, anon;

grant usage on schema public to authenticated, service_role;
grant select on public.organizations, public.branches, public.memberships,
  public.categories, public.waste_reasons, public.waste_events,
  public.threshold_rules, public.audit_logs to authenticated;
grant select (id, organization_id, branch_id, code, name, status, last_seen_at, created_at, updated_at)
  on public.devices to authenticated;
grant insert on public.waste_events to authenticated;
grant execute on function public.get_waste_summary() to authenticated, service_role;

grant select, insert, update, delete on public.organizations, public.branches,
  public.memberships, public.devices, public.categories, public.waste_reasons,
  public.waste_events, public.threshold_rules, public.audit_logs to service_role;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
