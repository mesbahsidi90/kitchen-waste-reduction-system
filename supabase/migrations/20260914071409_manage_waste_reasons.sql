-- Seed a practical starter list for every branch and let tenant managers maintain it.
grant insert, update on public.waste_reasons to authenticated;

create policy waste_reasons_insert_manager
on public.waste_reasons
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = waste_reasons.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = waste_reasons.branch_id)
      )
  )
);

create policy waste_reasons_update_manager
on public.waste_reasons
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = waste_reasons.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = waste_reasons.branch_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = waste_reasons.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = waste_reasons.branch_id)
      )
  )
);

create function public.seed_default_waste_reasons()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.waste_reasons (organization_id, branch_id, name)
  values
    (new.organization_id, new.id, 'فائض الإنتاج'),
    (new.organization_id, new.id, 'خطأ في التحضير'),
    (new.organization_id, new.id, 'انتهاء الصلاحية'),
    (new.organization_id, new.id, 'تلف أثناء التخزين'),
    (new.organization_id, new.id, 'بقايا العملاء')
  on conflict (organization_id, branch_id, name) do nothing;

  return new;
end;
$$;

revoke execute on function public.seed_default_waste_reasons() from public, anon, authenticated;
grant execute on function public.seed_default_waste_reasons() to service_role;

create trigger branches_seed_default_waste_reasons
after insert on public.branches
for each row
execute function public.seed_default_waste_reasons();

-- Bring existing branches to the same useful starting point without duplicating custom reasons.
insert into public.waste_reasons (organization_id, branch_id, name)
select b.organization_id, b.id, defaults.name
from public.branches b
cross join (
  values
    ('فائض الإنتاج'),
    ('خطأ في التحضير'),
    ('انتهاء الصلاحية'),
    ('تلف أثناء التخزين'),
    ('بقايا العملاء')
) as defaults(name)
on conflict (organization_id, branch_id, name) do nothing;
