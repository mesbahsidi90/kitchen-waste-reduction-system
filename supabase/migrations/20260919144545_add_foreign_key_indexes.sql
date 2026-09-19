-- Cover composite and user-reference foreign keys used by tenant-scoped tables.
create index if not exists audit_logs_organization_branch_fk_idx
  on public.audit_logs (organization_id, branch_id);

create index if not exists device_pairing_codes_created_by_idx
  on public.device_pairing_codes (created_by);

create index if not exists memberships_organization_branch_fk_idx
  on public.memberships (organization_id, branch_id);

create index if not exists platform_admins_created_by_idx
  on public.platform_admins (created_by);

create index if not exists waste_events_organization_branch_fk_idx
  on public.waste_events (organization_id, branch_id);

create index if not exists waste_events_organization_branch_category_fk_idx
  on public.waste_events (organization_id, branch_id, category_id);

create index if not exists waste_events_organization_branch_device_fk_idx
  on public.waste_events (organization_id, branch_id, device_id);

create index if not exists waste_events_organization_branch_reason_fk_idx
  on public.waste_events (organization_id, branch_id, reason_id);

