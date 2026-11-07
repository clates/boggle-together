begin;
select plan(12);

-- Empty set: nothing to delete returns 0
select is(public.cleanup_old_rooms(), 0, 'returns 0 when there are no rooms');

insert into public.rooms (code, created_by, last_activity_at) values
  ('OLD-01', '00000000-0000-0000-0000-0000000000a1', now() - interval '7 hours'),
  ('NEW-01', '00000000-0000-0000-0000-0000000000a1', now() - interval '5 hours');
insert into public.participants (room_code, id, kind, name) values
  ('OLD-01', '00000000-0000-0000-0000-0000000000a1', 'household', 'Old'),
  ('NEW-01', '00000000-0000-0000-0000-0000000000a2', 'household', 'New');
insert into public.boards (room_code, round, letters) values
  ('OLD-01', 1, array['A']), ('NEW-01', 1, array['B']);
insert into public.words (room_code, round, participant_id, word) values
  ('OLD-01', 1, '00000000-0000-0000-0000-0000000000a1', 'CAT'),
  ('NEW-01', 1, '00000000-0000-0000-0000-0000000000a2', 'DOG');

select is(has_function_privilege('anon', 'public.cleanup_old_rooms()', 'execute'), false, 'not callable by anon');
select is(has_function_privilege('authenticated', 'public.cleanup_old_rooms()', 'execute'), false, 'not callable by authenticated');

select is(public.cleanup_old_rooms(), 1, 'returns the number of rooms deleted');
select is((select count(*)::int from public.rooms where code = 'OLD-01'), 0, '7 hour old room deleted');
select is((select count(*)::int from public.participants where room_code = 'OLD-01'), 0, 'its participants cascade');
select is((select count(*)::int from public.boards where room_code = 'OLD-01'), 0, 'its board cascades');
select is((select count(*)::int from public.words where room_code = 'OLD-01'), 0, 'its words cascade');
select is((select count(*)::int from public.rooms where code = 'NEW-01'), 1, '5 hour old room kept');
select is((select count(*)::int from public.participants where room_code = 'NEW-01')
        + (select count(*)::int from public.boards where room_code = 'NEW-01')
        + (select count(*)::int from public.words where room_code = 'NEW-01'), 3, 'kept room keeps its children');

-- Boundary: expiry is strictly older than 6 hours. now() is fixed within a
-- transaction, so a room at exactly now() - 6 hours is KEPT.
insert into public.rooms (code, created_by, last_activity_at)
  values ('EDGE-01', '00000000-0000-0000-0000-0000000000a1', now() - interval '6 hours');
select is(public.cleanup_old_rooms(), 0, 'room exactly 6 hours old is kept (strictly older expires)');
update public.rooms set last_activity_at = now() - interval '6 hours 1 second' where code = 'EDGE-01';
select is(public.cleanup_old_rooms(), 1, 'room just over 6 hours old is deleted');

select * from finish();
rollback;
