-- Financial and operational analytics for restaurant managers.
-- Existing categories remain valid because cost is optional.
alter table public.categories
  add column cost_per_kg_dzd numeric(12, 2)
  check (cost_per_kg_dzd is null or cost_per_kg_dzd between 0 and 1000000000);

grant update (cost_per_kg_dzd, updated_at) on public.categories to authenticated;

create table public.daily_service_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  service_date date not null,
  meal_count integer not null check (meal_count between 0 and 10000000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_service_metrics_branch_fk
    foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete cascade,
  unique (organization_id, branch_id, service_date)
);

create index daily_service_metrics_branch_date_idx
  on public.daily_service_metrics (branch_id, service_date desc);

alter table public.daily_service_metrics enable row level security;

revoke all on table public.daily_service_metrics from anon, authenticated;
grant select, insert on public.daily_service_metrics to authenticated;
grant update (meal_count, updated_at) on public.daily_service_metrics to authenticated;
grant select, insert, update, delete on public.daily_service_metrics to service_role;

create policy daily_service_metrics_select_member
on public.daily_service_metrics
for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = daily_service_metrics.organization_id
      and m.status = 'active'
      and (m.branch_id is null or m.branch_id = daily_service_metrics.branch_id)
  )
);

create policy daily_service_metrics_insert_manager
on public.daily_service_metrics
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = daily_service_metrics.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = daily_service_metrics.branch_id)
      )
  )
);

create policy daily_service_metrics_update_manager
on public.daily_service_metrics
for update
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = daily_service_metrics.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = daily_service_metrics.branch_id)
      )
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = daily_service_metrics.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = daily_service_metrics.branch_id)
      )
  )
);

-- The function is security invoker: waste events and service metrics remain
-- restricted by each table's RLS policies.
create function public.get_operational_analytics(
  p_from date default (current_date - 29),
  p_to date default current_date,
  p_branch_id uuid default null,
  p_category_id uuid default null,
  p_reason_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with parameters as (
    select
      least(p_from, p_to) as from_date,
      greatest(p_from, p_to) as to_date
  ),
  visible_events as (
    select
      event.id,
      event.branch_id,
      event.category_id,
      event.reason_id,
      event.weight_grams,
      (event.occurred_at at time zone branch.timezone)::date as service_date,
      category.name as category_name,
      category.cost_per_kg_dzd,
      reason.name as reason_name
    from public.waste_events event
    join public.branches branch
      on branch.organization_id = event.organization_id and branch.id = event.branch_id
    join public.categories category on category.id = event.category_id
    join public.waste_reasons reason on reason.id = event.reason_id
    cross join parameters p
    where (event.occurred_at at time zone branch.timezone)::date between p.from_date and p.to_date
      and (p_branch_id is null or event.branch_id = p_branch_id)
      and (p_category_id is null or event.category_id = p_category_id)
      and (p_reason_id is null or event.reason_id = p_reason_id)
  ),
  visible_meals as (
    select metric.service_date, metric.branch_id, metric.meal_count
    from public.daily_service_metrics metric
    cross join parameters p
    where metric.service_date between p.from_date and p.to_date
      and (p_branch_id is null or metric.branch_id = p_branch_id)
  ),
  totals as (
    select
      coalesce(sum(weight_grams), 0)::bigint as total_weight_grams,
      count(*)::bigint as event_count,
      coalesce(sum((weight_grams::numeric / 1000) * coalesce(cost_per_kg_dzd, 0)), 0) as total_cost_dzd,
      count(*) filter (where cost_per_kg_dzd is not null)::bigint as costed_event_count
    from visible_events
  ),
  meal_totals as (
    select coalesce(sum(meal_count), 0)::bigint as meal_count, count(*)::integer as recorded_days
    from visible_meals
  ),
  category_totals as (
    select
      category_id,
      category_name as name,
      sum(weight_grams)::bigint as weight_grams,
      count(*)::bigint as event_count,
      sum((weight_grams::numeric / 1000) * coalesce(cost_per_kg_dzd, 0)) as cost_dzd
    from visible_events
    group by category_id, category_name
  ),
  reason_totals as (
    select reason_id, reason_name as name, sum(weight_grams)::bigint as weight_grams, count(*)::bigint as event_count
    from visible_events
    group by reason_id, reason_name
  ),
  daily_totals as (
    select service_date, sum(weight_grams)::bigint as weight_grams,
      sum((weight_grams::numeric / 1000) * coalesce(cost_per_kg_dzd, 0)) as cost_dzd
    from visible_events
    group by service_date
  )
  select jsonb_build_object(
    'from_date', p.from_date,
    'to_date', p.to_date,
    'period_days', (p.to_date - p.from_date + 1),
    'total_weight_kg', totals.total_weight_grams::numeric / 1000,
    'total_count', totals.event_count,
    'total_cost_dzd', round(totals.total_cost_dzd, 2),
    'cost_coverage_percent', case when totals.event_count = 0 then 0
      else round((totals.costed_event_count::numeric / totals.event_count) * 100, 1) end,
    'meal_count', meal_totals.meal_count,
    'meal_days_recorded', meal_totals.recorded_days,
    'waste_grams_per_meal', case when meal_totals.meal_count = 0 then 0
      else round(totals.total_weight_grams::numeric / meal_totals.meal_count, 1) end,
    'cost_dzd_per_meal', case when meal_totals.meal_count = 0 then 0
      else round(totals.total_cost_dzd / meal_totals.meal_count, 2) end,
    'registration_quality_percent', round((meal_totals.recorded_days::numeric / greatest((p.to_date - p.from_date + 1), 1)) * 100, 1),
    'categories', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.category_id, 'name', c.name, 'weight_kg', c.weight_grams::numeric / 1000,
      'event_count', c.event_count, 'cost_dzd', round(c.cost_dzd, 2),
      'percentage', case when totals.total_weight_grams = 0 then 0 else round(c.weight_grams::numeric / totals.total_weight_grams * 100, 1) end
    ) order by c.weight_grams desc) from category_totals c), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.reason_id, 'name', r.name, 'weight_kg', r.weight_grams::numeric / 1000,
      'event_count', r.event_count,
      'percentage', case when totals.total_weight_grams = 0 then 0 else round(r.weight_grams::numeric / totals.total_weight_grams * 100, 1) end
    ) order by r.weight_grams desc) from reason_totals r), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', d.service_date, 'weight_kg', d.weight_grams::numeric / 1000, 'cost_dzd', round(d.cost_dzd, 2)
    ) order by d.service_date) from daily_totals d), '[]'::jsonb)
  )
  from parameters p cross join totals cross join meal_totals;
$$;

revoke execute on function public.get_operational_analytics(date, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.get_operational_analytics(date, date, uuid, uuid, uuid) to authenticated, service_role;
