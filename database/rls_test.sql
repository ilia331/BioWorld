-- =====================================================================
-- BioWorld — проверка на правата (RLS) с два акаунта (стъпка 4)
--
-- ПРЕДИ ТОВА: създай двама тестови потребители в Supabase →
--   Authentication → Users → Add user → Create new user
--   (напр. test-a@bioworld.test и test-b@bioworld.test; отметни „Auto Confirm User“).
-- После изпълни целия файл в SQL Editor.
--
-- Какво прави: „влиза“ като потребител А, създава игра; после „влиза“ като Б
-- и се опитва да види, промени и изтрие играта на А. Накрая изтрива
-- тестовите данни и показва таблица с резултатите.
-- Всички редове трябва да са ✅.
-- =====================================================================

-- 0. Готова ли е базата за теста?
do $$
begin
  if (select count(*) from public.species) <> 3
     or (select count(*) from public.ecosystems) <> 5 then
    raise exception 'Липсват тестовите данни (3 вида и 5 мисии). Първо пусни seed.sql.';
  end if;
  if (select count(*) from auth.users) < 2 then
    raise exception 'Нужни са поне 2 потребителя: Authentication → Users → Add user.';
  end if;
  if (select count(*) from public.profiles) < 2 then
    raise exception 'Потребителите нямат профили. Пусни отново долната част на schema.sql (раздел 2).';
  end if;
end $$;

-- Запомняме двамата най-стари потребители като А и Б.
select set_config('test.user_a', (select id::text from auth.users order by created_at, id limit 1), false);
select set_config('test.user_b', (select id::text from auth.users order by created_at, id offset 1 limit 1), false);


-- ---------------------------------------------------------------------
-- 1. Влизаме като А (role = authenticated, sub = id на А)
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), false);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, false);

do $$
declare
  v_sim uuid;
  n     integer;
begin
  -- А създава игра по мисия 1, популации и един ход в историята
  insert into public.simulations (ecosystem_id, water)
  select id, initial_water from public.ecosystems where mission_no = 1
  returning id into v_sim;

  insert into public.populations (simulation_id, species_id, count)
  select v_sim, id, 10 from public.species;

  insert into public.simulation_history (simulation_id, turn_no, action, snapshot)
  values (v_sim, 1, 'none', '{"water": 60, "grass": 200, "rabbit": 20, "fox": 4}');

  perform set_config('test.sim_a', v_sim::text, false);
  perform set_config('test.r01', (select count(*) from public.simulations where id = v_sim)::text, false);
  perform set_config('test.r02', (select count(*) from public.populations where simulation_id = v_sim)::text, false);

  -- А се опитва да поправи изигран ход (историята е само за добавяне).
  -- „Отказано“ е и грешка за права, и 0 променени реда — и в двата случая нищо не се променя.
  begin
    update public.simulation_history set reason = 'поправено' where simulation_id = v_sim;
    get diagnostics n = row_count;
    perform set_config('test.r03', case when n = 0 then 'отказано' else 'позволено' end, false);
  exception when insufficient_privilege then
    perform set_config('test.r03', 'отказано', false);
  end;
end $$;


-- ---------------------------------------------------------------------
-- 2. Влизаме като Б и опитваме да достъпим играта на А
-- ---------------------------------------------------------------------
select set_config('request.jwt.claim.sub', current_setting('test.user_b'), false);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.user_b'), 'role', 'authenticated')::text, false);

do $$
declare
  v_a   uuid := current_setting('test.sim_a')::uuid;
  v_b   uuid;
  n     integer;
