-- =====================================================================
-- BioWorld — схема на базата данни (стъпка 4)
-- Изпълнява се ВЕДНЪЖ в Supabase → SQL Editor, върху празна база.
-- Модел: docs/ER_DIAGRAM.md
--
-- Ред на файловете:  1) schema.sql   2) seed.sql   3) rls_test.sql
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ТАБЛИЦИ
-- ---------------------------------------------------------------------

-- Профил на ученика. id е същият като в auth.users (таблицата на Supabase Auth).
-- ON DELETE CASCADE: ако акаунтът бъде изтрит, изтрива се и профилът.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- Видовете в играта: трева, заек, лисица.
-- code е кратко име на латиница, което JavaScript кодът ще използва.
create table public.species (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique check (code in ('grass', 'rabbit', 'fox')),
  name      text not null unique,
  role      text not null check (role in ('plant', 'herbivore', 'predator')),
  max_count integer not null check (max_count > 0)
);

-- Настройките на петте мисии. settings пази началните популации,
-- графика на събитията и условието за успех (виж seed.sql).
create table public.ecosystems (
  id            uuid primary key default gen_random_uuid(),
  mission_no    integer not null unique check (mission_no between 1 and 5),
  title         text not null,
  initial_water integer not null check (initial_water >= 0),
  max_water     integer not null check (max_water > 0),
  settings      jsonb not null default '{}'::jsonb,
  check (initial_water <= max_water)
);

-- Една конкретна игра на един ученик.
-- user_id по подразбиране е текущият потребител (auth.uid()).
create table public.simulations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
               references public.profiles (id) on delete cascade,
  ecosystem_id uuid not null references public.ecosystems (id),
  turn_no      integer not null default 0 check (turn_no between 0 and 10),
  water        integer not null check (water >= 0),
  status       text not null default 'active' check (status in ('active', 'won', 'lost')),
  actions_used jsonb not null default '{}'::jsonb,  -- напр. {"restore_pond": 1}
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Колко от всеки вид има в една игра.
-- Съставен първичен ключ: в една игра всеки вид се среща само веднъж.
create table public.populations (
  simulation_id uuid not null references public.simulations (id) on delete cascade,
  species_id    uuid not null references public.species (id),
  count         integer not null check (count >= 0),
  primary key (simulation_id, species_id)
);

-- Запис за всеки изигран ход: действие, събитие, прогноза, резултат, причини.
create table public.simulation_history (
  id                   uuid primary key default gen_random_uuid(),
  simulation_id        uuid not null references public.simulations (id) on delete cascade,
  turn_no              integer not null check (turn_no between 1 and 10),
  action               text not null check (action in
                         ('plant_grass', 'restore_pond', 'add_rabbits', 'add_foxes', 'none')),
  event                text not null default 'none' check (event in
                         ('none', 'rain', 'drought', 'disease')),
  prediction           jsonb,           -- напр. {"water": "down", "grass": "up", ...}
  snapshot             jsonb not null,  -- напр. {"water": 48, "grass": 212, "rabbit": 24, "fox": 4}
  reason               text,            -- причинната верига за дневника
  understanding_points integer check (understanding_points between 0 and 4),
  created_at           timestamptz not null default now(),
  unique (simulation_id, turn_no)       -- един запис на ход
);

-- Индекс за бързо търсене на игрите на един ученик.
create index simulations_user_id_idx on public.simulations (user_id);


-- ---------------------------------------------------------------------
-- 2. АВТОМАТИЧЕН ПРОФИЛ ПРИ РЕГИСТРАЦИЯ
-- ---------------------------------------------------------------------
-- Когато някой се регистрира, Supabase добавя ред в auth.users.
-- Тази функция веднага създава и негов ред в profiles.
-- security definer = функцията се изпълнява с правата на създателя си,
-- за да може да пише в profiles въпреки RLS.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name',
                  split_part(new.email, '@', 1),
                  'Ученик'), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Профили за потребители, регистрирани ПРЕДИ този файл да е изпълнен.
