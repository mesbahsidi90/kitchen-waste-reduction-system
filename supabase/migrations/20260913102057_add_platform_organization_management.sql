-- Platform-only write helpers keep limit checks and their audited mutation in
-- the same short transaction. They run with the caller's service-role rights.

create function public.platform_create_branch(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_name text,
  p_timezone text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed_branches integer;
  current_branches bigint;
  new_branch_id uuid;
begin
  select branch_limit
  into allowed_branches
  from public.subscriptions
  where organization_id = p_organization_id
  for update;

  if allowed_branches is null then
    raise exception using errcode = 'P0002', message = 'ORGANIZATION_NOT_FOUND';
  end if;

  select count(*)
  into current_branches
  from public.branches
  where organization_id = p_organization_id;

  if current_branches >= allowed_branches then
    raise exception using errcode = 'P0001', message = 'BRANCH_LIMIT_REACHED';
  end if;

  insert into public.branches (organization_id, name, timezone)
  values (p_organization_id, trim(p_name), trim(p_timezone))
  returning id into new_branch_id;

  insert into public.audit_logs (
    organization_id,
    branch_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_organization_id,
    new_branch_id,
    p_actor_user_id,
    'platform.branch.created',
    'branch',
    new_branch_id::text,
    jsonb_build_object('name', trim(p_name), 'timezone', trim(p_timezone))
  );

  return new_branch_id;
end;
$$;

create function public.platform_add_membership(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_role text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_membership_id uuid;
begin
  if not exists (
    select 1 from public.organizations where id = p_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'ORGANIZATION_NOT_FOUND';
  end if;

  if p_role not in ('organization_owner', 'branch_manager', 'worker') then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_ROLE';
  end if;

  if (p_role = 'organization_owner' and p_branch_id is not null)
    or (p_role in ('branch_manager', 'worker') and p_branch_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_MEMBER_SCOPE';
  end if;

  insert into public.memberships (
    user_id,
    organization_id,
    branch_id,
    role,
    status
  ) values (
    p_user_id,
    p_organization_id,
    p_branch_id,
    p_role,
    'active'
  )
  returning id into new_membership_id;

  insert into public.audit_logs (
    organization_id,
    branch_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_organization_id,
    p_branch_id,
    p_actor_user_id,
    'platform.member.invited',
    'membership',
    new_membership_id::text,
    jsonb_build_object('user_id', p_user_id, 'role', p_role)
  );

  return new_membership_id;
end;
$$;

revoke execute on function public.platform_create_branch(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.platform_create_branch(uuid, uuid, text, text)
  to service_role;

revoke execute on function public.platform_add_membership(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.platform_add_membership(uuid, uuid, uuid, uuid, text)
  to service_role;
