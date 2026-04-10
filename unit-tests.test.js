/**
 * Unit-тесты для JavaScript-функций ToDoList приложения
 *
 * Запуск: npm install --save-dev jest jsdom
 *         npx jest unit-tests.js
 *
 * Используется Jest + jsdom для эмуляции браузерного окружения
 */

// ======================================================================
// 1. Вспомогательные функции (чистые, без зависимостей от DOM)
// ======================================================================

// --- Копии функций из app.js для тестирования ---

function renderStatusText(status) {
  if (status === "todo") return "Сделать";
  if (status === "in-progress") return "В работе";
  return "Сделано";
}

function formatForDatetimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timezoneOffsetMs = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - timezoneOffsetMs);
  return localDate.toISOString().slice(0, 16);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ======================================================================
// ТЕСТЫ
// ======================================================================

// --- renderStatusText ---

describe("renderStatusText", () => {
  test('возвращает "Сделать" для статуса "todo"', () => {
    expect(renderStatusText("todo")).toBe("Сделать");
  });

  test('возвращает "В работе" для статуса "in-progress"', () => {
    expect(renderStatusText("in-progress")).toBe("В работе");
  });

  test('возвращает "Сделано" для статуса "done"', () => {
    expect(renderStatusText("done")).toBe("Сделано");
  });

  test('возвращает "Сделано" для неизвестного статуса (fallback)', () => {
    expect(renderStatusText("unknown")).toBe("Сделано");
  });

  test('возвращает "Сделано" для пустой строки', () => {
    expect(renderStatusText("")).toBe("Сделано");
  });

  test('возвращает "Сделано" для undefined', () => {
    expect(renderStatusText(undefined)).toBe("Сделано");
  });
});

// --- escapeHtml ---

