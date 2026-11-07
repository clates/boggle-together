-- Boggle Together: round lifecycle (ready, start, board, words, pens down, results).
-- Phase is derived from timestamps, never stored:
--   lobby = start_at is null; results = results_at is not null;
--   countdown = now() < start_at; playing = now() < ends_at; otherwise locked.

-- The 16 standard Boggle dice, one die per row. 'Qu' is a single face.
create function public.boggle_dice() returns table (die int, faces text[])
language sql immutable set search_path = public as $$
  select * from (values
    (1,  array['A','A','E','E','G','N']),
    (2,  array['E','L','R','T','T','Y']),
    (3,  array['A','O','O','T','T','W']),
    (4,  array['A','B','B','J','O','O']),
    (5,  array['E','H','R','T','V','W']),
    (6,  array['C','I','M','O','T','U']),
    (7,  array['D','I','S','T','T','Y']),
    (8,  array['E','I','O','S','S','T']),
    (9,  array['D','E','L','R','V','Y']),
    (10, array['A','C','H','O','P','S']),
    (11, array['H','I','M','N','Qu','U']),
    (12, array['E','E','I','N','S','U']),
    (13, array['E','E','G','H','N','W']),
    (14, array['A','F','F','K','P','S']),
    (15, array['H','L','N','N','R','Z']),
    (16, array['D','E','I','L','R','X'])
  ) d(die, faces);
$$;

-- One roll: dice in shuffled board order, one random face each.
create function public.boggle_roll() returns table (pos int, die int, face text)
language plpgsql volatile set search_path = public as $$
begin
  return query
    select (row_number() over (order by s.k))::int, s.die, s.face
    from (
      select d.die, d.faces[1 + floor(random() * 6)::int] as face, random() as k
      from public.boggle_dice() d
    ) s
    order by s.k;
end;
$$;

create function public.generate_board() returns text[]
language sql volatile set search_path = public as $$
  select array_agg(face order by pos) from public.boggle_roll();
$$;

