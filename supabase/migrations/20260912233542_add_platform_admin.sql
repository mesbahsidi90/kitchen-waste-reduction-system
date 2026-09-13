-- Platform-wide administration remains server-only. The browser never receives
-- service credentials and tenant users receive no grants on these objects.

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index platform_admins_status_idx
  on public.platform_admins (status, user_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'growth', 'enterprise')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  branch_limit integer not null default 1 check (branch_limit between 1 and 10000),
  device_limit integer not null default 2 check (device_limit between 1 and 100000),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_check check (
    current_period_end is null or current_period_end > current_period_start
  )
);

create index subscriptions_status_plan_idx
  on public.subscriptions (status, plan);

insert into public.subscriptions (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

alter table public.platform_admins enable row level security;
alter table public.subscriptions enable row level security;

revoke all on public.platform_admins, public.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.platform_admins, public.subscriptions to service_role;

-- One batched read prevents N+1 queries in the platform dashboard. Invoker
-- security plus service-role-only grants keep the summary unavailable to clients.
create view public.platform_organization_summary
with (security_invoker = true)
as
select
  o.id,
  o.name,
  o.slug,
  o.status,
  o.created_at,
  (select count(*) from public.branches b where b.organization_id = o.id)::bigint as branch_count,
  (select count(*) from public.devices d where d.organization_id = o.id)::bigint as device_count,
  (select count(*) from public.memberships m where m.organization_id = o.id)::bigint as member_count,
  (select count(*) from public.waste_events e where e.organization_id = o.id)::bigint as waste_event_count,
  (select coalesce(sum(e.weight_grams), 0) from public.waste_events e where e.organization_id = o.id)::bigint as waste_weight_grams,
  coalesce(s.plan, 'trial') as subscription_plan,
  coalesce(s.status, 'trialing') as subscription_status,
  s.current_period_end
from public.organizations o
left join public.subscriptions s on s.organization_id = o.id;

revoke all on public.platform_organization_summary from public, anon, authenticated;
grant select on public.platform_organization_summary to service_role;

create view public.platform_overview
with (security_invoker = true)
as
select
  (select count(*) from public.organizations)::bigint as organization_count,
  (select count(*) from public.branches)::bigint as branch_count,
  (select count(*) from public.devices)::bigint as device_count,
  (select count(*) from public.memberships where status = 'active')::bigint as active_member_count,
  (select count(*) from public.waste_events)::bigint as waste_event_count,
  (select coalesce(sum(weight_grams), 0) from public.waste_events)::bigint as waste_weight_grams,
  (select count(*) from public.subscriptions where status = 'active')::bigint as active_subscription_count,
  (select count(*) from public.subscriptions where status = 'trialing')::bigint as trial_subscription_count,
  (select count(*) from public.subscriptions where status = 'past_due')::bigint as past_due_subscription_count;

revoke all on public.platform_overview from public, anon, authenticated;
grant select on public.platform_overview to service_role;
