alter table public.profiles add column email text;

update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.id;

alter table public.profiles
  alter column email set not null,
  add constraint profiles_email_normalized check (email = lower(email)),
  add constraint profiles_email_unique unique (email);

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_color, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 60),
    (array['#d9b8a7', '#b9c9b8', '#c5bdd7', '#e7c78e', '#a9c8d3', '#d9adc0'])[1 + floor(random() * 6)::int],
    lower(new.email)
  );
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(new.email)
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

revoke all on function public.sync_profile_email() from public;