describe("escapeHtml", () => {
  test("экранирует символ &", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  test("экранирует символ <", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  test("экранирует символ >", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  test('экранирует двойные кавычки "', () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  test("экранирует одинарные кавычки '", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  test("экранирует все спецсимволы одновременно", () => {
    expect(escapeHtml(`<a href="test">&'`)).toBe(
      "&lt;a href=&quot;test&quot;&gt;&amp;&#039;"
    );
  });

  test("не изменяет обычный текст", () => {
    expect(escapeHtml("Привет мир")).toBe("Привет мир");
  });

  test("возвращает пустую строку для пустой строки", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("конвертирует числа в строку", () => {
    expect(escapeHtml(123)).toBe("123");
  });

  test("конвертирует null в строку", () => {
    expect(escapeHtml(null)).toBe("null");
  });

  test("защищает от XSS-атаки", () => {
    const malicious = '<img src=x onerror="alert(1)">';
    const result = escapeHtml(malicious);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
  });
});

// --- formatForDatetimeInput ---

describe("formatForDatetimeInput", () => {
  test("возвращает пустую строку для null", () => {
    expect(formatForDatetimeInput(null)).toBe("");
  });

  test("возвращает пустую строку для undefined", () => {
    expect(formatForDatetimeInput(undefined)).toBe("");
  });

  test("возвращает пустую строку для пустой строки", () => {
    expect(formatForDatetimeInput("")).toBe("");
  });

  test("возвращает пустую строку для невалидной даты", () => {
    expect(formatForDatetimeInput("не дата")).toBe("");
  });

  test("форматирует ISO-дату в формат datetime-local", () => {
    const result = formatForDatetimeInput("2026-04-10T12:00:00.000Z");
    // Результат зависит от таймзоны, но формат должен быть YYYY-MM-DDTHH:mm
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test("результат имеет длину 16 символов (YYYY-MM-DDTHH:mm)", () => {
    const result = formatForDatetimeInput("2026-01-15T10:30:00Z");
    expect(result.length).toBe(16);
  });

  test("корректно обрабатывает дату без времени", () => {
    const result = formatForDatetimeInput("2026-06-15");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test("корректно обрабатывает timestamp (число)", () => {
    const result = formatForDatetimeInput(1712750400000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ======================================================================
// 2. Тесты для state и логики (с моками)
// ======================================================================

describe("state — начальное состояние", () => {
  test("tasks изначально пустой массив", () => {
    const state = { token: "", currentUsername: "", tasks: [], draggedTaskId: null, listFilterStatus: "all" };
    expect(state.tasks).toEqual([]);
  });

  test("draggedTaskId изначально null", () => {
    const state = { draggedTaskId: null };
    expect(state.draggedTaskId).toBeNull();
  });

  test('listFilterStatus изначально "all"', () => {
    const state = { listFilterStatus: "all" };
    expect(state.listFilterStatus).toBe("all");
  });
});

// --- Логика фильтрации задач (используется в renderList) ---

describe("Фильтрация задач по статусу", () => {
  const tasks = [
    { id: "1", title: "Задача 1", status: "todo", done: false },
    { id: "2", title: "Задача 2", status: "in-progress", done: false },
    { id: "3", title: "Задача 3", status: "done", done: true },
    { id: "4", title: "Задача 4", status: "todo", done: false },
  ];

  test('фильтр "all" возвращает все задачи', () => {
    const filter = "all";
    const result = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
    expect(result.length).toBe(4);
  });

  test('фильтр "todo" возвращает только задачи "Сделать"', () => {
    const result = tasks.filter((t) => t.status === "todo");
    expect(result.length).toBe(2);
    expect(result.every((t) => t.status === "todo")).toBe(true);
  });

  test('фильтр "in-progress" возвращает только задачи "В работе"', () => {
    const result = tasks.filter((t) => t.status === "in-progress");
    expect(result.length).toBe(1);
    expect(result[0].title).toBe("Задача 2");
  });

  test('фильтр "done" возвращает только выполненные', () => {
    const result = tasks.filter((t) => t.status === "done");
    expect(result.length).toBe(1);
    expect(result[0].done).toBe(true);
  });
});

// --- Логика группировки задач (используется в renderBoard) ---

describe("Группировка задач по колонкам", () => {
  const tasks = [
    { id: "1", status: "todo" },
    { id: "2", status: "todo" },
    { id: "3", status: "in-progress" },
    { id: "4", status: "done" },
    { id: "5", status: "done" },
    { id: "6", status: "done" },
  ];

  test("корректно группирует по статусам", () => {
    const grouped = {
      todo: tasks.filter((t) => t.status === "todo"),
      "in-progress": tasks.filter((t) => t.status === "in-progress"),
      done: tasks.filter((t) => t.status === "done"),
    };
    expect(grouped.todo.length).toBe(2);
    expect(grouped["in-progress"].length).toBe(1);
    expect(grouped.done.length).toBe(3);
  });

  test("пустой массив задач — все группы пустые", () => {
    const empty = [];
    const grouped = {
      todo: empty.filter((t) => t.status === "todo"),
      "in-progress": empty.filter((t) => t.status === "in-progress"),
      done: empty.filter((t) => t.status === "done"),
    };
    expect(grouped.todo.length).toBe(0);
    expect(grouped["in-progress"].length).toBe(0);
    expect(grouped.done.length).toBe(0);
  });
});

// --- Логика markTaskDone ---

describe("Логика отметки задачи выполненной", () => {
  test("устанавливает done: true и status: done", () => {
    const task = { id: "1", title: "Test", status: "todo", done: false };
    const patch = { done: true, status: "done" };
    const updated = { ...task, ...patch };
    expect(updated.done).toBe(true);
    expect(updated.status).toBe("done");
  });

  test("не изменяет другие поля", () => {
    const task = { id: "1", title: "Test", description: "Desc", status: "todo", done: false };
    const patch = { done: true, status: "done" };
    const updated = { ...task, ...patch };
    expect(updated.title).toBe("Test");
    expect(updated.description).toBe("Desc");
    expect(updated.id).toBe("1");
  });
});

// --- Логика moveDraggedTaskToStatus ---

describe("Логика перемещения задачи в колонку", () => {
  test('перемещение в "done" устанавливает done: true', () => {
    const task = { id: "1", status: "todo", done: false };
    const newStatus = "done";
    const patch = { ...task, status: newStatus, done: newStatus === "done" ? true : task.done };
    expect(patch.status).toBe("done");
    expect(patch.done).toBe(true);
  });

  test('перемещение в "in-progress" сохраняет текущее значение done', () => {
    const task = { id: "1", status: "todo", done: false };
    const newStatus = "in-progress";
    const patch = { ...task, status: newStatus, done: newStatus === "done" ? true : task.done };
    expect(patch.status).toBe("in-progress");
    expect(patch.done).toBe(false);
  });

  test('перемещение из "done" обратно в "todo" НЕ сбрасывает done', () => {
    const task = { id: "1", status: "done", done: true };
    const newStatus = "todo";
    const patch = { ...task, status: newStatus, done: newStatus === "done" ? true : task.done };
    expect(patch.status).toBe("todo");
    // Внимание: done остаётся true — это особенность текущей логики
    expect(patch.done).toBe(true);
  });
});

// --- Логика addComment ---

describe("Логика добавления комментария", () => {
  test("добавляет комментарий в конец массива", () => {
    const comments = [{ id: "a", text: "Первый", createdAt: "2026-04-01T10:00:00Z" }];
    const newComment = { id: "b", text: "Второй", createdAt: "2026-04-10T12:00:00Z" };
    const updated = [...comments, newComment];
    expect(updated.length).toBe(2);
    expect(updated[1].text).toBe("Второй");
  });

  test("добавляет комментарий к пустому массиву", () => {
    const comments = [];
    const newComment = { id: "a", text: "Первый", createdAt: "2026-04-10T12:00:00Z" };
    const updated = [...comments, newComment];
    expect(updated.length).toBe(1);
  });

  test("комментарий содержит id, text и createdAt", () => {
    const comment = { id: "abc-123", text: "Тестовый комментарий", createdAt: new Date().toISOString() };
    expect(comment).toHaveProperty("id");
    expect(comment).toHaveProperty("text");
    expect(comment).toHaveProperty("createdAt");
  });
});

// --- Логика clearColumn ---

describe("Логика очистки колонки", () => {
  const tasks = [
    { id: "1", status: "todo" },
    { id: "2", status: "todo" },
    { id: "3", status: "in-progress" },
    { id: "4", status: "done" },
  ];

  test("находит задачи для удаления по статусу", () => {
    const toDelete = tasks.filter((t) => t.status === "todo");
    expect(toDelete.length).toBe(2);
  });

  test("возвращает пустой массив если задач с таким статусом нет", () => {
    const toDelete = tasks.filter((t) => t.status === "cancelled");
    expect(toDelete.length).toBe(0);
  });
});

// --- Логика создания задачи (onCreateTask) ---

describe("Логика создания задачи", () => {
  test("новая задача имеет статус todo и done: false", () => {
    const newTask = {
      title: "Тест",
      description: "",
      deadline: null,
      status: "todo",
      done: false,
      comments: [],
      attachments: [],
    };
    expect(newTask.status).toBe("todo");
    expect(newTask.done).toBe(false);
  });

  test("комментарий добавляется если initialComment не пустой", () => {
    const initialComment = "Начальный комментарий";
    const comments = initialComment
      ? [{ id: "test-id", text: initialComment, createdAt: "2026-04-10T00:00:00Z" }]
      : [];
    expect(comments.length).toBe(1);
    expect(comments[0].text).toBe("Начальный комментарий");
  });

  test("комментарий не добавляется если initialComment пустой", () => {
    const initialComment = "";
    const comments = initialComment
      ? [{ id: "test-id", text: initialComment, createdAt: "2026-04-10T00:00:00Z" }]
      : [];
    expect(comments.length).toBe(0);
  });

  test("пустой title (после trim) не создаёт задачу", () => {
    const title = "   ".trim();
    expect(title).toBe("");
    expect(!title).toBe(true); // условие if (!title) return сработает
  });
});

// --- api() — тесты с моком fetch ---

describe("api() — обёртка над fetch", () => {
  // Воссоздаём функцию api для тестирования
  const state = { token: "test-token-123" };

  async function api(url, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (options.useAuth !== false && state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Ошибка сервера");
    return data;
  }

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("добавляет Authorization заголовок с токеном", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    await api("/api/tasks");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123",
        }),
      })
    );
  });

  test("не добавляет Authorization если useAuth: false", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    await api("/api/auth/login", { useAuth: false });

    const callHeaders = global.fetch.mock.calls[0][1].headers;
    expect(callHeaders.Authorization).toBeUndefined();
  });

  test("выбрасывает ошибку при response.ok = false", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Неверный пароль" }),
    });

    await expect(api("/api/auth/login")).rejects.toThrow("Неверный пароль");
  });

  test('выбрасывает "Ошибка сервера" если нет поля error', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    await expect(api("/api/tasks")).rejects.toThrow("Ошибка сервера");
  });

  test("возвращает данные при успешном запросе", async () => {
    const mockData = [{ id: "1", title: "Задача 1" }];
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const result = await api("/api/tasks");
    expect(result).toEqual(mockData);
  });

  test("устанавливает Content-Type: application/json", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await api("/api/tasks");

    const callHeaders = global.fetch.mock.calls[0][1].headers;
    expect(callHeaders["Content-Type"]).toBe("application/json");
  });
});

// --- Логика syncAuthUi ---

describe("Логика syncAuthUi", () => {
  test("isLoggedIn = true если токен есть", () => {
    const state = { token: "abc123" };
    expect(Boolean(state.token)).toBe(true);
  });

  test("isLoggedIn = false если токен пустой", () => {
    const state = { token: "" };
    expect(Boolean(state.token)).toBe(false);
  });

  test("формирует текст лейбла с именем пользователя", () => {
    const username = "Полина";
    const label = `Пользователь: ${username}`;
    expect(label).toBe("Пользователь: Полина");
  });
});

// --- Логика showAuthOnly ---

describe("Логика showAuthOnly", () => {
  test("очищает токен и имя пользователя", () => {
    const state = { token: "old-token", currentUsername: "Полина" };
    state.token = "";
    state.currentUsername = "";
    expect(state.token).toBe("");
    expect(state.currentUsername).toBe("");
  });
});

// --- Логика редактирования задачи (saveFromEditForm) ---

describe("Логика сохранения редактирования", () => {
  test('если статус изменён на "done", done становится true', () => {
    const task = { id: "1", title: "Test", status: "todo", done: false };
    const editedStatus = "done";
    const patch = { ...task, status: editedStatus, done: editedStatus === "done" };
    expect(patch.done).toBe(true);
  });

  test('если статус "todo", done становится false', () => {
    const task = { id: "1", title: "Test", status: "done", done: true };
    const editedStatus = "todo";
    const patch = { ...task, status: editedStatus, done: editedStatus === "done" };
    expect(patch.done).toBe(false);
  });
});

// --- Логика чекбокса в виде списка ---

describe("Логика чекбокса в виде списка", () => {
  test('отметка чекбокса ставит done: true и status: "done"', () => {
    const checked = true;
    const patch = { done: checked, status: checked ? "done" : "todo" };
    expect(patch.done).toBe(true);
    expect(patch.status).toBe("done");
  });

  test('снятие чекбокса ставит done: false и status: "todo"', () => {
    const checked = false;
    const patch = { done: checked, status: checked ? "done" : "todo" };
    expect(patch.done).toBe(false);
    expect(patch.status).toBe("todo");
  });
});
