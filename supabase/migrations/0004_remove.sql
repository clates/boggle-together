-- Boggle Together: remove a participant (a phantom household, an intruder) or leave the room.
-- Any household may remove anyone, including itself; a typist may only remove itself.
-- After the removal the round re-checks the same conditions as set_ready / pens_down, so a
-- household that is gone can no longer hold up the start or the results.

create function public.remove_participant(p_code text, p_participant uuid) returns void
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

  -- lock the room row first: serializes with join, ready, start and pens down
  select * into v_room from public.rooms where code = v_code for update;
  if not found then
    raise exception 'Not in room';
  end if;
  select kind into v_kind from public.participants where room_code = v_code and id = v_uid;
  if v_kind is null then
    raise exception 'Not in room';
  end if;
  if v_kind <> 'household' and p_participant is distinct from v_uid then
    raise exception 'Households only';
  end if;

  delete from public.participants where room_code = v_code and id = p_participant;
  if not found then
    return; -- already gone (double tap): nothing to do
  end if;
  delete from public.words where room_code = v_code and round = v_room.round and participant_id = p_participant;
  update public.rooms set last_activity_at = now() where code = v_code;

  if not exists (select 1 from public.participants where room_code = v_code and kind = 'household') then
    return; -- no households left: nothing to start or confirm
  end if;

  if v_room.start_at is null or v_room.results_at is not null then
    -- lobby or results: start once every remaining household is ready
    if not exists (
      select 1 from public.participants where room_code = v_code and kind = 'household' and not ready
    ) then
      perform public.start_round(v_code);
    end if;
  elsif now() >= v_room.ends_at then
    -- locked: open results once every remaining household has put pens down
    if not exists (
      select 1 from public.participants where room_code = v_code and kind = 'household' and not pens_down
    ) then
      update public.rooms set results_at = now() where code = v_code;
    end if;
  end if;
end;
$$;

revoke execute on function public.remove_participant(text, uuid) from public, anon, authenticated;
grant execute on function public.remove_participant(text, uuid) to authenticated;
