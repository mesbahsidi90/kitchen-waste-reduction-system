create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_name text not null check (char_length(trim(restaurant_name)) between 2 and 120),
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  phone text not null check (char_length(trim(phone)) between 8 and 24),
  email text check (email is null or char_length(trim(email)) between 5 and 254),
  city text not null check (char_length(trim(city)) between 2 and 100),
  branch_count integer not null default 1 check (branch_count between 1 and 1000),
  preferred_language text not null default 'ar' check (preferred_language in ('ar', 'fr', 'en')),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now()
);

create index demo_requests_status_created_at_idx
  on public.demo_requests (status, created_at desc);

alter table public.demo_requests enable row level security;

-- Demo requests are accepted only through the validated server endpoint.
-- Browser roles receive no direct table privileges and no RLS policy.
revoke all on table public.demo_requests from public, anon, authenticated;
grant select, insert, update on table public.demo_requests to service_role;

comment on table public.demo_requests is
  'Inbound demo requests submitted through the public Kitzon landing page.';
