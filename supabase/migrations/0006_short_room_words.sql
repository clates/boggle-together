-- Room codes are said aloud, so shorter is better: every word is now five letters or fewer
-- (BEETROOT, PRIMROSE and the like are gone). Same rules as 0005: easy to spell after hearing it, no
-- homophones or near-rhymes, nothing that sounds like a letter or a number, all nature words.
-- Same behavior as 0005 otherwise. Existing rooms keep their codes (codes are plain strings).
-- Keep this list identical to ROOM_WORDS in src/lib/roomCode.ts (a unit test checks it).
create or replace function public.create_room() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_words text[] := array[
    'OAK','BIRCH','MAPLE','HAZEL','SHRUB','ASPEN','HOLLY','TEAK','PALM','STUMP',
    'BARK','PECAN','ACORN','HUSK','FIELD','OLIVE','MANGO','LEMON','LIME','PEACH',
    'GRAPE','KIWI','TULIP','DAISY','LILAC','POPPY','LOTUS','FERN','MOSS','FROG',
    'BUD','LEAF','SAGE','MINT','DILL','STRAW','LAWN','BEAN','KALE','ONION',
    'YAM','WHEAT','RICE','FLAX','GROVE','HEDGE','SOIL','MULCH','ALDER','CEDAR',
    'ROWAN','APPLE','BASIL','ASTER','ROBIN','FINCH','OTTER','WREN','LAKE','POND',
    'BROOK','CREEK','RIVER','MARSH','GLADE','GLEN','CLIFF','DUNE','RIDGE','COVE',
    'MESA','CLOUD','FROST','STORM','MOON','SAND','CORN','OATS','HONEY','PRUNE',
    'GOURD','CAPER','CHARD','GUAVA','CAROB','TANSY','SEDGE','TWIG','STEM','HERON',
    'EAGLE','PEONY','CLOVE','ELK','LARK','SWAN','OWL','CRANE','RAVEN','THORN'];
  v_code text;
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  -- serialize per user so parallel calls cannot exceed the limit
  perform pg_advisory_xact_lock(hashtextextended('create_room:' || v_uid::text, 0));
  if (select count(*) from public.rooms
      where created_by = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many rooms';
  end if;
  loop
    v_code := v_words[1 + floor(random() * array_length(v_words, 1))::int]
              || '-' || lpad(floor(random() * 10000)::int::text, 4, '0');  -- 1,000,000 codes
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

-- create or replace keeps the existing grants; restate them so this file stands on its own.
revoke execute on function public.create_room() from public, anon;
grant execute on function public.create_room() to authenticated;