-- Internal: starts a new round. Idempotent under races.
create function public.start_round(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room public.rooms;
  v_countdown int := coalesce(nullif(current_setting('boggle.countdown_seconds', true), '')::int, 5);
  v_length int := coalesce(nullif(current_setting('boggle.round_seconds', true), '')::int, 180);
begin
  select * into v_room from public.rooms where code = p_code for update;
  if not found then
    return;
  end if;
  -- a round is already counting down or being played: nothing to do
  if v_room.start_at is not null and v_room.results_at is null then
    return;
  end if;

  delete from public.words where room_code = p_code;
  delete from public.boards where room_code = p_code;

  update public.rooms set
    round = round + 1,
    start_at = now() + make_interval(secs => v_countdown),
    ends_at = now() + make_interval(secs => v_countdown + v_length),
    results_at = null,
    last_activity_at = now()
  where code = p_code;

  insert into public.boards (room_code, round, letters)
    values (p_code, v_room.round + 1, public.generate_board());

  update public.participants set ready = false, pens_down = false where room_code = p_code;
end;
$$;

create function public.set_ready(p_code text, p_ready boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room public.rooms;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select kind into v_kind from public.participants where room_code = v_code and id = v_uid;
  if v_kind is null then
    raise exception 'Not in room';
  end if;
  if v_kind <> 'household' then
    raise exception 'Households only';
  end if;

  select * into v_room from public.rooms where code = v_code for update;
  if v_room.start_at is not null and v_room.results_at is null then
    raise exception 'Round already in progress';
  end if;

  update public.participants set ready = coalesce(p_ready, false)
    where room_code = v_code and id = v_uid;
  update public.rooms set last_activity_at = now() where code = v_code;

  if not exists (
    select 1 from public.participants
    where room_code = v_code and kind = 'household' and not ready
  ) then
    perform public.start_round(v_code);
  end if;
end;
$$;

create function public.start_anyway(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room public.rooms;
  v_kind text;
  v_total int;
  v_ready int;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select kind into v_kind from public.participants where room_code = v_code and id = v_uid;
  if v_kind is null then
    raise exception 'Not in room';
  end if;
  if v_kind <> 'household' then
    raise exception 'Households only';
  end if;

  select * into v_room from public.rooms where code = v_code for update;
  if v_room.start_at is not null and v_room.results_at is null then
    raise exception 'Round already in progress';
  end if;

  select count(*), count(*) filter (where ready) into v_total, v_ready
    from public.participants where room_code = v_code and kind = 'household';
  if v_ready * 2 < v_total then
    raise exception 'Not enough households ready';
  end if;

  update public.rooms set last_activity_at = now() where code = v_code;
  perform public.start_round(v_code);
end;
$$;

create function public.get_board(p_code text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  v_code text := upper(trim(p_code));
  v_room public.rooms;
begin
  if not public.is_member(v_code) then
    raise exception 'Not in room';
  end if;
  select * into v_room from public.rooms where code = v_code;
  if v_room.start_at is null or now() < v_room.start_at then
    return null;
  end if;
  return (select letters from public.boards where room_code = v_code and round = v_room.round);
end;
$$;

create function public.submit_word(p_code text, p_word text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_word text := upper(trim(coalesce(p_word, '')));
  v_room public.rooms;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select kind into v_kind from public.participants where room_code = v_code and id = v_uid;
  if v_kind is null then
    raise exception 'Not in room';
  end if;
  if v_kind <> 'typist' then
    raise exception 'Typists only';
  end if;

  -- serialize per participant so the word limit cannot be exceeded in parallel
  perform pg_advisory_xact_lock(hashtextextended('submit_word:' || v_code || v_uid::text, 0));

  select * into v_room from public.rooms where code = v_code;
  if v_room.start_at is null or now() < v_room.start_at then
    raise exception 'Not started';
  end if;
  if v_room.results_at is not null or now() > v_room.ends_at + interval '2 seconds' then
    raise exception 'Too late';
  end if;
  if v_word !~ '^[A-Z]{3,20}$' then
    raise exception 'Invalid word';
  end if;

  if exists (
    select 1 from public.words
    where room_code = v_code and round = v_room.round and participant_id = v_uid and word = v_word
  ) then
    return;
  end if;
  if (select count(*) from public.words
      where room_code = v_code and round = v_room.round and participant_id = v_uid) >= 300 then
    raise exception 'Word limit reached';
  end if;

  insert into public.words (room_code, round, participant_id, word)
    values (v_code, v_room.round, v_uid, v_word)
    on conflict do nothing;
  update public.rooms set last_activity_at = now() where code = v_code;
end;
$$;

create function public.pens_down(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room public.rooms;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select kind into v_kind from public.participants where room_code = v_code and id = v_uid;
  if v_kind is null then
    raise exception 'Not in room';
  end if;
  if v_kind <> 'household' then
    raise exception 'Households only';
  end if;

  select * into v_room from public.rooms where code = v_code for update;
  if v_room.results_at is not null then
    raise exception 'Results already shown';
  end if;
  if v_room.start_at is null or now() < v_room.ends_at then
    raise exception 'Round not over';
  end if;

  update public.participants set pens_down = true where room_code = v_code and id = v_uid;
  if not exists (
    select 1 from public.participants
    where room_code = v_code and kind = 'household' and not pens_down
  ) then
    update public.rooms set results_at = now() where code = v_code;
  end if;
  update public.rooms set last_activity_at = now() where code = v_code;
end;
$$;

create function public.show_results(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_room public.rooms;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select kind into v_kind from public.participants where room_code = v_code and id = v_uid;
  if v_kind is null then
    raise exception 'Not in room';
  end if;
  if v_kind <> 'household' then
    raise exception 'Households only';
  end if;

  select * into v_room from public.rooms where code = v_code for update;
  if v_room.results_at is not null then
    raise exception 'Results already shown';
  end if;
  if v_room.start_at is null then
    raise exception 'Round not over';
  end if;
  if now() < v_room.ends_at + interval '30 seconds' then
    raise exception 'Too early';
  end if;

  update public.rooms set results_at = now(), last_activity_at = now() where code = v_code;
end;
$$;

revoke execute on function
  public.boggle_dice(), public.boggle_roll(), public.generate_board(), public.start_round(text),
  public.set_ready(text, boolean), public.start_anyway(text), public.get_board(text),
  public.submit_word(text, text), public.pens_down(text), public.show_results(text)
  from public, anon, authenticated;
grant execute on function
  public.set_ready(text, boolean), public.start_anyway(text), public.get_board(text),
  public.submit_word(text, text), public.pens_down(text), public.show_results(text)
  to authenticated;
