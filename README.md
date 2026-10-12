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

## Команди

Потрібні Node.js 22+ і pnpm.

    pnpm install
    pnpm test                          # усі тести
    pnpm typecheck                     # перевірка типів
    pnpm --filter @quiz/server dev     # сервер на http://localhost:3000

## HTTP API

- `POST /api/games` з вікториною в тілі створює кімнату й повертає
  `code`, `hostToken`, `stageToken`.
- `GET /api/games/by-code/:code` перевіряє код гри.
- `POST /api/games/by-code/:code/join` з `{ "nickname": "…" }` впускає гравця
  й повертає його `token`.

Сокет підключається з `auth: { code, role, token }`, де `role` дорівнює
`host`, `stage` або `player`.
