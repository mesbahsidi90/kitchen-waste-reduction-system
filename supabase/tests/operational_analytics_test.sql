begin;
select plan(10);

insert into auth.users (id, email) values
  ('51000000-0000-4000-8000-000000000001', 'analytics-owner@example.test'),
  ('52000000-0000-4000-8000-000000000002', 'analytics-other@example.test');

insert into public.organizations (id, name, slug) values
  ('51100000-0000-4000-8000-000000000001', 'Analytics One', 'analytics-one'),
  ('52200000-0000-4000-8000-000000000002', 'Analytics Two', 'analytics-two');
insert into public.branches (id, organization_id, name) values
  ('51110000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', 'Main One'),
  ('52220000-0000-4000-8000-000000000002', '52200000-0000-4000-8000-000000000002', 'Main Two');
insert into public.memberships (user_id, organization_id, branch_id, role) values
  ('51000000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', null, 'organization_owner'),
  ('52000000-0000-4000-8000-000000000002', '52200000-0000-4000-8000-000000000002', null, 'organization_owner');
insert into public.devices (id, organization_id, branch_id, code, name, api_key_hash) values
  ('51111000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', '51110000-0000-4000-8000-000000000001', 'ANALYTICS_1', 'Analytics scale', repeat('c', 64));
insert into public.categories (id, organization_id, branch_id, name, cost_per_kg_dzd) values
  ('51111100-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', '51110000-0000-4000-8000-000000000001', 'Bread', 500);
insert into public.waste_reasons (id, organization_id, branch_id, name) values
  ('51111110-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', '51110000-0000-4000-8000-000000000001', 'Overproduction');
insert into public.waste_events (
  organization_id, branch_id, device_id, client_event_id, category_id, reason_id, weight_grams, source
) values (
  '51100000-0000-4000-8000-000000000001', '51110000-0000-4000-8000-000000000001',
  '51111000-0000-4000-8000-000000000001', '51111111-0000-4000-8000-000000000001',
  '51111100-0000-4000-8000-000000000001', '51111110-0000-4000-8000-000000000001', 1000, 'serial'
);
insert into public.daily_service_metrics (organization_id, branch_id, service_date, meal_count, created_by) values
  ('51100000-0000-4000-8000-000000000001', '51110000-0000-4000-8000-000000000001', current_date, 100, '51000000-0000-4000-8000-000000000001'),
  ('52200000-0000-4000-8000-000000000002', '52220000-0000-4000-8000-000000000002', current_date, 999, '52000000-0000-4000-8000-000000000002');

select ok((select relrowsecurity from pg_class where oid = 'public.daily_service_metrics'::regclass), 'service metrics have RLS enabled');
select ok(not has_table_privilege('anon', 'public.daily_service_metrics', 'select'), 'anonymous users cannot read service metrics');
select ok(has_table_privilege('authenticated', 'public.daily_service_metrics', 'insert'), 'authenticated managers can insert service metrics');
select ok(has_function_privilege('authenticated', 'public.get_operational_analytics(date,date,uuid,uuid,uuid)', 'execute'), 'authenticated users can execute analytics');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.daily_service_metrics), 1::bigint, 'owner sees only their service metrics');
select lives_ok(
  $$update public.daily_service_metrics set meal_count = 120, updated_at = now()
    where branch_id = '51110000-0000-4000-8000-000000000001'$$,
  'owner can update meal count in their organization'
);
select throws_ok(
  $$insert into public.daily_service_metrics (organization_id, branch_id, service_date, meal_count)
    values ('52200000-0000-4000-8000-000000000002', '52220000-0000-4000-8000-000000000002', current_date - 1, 50)$$,
  '42501',
  'new row violates row-level security policy for table "daily_service_metrics"',
  'owner cannot insert metrics into another tenant'
);
select is((public.get_operational_analytics(current_date, current_date, null, null, null)->>'total_cost_dzd')::numeric, 500::numeric, 'analytics calculate waste cost in DZD');
select is((public.get_operational_analytics(current_date, current_date, null, null, null)->>'meal_count')::bigint, 120::bigint, 'analytics include visible meal count');
select is((public.get_operational_analytics(current_date, current_date, null, null, null)->>'waste_grams_per_meal')::numeric, 8.3::numeric, 'analytics calculate grams per meal');

select * from finish();
rollback;
