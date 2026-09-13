-- Keep tenant onboarding usable before custom SMTP is configured. A platform
-- administrator may create the tenant shell now and assign its owner later.

create or replace function public.platform_create_organization(
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

  if p_owner_user_id is not null then
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
  end if;

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
