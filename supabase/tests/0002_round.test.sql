begin;
select plan(77);

-- Fixtures: room A (4 households a1-a4, typists b1,b2), room B (4 households, typist b1)
insert into public.rooms (code, created_by) values ('ROOM-A', '00000000-0000-0000-0000-0000000000a1'), ('ROOM-B', '00000000-0000-0000-0000-0000000000a1');
insert into public.participants (room_code, id, kind, name)
select r, ('00000000-0000-0000-0000-0000000000a' || i)::uuid, 'household', 'H' || i
from unnest(array['ROOM-A','ROOM-B']) r, generate_series(1, 4) i;
insert into public.participants (room_code, id, kind, name) values
  ('ROOM-A', '00000000-0000-0000-0000-0000000000b1', 'typist', 'T1'), ('ROOM-A', '00000000-0000-0000-0000-0000000000b2', 'typist', 'T2'), ('ROOM-B', '00000000-0000-0000-0000-0000000000b1', 'typist', 'T1');

-- privileges
select is(has_function_privilege('authenticated', 'public.start_round(text)', 'execute'), false, 'start_round not callable by authenticated');
select is(has_function_privilege('anon', 'public.set_ready(text, boolean)', 'execute'), false, 'set_ready not callable by anon');
select is(has_function_privilege('authenticated', 'public.set_ready(text, boolean)', 'execute'), true, 'set_ready callable by authenticated');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select * from public.boards$$, '42501', null, 'clients cannot read boards');
-- lobby rules in room B
select throws_ok($$select public.set_ready('ROOM-X', true)$$, null, 'Not in room', 'non-member set_ready refused');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.set_ready('ROOM-B', true)$$, null, 'Households only', 'typist set_ready refused');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-B', true)$$, 'household a1 ready in B');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$select public.start_anyway('ROOM-B')$$, null, 'Not enough households ready', 'start_anyway refused with 1 of 4 ready');
select lives_ok($$select public.set_ready('ROOM-B', true)$$, 'household a2 ready in B');
select lives_ok($$select public.start_anyway('ROOM-B')$$, 'start_anyway accepted with 2 of 4 ready');
reset role;
select is((select round from public.rooms where code = 'ROOM-B'), 1, 'start_anyway started round 1');
select is((select count(*)::int from public.participants where ready or pens_down), 0, 'ready and pens_down cleared on start');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.start_anyway('ROOM-B')$$, null, 'Round already in progress', 'start_anyway refused mid-round');
-- room A: all households ready starts a round
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a1 ready');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a2 ready');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a3 ready');
reset role;
select is((select round from public.rooms where code = 'ROOM-A'), 0, 'three of four ready does not start');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a4 ready starts the round');
reset role;
select is((select round from public.rooms where code = 'ROOM-A'), 1, 'round = 1');
select ok((select start_at - now() = interval '5 seconds' from public.rooms where code = 'ROOM-A'), 'start_at is 5 s ahead');
select ok((select ends_at - start_at = interval '180 seconds' from public.rooms where code = 'ROOM-A'), 'ends_at - start_at = 180 s');
select is((select count(*)::int from public.boards where room_code = 'ROOM-A' and round = 1 and array_length(letters, 1) = 16), 1, 'board stored with 16 tiles');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select throws_ok($$select public.set_ready('ROOM-A', true)$$, null, 'Round already in progress', 'repeat set_ready refused once started');
reset role;
select lives_ok($$select public.start_round('ROOM-A'); select public.start_round('ROOM-A')$$, 'start_round twice does not raise');
select is((select round from public.rooms where code = 'ROOM-A'), 1, 'round still 1 after racing start_round');
-- get_board
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(public.get_board('ROOM-A'), null, 'get_board null during countdown');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
select throws_ok($$select public.get_board('ROOM-A')$$, null, 'Not in room', 'non-member get_board refused');
reset role;
update public.rooms set start_at = now() - interval '1 second', ends_at = now() + interval '179 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(array_length(public.get_board('ROOM-A'), 1), 16, 'get_board returns 16 tiles once started');
select is((select count(*)::int from unnest(public.get_board('ROOM-A')) t where t !~ '^([A-Z]|Qu)$'), 0, 'every tile is a letter or Qu');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(array_length(public.get_board('ROOM-A'), 1), 16, 'households can read the board too');
reset role;
-- dice
select is((select count(*)::int from public.boggle_dice() where array_length(faces, 1) = 6), 16, '16 dice with 6 faces');
select is((select count(*)::int from public.boggle_dice(), unnest(faces) f where f = 'Qu'), 1, 'exactly one Qu face');
create temp table rolls (g int, pos int, die int, face text);
do $$ begin
  for i in 1..1000 loop
    insert into rolls select i, pos, die, face from public.boggle_roll();
  end loop;
end $$;
select is((
  select count(*)::int from (
    select r.g from rolls r join public.boggle_dice() d on d.die = r.die
    group by r.g
    having count(*) = 16 and count(distinct r.die) = 16 and bool_and(r.face = any (d.faces))
  ) ok), 1000, '1000 boards each use one face from each of the 16 dice');
