# BioWorld — Източници

Тук са всички външни библиотеки, услуги и материали, които проектът използва или от които е вдъхновен. Код, изображения и правила от сходните решения **не са копирани**.

## Библиотеки (зареждат се от CDN, без инсталиране)

| Библиотека | Версия | Лиценз | За какво | Адрес |
| --- | --- | --- | --- | --- |
| Three.js | 0.186.1 | MIT | 3D долината (`src/js/scene3d.js`) | https://threejs.org |
| Chart.js | 4.5.1 | MIT | Графиката на ходовете (`src/js/historyChart.js`) | https://www.chartjs.org |
| supabase-js | 2.117.3 | MIT | Вход, регистрация, запис и зареждане (`src/js/storage.js`) | https://supabase.com/docs/reference/javascript |

Версиите са фиксирани в `index.html`. Файловете се зареждат от jsDelivr (https://www.jsdelivr.com).

## Услуги

| Услуга | За какво |
| --- | --- |
| Supabase (PostgreSQL, Auth, RLS) | База данни и профили — https://supabase.com |
| Netlify | Публично демо — https://bioworldd.netlify.app |
| GitHub | Код, задачи (Issues) и прегледи (Pull Requests) — https://github.com/ilia331/BioWorld |

## Сходни решения (вдъхновение, без копиране)

Описани подробно в [RESEARCH.md](RESEARCH.md).

| Решение | Адрес | Какво взехме като идея |
| --- | --- | --- |
| PhET Natural Selection | https://phet.colorado.edu/en/simulations/natural-selection | Наблюдение на популации с графика |
| The Habitable Planet — Ecology Lab | https://www.learner.org/wp-content/interactive/envsci/ecology/ | Връзки между видовете в една екосистема |
| Eco | https://www.play.eco/ | Действия с цена и последствия |

## Собствено съдържание

- **Алгоритъмът за хода, правилата и мисиите** са измислени за проекта ([GAME_DESIGN.md](GAME_DESIGN.md), [TESTS.md](TESTS.md)). Моделът е **опростен учебен модел**, а не научна прогноза.
- **Илюстрациите** (`assets/`, SVG долината в `index.html`, макетите в `docs/mockups/`) и **3D моделите** (направени в кода от прости форми) са създадени за проекта.
- Шрифтовете са системни (Segoe UI / Arial) — не се зареждат външни шрифтове.

## Изкуствен интелект

ChatGPT (OpenAI) и Claude (Anthropic) са използвани като помощници. За какво, с какви заявки и как е проверен резултатът — в [AI_USAGE.md](AI_USAGE.md).
