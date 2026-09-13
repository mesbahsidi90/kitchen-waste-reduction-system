-- Kitchen managers can maintain only the categories of their assigned branch.
-- Organization owners can maintain categories for every branch in their organization.
grant insert, update on public.categories to authenticated;

create policy categories_insert_manager
on public.categories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = categories.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = categories.branch_id)
      )
  )
);

create policy categories_update_manager
on public.categories
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = categories.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = categories.branch_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = categories.organization_id
      and m.status = 'active'
      and (
        (m.role = 'organization_owner' and m.branch_id is null)
        or (m.role = 'branch_manager' and m.branch_id = categories.branch_id)
      )
  )
);
