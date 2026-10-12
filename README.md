# Quiz

Платформа живих вікторин: ведучий створює вікторину й запускає гру, гравці
приєднуються з телефонів за кодом або QR.

Специфікація: `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`.
Плани реалізації: `docs/superpowers/plans/`.

## Пакети

- `packages/shared`: схеми вікторини, відповідей, зрізів стану й подій сокета.
- `packages/engine`: чиста логіка гри без мережі й бази: перевірка відповідей,
  бали, рейтинг, етапи гри, зрізи стану для сцени, гравця й ведучого.
- `apps/server`: Fastify + Socket.IO. Кімнати живуть у пам'яті; сервер володіє
  таймером і розсилає кожній ролі її зріз стану.
- `apps/web`: клієнт на React + Vite: вхід гравця, сцена, пульт ведучого.

## Команди

Потрібні Node.js 22+ і pnpm.

    pnpm install
    pnpm test                          # усі тести
    pnpm typecheck                     # перевірка типів
    pnpm --filter @quiz/server dev     # сервер на http://localhost:3000

## Як зіграти локально

Потрібен Docker (для бази даних).

    cp .env.example .env      # і впишіть власний BETTER_AUTH_SECRET
    pnpm install
    pnpm db:up                # PostgreSQL у Docker на порту 5433
    pnpm build
    pnpm start

Відкрийте http://localhost:3000 на комп'ютері, натисніть «Я ведучий»,
зареєструйтесь і додайте приклад вікторини або створіть власну в редакторі.
Кнопка «Грати» відкриває пульт; «Відкрити сцену» на пульті показує екран для
телевізора. Гравці з телефонів у тій самій мережі Wi-Fi заходять на адресу
комп'ютера (наприклад, http://192.168.0.10:3000) і вводять код гри або
сканують QR-код зі сцени, якщо сцену відкрито за цією ж адресою.

Під час розробки `pnpm dev` запускає сервер і клієнт із гарячим оновленням
на http://localhost:5173. Тести (`pnpm test`) бази в Docker не потребують.

## HTTP API

- `POST /api/games` з вікториною в тілі створює кімнату й повертає
  `code`, `hostToken`, `stageToken`.
- `GET /api/games/by-code/:code` перевіряє код гри.
- `POST /api/games/by-code/:code/join` з `{ "nickname": "…" }` впускає гравця
  й повертає його `token`.

Сокет підключається з `auth: { code, role, token }`, де `role` дорівнює
`host`, `stage` або `player`.

Акаунти й вікторини (потрібна сесія, крім реєстрації та входу):

- `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`,
  `POST /api/auth/sign-out`, `GET /api/me`.
- `GET|POST /api/quizzes`, `GET|PUT|DELETE /api/quizzes/:id`.
- `POST /api/games` з `{ "quizId": "…" }` створює гру зі збереженої вікторини.
- `GET /api/games/by-code/:code/host-access` повертає ведучому токени його гри.
- `GET /api/games` і `GET /api/games/:id`: історія ігор ведучого.
- `GET /api/me/history`: ігри, у яких гравець брав участь, увійшовши в акаунт.
