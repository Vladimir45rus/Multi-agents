# Multi-Agent Code Studio 🚀

**Web IDE with multi-agent AI architecture** — a desktop application that combines a VS Code-like editor with a team of AI agents who collaborate on code.

[🇷🇺 Русская версия ниже](#русский)

---

## 🇬🇧 Features

### Multi-Agent System
- **Lead Agent** — full code access: reads, writes, creates, deletes files, runs tests
- **Advisor** — reads code, searches, gives recommendations
- **UI/UX Designer** — analyzes interface requirements, proposes layouts
- **Architect** — evaluates project structure, suggests architecture decisions
- **Reviewer** — reviews code, finds bugs, checks best practices
- **Tester** — analyzes test coverage, finds edge cases
- **Security Analyst** — checks vulnerabilities and security practices
- **Observer** — monitors overall project state

All agents communicate in a shared chat, discussing solutions before the Lead Agent applies changes. Each agent has its own color for easy identification.

### Autonomous Cycle (v1.3+)
- **Auto-Approve mode**: agents run a self-correction loop — code → review → fix → retest → until `RELEASE_READY`
- **Confirmation mode**: Lead Agent forms a plan, waits for your approval before coding

### VS Code-like Features
- **Monaco Editor** — syntax highlighting for 30+ languages
- **File tabs** — open multiple files, switch between them
- **Project tree** — browse, create, rename, delete files/folders
- **Search across files** — instant project-wide code search
- **GitHub integration** — push changes with one click
- **Terminal** — run commands directly in the IDE

### Quick Commands
Type in chat:
- `/fix` — fix the selected code
- `/explain` — explain what the code does
- `/test` — write tests for the selected code
- `/refactor` — improve code structure
- `/docs` — generate documentation
- `@AgentName` — mention a specific agent

### What's New in v1.5.20
- **Independent agents with isolated contexts** — every agent keeps its own identity, provider/model pair and role-restricted toolset; advisors are limited to read-only inspection while only the Lead Agent can modify files
- **Live streaming everywhere** — token-level SSE streaming in both chat windows and in the orchestrator panel, with resilient parsing of fragmented provider chunks and automatic fallback between models
- **Context awareness** — a memory gauge per chat window shows how much of the context window is used and when compaction kicked in
- **Clean chat display** — tool executions render as friendly status chips ("Reading files...", "Running terminal command...") instead of raw JSON; provider errors (HTTP 429, rate limits) go to the Logs panel, never into the conversation
- **Panel management** — every workspace panel (Tree, Editor, Lead Chat, Group Chat, Terminal, Logs) has collapse / expand / fullscreen controls, its own color accent and a bright collapsed badge for 1-click restore
- **Floating widget** — the always-on-top overlay widget shows live agent status, allows switching the Lead model and sending quick messages without opening the main window
- **Safe file operations** — multi-file patches apply atomically (all-or-nothing with automatic rollback), deletions always create recoverable backups, rollback history for every changed file

---

## ⚠️ Disclaimer

Multi-Agent Code Studio uses third-party AI services (OpenRouter, OpenAI, etc.) via **YOUR** API keys. You manage your own keys, costs, and are responsible for AI-generated code.

Agents have access to your project's file system. Do not run on sensitive data without backups.

Generated code may contain errors, vulnerabilities, or suboptimal solutions. Always review the output.

This is an open-source project. Source code: [github.com/Vladimir45rus/Multi-agents](https://github.com/Vladimir45rus/Multi-agents)

---

## 🔧 Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS v4, Monaco Editor
- **Backend**: Next.js API routes, Drizzle ORM, SQLite (better-sqlite3)
- **Desktop**: Electron
- **AI**: OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, Together AI

---

## 🏗️ Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (web)
npm run dev

# Build for production
npm run build

# Run Electron desktop app
npm run electron:open
```

---

## 🖥️ System Requirements

- **OS**: Windows 10/11 x64
- **RAM**: 4 GB minimum (8 GB recommended)
- **Disk**: 500 MB for the application + space for your projects
- **Internet**: required for AI provider APIs
- **API key**: at least one provider key (OpenRouter / OpenAI / Anthropic / Gemini / Groq / Together AI)

---

## 🚀 Install from Installer (.exe)

1. Download `Multi-Agent Code Studio-1.5.20-setup.exe` from [GitHub Releases](https://github.com/Vladimir45rus/Multi-agents/releases)
2. Run the installer and follow the wizard (installation directory can be changed)
3. Launch the app — it starts the embedded local server automatically (127.0.0.1, not exposed to the network)
4. Open **Settings → API keys** and add your provider key(s)
5. Connect a project folder and start working with the agents

> The app stores all secrets locally: API keys are encrypted (AES-256-GCM) in a local SQLite database; the encryption key lives in your user profile (`%USERPROFILE%\.multi-agent-studio\`). Nothing is sent anywhere except directly to the AI providers you configure.

---

## 🛡️ Security

Multi-Agent Code Studio is designed as a **local-only** application and ships with layered protections:

- **CSRF protection** — cross-site browser requests against the localhost API are blocked via `Origin` / `Sec-Fetch-Site` validation
- **Hardened mobile access** — when the optional localtunnel/mobile mode is enabled, every API route requires a secret access token; spoofed `X-Forwarded-For` / `Host` headers are never trusted
- **SSRF filtering** — link previews sent to agents are validated server-side: private networks (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254 cloud metadata), localhost names and DNS-resolved private addresses are rejected, redirects are re-validated per hop
- **Electron isolation** — `contextIsolation`, `sandbox`, no `nodeIntegration`; navigation away from the app origin is blocked; external links open in the system browser; preview content runs inside a sandboxed iframe without same-origin access
- **Terminal sandboxing** — an allowlist of vetted development commands only; package-smuggling flags (`npx --package=...`) and lifecycle scripts are rejected
- **Atomic workspace patches** — multi-file agent edits either fully apply or fully roll back; every deletion creates a recoverable backup with rollback history
- **Secrets at rest** — provider API keys and GitHub tokens are AES-256-GCM encrypted before they touch SQLite; plaintext legacy values migrate on next save
- **Path traversal defense** — workspace file access rejects absolute paths, `..` segments, UNC paths, null bytes and symlink escapes
- **Prompt-injection hardening** — tool calls are only honored from pure JSON tool-call payloads, never from prose embedded in read files

---

## 📝 License

MIT

---

---

## 🇷🇺 Русский

# Multi-Agent Code Studio 🚀

**Веб-IDE с мультиагентной AI-архитектурой** — десктопное приложение, объединяющее редактор в стиле VS Code с командой AI-агентов, которые совместно работают над кодом.

---

## Возможности

### Мультиагентная система
- **Главный агент** — полный доступ к коду: читает, пишет, создаёт, удаляет файлы, запускает тесты
- **Советник** — читает код, ищет по проекту, даёт рекомендации
- **UI/UX Дизайнер** — анализирует требования к интерфейсу, предлагает вёрстку
- **Архитектор** — оценивает структуру проекта, предлагает архитектурные решения
- **Ревьюер** — проверяет код, находит баги, следит за лучшими практиками
- **Тестировщик** — анализирует покрытие тестами, ищет крайние случаи
- **Секурити-аналитик** — проверяет уязвимости и безопасность
- **Наблюдатель** — мониторит общее состояние проекта

Все агенты общаются в общем чате, обсуждая решения перед тем как Главный вносит изменения. У каждого агента свой цвет для лёгкой идентификации.

### Автономный цикл (v1.3+)
- **Режим Авто-утверждения**: агенты запускают цикл самоисправления — код → ревью → правка → перетестирование → до статуса `RELEASE_READY`
- **Режим с подтверждением**: Главный формирует план и ждёт одобрения перед кодингом

### Возможности редактора
- **Monaco Editor** — подсветка синтаксиса для 30+ языков
- **Табы файлов** — открывайте несколько файлов, переключайтесь между ними
- **Дерево проекта** — просмотр, создание, переименование, удаление файлов/папок
- **Поиск по файлам** — мгновенный поиск по всему проекту
- **GitHub интеграция** — пуш изменений в один клик
- **Терминал** — запуск команд прямо в IDE
- **Тёмная и светлая темы** — переключатель в верхней панели

### Быстрые команды
Введите в чате:
- `/fix` — исправить выделенный код
- `/explain` — объяснить что делает код
- `/test` — написать тесты
- `/refactor` — улучшить структуру
- `/docs` — сгенерировать документацию
- `@ИмяАгента` — обратиться к конкретному агенту

### Что нового в v1.5.20
- **Независимые агенты с изолированным контекстом** — у каждого агента своя идентичность, связка провайдер/модель и ограниченный ролью набор инструментов: советникам доступно только чтение, изменять файлы может лишь Главный агент
- **Живой стриминг везде** — потоковый вывод на уровне токенов в обоих чатах и в панели оркестратора, устойчивая сборка фрагментированных ответов провайдера и автоматический fallback между моделями
- **Контекст-индикация** — счётчик заполнения контекста в каждом чате показывает, сколько окна занято и когда включилось сжатие
- **Чистый чат** — вызовы инструментов отображаются аккуратными плашками статуса («Выполняю чтение файлов…», «Выполняю команду в терминале…») вместо сырого JSON; ошибки провайдеров (HTTP 429, rate-limit) уходят в панель Логов, а не в беседу
- **Управление панелями** — у каждой панели (Дерево, Редактор, Чат с Главным, Общий чат, Терминал, Логи) есть кнопки «Свернуть / Развернуть / На весь экран», свой цветовой акцент и яркий бейдж в свёрнутом состоянии для мгновенного возврата в 1 клик
- **Плавающий виджет** — поверх всех окон: живой статус агентов, переключение модели Главного и быстрый ввод сообщений без открытия основного окна
- **Безопасные операции с файлами** — мультифайловые патчи применяются атомарно (всё или ничего с автооткатом), удаления всегда создают восстанавливаемые бэкапы, история отката для каждого изменённого файла

---

## ⚠️ Дисклеймер

Multi-Agent Code Studio использует сторонние AI-сервисы (OpenRouter, OpenAI и др.) через **ВАШИ** API-ключи. Вы самостоятельно управляете ключами, расходами и несёте ответственность за код, сгенерированный агентами.

Агенты имеют доступ к файловой системе открытого проекта. Не запускайте приложение на чувствительных данных без резервного копирования.

Сгенерированный код может содержать ошибки, уязвимости или неоптимальные решения. Всегда проверяйте результат.

Это опенсорс-проект. Исходный код: [github.com/Vladimir45rus/Multi-agents](https://github.com/Vladimir45rus/Multi-agents)

---

## 🔧 Технологии

- **Фронтенд**: Next.js 15, React 19, Tailwind CSS v4, Monaco Editor
- **Бэкенд**: Next.js API routes, Drizzle ORM, SQLite (better-sqlite3)
- **Десктоп**: Electron
- **AI**: OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, Together AI

---

## 🏗️ Быстрый старт

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки (веб)
npm run dev

# Продакшн-сборка
npm run build

# Запуск Electron-приложения
npm run electron:open
```

---

## 🖥️ Системные требования

- **ОС**: Windows 10/11 x64
- **ОЗУ**: минимум 4 ГБ (рекомендуется 8 ГБ)
- **Диск**: 500 МБ для приложения + место под проекты
- **Интернет**: требуется для обращения к AI-провайдерам
- **API-ключ**: хотя бы один ключ провайдера (OpenRouter / OpenAI / Anthropic / Gemini / Groq / Together AI)

---

## 🚀 Установка из установщика (.exe)

1. Скачайте `Multi-Agent Code Studio-1.5.20-setup.exe` со страницы [GitHub Releases](https://github.com/Vladimir45rus/Multi-agents/releases)
2. Запустите установщик и следуйте мастеру (можно изменить папку установки)
3. Запустите приложение — встроенный локальный сервер стартует автоматически (127.0.0.1, наружу не доступен)
4. Откройте **Настройки → API-ключи** и добавьте ключ вашего провайдера
5. Подключите папку проекта и начинайте работать с агентами

> Все секреты хранятся локально: API-ключи шифруются (AES-256-GCM) в локальной базе SQLite; ключ шифрования лежит в профиле пользователя (`%USERPROFILE%\.multi-agent-studio\`). Данные никуда не отправляются, кроме напрямую настроенных вами AI-провайдеров.

---

## 🛡️ Безопасность

Multi-Agent Code Studio — **локальное** приложение с многоуровневой защитой:

- **CSRF-защита** — межсайтовые запросы браузера к localhost API блокируются проверкой `Origin` / `Sec-Fetch-Site`
- **Безопасный мобильный доступ** — при включении опционального режима localtunnel каждый API-маршрут требует секретный токен доступа; подделка заголовков `X-Forwarded-For` / `Host` бесполезна
- **SSRF-фильтр** — ссылки для превью проверяются на сервере: приватные сети (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, облачные метаданные 169.254.169.254), localhost-имена и DNS-адреса приватных диапазонов отклоняются, редиректы перепроверяются на каждом хопе
- **Изоляция Electron** — `contextIsolation`, `sandbox`, без `nodeIntegration`; навигация за пределы origin приложения заблокирована; внешние ссылки открываются в системном браузере; превью работает в изолированном iframe без same-origin доступа
- **Песочница терминала** — только белый список проверенных команд разработки; флаги-обходчики (`npx --package=...`) и lifecycle-скрипты отклоняются
- **Атомарные патчи воркспейса** — мультифайловые правки агентов применяются либо полностью, либо не применяются вовсе; каждое удаление создаёт восстанавливаемый бэкап с историей отката
- **Секреты в покое** — API-ключи и GitHub-токены шифруются AES-256-GCM до записи в SQLite; старые значения в открытом виде мигрируют при следующем сохранении
- **Защита от path traversal** — доступ к файлам воркспейса отклоняет абсолютные пути, сегменты `..`, UNC-пути, нулевые байты и symlink-эскейпы
- **Защита от prompt-injection** — вызовы инструментов распознаются только в чистых JSON-полезных нагрузках, но никогда — из прозы прочитанных файлов

---

## 📝 Лицензия

MIT