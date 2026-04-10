/**
 * UI-тесты для ToDoList приложения (Playwright)
 *
 * Установка:
 *   npm init -y
 *   npm install --save-dev @playwright/test
 *   npx playwright install chromium
 *
 * Запуск:
 *   npx playwright test ui-tests.spec.js
 *
 * Перед запуском нужно запустить сервер:
 *    python server.py
 *   (сервер запустится на http://localhost:8001)
 */

const { test, expect } = require("@playwright/test");

// --- Настройки ---
const BASE_URL = "http://localhost:8080";
const TEST_USER = "TestUser_" + Date.now(); // уникальное имя для каждого запуска
const TEST_PASS = "testpass123";

// ======================================================================
// Вспомогательные функции
// ======================================================================

/** Логин или регистрация */
async function login(page, username = TEST_USER, passphrase = TEST_PASS) {
  await page.goto(BASE_URL);
  await page.fill("#authUsernameInput", username);
  await page.fill("#authPassphraseInput", passphrase);
  await page.click('#authForm button[type="submit"]');
  // Ждём пока доска появится
  await expect(page.locator(".app-shell")).toBeVisible();
}

/** Создать задачу через модальное окно */
async function createTask(page, title, options = {}) {
  await page.click("#openTaskModalBtn");
  await expect(page.locator("#taskModal")).toBeVisible();
  await page.fill("#titleInput", title);
  if (options.description) {
    await page.fill("#descriptionInput", options.description);
  }
  if (options.deadline) {
    await page.fill("#deadlineInput", options.deadline);
  }
  if (options.comment) {
    // Раскрываем "Дополнения"
    await page.click("#taskForm details summary");
    await page.fill("#initialCommentInput", options.comment);
  }
  await page.click('#taskForm button[type="submit"]');
  // Ждём закрытия модалки
  await expect(page.locator("#taskModal")).toBeHidden();
}

/** Получить количество карточек в колонке */
async function getColumnCount(page, columnId) {
  return await page.locator(`#${columnId} .task-card`).count();
}

// ======================================================================
// 1. АУТЕНТИФИКАЦИЯ
// ======================================================================

test.describe("Аутентификация", () => {
  test("показывает форму входа при первом открытии", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator("#authModal")).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();
  });

  test("регистрация нового пользователя", async ({ page }) => {
    const uniqueUser = "NewUser_" + Date.now();
    await login(page, uniqueUser, "pass123");
    await expect(page.locator("#currentUserLabel")).toContainText(uniqueUser);
  });

  test("вход с неверным паролем показывает ошибку", async ({ page }) => {
    // Сначала регистрируем
    const user = "WrongPass_" + Date.now();
    await login(page, user, "correct_pass");
    // Выходим
    await page.click("#logoutBtn");
    await expect(page.locator("#authModal")).toBeVisible();

    // Пробуем войти с неверным паролем
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.fill("#authUsernameInput", user);
    await page.fill("#authPassphraseInput", "wrong_pass");
    await page.click('#authForm button[type="submit"]');

    // Остаёмся на странице входа
    await expect(page.locator("#authModal")).toBeVisible();
  });

  test("выход из аккаунта", async ({ page }) => {
    await login(page);
    await page.click("#logoutBtn");
    await expect(page.locator("#authModal")).toBeVisible();
    await expect(page.locator(".app-shell")).toBeHidden();
  });

  test("сессия сохраняется после перезагрузки", async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator("#currentUserLabel")).toContainText(TEST_USER);
  });
});

// ======================================================================
// 2. СОЗДАНИЕ ЗАДАЧ
// ======================================================================

