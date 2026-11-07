begin;
select plan(27);

-- Fixed users (id equals auth.uid())
-- u1 creates/joins, u2 is an outsider, u3.. fill rooms.
create temp table ctx (k text primary key, v text);
grant all on ctx to authenticated;

select has_table('public', 'rooms', 'rooms exists');
select has_table('public', 'participants', 'participants exists');
select has_table('public', 'boards', 'boards exists');
select has_table('public', 'words', 'words exists');

-- act as user 1
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into ctx select 'code', public.create_room();

select matches((select v from ctx where k = 'code'), '^[A-Z]+-[0-9]{2}$', 'create_room returns WORD-NN');

reset role;
select is((select count(*)::int from public.rooms where code = (select v from ctx where k = 'code')), 1, 'create_room creates a room row');
select is((select count(*)::int from public.participants), 0, 'creator is not automatically a participant');

set local role authenticated;
select lives_ok(
  $$select public.join_room(lower('  ' || (select v from ctx where k = 'code') || ' '), 'household', 'Lates')$$,
  'join_room trims and uppercases the code');
select is((select count(*)::int from public.participants), 1, 'member sees own participant row');
select is((select count(*)::int from public.rooms), 1, 'member sees the room');
select is(public.room_exists(' ' || lower((select v from ctx where k = 'code'))), true, 'room_exists true');
select is(public.room_exists('NOPE-00'), false, 'room_exists false');

select throws_ok($$select public.join_room('NOPE-00', 'household', 'X')$$, null, 'Room not found', 'unknown room refused');

-- outsider sees nothing
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.rooms), 0, 'non-member sees no rooms');
select is((select count(*)::int from public.participants), 0, 'non-member sees no participants');

-- name length (after trim)
select throws_ok($$select public.join_room((select v from ctx where k = 'code'), 'household', '   ')$$, null, 'Name must be 1 to 24 characters', 'blank name refused');
select throws_ok($$select public.join_room((select v from ctx where k = 'code'), 'household', repeat('x', 25))$$, null, 'Name must be 1 to 24 characters', '25-char name refused');

-- valid names: exactly 24 chars, and padded (trimmed before the length check)
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}';
select lives_ok($$select public.join_room((select v from ctx where k = 'code'), 'typist', repeat('y', 24))$$, '24-char name accepted');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000006","role":"authenticated"}';
select lives_ok($$select public.join_room((select v from ctx where k = 'code'), 'typist', '  ' || repeat('z', 24) || '  ')$$, 'padded 24-char name accepted');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- capacity: fill to 4 households as superuser, then a 5th is refused
reset role;
insert into public.participants (room_code, id, kind, name)
select (select v from ctx where k = 'code'), ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'household', 'H' || i
from generate_series(2, 4) i;
set local role authenticated;
select throws_ok($$select public.join_room((select v from ctx where k = 'code'), 'household', 'Fifth')$$, null, 'Room is full', '5th household refused');
select lives_ok($$select public.join_room((select v from ctx where k = 'code'), 'typist', 'Typer')$$, 'typist still allowed with 4 households');

-- rejoin keeps the stored kind (cannot sneak past the household cap) but updates the name
select lives_ok($$select public.join_room((select v from ctx where k = 'code'), 'household', 'Renamed')$$, 'rejoin does not raise');
select is((select kind from public.participants where id = '00000000-0000-0000-0000-000000000002'), 'typist', 'rejoin keeps stored kind');
select is((select name from public.participants where id = '00000000-0000-0000-0000-000000000002'), 'Renamed', 'rejoin updates name');

-- fill to 24 total, 25th refused
reset role;
insert into public.participants (room_code, id, kind, name)
select (select v from ctx where k = 'code'), ('00000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid, 'typist', 'T' || i
from generate_series(1, 17) i;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000399","role":"authenticated"}';
select throws_ok($$select public.join_room((select v from ctx where k = 'code'), 'typist', 'Late')$$, null, 'Room is full', '25th participant refused');

-- rate limit: user 7 already may create 10 per hour
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000007","role":"authenticated"}';
select lives_ok($$select public.create_room() from generate_series(1, 10)$$, '10 rooms in an hour allowed');
select throws_ok($$select public.create_room()$$, null, 'Too many rooms', '11th room refused');

select * from finish();
rollback;
