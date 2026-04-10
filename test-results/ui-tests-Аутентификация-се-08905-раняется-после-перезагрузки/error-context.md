# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-tests.spec.js >> Аутентификация >> сессия сохраняется после перезагрузки
- Location: ui-tests.spec.js:106:3

# Error details

```
Error: page.fill: Target page, context or browser has been closed
Call log:
  - waiting for locator('#authUsernameInput')

```

```
Error: browserContext.close: Target page, context or browser has been closed
```