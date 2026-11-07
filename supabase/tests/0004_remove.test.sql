begin;
select plan(29);

-- Fixtures: room R1 (households h1-h3, typist t1), room R2 (household h1, typist t1)
insert into public.rooms (code, created_by) values
  ('REM-0001', '00000000-0000-0000-0000-0000000000c1'),
  ('REM-0002', '00000000-0000-0000-0000-0000000000c1'),
  ('REM-0003', '00000000-0000-0000-0000-0000000000c1');
insert into public.participants (room_code, id, kind, name) values
  ('REM-0001', '00000000-0000-0000-0000-0000000000c1', 'household', 'H1'),
  ('REM-0001', '00000000-0000-0000-0000-0000000000c2', 'household', 'H2'),
  ('REM-0001', '00000000-0000-0000-0000-0000000000c3', 'household', 'H3'),
  ('REM-0001', '00000000-0000-0000-0000-0000000000d1', 'typist', 'T1'),
  ('REM-0002', '00000000-0000-0000-0000-0000000000c1', 'household', 'H1'),
  ('REM-0002', '00000000-0000-0000-0000-0000000000d1', 'typist', 'T1'),
  ('REM-0003', '00000000-0000-0000-0000-0000000000c1', 'household', 'H1'),
  ('REM-0003', '00000000-0000-0000-0000-0000000000c2', 'household', 'H2');

-- privileges
select is(has_function_privilege('anon', 'public.remove_participant(text, uuid)', 'execute'), false, 'remove_participant not callable by anon');
select is(has_function_privilege('authenticated', 'public.remove_participant(text, uuid)', 'execute'), true, 'remove_participant callable by authenticated');

-- a non-member cannot call it
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e9","role":"authenticated"}';
select throws_ok($$select public.remove_participant('REM-0001', '00000000-0000-0000-0000-0000000000c2')$$, null, 'Not in room', 'non-member refused');
select throws_ok($$select public.remove_participant('NOPE-0000', '00000000-0000-0000-0000-0000000000c2')$$, null, 'Not in room', 'unknown room refused');

-- a typist cannot remove a household, but may leave
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$select public.remove_participant('REM-0001', '00000000-0000-0000-0000-0000000000c2')$$, null, 'Households only', 'typist cannot remove a household');
reset role;
select is((select count(*)::int from public.participants where room_code = 'REM-0001'), 4, 'nobody removed by the refused calls');

-- lobby: h1 and h2 ready, h3 is a phantom; removing h3 starts the round
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.set_ready('REM-0001', true)$$, 'h1 ready');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select lives_ok($$select public.set_ready('REM-0001', true)$$, 'h2 ready');
reset role;
update public.rooms set last_activity_at = now() - interval '1 hour' where code = 'REM-0001';
select is((select round from public.rooms where code = 'REM-0001'), 0, 'not started while h3 is not ready');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select lives_ok($$select public.remove_participant('REM-0001', '00000000-0000-0000-0000-0000000000c3')$$, 'household removes another household');
reset role;
select is((select count(*)::int from public.participants where room_code = 'REM-0001' and id = '00000000-0000-0000-0000-0000000000c3'), 0, 'removed household is gone');
select is((select round from public.rooms where code = 'REM-0001'), 1, 'removing the last not-ready household starts the round');
select ok((select last_activity_at = now() from public.rooms where code = 'REM-0001'), 'last_activity_at updated');

-- locked: h1 pens down, h2 vanishes; removing h2 opens results. t1's words for the round survive.
update public.rooms set start_at = now() - interval '200 seconds', ends_at = now() - interval '5 seconds' where code = 'REM-0001';
insert into public.words (room_code, round, participant_id, word) values
  ('REM-0001', 1, '00000000-0000-0000-0000-0000000000d1', 'CAT'),
  ('REM-0001', 1, '00000000-0000-0000-0000-0000000000c2', 'ODD');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.pens_down('REM-0001')$$, 'h1 pens down');
reset role;
select ok((select results_at is null from public.rooms where code = 'REM-0001'), 'results wait for h2');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.remove_participant('REM-0001', '00000000-0000-0000-0000-0000000000c2')$$, 'h1 removes h2 in the locked phase');
reset role;
select ok((select results_at = now() from public.rooms where code = 'REM-0001'), 'results open once the rest have confirmed');
select is((select count(*)::int from public.words where room_code = 'REM-0001' and participant_id = '00000000-0000-0000-0000-0000000000c2'), 0, 'removed participant''s words deleted');
select is((select count(*)::int from public.words where room_code = 'REM-0001' and participant_id = '00000000-0000-0000-0000-0000000000d1'), 1, 'other words kept');

-- a typist may leave
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select lives_ok($$select public.remove_participant('REM-0002', '00000000-0000-0000-0000-0000000000d1')$$, 'typist leaves');
reset role;
select is((select count(*)::int from public.participants where room_code = 'REM-0002' and kind = 'typist'), 0, 'typist gone');

-- a household may remove a typist
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.remove_participant('REM-0001', '00000000-0000-0000-0000-0000000000d1')$$, 'household removes a typist');
reset role;
select is((select count(*)::int from public.participants where room_code = 'REM-0001' and kind = 'typist'), 0, 'removed typist gone');

-- removing the last household (leaving) is fine and leaves an empty room
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.remove_participant('rem-0002', '00000000-0000-0000-0000-0000000000c1')$$, 'last household leaves');
reset role;
select is((select count(*)::int from public.participants where room_code = 'REM-0002'), 0, 'room is empty');
select is((select round from public.rooms where code = 'REM-0002'), 0, 'empty room does not start a round');

-- removing someone already gone is harmless (double tap)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$select public.remove_participant('REM-0003', '00000000-0000-0000-0000-0000000000e9')$$, 'removing a non-participant is a no-op');
-- leaving while not ready, with the other household ready, starts the round for them
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select lives_ok($$select public.set_ready('REM-0003', true); select public.remove_participant('REM-0003', '00000000-0000-0000-0000-0000000000c1')$$, 'the ready household removes the not-ready one');
reset role;
select is((select round from public.rooms where code = 'REM-0003'), 1, 'removal starts the round when everyone left is ready');

select * from finish();
rollback;
