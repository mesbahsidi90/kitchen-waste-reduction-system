-- Create a complete tenant shell in one transaction. Only the server-side
-- service role can call this function; browser roles keep no direct access.

alter table public.organizations
  add column contact_email text;

alter table public.organizations
  add constraint organizations_contact_email_check
  check (
    contact_email is null
    or contact_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );

drop view public.platform_organization_summary;

create view public.platform_organization_summary
with (security_invoker = true)
as
select
  o.id,
  o.name,
  o.slug,
  o.contact_email,
  o.status,
  o.created_at,
  (select count(*) from public.branches b where b.organization_id = o.id)::bigint as branch_count,
  (select count(*) from public.devices d where d.organization_id = o.id)::bigint as device_count,
  (select count(*) from public.memberships m where m.organization_id = o.id)::bigint as member_count,
  (select count(*) from public.waste_events e where e.organization_id = o.id)::bigint as waste_event_count,
  (select coalesce(sum(e.weight_grams), 0) from public.waste_events e where e.organization_id = o.id)::bigint as waste_weight_grams,
  coalesce(s.plan, 'trial') as subscription_plan,
  coalesce(s.status, 'trialing') as subscription_status,
  coalesce(s.branch_limit, 1) as branch_limit,
  coalesce(s.device_limit, 2) as device_limit,
  s.current_period_end
from public.organizations o
left join public.subscriptions s on s.organization_id = o.id;

revoke all on public.platform_organization_summary from public, anon, authenticated;
grant select on public.platform_organization_summary to service_role;

create function public.platform_create_organization(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_name text,
  p_slug text,
  p_contact_email text,
  p_branch_name text,
  p_timezone text,
  p_plan text,
  p_branch_limit integer,
  p_device_limit integer,
  p_trial_days integer default 14
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  insert into public.organizations (name, slug, contact_email, status)
  values (trim(p_name), lower(trim(p_slug)), lower(trim(p_contact_email)), 'trial')
  returning id into new_organization_id;

  insert into public.branches (organization_id, name, timezone)
  values (new_organization_id, trim(p_branch_name), trim(p_timezone));

  insert into public.subscriptions (
    organization_id,
    plan,
    status,
    branch_limit,
    device_limit,
    current_period_end
  ) values (
    new_organization_id,
    p_plan,
    'trialing',
    p_branch_limit,
    p_device_limit,
    now() + make_interval(days => p_trial_days)
  );

  insert into public.memberships (
    user_id,
    organization_id,
    branch_id,
    role,
    status
  ) values (
    p_owner_user_id,
    new_organization_id,
    null,
    'organization_owner',
    'active'
  );

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    new_organization_id,
    p_actor_user_id,
    'platform.organization.created',
    'organization',
    new_organization_id::text,
    jsonb_build_object(
      'plan', p_plan,
      'owner_user_id', p_owner_user_id,
      'initial_branch', trim(p_branch_name)
    )
  );

  return new_organization_id;
end;
$$;

revoke execute on function public.platform_create_organization(
  uuid, uuid, text, text, text, text, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.platform_create_organization(
  uuid, uuid, text, text, text, text, text, text, integer, integer, integer
) to service_role;
