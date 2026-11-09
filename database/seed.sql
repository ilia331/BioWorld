-- =====================================================================
-- BioWorld — тестови данни (стъпка 4)
-- Изпълнява се СЛЕД schema.sql. Може да се пусне повече от веднъж:
-- „on conflict do nothing“ пропуска редовете, които вече съществуват.
--
-- Числата са НАЧАЛНИ ПРЕДЛОЖЕНИЯ от docs/GAME_DESIGN.md (раздели 2 и 7).
-- Ще бъдат проверени и балансирани в стъпка 6.
-- =====================================================================

-- Три вида: растение → тревопасно → хищник.
insert into public.species (code, name, role, max_count) values
  ('grass',  'Трева',  'plant',     500),
  ('rabbit', 'Заек',   'herbivore', 200),
  ('fox',    'Лисица', 'predator',   50)
on conflict (code) do nothing;

-- Пет мисии с един и същ механизъм и различни настройки.
-- settings.start  = начални популации
-- settings.events = номер на ход → събитие (disease има и засегнат вид)
-- settings.goal   = условие за успех (ще се проверява от JavaScript в стъпка 6)
insert into public.ecosystems (mission_no, title, initial_water, max_water, settings) values
  (1, 'Първи живот', 60, 100, '{
     "start":  {"grass": 200, "rabbit": 20, "fox": 4},
     "events": {"5": {"type": "rain"}},
     "goal":   {"type": "all_alive", "text": "И трите вида оцеляват 10 хода."}
   }'),
  (2, 'Пресъхналият поток', 30, 100, '{
     "start":  {"grass": 150, "rabbit": 15, "fox": 3},
     "events": {"3": {"type": "drought"}, "7": {"type": "drought"}},
     "goal":   {"type": "water_min", "min_water": 20,
                "text": "Водата остава поне 20 във всеки ход и трите вида оцеляват."}
   }'),
  (3, 'Твърде много зайци', 60, 100, '{
     "start":  {"grass": 200, "rabbit": 80, "fox": 2},
     "events": {},
     "goal":   {"type": "min_counts", "min": {"grass": 50, "rabbit": 10},
                "text": "Тревата и зайците остават жизнеспособни."}
   }'),
  (4, 'Изчезващият хищник', 60, 100, '{
     "start":  {"grass": 220, "rabbit": 40, "fox": 6},
     "events": {"2": {"type": "disease", "species": "fox"}},
     "goal":   {"type": "stable", "last_turns": 3, "max_change_percent": 20,
                "text": "Трите вида оцеляват и се стабилизират."}
   }'),
  (5, 'Непредвидима година', 50, 100, '{
     "start":  {"grass": 200, "rabbit": 25, "fox": 4},
     "events": {"2": {"type": "rain"}, "4": {"type": "drought"},
                "6": {"type": "disease", "species": "rabbit"}, "8": {"type": "drought"}},
     "goal":   {"type": "all_alive_and_water", "text": "Балансът се запазва въпреки събитията."}
   }')
on conflict (mission_no) do nothing;

-- Проверка: трябва да видиш 3 вида и 5 мисии.
select
  (select count(*) from public.species)    as "видове (очаквано 3)",
  (select count(*) from public.ecosystems) as "мисии (очаквано 5)";
