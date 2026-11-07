-- Room codes are mostly read out loud on a call ("pecan 2654"), so the words are chosen to be
-- heard once and typed right: one or two syllables, plain spelling, no homophones (fir/fur,
-- yew/you, beech/beach), no near-rhymes or look-alike pairs, all from the tree/plant/garden theme.
-- Same behavior as 0001 otherwise. Existing rooms keep their codes (codes are plain strings).
-- Keep this list identical to ROOM_WORDS in src/lib/roomCode.ts (a unit test checks it).
create or replace function public.create_room() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_words text[] := array[
    'OAK','ELM','ASH','BIRCH','MAPLE','SPRUCE','WILLOW','HAZEL','LARCH','ASPEN',
    'LINDEN','HOLLY','LAUREL','REDWOOD','TEAK','PALM','BAMBOO','BONSAI','SAPLING','STUMP',
    'BARK','WALNUT','PECAN','CASHEW','NUTMEG','ACORN','HUSK','CHERRY','FIG','OLIVE',
    'MANGO','LEMON','LIME','ORANGE','PEACH','GRAPE','KIWI','DATE','CLOVER','TULIP',
    'DAISY','LILAC','IRIS','POPPY','LOTUS','HEATHER','BLUEBELL','BRAMBLE','CACTUS','FERN',
    'MOSS','IVY','BLOSSOM','BUD','LEAF','POLLEN','NECTAR','SAGE','MINT','DILL',
    'CHIVE','FENNEL','GINGER','PEPPER','MUSTARD','RADISH','BEAN','SQUASH','PUMPKIN','KALE',
    'ONION','GARLIC','PARSNIP','CABBAGE','SPINACH','OKRA','YAM','MUSHROOM','WHEAT','BARLEY',
    'RICE','COTTON','FLAX','COFFEE','SPROUT','BRANCH','GARDEN','MEADOW','ORCHARD','GROVE',
    'FOREST','HEDGE','HARVEST','SOIL','MULCH','COMPOST','PEBBLE','SHOVEL','BUCKET','WAGON'];
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
