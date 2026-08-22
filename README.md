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
npm run electron:dev
```

---

## 📦 Releases

Download the latest Windows installer from [GitHub Releases](https://github.com/Vladimir45rus/Multi-agents/releases).

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
npm run electron:dev
```

---

## 📦 Релизы

Скачать последний установщик для Windows можно на [GitHub Releases](https://github.com/Vladimir45rus/Multi-agents/releases).

---

## 📝 Лицензия

MIT