test.describe("Создание задач", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("открытие модального окна создания задачи", async ({ page }) => {
    await page.click("#openTaskModalBtn");
    await expect(page.locator("#taskModal")).toBeVisible();
    // Фокус на поле названия
    await expect(page.locator("#titleInput")).toBeFocused();
  });

  test("создание задачи только с названием", async ({ page }) => {
    const before = await getColumnCount(page, "todoColumn");
    await createTask(page, "Простая задача");
    const after = await getColumnCount(page, "todoColumn");
    expect(after).toBe(before + 1);
  });

  test("созданная задача появляется в колонке Сделать", async ({ page }) => {
    await createTask(page, "Задача в Сделать");
    const card = page.locator("#todoColumn .task-card", { hasText: "Задача в Сделать" });
    await expect(card).toBeVisible();
  });

  test("создание задачи со всеми полями", async ({ page }) => {
    await createTask(page, "Полная задача", {
      description: "Описание задачи",
      deadline: "2026-12-31T23:59",
      comment: "Первый комментарий",
    });
    const card = page.locator("#todoColumn .task-card", { hasText: "Полная задача" });
    await expect(card).toBeVisible();
    await expect(card.locator(".task-description")).toContainText("Описание задачи");
  });

  test("закрытие модалки кнопкой X", async ({ page }) => {
    await page.click("#openTaskModalBtn");
    await expect(page.locator("#taskModal")).toBeVisible();
    await page.click("#closeTaskModalBtn");
    await expect(page.locator("#taskModal")).toBeHidden();
  });

  test("закрытие модалки клавишей Escape", async ({ page }) => {
    await page.click("#openTaskModalBtn");
    await expect(page.locator("#taskModal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#taskModal")).toBeHidden();
  });

  test("закрытие модалки кликом на фон", async ({ page }) => {
    await page.click("#openTaskModalBtn");
    await expect(page.locator("#taskModal")).toBeVisible();
    // Кликаем на overlay (сам taskModal), а не на .modal внутри
    await page.locator("#taskModal").click({ position: { x: 10, y: 10 } });
    await expect(page.locator("#taskModal")).toBeHidden();
  });

  test("счётчик задач обновляется после создания", async ({ page }) => {
    const beforeText = await page.locator("#countTodo").textContent();
    const before = parseInt(beforeText);
    await createTask(page, "Задача для счётчика");
    const afterText = await page.locator("#countTodo").textContent();
    const after = parseInt(afterText);
    expect(after).toBe(before + 1);
  });

  test("форма очищается после создания задачи", async ({ page }) => {
    await createTask(page, "Задача для проверки формы");
    // Открываем модалку снова
    await page.click("#openTaskModalBtn");
    const titleValue = await page.locator("#titleInput").inputValue();
    expect(titleValue).toBe("");
  });
});

// ======================================================================
// 3. РЕДАКТИРОВАНИЕ ЗАДАЧ
// ======================================================================

test.describe("Редактирование задач", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await createTask(page, "Задача для редактирования");
  });

  test("открытие формы редактирования", async ({ page }) => {
    const card = page.locator(".task-card", { hasText: "Задача для редактирования" }).first();
    await card.locator(".edit-btn").click();
    await expect(card.locator(".edit-form")).toBeVisible();
  });

  test("изменение названия задачи", async ({ page }) => {
    const card = page.locator(".task-card", { hasText: "Задача для редактирования" }).first();
    await card.locator(".edit-btn").click();
    await card.locator('input[name="editTitle"]').fill("Изменённое название");
    await card.locator(".edit-form").locator('button[type="submit"]').click();
    // Ждём обновления
    await expect(page.locator(".task-card", { hasText: "Изменённое название" })).toBeVisible();
  });

  test("отмена редактирования", async ({ page }) => {
    const card = page.locator(".task-card", { hasText: "Задача для редактирования" }).first();
    await card.locator(".edit-btn").click();
    await card.locator('input[name="editTitle"]').fill("Не сохранять");
    await card.locator(".cancel-edit-btn").click();
    // Форма скрыта
    await expect(card.locator(".edit-form")).toBeHidden();
    // Название не изменилось
    await expect(card.locator(".task-title")).toContainText("Задача для редактирования");
  });

  test("изменение статуса через форму перемещает задачу", async ({ page }) => {
    const card = page.locator(".task-card", { hasText: "Задача для редактирования" }).first();
    await card.locator(".edit-btn").click();
    await card.locator('select[name="editStatus"]').selectOption("in-progress");
    await card.locator(".edit-form").locator('button[type="submit"]').click();
    // Задача в колонке "В работе"
    await expect(page.locator("#inProgressColumn .task-card", { hasText: "Задача для редактирования" })).toBeVisible();
  });
});

// ======================================================================
// 4. УДАЛЕНИЕ ЗАДАЧ
// ======================================================================

