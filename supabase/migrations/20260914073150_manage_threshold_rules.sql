-- Tenant managers can maintain alert thresholds without changing their tenant ownership fields.
alter table public.threshold_rules
  alter column created_by set default auth.uid();

create unique index threshold_rules_scope_period_unique
  on public.threshold_rules (organization_id, branch_id, category_id, period)
  nulls not distinct;

grant insert on public.threshold_rules to authenticated;
grant update (category_id, period, limit_grams, cooldown_minutes, is_active, updated_at)
  on public.threshold_rules to authenticated;

create policy threshold_rules_insert_manager
on public.threshold_rules
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = threshold_rules.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = threshold_rules.branch_id)
      )
  )
);

create policy threshold_rules_update_manager
on public.threshold_rules
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = threshold_rules.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = threshold_rules.branch_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = threshold_rules.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = threshold_rules.branch_id)
      )
  )
);

-- Computes calendar-period usage in each branch's timezone. RLS remains active
-- because the function runs with the caller's privileges.
create function public.get_threshold_statuses()
returns table (
  id uuid,
  branch_id uuid,
  category_id uuid,
  period text,
  limit_grams bigint,
  cooldown_minutes integer,
  is_active boolean,
  current_grams bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible_rules as (
    select
      rule.id,
      rule.organization_id,
      rule.branch_id,
      rule.category_id,
      rule.period,
      rule.limit_grams,
      rule.cooldown_minutes,
      rule.is_active,
      date_trunc(rule.period, current_timestamp at time zone branch.timezone)
        at time zone branch.timezone as period_started_at
    from public.threshold_rules rule
    join public.branches branch
      on branch.organization_id = rule.organization_id
     and branch.id = rule.branch_id
  )
  select
    rule.id,
    rule.branch_id,
    rule.category_id,
    rule.period,
    rule.limit_grams,
    rule.cooldown_minutes,
    rule.is_active,
    coalesce(sum(event.weight_grams), 0)::bigint as current_grams
  from visible_rules rule
  left join public.waste_events event
    on event.organization_id = rule.organization_id
   and event.branch_id = rule.branch_id
   and (rule.category_id is null or event.category_id = rule.category_id)
   and event.occurred_at >= rule.period_started_at
  group by
    rule.id,
    rule.branch_id,
    rule.category_id,
    rule.period,
    rule.limit_grams,
    rule.cooldown_minutes,
    rule.is_active
  order by rule.branch_id, rule.id;
$$;

revoke execute on function public.get_threshold_statuses() from public, anon;
grant execute on function public.get_threshold_statuses() to authenticated, service_role;
