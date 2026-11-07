begin;
select plan(9);

-- The spoken-friendly room-code words (0005). Must equal src/lib/roomCode.ts ROOM_WORDS.
create temp table words_new (w text primary key);
insert into words_new select unnest(array[
  'OAK','ELM','ASH','BIRCH','MAPLE','SPRUCE','WILLOW','HAZEL','LARCH','ASPEN',
  'LINDEN','HOLLY','LAUREL','REDWOOD','TEAK','PALM','BAMBOO','BONSAI','SAPLING','STUMP',
  'BARK','WALNUT','PECAN','CASHEW','NUTMEG','ACORN','HUSK','CHERRY','FIG','OLIVE',
  'MANGO','LEMON','LIME','ORANGE','PEACH','GRAPE','KIWI','DATE','CLOVER','TULIP',
  'DAISY','LILAC','IRIS','POPPY','LOTUS','HEATHER','BLUEBELL','BRAMBLE','CACTUS','FERN',
  'MOSS','IVY','BLOSSOM','BUD','LEAF','POLLEN','NECTAR','SAGE','MINT','DILL',
  'CHIVE','FENNEL','GINGER','PEPPER','MUSTARD','RADISH','BEAN','SQUASH','PUMPKIN','KALE',
  'ONION','GARLIC','PARSNIP','CABBAGE','SPINACH','OKRA','YAM','MUSHROOM','WHEAT','BARLEY',
  'RICE','COTTON','FLAX','COFFEE','SPROUT','BRANCH','GARDEN','MEADOW','ORCHARD','GROVE',
  'FOREST','HEDGE','HARVEST','SOIL','MULCH','COMPOST','PEBBLE','SHOVEL','BUCKET','WAGON']);
create temp table codes (c text);
grant all on words_new, codes to authenticated;

select is((select count(*)::int from words_new), 100, 'the test list has 100 words');

-- 30 users x 10 rooms each (the per-user hourly limit) = 300 generated codes
set local role authenticated;
do $$
begin
  for u in 1..30 loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', '00000000-0000-0000-0000-0000000005' || lpad(u::text, 2, '0'), 'role', 'authenticated')::text, true);
    for i in 1..10 loop
      insert into codes select public.create_room();
    end loop;
  end loop;
end;
$$;
reset role;

select is((select count(*)::int from codes), 300, '300 rooms created');
select is((select count(*)::int from codes where c !~ '^[A-Z]+-[0-9]{4}$'), 0, 'every code is WORD-NNNN');
select is(
  (select count(*)::int from codes where split_part(c, '-', 1) not in (select w from words_new)),
  0, 'every generated word comes from the new list');
select cmp_ok(
  (select count(distinct split_part(c, '-', 1))::int from codes), '>', 50,
  'codes draw from across the whole list');
select is(
  (select count(*)::int from codes where split_part(c, '-', 1) in ('FIR', 'YEW', 'PINE', 'BEECH', 'MAHOGANY')),
  0, 'retired words are not generated');

-- still security definer, pinned search_path, callable only when signed in
select is((select prosecdef from pg_proc where oid = 'public.create_room()'::regprocedure), true, 'create_room is security definer');
select is((select proconfig from pg_proc where oid = 'public.create_room()'::regprocedure), array['search_path=public'], 'create_room pins search_path');
select is(has_function_privilege('anon', 'public.create_room()', 'execute'), false, 'create_room not callable by anon');

select * from finish();
rollback;
