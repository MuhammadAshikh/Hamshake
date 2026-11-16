create extension if not exists pgcrypto;

create table public.allowed_email_domains (
  domain text primary key,
  created_at timestamptz not null default now(),
  constraint allowed_email_domains_normalized check (
    domain = lower(domain)
    and domain !~ '[@[:space:]]'
    and position('.' in domain) > 1
  )
);

alter table public.allowed_email_domains enable row level security;

create or replace function public.is_email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_email_domains d
    where lower(split_part(trim(p_email), '@', 2)) = d.domain
      and split_part(trim(p_email), '@', 1) <> ''
      and split_part(trim(p_email), '@', 3) = ''
  );
$$;

revoke all on function public.is_email_domain_allowed(text) from public;
grant execute on function public.is_email_domain_allowed(text) to anon, authenticated;

create or replace function public.enforce_allowed_signup_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not public.is_email_domain_allowed(new.email) then
    raise exception 'Sign-up is only available to invited email domains'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_allowed_signup_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_allowed_signup_domain();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  avatar_color text not null default '#d9b8a7',
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_color)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    (array['#d9b8a7', '#b9c9b8', '#c5bdd7', '#e7c78e', '#a9c8d3', '#d9adc0'])[1 + floor(random() * 6)::int]
  );
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_user();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  is_group boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_conversation_name check (not is_group or name is not null)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
create index conversation_members_user_idx
  on public.conversation_members (user_id, conversation_id);

create or replace function public.start_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to start a conversation';
  end if;
  if other_user_id is null or other_user_id = current_user_id then
    raise exception 'Choose another person to start a conversation';
  end if;
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

  if conversation_id is null then
    insert into public.conversations (created_by)
    values (current_user_id)
    returning id into conversation_id;

    insert into public.conversation_members (conversation_id, user_id)
    values (conversation_id, current_user_id), (conversation_id, other_user_id);
  end if;
  return conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_after_message();

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "Profiles are visible to signed-in members"
  on public.profiles for select to authenticated using (true);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members can view their conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "Members can view conversation participants"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_members.conversation_id));

create policy "Members can read conversation messages"
  on public.messages for select to authenticated
  using (public.is_conversation_member(messages.conversation_id));

create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(messages.conversation_id)
  );

grant select on public.profiles to authenticated;
grant update (display_name, avatar_color) on public.profiles to authenticated;
grant select on public.conversations, public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

alter publication supabase_realtime add table public.messages;

-- Add one or more domains after applying this migration, for example:
-- insert into public.allowed_email_domains (domain) values ('example.org');
