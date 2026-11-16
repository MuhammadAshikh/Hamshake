create table public.conversation_domain_monthly_usage (
  domain text not null,
  month_start date not null,
  initiation_count integer not null default 0
    check (initiation_count between 0 and 50),
  primary key (domain, month_start)
);

alter table public.conversation_domain_monthly_usage enable row level security;
revoke all on table public.conversation_domain_monthly_usage from public, anon, authenticated;

create or replace function public.start_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
  initiating_domain text;
  quota_month_start date := (date_trunc('month', now() at time zone 'UTC'))::date;
  initiation_count integer;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to start a conversation';
  end if;
  if other_user_id is null or other_user_id = current_user_id then
    raise exception 'Choose another person to start a conversation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      least(current_user_id::text, other_user_id::text) || ':' ||
      greatest(current_user_id::text, other_user_id::text),
      1
    )
  );

  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'That person could not be found';
  end if;

  select c.id into conversation_id
  from public.conversations c
  where c.is_group = false
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = current_user_id
    )
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = other_user_id
    )
    and (
      select count(*) from public.conversation_members m
      where m.conversation_id = c.id
    ) = 2
  limit 1;

  if conversation_id is not null then
    return conversation_id;
  end if;

  select lower(split_part(u.email, '@', 2))
  into initiating_domain
  from auth.users u
  where u.id = current_user_id;

  if initiating_domain is null or initiating_domain = '' then
    raise exception 'Your account email must have a valid domain to start a conversation';
  end if;

  insert into public.conversation_domain_monthly_usage as usage (domain, month_start, initiation_count)
  values (initiating_domain, quota_month_start, 1)
  on conflict (domain, month_start) do update
    set initiation_count = usage.initiation_count + 1
    where usage.initiation_count < 50
  returning usage.initiation_count into initiation_count;

  if not found then
    raise exception 'Your email domain has reached its limit of 50 new conversations this month. You can start more next month.';
  end if;

  insert into public.conversations (created_by)
  values (current_user_id)
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, current_user_id), (conversation_id, other_user_id);

  return conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
