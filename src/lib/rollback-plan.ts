// Порядок откатa задачи — единственная часть rollback, которую можно проверить
// без живой базы: в каком порядке восстанавливать файлы и что будет удалено.

export type HistoryEntry = {
  id: number;
  filePath: string;
  operation: string;
};

export type RollbackPlan = {
  /** Снимки в порядке применения: от нового к старому. */
  order: HistoryEntry[];
  /** Файлы, которые были созданы задачей — их нужно удалить. */
  created: string[];
  /** Файлы, которые существовали раньше — им вернётся прежнее содержимое. */
  restored: string[];
};

export function planRollback(rows: HistoryEntry[]): RollbackPlan {
  // Новые записи идут первыми: если файл меняли дважды, последний откат
  // возвращает состояние до задачи.
  const order = [...rows].sort((left, right) => right.id - left.id);
  const created = [...new Set(order.filter((row) => row.operation === "create").map((row) => row.filePath))];
  const restored = [...new Set(order.filter((row) => row.operation !== "create").map((row) => row.filePath))];
  return { order, created, restored };
}

export function summarizeRollback(plan: RollbackPlan, locale: "ru" | "en" = "ru") {
  const removed = plan.created.length;
  const restored = plan.restored.length;
  if (locale === "ru") {
    return `удалено новых файлов: ${removed}, восстановлено: ${restored}`;
  }
  return `new files removed: ${removed}, restored: ${restored}`;
}