select cmp_ok((select count(distinct arr)::int from (select array_agg(face order by pos) arr from rolls group by g) b), '>', 900, 'the 1000 boards are independently generated (over 900 distinct)');
select cmp_ok((select count(distinct public.generate_board())::int from generate_series(1, 200)), '>', 150, 'boards are shuffled');
select is(has_function_privilege('authenticated', 'public.generate_board()', 'execute'), false, 'generate_board not callable by clients');
-- submit_word
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$select public.submit_word('ROOM-A', '  train ')$$, 'accepts padded word');
select is((select word from public.words where participant_id = '00000000-0000-0000-0000-0000000000b1'), 'TRAIN', 'stored normalized');
select throws_ok($$select public.submit_word('ROOM-A', 'ab')$$, null, 'Invalid word', 'rejects too short');
select throws_ok($$select public.submit_word('ROOM-A', 'tr4in')$$, null, 'Invalid word', 'rejects non-letters');
select throws_ok($$select public.submit_word('ROOM-A', 'aaaaaaaaaaaaaaaaaaaaa')$$, null, 'Invalid word', 'rejects 21 letters');
select throws_ok($$select public.submit_word('ROOM-A', '')$$, null, 'Invalid word', 'rejects empty');
select lives_ok($$select public.submit_word('ROOM-A', 'TRAIN')$$, 'duplicate ignored');
select is((select count(*)::int from public.words where participant_id = '00000000-0000-0000-0000-0000000000b1'), 1, 'still one word after duplicate');
select lives_ok($$select public.submit_word('ROOM-A', 'aaaaaaaaaaaaaaaaaaaa')$$, '20 letters accepted');
select is((select count(*)::int from public.words where participant_id = '00000000-0000-0000-0000-0000000000b1'), 2, 'two words stored');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.submit_word('ROOM-A', 'house')$$, null, 'Typists only', 'household submit refused');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
select throws_ok($$select public.submit_word('ROOM-A', 'house')$$, null, 'Not in room', 'non-member submit refused');
reset role;
update public.rooms set start_at = now() + interval '3 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.submit_word('ROOM-A', 'early')$$, null, 'Not started', 'refused before start_at');
reset role;
update public.rooms set start_at = now() - interval '200 seconds', ends_at = now() - interval '1.5 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$select public.submit_word('ROOM-A', 'second')$$, 'accepted at ends_at + 1.5 s');
reset role;
update public.rooms set ends_at = now() - interval '2.5 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.submit_word('ROOM-A', 'third')$$, null, 'Too late', 'rejected at ends_at + 2.5 s');
reset role;
update public.rooms set ends_at = now() + interval '100 seconds' where code = 'ROOM-A';
-- pens_down / show_results before end
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.pens_down('ROOM-A')$$, null, 'Round not over', 'pens_down refused before ends_at');
select throws_ok($$select public.show_results('ROOM-A')$$, null, 'Too early', 'show_results refused before ends_at + 30 s');
-- word limit and row security
reset role;
insert into public.words select 'ROOM-A', 1, '00000000-0000-0000-0000-0000000000b2', 'W' || i from generate_series(1, 300) i;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select throws_ok($$select public.submit_word('ROOM-A', 'newword')$$, null, 'Word limit reached', '301st word refused');
select is((select count(*)::int from public.words where participant_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'typist cannot read another typist''s words before results');
reset role;
update public.rooms set ends_at = now() - interval '10 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.pens_down('ROOM-A')$$, null, 'Households only', 'typist pens_down refused');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.pens_down('ROOM-A')$$, 'a1 pens down');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.pens_down('ROOM-A')$$, 'a2 pens down');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select lives_ok($$select public.pens_down('ROOM-A')$$, 'a3 pens down');
reset role;
select ok((select results_at is null from public.rooms where code = 'ROOM-A'), 'results not open until all households confirm');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select lives_ok($$select public.pens_down('ROOM-A')$$, 'a4 pens down');
reset role;
select ok((select results_at = now() from public.rooms where code = 'ROOM-A'), 'results_at set once every household confirmed');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select throws_ok($$select public.pens_down('ROOM-A')$$, null, 'Results already shown', 'pens_down refused after results');
select throws_ok($$select public.show_results('ROOM-A')$$, null, 'Results already shown', 'show_results refused after results');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*)::int from public.words where participant_id = '00000000-0000-0000-0000-0000000000b1'), 3, 'typist reads another typist''s words after results');
-- new round from results phase deletes old words and board
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a1 ready in results phase');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a2 ready');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a3 ready');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select lives_ok($$select public.set_ready('ROOM-A', true)$$, 'a4 ready starts round 2');
reset role;
select is((select round from public.rooms where code = 'ROOM-A'), 2, 'round = 2');
select ok((select results_at is null from public.rooms where code = 'ROOM-A'), 'results_at cleared');
select is((select count(*)::int from public.words where room_code = 'ROOM-A'), 0, 'previous words deleted');
select is((select array_agg(round) from public.boards where room_code = 'ROOM-A'), array[2], 'previous board deleted');
-- show_results timing
update public.rooms set start_at = now() - interval '300 seconds', ends_at = now() - interval '29 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select public.show_results('ROOM-A')$$, null, 'Too early', 'show_results refused at ends_at + 29 s');
reset role;
update public.rooms set ends_at = now() - interval '30 seconds' where code = 'ROOM-A';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$select public.show_results('ROOM-A')$$, null, 'Households only', 'typist show_results refused');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.show_results('ROOM-A')$$, 'show_results works at ends_at + 30 s');
reset role;
select ok((select results_at = now() from public.rooms where code = 'ROOM-A'), 'show_results sets results_at');
select * from finish();
rollback;