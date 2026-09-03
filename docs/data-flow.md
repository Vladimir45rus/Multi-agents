# Data Flow Audit: контуры ЧАТА и ОРКЕСТРАТОРА

Дата аудита: 31.08.2026 · Версия: 1.5.20 · Ветка: main

## 1. Контур «Чат / Диалог» (Conversational Loop) — только текст

Ввод сообщения пользователем порождает **только текстовые ответы агентов**.
Файлы не пишутся, консольные команды не выполняются, авто-цикл не запускается.

```mermaid
flowchart TD
    A[Пользователь вводит сообщение в Общий чат / ЧАТ С ГЛАВНЫМ] --> B["ide-app.tsx sendChat() → POST /api/chat/stream (SSE)"]
    B --> C["streamWorkspaceMessage() — workspace.ts"]
    C --> D[("pushMessage: user → chat_messages (SQLite)")]
    C --> E["runAgentRound() — текстовые ответы агентов"]
    E --> F["streamAgentReply() — LLM + инструменты"]
    F --> G{Модель вызвала инструмент?}
    G -- "read_file / list_files / search_code" --> H["executeToolCall: чтение ФС → результат обратно модели → финальный текст"]
    G -- "write_file / create_file / delete_file / run_command" --> X["ОТКАЗ (guard): 'в чате только инструменты чтения'"]
    H --> I[("pushMessage: ответ агента → chat_messages")]
    I --> J{"Это ответ Главного из общего чата?"}
    J -- да --> K[("зеркало в lead-канал «ЧАТ С ГЛАВНЫМ»")]
    C --> L["yield done → SSE закрыт"]
```

**Гарантии контура чата (код):**
- `filterToolDefinitions(agent.role, CHAT_TOOL_NAMES)` — в conversation-цикле
  агенту выдаются **только read-only инструменты** (`read_file`, `list_files`,
  `search_code`). `write_file`, `create_file`, `delete_file`, `run_command`
  отсутствуют в схеме для модели.
- Guard в tool-цикле: даже если модель проигнорировала инструкцию и эмитнула
  write/run — `isReadOnlyTool()` отклоняет вызов, модели возвращается отказ.
- Запуск auto-cycle из чата **полностью удалён**: `streamWorkspaceMessage`
  завершается после ответов агентов (строгий запрет, см. п.2).

## 2. Контур «Оркестратор / Исполнение» (Execution Loop)

Запускается **только явным действием пользователя** — отправкой задачи в
панели Оркестратора (кнопка запуска задачи / «Сгенерировать код»).

```mermaid
flowchart TD
    T["Пользователь: задача в панели Оркестратора (явное действие)"] --> U["POST /api/orchestrate/stream"]
    U --> V["runOrchestrator() — execution loop"]
    V --> V1["completeAgent(): полный набор инструментов (write_file, run_command…), tool-цикл до 4 раундов"]
    V1 --> V2["parsePatchInstruction (JSON) → пусто? → extractFencedPatches (```lang path блоки)"]
    V2 --> V3["applyWorkspacePatch → реальная запись на диск (fs)"]
    V3 --> V4["existsSync(): каждый изменённый файл"]
    V4 -- "файла нет" --> V4E["шаг остановлен, ошибка → self-correction"]
    V4 -- ок --> V5["ensureBuildDependencies: typescript/@types/vite в package.json + npm install"]
    V5 --> V6["runDirectCommand: npx tsc --noEmit, npm test — вердикт ТОЛЬКО по exitCode"]
    V6 --> V7{Все проверки exitCode == 0?}
    V7 -- "нет" --> V8["stderr → Главному агенту (fix-промпт) → следующая итерация (self-correction)"]
    V8 --> V1
    V7 -- "да + есть изменённые файлы" --> V9["✅ RELEASE_READY"]
    V7 -- "есть skipped" --> V10["⚠️ FAILED: RELEASE_READY запрещён"]
    V8 -- "лимит итераций исчерпан" --> V11["⚠️ FAILED: 'Лимит итераций исчерпан'"]
```

Запись на диск возможна **только** в этом контуре: `applyWorkspacePatch`
(патчи), tool-цикл `completeAgent` (полные инструменты), `ensureBuildDependencies`
(автозапись dev-зависимостей).

Зеркало статусов в «Общий чат агентов» — `mirrorToGroupChat()` через
`pushMessage({ toChat: true })`: 🚀 старт задачи, 🔧 применён патч, ❌ провал
проверок (stderr), ⚠️ FAILED, ✅ RELEASE_READY, ⏹ отмена.

## 3. Условия триггера авто-цикла (было → стало)

| Было (до исправления) | Стало |
|---|---|
| AUTO ☑ + **любое** сообщение в общий чат → фоновый auto-cycle (review/fix до 4 итераций, cap 10 мин) | **Удалено.** Чат не запускает авто-цикл ни при каких условиях |
| AUTO ☑ влиял только на фоновый чат-цикл | AUTO ☑ = режим Оркестратора: при старте задачи без явного mode — `autonomous` (иначе `controlled`) |

**Единственный триггер исполнения сейчас:** явная отправка задачи в панель
Оркестратора → `/api/orchestrate/stream`.

## 4. MAX_ITERATIONS / принудительное завершение

**Оркестратор (execution loop):**
- `maxIterations` — по умолчанию **5**, диапазон clamp **5…10**.
- Одна итерация = план/анализ → патч → проверки. Провал проверок → следующая
  итерация с stderr в fix-промпте (self-correction, до 5 попыток по умолчанию).
- Принудительное завершение:
  1. Все проверки `exitCode == 0` + есть изменённые файлы → `RELEASE_READY`.
  2. Любая проверка `skipped` → `FAILED` (немедленно).
  3. Исчерпан `maxIterations` → `FAILED` «Лимит итераций исчерпан».
  4. Отмена пользователя (`/api/orchestrate/cancel`, abort) → `cancelled`.
  5. Ошибка генерации (обрезанный JSON при отсутствии патчей) → `GENERATION_ERROR` → `FAILED`.

**Таймауты, страхующие от вечного «Выполняется»:**
- Gateway: connect-timeout 120 c на попытку; idle/stall-таймаут стрима 120 c
  без данных → 408 → фолбэк модели (3 ретрая + exponential backoff, Retry-After).
- Клиентский watchdog чата: 180 c без SSE-блоков → разрыв, кнопка «Остановить» сбрасывается.
- Оркестратор: проверки 300 c на команду; подтверждения в controlled-режиме — 10 мин.
- Устаревший файл `orchestrator-active.json` (после рестарта) сбрасывается при
  первом опросе `/api/orchestrate/state` — UI не зависает на «Выполняется».

## 5. Инструменты по контурам

| Инструмент | Чат | Оркестратор |
|---|---|---|
| read_file / list_files / search_code | ✅ | ✅ |
| write_file / create_file / delete_file | ❌ guard-отказ | ✅ |
| run_command | ❌ guard-отказ | ✅ (sandbox + verification через direct exec) |

## 6. Точки хранения

- Сообщения чата и зеркала: `chat_messages` (канал `group` / `lead`).
- Размышления авто-обсуждений и служебные события: `system_events` (панель ЛОГИ).
- История файлов и откатов: `file_history`, `workspace_file_history` + `.multi-agent-backups/`.
- Состояние задачи оркестратора: `orchestrator-active.json` (авто-сброс при «осиротении»).
