begin;
select plan(11);

-- The word list is read from create_room itself, so this test holds no copy of it (the client copy
-- in src/lib/roomCode.ts is checked against the migration file by src/lib/roomWords.test.ts).
create temp table words_new (w text primary key);
insert into words_new
  select unnest(regexp_match(pg_get_functiondef('public.create_room()'::regprocedure), 'v_words text\[\] := array\[([^\]]*)\]'))
  as list
  on conflict do nothing;
-- split the captured "'OAK','ELM',..." text into rows
create temp table words_split as
  select trim(both '''' from regexp_replace(x, '\s', '', 'g')) as w
  from words_new, regexp_split_to_table(words_new.w, ',') as x;
delete from words_new;
insert into words_new select w from words_split;
create temp table codes (c text);
grant all on words_new, codes to authenticated;

select is((select count(*)::int from words_new), 100, 'create_room has 100 words');
select is((select count(*)::int from words_new where w !~ '^[A-Z]{2,8}$'), 0, 'all words are 2 to 8 capital letters');
select ok(exists (select 1 from words_new where w = 'PECAN'), 'PECAN is a word');
select is(
  (select count(*)::int from words_new where w in (
    'FIR', 'YEW', 'PINE', 'BEECH', 'MAHOGANY',
    'SPROUT', 'GARLIC', 'MUSHROOM', 'OKRA', 'ASH', 'IRIS', 'LARCH', 'FENNEL', 'GINGER', 'FIG', 'DATE', 'PEBBLE',
    'SEAWEED', 'CRESS', 'IVY', 'ELM', 'CHIVE')),
  0, 'retired and sound-alike words are not in the list');

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
  0, 'every generated word comes from the list');
select cmp_ok(
  (select count(distinct split_part(c, '-', 1))::int from codes), '>', 50,
  'codes draw from across the whole list');

-- still security definer, pinned search_path, callable only when signed in
select is((select prosecdef from pg_proc where oid = 'public.create_room()'::regprocedure), true, 'create_room is security definer');
select is((select proconfig from pg_proc where oid = 'public.create_room()'::regprocedure), array['search_path=public'], 'create_room pins search_path');
select is(has_function_privilege('anon', 'public.create_room()', 'execute'), false, 'create_room not callable by anon');

select * from finish();
rollback;
