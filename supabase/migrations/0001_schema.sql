-- Boggle Together: schema, row security, room creation and joining.

create table public.rooms (
  code text primary key,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  round int not null default 0,
  start_at timestamptz,
  ends_at timestamptz,
  results_at timestamptz
);

create table public.participants (
  room_code text not null references public.rooms(code) on delete cascade,
  id uuid not null,
  kind text not null check (kind in ('household', 'typist')),
  name text not null check (char_length(name) between 1 and 24),
  ready boolean not null default false,
  pens_down boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_code, id)
);

create table public.boards (
  room_code text not null references public.rooms(code) on delete cascade,
  round int not null,
  letters text[] not null,
  primary key (room_code, round)
);

create table public.words (
  room_code text not null references public.rooms(code) on delete cascade,
  round int not null,
  participant_id uuid not null,
  word text not null,
  primary key (room_code, round, participant_id, word)
);

create index rooms_created_by_idx on public.rooms (created_by, created_at);
create index rooms_last_activity_idx on public.rooms (last_activity_at);

-- Membership check; security definer so policies do not recurse.
create function public.is_member(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.participants
    where room_code = p_code and id = auth.uid()
  );
$$;

create function public.results_open(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rooms where code = p_code and results_at is not null
  );
$$;

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.boards enable row level security;
alter table public.words enable row level security;

create policy rooms_member_read on public.rooms
  for select to authenticated using (public.is_member(code));
create policy participants_member_read on public.participants
  for select to authenticated using (public.is_member(room_code));
-- boards: deliberately no policy (no direct read).
create policy words_read on public.words
  for select to authenticated using (
    participant_id = auth.uid()
    or (public.is_member(room_code) and public.results_open(room_code))
  );

-- No direct writes: all mutation goes through security definer functions.
revoke all on public.rooms, public.participants, public.boards, public.words from anon, authenticated;
grant select on public.rooms, public.participants, public.words to authenticated;

revoke execute on function public.is_member(text), public.results_open(text) from public, anon;
grant execute on function public.is_member(text), public.results_open(text) to authenticated;

create function public.server_now() returns timestamptz
language sql stable security definer set search_path = public as $$
  select now();
$$;

create function public.room_exists(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms where code = upper(trim(p_code)));
$$;

create function public.create_room() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_words text[] := array[
    'OAK','ELM','ASH','BIRCH','MAPLE','PINE','CEDAR','FIR','SPRUCE','WILLOW','ALDER','BEECH',
    'HAZEL','ROWAN','YEW','LARCH','POPLAR','ASPEN','CHERRY','PLUM','APPLE','PEAR','FIG','OLIVE',
    'LINDEN','HOLLY','JUNIPER','HEMLOCK','SEQUOIA','REDWOOD','BALSA','TEAK','EBONY','MAHOGANY','WALNUT','PECAN',
    'CHESTNUT','HICKORY','SYCAMORE','CYPRESS','MAGNOLIA','DOGWOOD','BAOBAB','BANYAN','MANGO','LEMON','LIME','ORANGE',
    'PEACH','APRICOT','ACACIA','BAMBOO','PALM','COCOA','MULBERRY','LOCUST','TAMARACK','BUCKEYE','ELDER','SUMAC',
    'GINKGO','CATALPA','MESQUITE','LAUREL'];
  v_code text;
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if (select count(*) from public.rooms
      where created_by = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many rooms';
  end if;
  loop
    v_code := v_words[1 + floor(random() * array_length(v_words, 1))::int]
              || '-' || lpad(floor(random() * 100)::int::text, 2, '0');
    begin
      insert into public.rooms (code, created_by) values (v_code, v_uid);
      return v_code;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 50 then
        raise exception 'Could not allocate a room code';
      end if;
    end;
  end loop;
end;
$$;

create function public.join_room(p_code text, p_kind text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_name text := trim(p_name);
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if p_kind is null or p_kind not in ('household', 'typist') then
    raise exception 'Invalid kind';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 24 then
    raise exception 'Name must be 1 to 24 characters';
  end if;

  -- lock the room row so capacity checks are serialized
  perform 1 from public.rooms where code = v_code for update;
  if not found then
    raise exception 'Room not found';
  end if;

  if exists (select 1 from public.participants where room_code = v_code and id = v_uid) then
    update public.participants set name = v_name, kind = p_kind
      where room_code = v_code and id = v_uid;
  else
    if (select count(*) from public.participants where room_code = v_code) >= 24
       or (p_kind = 'household'
           and (select count(*) from public.participants
                where room_code = v_code and kind = 'household') >= 4) then
      raise exception 'Room is full';
    end if;
    insert into public.participants (room_code, id, kind, name)
      values (v_code, v_uid, p_kind, v_name);
  end if;

  update public.rooms set last_activity_at = now() where code = v_code;
end;
$$;

revoke execute on function public.server_now(), public.room_exists(text),
  public.create_room(), public.join_room(text, text, text) from public, anon;
grant execute on function public.server_now(), public.room_exists(text),
  public.create_room(), public.join_room(text, text, text) to authenticated;

alter publication supabase_realtime add table public.rooms, public.participants;