begin
  perform set_config('test.r04', (select count(*) from public.simulations where id = v_a)::text, false);
  perform set_config('test.r05', (select count(*) from public.populations where simulation_id = v_a)::text, false);
  perform set_config('test.r06', (select count(*) from public.simulation_history where simulation_id = v_a)::text, false);

  update public.simulations set turn_no = 5 where id = v_a;
  get diagnostics n = row_count;
  perform set_config('test.r07', n::text, false);

  delete from public.simulations where id = v_a;
  get diagnostics n = row_count;
  perform set_config('test.r08', n::text, false);

  -- Б се опитва да създаде игра от името на А
  begin
    insert into public.simulations (user_id, ecosystem_id, water)
    select current_setting('test.user_a')::uuid, id, 50 from public.ecosystems where mission_no = 1;
    perform set_config('test.r09', 'позволено', false);
  exception when insufficient_privilege then
    perform set_config('test.r09', 'отказано', false);
  end;

  -- Б се опитва да добави ход в играта на А
  begin
    insert into public.simulation_history (simulation_id, turn_no, action, snapshot)
    values (v_a, 2, 'none', '{}');
    perform set_config('test.r10', 'позволено', false);
  exception when insufficient_privilege then
    perform set_config('test.r10', 'отказано', false);
  end;

  -- Б създава своя игра и се опитва да я „подари“ на А
  insert into public.simulations (ecosystem_id, water)
  select id, 50 from public.ecosystems where mission_no = 2
  returning id into v_b;
  perform set_config('test.sim_b', v_b::text, false);
  perform set_config('test.r11', (select count(*) from public.simulations where id = v_b)::text, false);

  begin
    update public.simulations set user_id = current_setting('test.user_a')::uuid where id = v_b;
    perform set_config('test.r12', 'позволено', false);
  exception when insufficient_privilege then
    perform set_config('test.r12', 'отказано', false);
  end;
end $$;


-- ---------------------------------------------------------------------
-- 3. Посетител без вход (anon)
-- ---------------------------------------------------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role": "anon"}', false);

do $$
begin
  perform set_config('test.r13', (select count(*) from public.ecosystems)::text, false);
  -- В този момент в базата има игра на Б. Посетителят не трябва да я види:
  -- 0 видени реда или грешка за права — и двете означават „отказано“.
  begin
    perform set_config('test.r14',
      case when (select count(*) from public.simulations) = 0 then 'отказано' else 'позволено' end, false);
  exception when insufficient_privilege then
    perform set_config('test.r14', 'отказано', false);
  end;
end $$;


-- ---------------------------------------------------------------------
-- 4. Почистване и резултат
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '', false);

delete from public.simulations
where id in (current_setting('test.sim_a')::uuid, current_setting('test.sim_b')::uuid);

select
  t.no as "№",
  t.check_name as "проверка",
  t.actual as "резултат",
  t.expected as "очаквано",
  case when t.actual = t.expected then '✅' else '❌' end as "ОК"
from (values
  (1,  'А вижда своята игра',                     current_setting('test.r01'), '1'),
  (2,  'А вижда популациите си (3 вида)',          current_setting('test.r02'), '3'),
  (3,  'А поправя изигран ход',                    current_setting('test.r03'), 'отказано'),
  (4,  'Б вижда играта на А',                      current_setting('test.r04'), '0'),
  (5,  'Б вижда популациите на А',                 current_setting('test.r05'), '0'),
  (6,  'Б вижда историята на А',                   current_setting('test.r06'), '0'),
  (7,  'Б променя играта на А (редове)',           current_setting('test.r07'), '0'),
  (8,  'Б изтрива играта на А (редове)',           current_setting('test.r08'), '0'),
  (9,  'Б създава игра от името на А',             current_setting('test.r09'), 'отказано'),
  (10, 'Б добавя ход в играта на А',               current_setting('test.r10'), 'отказано'),
  (11, 'Б вижда своята игра',                      current_setting('test.r11'), '1'),
  (12, 'Б прехвърля своята игра на А',             current_setting('test.r12'), 'отказано'),
  (13, 'Посетител без вход вижда 5-те мисии',      current_setting('test.r13'), '5'),
  (14, 'Посетител без вход чете игри',             current_setting('test.r14'), 'отказано')
) as t(no, check_name, actual, expected)
order by t.no;
