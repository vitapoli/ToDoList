# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-tests.spec.js >> Аутентификация >> вход с неверным паролем показывает ошибку
- Location: ui-tests.spec.js:81:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#authUsernameInput')

```

# Test source

```ts
  1   | /**
  2   |  * UI-тесты для ToDoList приложения (Playwright)
  3   |  *
  4   |  * Установка:
  5   |  *   npm init -y
  6   |  *   npm install --save-dev @playwright/test
  7   |  *   npx playwright install chromium
  8   |  *
  9   |  * Запуск:
  10  |  *   npx playwright test ui-tests.spec.js
  11  |  *
  12  |  * Перед запуском нужно запустить сервер:
  13  |  *    python server.py
  14  |  *   (сервер запустится на http://localhost:8001)
  15  |  */
  16  | 
  17  | const { test, expect } = require("@playwright/test");
  18  | 
  19  | // --- Настройки ---
  20  | const BASE_URL = "http://localhost:8080";
  21  | const TEST_USER = "TestUser_" + Date.now(); // уникальное имя для каждого запуска
  22  | const TEST_PASS = "testpass123";
  23  | 
  24  | // ======================================================================
  25  | // Вспомогательные функции
  26  | // ======================================================================
  27  | 
  28  | /** Логин или регистрация */
  29  | async function login(page, username = TEST_USER, passphrase = TEST_PASS) {
  30  |   await page.goto(BASE_URL);
> 31  |   await page.fill("#authUsernameInput", username);
      |              ^ Error: page.fill: Test timeout of 30000ms exceeded.
  32  |   await page.fill("#authPassphraseInput", passphrase);
  33  |   await page.click('#authForm button[type="submit"]');
  34  |   // Ждём пока доска появится
  35  |   await expect(page.locator(".app-shell")).toBeVisible();
  36  | }
  37  | 
  38  | /** Создать задачу через модальное окно */
  39  | async function createTask(page, title, options = {}) {
  40  |   await page.click("#openTaskModalBtn");
  41  |   await expect(page.locator("#taskModal")).toBeVisible();
  42  |   await page.fill("#titleInput", title);
  43  |   if (options.description) {
  44  |     await page.fill("#descriptionInput", options.description);
  45  |   }
  46  |   if (options.deadline) {
  47  |     await page.fill("#deadlineInput", options.deadline);
  48  |   }
  49  |   if (options.comment) {
  50  |     // Раскрываем "Дополнения"
  51  |     await page.click("#taskForm details summary");
  52  |     await page.fill("#initialCommentInput", options.comment);
  53  |   }
  54  |   await page.click('#taskForm button[type="submit"]');
  55  |   // Ждём закрытия модалки
  56  |   await expect(page.locator("#taskModal")).toBeHidden();
  57  | }
  58  | 
  59  | /** Получить количество карточек в колонке */
  60  | async function getColumnCount(page, columnId) {
  61  |   return await page.locator(`#${columnId} .task-card`).count();
  62  | }
  63  | 
  64  | // ======================================================================
  65  | // 1. АУТЕНТИФИКАЦИЯ
  66  | // ======================================================================
  67  | 
  68  | test.describe("Аутентификация", () => {
  69  |   test("показывает форму входа при первом открытии", async ({ page }) => {
  70  |     await page.goto(BASE_URL);
  71  |     await expect(page.locator("#authModal")).toBeVisible();
  72  |     await expect(page.locator(".app-shell")).toBeHidden();
  73  |   });
  74  | 
  75  |   test("регистрация нового пользователя", async ({ page }) => {
  76  |     const uniqueUser = "NewUser_" + Date.now();
  77  |     await login(page, uniqueUser, "pass123");
  78  |     await expect(page.locator("#currentUserLabel")).toContainText(uniqueUser);
  79  |   });
  80  | 
  81  |   test("вход с неверным паролем показывает ошибку", async ({ page }) => {
  82  |     // Сначала регистрируем
  83  |     const user = "WrongPass_" + Date.now();
  84  |     await login(page, user, "correct_pass");
  85  |     // Выходим
  86  |     await page.click("#logoutBtn");
  87  |     await expect(page.locator("#authModal")).toBeVisible();
  88  | 
  89  |     // Пробуем войти с неверным паролем
  90  |     page.on("dialog", (dialog) => dialog.dismiss());
  91  |     await page.fill("#authUsernameInput", user);
  92  |     await page.fill("#authPassphraseInput", "wrong_pass");
  93  |     await page.click('#authForm button[type="submit"]');
  94  | 
  95  |     // Остаёмся на странице входа
  96  |     await expect(page.locator("#authModal")).toBeVisible();
  97  |   });
  98  | 
  99  |   test("выход из аккаунта", async ({ page }) => {
  100 |     await login(page);
  101 |     await page.click("#logoutBtn");
  102 |     await expect(page.locator("#authModal")).toBeVisible();
  103 |     await expect(page.locator(".app-shell")).toBeHidden();
  104 |   });
  105 | 
  106 |   test("сессия сохраняется после перезагрузки", async ({ page }) => {
  107 |     await login(page);
  108 |     await page.reload();
  109 |     await expect(page.locator(".app-shell")).toBeVisible();
  110 |     await expect(page.locator("#currentUserLabel")).toContainText(TEST_USER);
  111 |   });
  112 | });
  113 | 
  114 | // ======================================================================
  115 | // 2. СОЗДАНИЕ ЗАДАЧ
  116 | // ======================================================================
  117 | 
  118 | test.describe("Создание задач", () => {
  119 |   test.beforeEach(async ({ page }) => {
  120 |     await login(page);
  121 |   });
  122 | 
  123 |   test("открытие модального окна создания задачи", async ({ page }) => {
  124 |     await page.click("#openTaskModalBtn");
  125 |     await expect(page.locator("#taskModal")).toBeVisible();
  126 |     // Фокус на поле названия
  127 |     await expect(page.locator("#titleInput")).toBeFocused();
  128 |   });
  129 | 
  130 |   test("создание задачи только с названием", async ({ page }) => {
  131 |     const before = await getColumnCount(page, "todoColumn");
```