create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  domain text not null,
  message text,
  created_at timestamptz not null default now(),
  constraint access_requests_email_normalized check (
    email = lower(btrim(email))
    and char_length(email) <= 320
    and position('@' in email) > 1
    and position('@' in substring(email from position('@' in email) + 1)) = 0
  ),
  constraint access_requests_domain_matches_email check (
    domain = split_part(email, '@', 2)
    and char_length(domain) between 3 and 253
    and domain !~ '[@[:space:]]'
    and position('.' in domain) > 1
  ),
  constraint access_requests_message_length check (
    message is null or char_length(message) <= 1000
  )
);

alter table public.access_requests enable row level security;

revoke all on table public.access_requests from public, anon, authenticated;
grant insert (email, domain, message) on table public.access_requests to anon, authenticated;

create policy "Anyone can submit an access request"
  on public.access_requests for insert to anon, authenticated
  with check (true);