test.describe("Удаление задач", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("удаление одной задачи", async ({ page }) => {
    await createTask(page, "Удалить эту задачу");
    const card = page.locator(".task-card", { hasText: "Удалить эту задачу" }).first();
    await card.locator(".delete-btn").click();
    await expect(page.locator(".task-card", { hasText: "Удалить эту задачу" })).toHaveCount(0);
  });

  test("очистка колонки с подтверждением", async ({ page }) => {
    await createTask(page, "Удалить колонку 1");
    await createTask(page, "Удалить колонку 2");

    // Принимаем подтверждение
    page.on("dialog", (dialog) => dialog.accept());
    await page.click("#clearTodoBtn");

    // Ждём пока задачи исчезнут
    await expect(page.locator("#todoColumn .task-card")).toHaveCount(0);
  });

  test("отмена очистки колонки", async ({ page }) => {
    await createTask(page, "Не удалять");
    const before = await getColumnCount(page, "todoColumn");

    // Отклоняем подтверждение
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.click("#clearTodoBtn");

    const after = await getColumnCount(page, "todoColumn");
    expect(after).toBe(before);
  });
});

// ======================================================================
// 5. ОТМЕТКА ВЫПОЛНЕНИЯ
// ======================================================================

test.describe("Отметка задачи выполненной", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("кнопка-галочка перемещает задачу в Сделано", async ({ page }) => {
    await createTask(page, "Выполнить эту задачу");
    const card = page.locator("#todoColumn .task-card", { hasText: "Выполнить эту задачу" });
    await card.locator(".mark-done-btn").click();
    // Задача в колонке "Сделано"
    await expect(page.locator("#doneColumn .task-card", { hasText: "Выполнить эту задачу" })).toBeVisible();
  });

  test("кнопка-галочка заблокирована у выполненной задачи", async ({ page }) => {
    await createTask(page, "Уже готово");
    const card = page.locator("#todoColumn .task-card", { hasText: "Уже готово" });
    await card.locator(".mark-done-btn").click();
    // Кнопка заблокирована
    const doneCard = page.locator("#doneColumn .task-card", { hasText: "Уже готово" });
    await expect(doneCard.locator(".mark-done-btn")).toBeDisabled();
  });
});

// ======================================================================
// 6. DRAG & DROP
// ======================================================================

test.describe("Перетаскивание задач", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await createTask(page, "Перетащить задачу");
  });

  test("перетаскивание из Сделать в В работе", async ({ page }) => {
    const card = page.locator("#todoColumn .task-card", { hasText: "Перетащить задачу" });
    const target = page.locator("#inProgressColumn");

    await card.dragTo(target);

    // Задача должна переместиться
    await expect(page.locator("#inProgressColumn .task-card", { hasText: "Перетащить задачу" })).toBeVisible({ timeout: 3000 });
  });

  test("перетаскивание в Сделано", async ({ page }) => {
    const card = page.locator("#todoColumn .task-card", { hasText: "Перетащить задачу" });
    const target = page.locator("#doneColumn");

    await card.dragTo(target);

    await expect(page.locator("#doneColumn .task-card", { hasText: "Перетащить задачу" })).toBeVisible({ timeout: 3000 });
  });
});

// ======================================================================
// 7. КОММЕНТАРИИ
// ======================================================================

test.describe("Комментарии", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await createTask(page, "Задача с комментариями");
  });

  test("добавление комментария к задаче", async ({ page }) => {
    const card = page.locator(".task-card", { hasText: "Задача с комментариями" }).first();

    // Раскрываем "Дополнения" → "Комментарии"
    await card.locator("details").first().locator("summary").click();
    await card.locator("details details").locator("summary").click();

    // Вводим комментарий
    await card.locator('.comment-form input[name="comment"]').fill("Мой комментарий");
    await card.locator('.comment-form button[type="submit"]').click();

    // Ждём обновления — комментарий появился
    await expect(page.locator(".comments-list li", { hasText: "Мой комментарий" })).toBeVisible({ timeout: 3000 });
  });

  test("комментарий при создании задачи виден в карточке", async ({ page }) => {
    await createTask(page, "Задача с начальным комментарием", {
      comment: "Начальный комментарий",
    });

    const card = page.locator(".task-card", { hasText: "Задача с начальным комментарием" }).first();
    // Раскрываем дополнения
    await card.locator("details").first().locator("summary").click();
    await card.locator("details details").locator("summary").click();

    await expect(card.locator(".comments-list li", { hasText: "Начальный комментарий" })).toBeVisible();
  });
});

// ======================================================================
// 8. ПЕРЕКЛЮЧЕНИЕ ВИДОВ
// ======================================================================

