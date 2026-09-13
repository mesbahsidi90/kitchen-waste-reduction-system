begin;
select plan(14);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner-one@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'owner-two@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'manager-one@example.test');

insert into public.organizations (id, name, slug) values
  ('11000000-0000-4000-8000-000000000001', 'Restaurant One', 'restaurant-one'),
  ('22000000-0000-4000-8000-000000000002', 'Restaurant Two', 'restaurant-two');
insert into public.branches (id, organization_id, name) values
  ('11100000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Branch One'),
  ('22200000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', 'Branch Two');
insert into public.memberships (user_id, organization_id, branch_id, role) values
  ('10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', null, 'organization_owner'),
  ('20000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', null, 'organization_owner'),
  ('30000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001',
    '11100000-0000-4000-8000-000000000001', 'branch_manager');
insert into public.devices (id, organization_id, branch_id, code, name, api_key_hash) values
  ('11110000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', 'SCALE_01', 'Scale One', repeat('a', 64)),
  ('22220000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', 'SCALE_02', 'Scale Two', repeat('b', 64));
insert into public.categories (id, organization_id, branch_id, name) values
  ('11111000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', 'Vegetables'),
  ('22222000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', 'Bakery');
insert into public.waste_reasons (id, organization_id, branch_id, name) values
  ('11111100-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', 'Expired'),
  ('22222200-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', 'Overproduction');
insert into public.waste_events (
  id, organization_id, branch_id, device_id, client_event_id,
  category_id, reason_id, weight_grams, source
) values
  ('11111110-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', '11111000-0000-4000-8000-000000000001', '11111100-0000-4000-8000-000000000001', 500, 'serial'),
  ('22222220-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', '22220000-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', '22222000-0000-4000-8000-000000000002', '22222200-0000-4000-8000-000000000002', 900, 'serial');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (
     'organizations', 'branches', 'memberships', 'devices', 'categories',
     'waste_reasons', 'waste_events', 'threshold_rules', 'audit_logs'
   ) and c.relrowsecurity),
  9::bigint,
  'RLS is enabled on every exposed application table'
);
select ok(not has_table_privilege('anon', 'public.organizations', 'select'), 'anonymous users cannot read organizations');
select ok(has_table_privilege('authenticated', 'public.waste_events', 'select'), 'authenticated users have explicit read grants');
select ok(has_table_privilege('authenticated', 'public.categories', 'insert'), 'authenticated managers have an explicit category insert grant');
select ok(not has_column_privilege('authenticated', 'public.devices', 'api_key_hash', 'select'), 'device hashes are not readable by clients');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.organizations), 1::bigint, 'a user sees only their organization');
select is((select count(*) from public.branches), 1::bigint, 'a user sees only their branches');
select is((select count(*) from public.waste_events), 1::bigint, 'a user sees only their waste events');
select is((select count(*) from public.memberships), 1::bigint, 'a user sees only their own memberships');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.waste_events), 1::bigint, 'another tenant sees only its own waste events');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.waste_events (
    organization_id, branch_id, actor_user_id, client_event_id,
    category_id, reason_id, weight_grams, source
  ) values (
    '22000000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', '99999999-0000-4000-8000-000000000009',
    '22222000-0000-4000-8000-000000000002', '22222200-0000-4000-8000-000000000002',
    100, 'manual'
  )$$,
  '42501',
  'new row violates row-level security policy for table "waste_events"',
  'a user cannot insert an event into another tenant'
);

select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.categories (id, organization_id, branch_id, name)
    values ('33333000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000001',
      '11100000-0000-4000-8000-000000000001', 'Dairy')$$,
  'a branch manager can add a category to the assigned branch'
);
select lives_ok(
  $$update public.categories set is_active = false
    where id = '33333000-0000-4000-8000-000000000003'$$,
  'a branch manager can deactivate a category in the assigned branch'
);
select throws_ok(
  $$insert into public.categories (organization_id, branch_id, name)
    values ('22000000-0000-4000-8000-000000000002',
      '22200000-0000-4000-8000-000000000002', 'Forbidden category')$$,
  '42501',
  'new row violates row-level security policy for table "categories"',
  'a branch manager cannot add a category to another tenant'
);

select * from finish();
rollback;
