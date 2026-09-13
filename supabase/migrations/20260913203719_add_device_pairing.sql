-- Pairing codes are server-managed credentials. Tenant browsers can create them
-- only through the API after their membership and subscription are checked.
create table public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null unique references public.devices(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint device_pairing_codes_expiry_check check (expires_at > created_at)
);

create index device_pairing_codes_unclaimed_idx
  on public.device_pairing_codes (expires_at)
  where claimed_at is null;

alter table public.device_pairing_codes enable row level security;
revoke all on public.device_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on public.device_pairing_codes to service_role;

-- Both the pending device and its one-time pairing code are created atomically.
create function public.create_device_pairing(
  p_organization_id uuid,
  p_branch_id uuid,
  p_device_code text,
  p_device_name text,
  p_placeholder_api_key_hash text,
  p_pairing_code_hash text,
  p_expires_at timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  insert into public.devices (
    organization_id,
    branch_id,
    code,
    name,
    api_key_hash,
    status
  ) values (
    p_organization_id,
    p_branch_id,
    p_device_code,
    p_device_name,
    p_placeholder_api_key_hash,
    'pending'
  )
  returning id into v_device_id;

  insert into public.device_pairing_codes (
    device_id,
    code_hash,
    expires_at,
    created_by
  ) values (
    v_device_id,
    p_pairing_code_hash,
    p_expires_at,
    p_created_by
  );

  return v_device_id;
end;
$$;

revoke all on function public.create_device_pairing(uuid, uuid, text, text, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.create_device_pairing(uuid, uuid, text, text, text, text, timestamptz, uuid)
  to service_role;

-- Claiming is atomic: a code cannot be reused even by simultaneous requests.
create function public.claim_device_pairing(
  p_pairing_code_hash text,
  p_api_key_hash text
)
returns table (device_id uuid, device_code text, device_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  update public.device_pairing_codes
  set claimed_at = now()
  where code_hash = p_pairing_code_hash
    and claimed_at is null
    and expires_at > now()
  returning device_pairing_codes.device_id into v_device_id;

  if v_device_id is null then
    return;
  end if;

  update public.devices
  set api_key_hash = p_api_key_hash,
      status = 'active',
      updated_at = now()
  where id = v_device_id
    and status = 'pending'
  returning id, code, name into device_id, device_code, device_name;

  if device_id is null then
    raise exception using errcode = 'P0002', message = 'device unavailable';
  end if;

  return next;
end;
$$;

revoke all on function public.claim_device_pairing(text, text) from public, anon, authenticated;
grant execute on function public.claim_device_pairing(text, text) to service_role;