test.describe("Переключение видов", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("переключение на вид Список", async ({ page }) => {
    await page.click("#listViewBtn");
    await expect(page.locator("#listView")).toBeVisible();
    await expect(page.locator("#boardView")).toBeHidden();
    await expect(page.locator("#listViewBtn")).toHaveClass(/is-active/);
  });

  test("переключение обратно на Доску", async ({ page }) => {
    await page.click("#listViewBtn");
    await page.click("#boardViewBtn");
    await expect(page.locator("#boardView")).toBeVisible();
    await expect(page.locator("#listView")).toBeHidden();
    await expect(page.locator("#boardViewBtn")).toHaveClass(/is-active/);
  });

  test("фильтрация по статусу в виде списка", async ({ page }) => {
    await createTask(page, "Фильтр-задача");
    await page.click("#listViewBtn");

    // Выбираем фильтр "Сделать"
    await page.selectOption("#statusFilterSelect", "todo");

    // Задача видна
    await expect(page.locator("#tasksTableBody tr", { hasText: "Фильтр-задача" })).toBeVisible();

    // Выбираем фильтр "Сделано" — задача скрыта
    await page.selectOption("#statusFilterSelect", "done");
    await expect(page.locator("#tasksTableBody tr", { hasText: "Фильтр-задача" })).toHaveCount(0);
  });

  test("чекбокс в виде списка отмечает задачу выполненной", async ({ page }) => {
    await createTask(page, "Чекбокс-задача");
    await page.click("#listViewBtn");

    const row = page.locator("#tasksTableBody tr", { hasText: "Чекбокс-задача" });
    await row.locator('input[type="checkbox"]').check();

    // Переключаемся на доску и проверяем что задача в "Сделано"
    await page.click("#boardViewBtn");
    await expect(page.locator("#doneColumn .task-card", { hasText: "Чекбокс-задача" })).toBeVisible();
  });
});

// ======================================================================
// 9. ИЗОЛЯЦИЯ ДАННЫХ ПОЛЬЗОВАТЕЛЕЙ
// ======================================================================

test.describe("Изоляция данных", () => {
  test("задачи не видны другим пользователям", async ({ page }) => {
    const userA = "UserA_" + Date.now();
    const userB = "UserB_" + Date.now();

    // Логин как UserA, создаём задачу
    await login(page, userA, "pass");
    await createTask(page, "Секретная задача UserA");
    await expect(page.locator(".task-card", { hasText: "Секретная задача UserA" })).toBeVisible();

    // Выходим, логинимся как UserB
    await page.click("#logoutBtn");
    await login(page, userB, "pass");

    // Задача UserA не видна
    await expect(page.locator(".task-card", { hasText: "Секретная задача UserA" })).toHaveCount(0);
  });
});

// ======================================================================
// 10. ОТОБРАЖЕНИЕ ЭЛЕМЕНТОВ
// ======================================================================

test.describe("Отображение UI-элементов", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("отображаются три колонки на доске", async ({ page }) => {
    await expect(page.locator("#todoColumn")).toBeVisible();
    await expect(page.locator("#inProgressColumn")).toBeVisible();
    await expect(page.locator("#doneColumn")).toBeVisible();
  });

  test("имя пользователя отображается в шапке", async ({ page }) => {
    await expect(page.locator("#currentUserLabel")).toContainText(TEST_USER);
  });

  test("кнопка Создать + видна", async ({ page }) => {
    await expect(page.locator("#openTaskModalBtn")).toBeVisible();
  });

  test("карточка задачи содержит кнопки управления", async ({ page }) => {
    await createTask(page, "Проверка кнопок");
    const card = page.locator(".task-card", { hasText: "Проверка кнопок" }).first();
    await expect(card.locator(".edit-btn")).toBeVisible();
    await expect(card.locator(".mark-done-btn")).toBeVisible();
    await expect(card.locator(".delete-btn")).toBeVisible();
  });

  test("задача без описания показывает 'Без описания'", async ({ page }) => {
    await createTask(page, "Задача без описания");
    const card = page.locator(".task-card", { hasText: "Задача без описания" }).first();
    await expect(card.locator(".task-description")).toContainText("Без описания");
  });

  test("задача без дедлайна показывает 'не указан'", async ({ page }) => {
    await createTask(page, "Задача без дедлайна");
    const card = page.locator(".task-card", { hasText: "Задача без дедлайна" }).first();
    await expect(card.locator(".deadline")).toContainText("не указан");
  });
});