insert into public.profiles (id, display_name)
select id, left(coalesce(split_part(email, '@', 1), 'Ученик'), 40)
from auth.users
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
-- 3. RLS — ПРАВА ЗА ДОСТЪП (Row Level Security)
-- ---------------------------------------------------------------------
-- Щом RLS е включен, по подразбиране НИКОЙ не вижда нищо.
-- Всяка политика (policy) отваря точно определен достъп.
-- auth.uid() връща id на влезлия потребител (или null, ако не е влязъл).

-- Първо: кои роли изобщо имат достъп до таблиците.
-- anon = посетител без вход; authenticated = влязъл ученик.
-- Supabase по подразбиране дава ВСИЧКИ права на всяка нова таблица,
-- затова първо ги отнемаме (revoke) и после даваме само нужните (grant).
-- RLS политиките по-долу ограничават този достъп до конкретни редове.
-- (Този блок може да се пусне отделно и повторно — не изтрива данни.)
revoke all on public.profiles, public.species, public.ecosystems, public.simulations,
              public.populations, public.simulation_history
  from anon, authenticated;
grant select                        on public.species, public.ecosystems to anon, authenticated;
grant select, update                 on public.profiles                   to authenticated;
grant select, insert, update, delete on public.simulations                to authenticated;
grant select, insert, update         on public.populations                to authenticated;
grant select, insert                 on public.simulation_history         to authenticated;

alter table public.profiles           enable row level security;
alter table public.species            enable row level security;
alter table public.ecosystems         enable row level security;
alter table public.simulations        enable row level security;
alter table public.populations        enable row level security;
alter table public.simulation_history enable row level security;

-- profiles: всеки чете и променя само своя профил.
create policy "Профил: чета своя"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "Профил: променям своя"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- species и ecosystems: само четене, за всички (и без вход),
-- за да се виждат мисиите на първия екран. Никой не ги променя от сайта.
create policy "Видове: четат всички"
  on public.species for select to anon, authenticated
  using (true);

create policy "Мисии: четат всички"
  on public.ecosystems for select to anon, authenticated
  using (true);

-- simulations: само собственикът вижда, създава, променя и изтрива своите игри.
-- using       = кои СЪЩЕСТВУВАЩИ редове може да види/промени
-- with check  = какви НОВИ стойности може да запише
create policy "Игри: чета своите"
  on public.simulations for select to authenticated
  using (user_id = auth.uid());

create policy "Игри: създавам своя"
  on public.simulations for insert to authenticated
  with check (user_id = auth.uid());

create policy "Игри: променям своите"
  on public.simulations for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Игри: изтривам своите"
  on public.simulations for delete to authenticated
  using (user_id = auth.uid());

-- populations: достъп само ако играта, към която принадлежат, е моя.
create policy "Популации: чета от моите игри"
  on public.populations for select to authenticated
  using (exists (select 1 from public.simulations s
                 where s.id = simulation_id and s.user_id = auth.uid()));

create policy "Популации: добавям в моите игри"
  on public.populations for insert to authenticated
  with check (exists (select 1 from public.simulations s
                      where s.id = simulation_id and s.user_id = auth.uid()));

create policy "Популации: променям в моите игри"
  on public.populations for update to authenticated
  using (exists (select 1 from public.simulations s
                 where s.id = simulation_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.simulations s
                      where s.id = simulation_id and s.user_id = auth.uid()));

-- simulation_history: само четене и добавяне.
-- Изигран ход не се поправя — историята е „дневник“.
-- (Тя се изтрива автоматично заедно с играта чрез ON DELETE CASCADE.)
create policy "История: чета от моите игри"
  on public.simulation_history for select to authenticated
  using (exists (select 1 from public.simulations s
                 where s.id = simulation_id and s.user_id = auth.uid()));

create policy "История: добавям в моите игри"
  on public.simulation_history for insert to authenticated
  with check (exists (select 1 from public.simulations s
                      where s.id = simulation_id and s.user_id = auth.uid()));
