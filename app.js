const state = {
  token: localStorage.getItem("todo_auth_token") || "",
  currentUsername: localStorage.getItem("todo_auth_username") || "",
  tasks: [],
  draggedTaskId: null,
  listFilterStatus: "all",
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  authModal: document.getElementById("authModal"),
  authForm: document.getElementById("authForm"),
  authUsernameInput: document.getElementById("authUsernameInput"),
  authPassphraseInput: document.getElementById("authPassphraseInput"),
  currentUserLabel: document.getElementById("currentUserLabel"),
  logoutBtn: document.getElementById("logoutBtn"),

  taskForm: document.getElementById("taskForm"),
  titleInput: document.getElementById("titleInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  deadlineInput: document.getElementById("deadlineInput"),
  initialCommentInput: document.getElementById("initialCommentInput"),
  openTaskModalBtn: document.getElementById("openTaskModalBtn"),
  taskModal: document.getElementById("taskModal"),
  closeTaskModalBtn: document.getElementById("closeTaskModalBtn"),

  boardView: document.getElementById("boardView"),
  listView: document.getElementById("listView"),
  statusFilterSelect: document.getElementById("statusFilterSelect"),
  boardViewBtn: document.getElementById("boardViewBtn"),
  listViewBtn: document.getElementById("listViewBtn"),
  todoColumn: document.getElementById("todoColumn"),
  inProgressColumn: document.getElementById("inProgressColumn"),
  doneColumn: document.getElementById("doneColumn"),
  clearTodoBtn: document.getElementById("clearTodoBtn"),
  clearProgressBtn: document.getElementById("clearProgressBtn"),
  clearDoneBtn: document.getElementById("clearDoneBtn"),
  countTodo: document.getElementById("countTodo"),
  countProgress: document.getElementById("countProgress"),
  countDone: document.getElementById("countDone"),
  taskCardTemplate: document.getElementById("taskCardTemplate"),
  tasksTableBody: document.getElementById("tasksTableBody"),
};

init();

function init() {
  registerServiceWorker();
  bindEvents();
  syncAuthUi();
  if (state.token) {
    bootstrap().catch(() => showAuthOnly());
  } else {
    showAuthOnly();
  }
}

function bindEvents() {
  elements.authForm.addEventListener("submit", onAuthSubmit);
  elements.logoutBtn.addEventListener("click", logout);

  elements.taskForm.addEventListener("submit", onCreateTask);
  elements.openTaskModalBtn.addEventListener("click", openTaskModal);
  elements.closeTaskModalBtn.addEventListener("click", closeTaskModal);
  elements.boardViewBtn.addEventListener("click", () => setView("board"));
  elements.listViewBtn.addEventListener("click", () => setView("list"));
  elements.statusFilterSelect.addEventListener("change", () => {
    state.listFilterStatus = elements.statusFilterSelect.value;
    renderList();
  });
  if (elements.clearTodoBtn) elements.clearTodoBtn.addEventListener("click", () => clearColumn("todo"));
  if (elements.clearProgressBtn) elements.clearProgressBtn.addEventListener("click", () => clearColumn("in-progress"));
  if (elements.clearDoneBtn) elements.clearDoneBtn.addEventListener("click", () => clearColumn("done"));

  elements.taskModal.addEventListener("click", (event) => {
    if (event.target === elements.taskModal) closeTaskModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeTaskModal();
  });

  [elements.todoColumn, elements.inProgressColumn, elements.doneColumn].forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", () => {
      zone.classList.remove("drag-over");
      const status = zone.parentElement.dataset.status;
      moveDraggedTaskToStatus(status);
    });
  });
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const username = elements.authUsernameInput.value.trim();
  const passphrase = elements.authPassphraseInput.value.trim();
  if (!username || !passphrase) return;

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, passphrase }),
      useAuth: false,
    });
    state.token = data.token;
    state.currentUsername = data.username;
    localStorage.setItem("todo_auth_token", state.token);
    localStorage.setItem("todo_auth_username", state.currentUsername);
    elements.authForm.reset();
    await bootstrap();
  } catch (error) {
    alert(error.message || "Не удалось войти.");
  }
}

async function bootstrap() {
  state.tasks = await api("/api/tasks");
  syncAuthUi();
  renderAll();
}

function syncAuthUi() {
  const isLoggedIn = Boolean(state.token);
  elements.appShell.classList.toggle("hidden", !isLoggedIn);
  elements.authModal.classList.toggle("hidden", isLoggedIn);
  elements.logoutBtn.classList.toggle("hidden", !isLoggedIn);
  elements.currentUserLabel.classList.toggle("hidden", !isLoggedIn);
  elements.currentUserLabel.textContent = isLoggedIn ? `Пользователь: ${state.currentUsername}` : "";
}

function showAuthOnly() {
  state.token = "";
  state.currentUsername = "";
  localStorage.removeItem("todo_auth_token");
  localStorage.removeItem("todo_auth_username");
  syncAuthUi();
}

async function logout() {
  if (state.token) {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (_error) {
      // nothing
    }
  }
  showAuthOnly();
}

async function onCreateTask(event) {
  event.preventDefault();
  const title = elements.titleInput.value.trim();
  if (!title) return;

  const initialComment = elements.initialCommentInput.value.trim();
  const comments = initialComment
    ? [{ id: crypto.randomUUID(), text: initialComment, createdAt: new Date().toISOString() }]
    : [];

  await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title,
      description: elements.descriptionInput.value.trim(),
      deadline: elements.deadlineInput.value || null,
      status: "todo",
      done: false,
      comments,
      attachments: [],
    }),
  });

  elements.taskForm.reset();
  closeTaskModal();
  await refreshTasks();
}

async function deleteTask(taskId) {
  try {
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    await refreshTasks();
  } catch (error) {
    alert(error.message || "Не удалось удалить задачу");
  }
}

async function clearColumn(status) {
  const tasksToDelete = state.tasks.filter((task) => task.status === status);
  if (tasksToDelete.length === 0) return;

  const statusLabel = renderStatusText(status);
  const ok = confirm(`Удалить все задачи из колонки "${statusLabel}"? (${tasksToDelete.length} шт.)`);
  if (!ok) return;

  try {
    await api(`/api/tasks/clear/${status}`, { method: "POST", body: JSON.stringify({}) });
    await refreshTasks();
  } catch (error) {
    alert(error.message || "Не удалось очистить колонку");
  }
}

async function updateTask(taskId, patch) {
  try {
    await api(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(patch) });
    await refreshTasks();
  } catch (error) {
    alert(error.message || "Не удалось обновить задачу");
  }
}

async function markTaskDone(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  await updateTask(taskId, { done: true, status: "done" });
}

async function addComment(taskId, text) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  await updateTask(taskId, { ...task, comments: [...task.comments, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] });
}

async function addAttachment(taskId, attachment) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  await updateTask(taskId, { ...task, attachments: [...task.attachments, attachment] });
}

function setView(type) {
  const isBoard = type === "board";
  elements.boardView.classList.toggle("hidden", !isBoard);
  elements.listView.classList.toggle("hidden", isBoard);
  elements.boardViewBtn.classList.toggle("is-active", isBoard);
  elements.listViewBtn.classList.toggle("is-active", !isBoard);
}

async function moveDraggedTaskToStatus(status) {
  if (!state.draggedTaskId) return;
  const task = state.tasks.find((item) => item.id === state.draggedTaskId);
  if (!task) return;
  state.draggedTaskId = null;
  await updateTask(task.id, { ...task, status, done: status === "done" ? true : task.done });
}

function openTaskModal() {
  elements.taskModal.classList.remove("hidden");
  elements.titleInput.focus();
}
function closeTaskModal() {
  elements.taskModal.classList.add("hidden");
}
async function refreshTasks() {
  state.tasks = await api("/api/tasks");
  renderBoard();
  renderList();
}

function renderAll() {
  renderBoard();
  renderList();
}

function renderBoard() {
  elements.todoColumn.innerHTML = "";
  elements.inProgressColumn.innerHTML = "";
  elements.doneColumn.innerHTML = "";

  const grouped = {
    todo: state.tasks.filter((task) => task.status === "todo"),
    "in-progress": state.tasks.filter((task) => task.status === "in-progress"),
    done: state.tasks.filter((task) => task.status === "done"),
  };

  grouped.todo.forEach((task) => elements.todoColumn.appendChild(createTaskCard(task)));
  grouped["in-progress"].forEach((task) => elements.inProgressColumn.appendChild(createTaskCard(task)));
  grouped.done.forEach((task) => elements.doneColumn.appendChild(createTaskCard(task)));

  elements.countTodo.textContent = String(grouped.todo.length);
  elements.countProgress.textContent = String(grouped["in-progress"].length);
  elements.countDone.textContent = String(grouped.done.length);
}

function renderList() {
  elements.tasksTableBody.innerHTML = "";
  const visibleTasks = state.listFilterStatus === "all"
    ? state.tasks
    : state.tasks.filter((task) => task.status === state.listFilterStatus);

  visibleTasks.forEach((task) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${renderStatusText(task.status)}</td>
      <td>${escapeHtml(task.title)}</td>
      <td>${task.deadline ? new Date(task.deadline).toLocaleString() : "-"}</td>
      <td><input type="checkbox" ${task.done ? "checked" : ""}></td>
    `;
    const checkbox = tr.querySelector("input");
    checkbox.addEventListener("change", async (event) => {
      const checked = event.target.checked;
      await updateTask(task.id, { ...task, done: checked, status: checked ? "done" : "todo" });
    });
    elements.tasksTableBody.appendChild(tr);
  });
}

function createTaskCard(task) {
  const fragment = elements.taskCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  card.dataset.taskId = task.id;
  card.querySelector(".task-title").textContent = task.title;
  card.querySelector(".task-description").textContent = task.description || "Без описания";
  card.querySelector(".deadline").textContent = task.deadline
    ? `Дедлайн: ${new Date(task.deadline).toLocaleString()}`
    : "Дедлайн: не указан";

  const markDoneBtn = card.querySelector(".mark-done-btn");
  markDoneBtn.disabled = task.done;
  markDoneBtn.addEventListener("click", () => markTaskDone(task.id));
  card.querySelector(".delete-btn").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteTask(task.id);
  });

  const editBtn = card.querySelector(".edit-btn");
  const editForm = card.querySelector(".edit-form");
  const cancelEditBtn = card.querySelector(".cancel-edit-btn");
  editForm.elements.editTitle.value = task.title;
  editForm.elements.editDescription.value = task.description || "";
  editForm.elements.editDeadline.value = formatForDatetimeInput(task.deadline);
  editForm.elements.editStatus.value = task.status;

  const saveFromEditForm = async () => {
    const title = editForm.elements.editTitle.value.trim();
    if (!title) return;
    const status = editForm.elements.editStatus.value;
    await updateTask(task.id, {
      ...task,
      title,
      description: editForm.elements.editDescription.value.trim(),
      deadline: editForm.elements.editDeadline.value || null,
      status,
      done: status === "done",
    });
  };

  editBtn.addEventListener("click", async () => {
    const isEditing = !editForm.classList.contains("hidden");
    if (!isEditing) {
      editForm.classList.remove("hidden");
      editBtn.classList.add("is-editing");
      return;
    }
    await saveFromEditForm();
  });
  cancelEditBtn.addEventListener("click", () => {
    editForm.classList.add("hidden");
    editBtn.classList.remove("is-editing");
  });
  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFromEditForm();
  });

  const commentsList = card.querySelector(".comments-list");
  const detailsBlocks = card.querySelectorAll("details");
  detailsBlocks.forEach((block) => block.removeAttribute("open"));
  task.comments.forEach((comment) => {
    const li = document.createElement("li");
    li.textContent = `${comment.text} (${new Date(comment.createdAt).toLocaleString()})`;
    commentsList.appendChild(li);
  });
  const commentForm = card.querySelector(".comment-form");
  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = commentForm.elements.comment.value.trim();
    if (!text) return;
    await addComment(task.id, text);
  });

  const attachmentsList = card.querySelector(".attachments-list");
  task.attachments.forEach((item) => {
    if (item.type !== "audio") return;
    const div = document.createElement("div");
    div.className = "attachment-item";
    const label = document.createElement("strong");
    label.textContent = "Аудио:";
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = item.url;
    div.appendChild(label);
    div.appendChild(document.createElement("br"));
    div.appendChild(audio);
    attachmentsList.appendChild(div);
  });

  const attachForm = card.querySelector(".attach-form");
  const startRecordBtn = card.querySelector(".start-record-btn");
  const stopRecordBtn = card.querySelector(".stop-record-btn");
  const recordStatus = card.querySelector(".record-status");
  let recorder = null;
  let recorderStream = null;
  let recorderChunks = [];
  attachForm.addEventListener("submit", (event) => event.preventDefault());

  startRecordBtn.addEventListener("click", async () => {
    try {
      recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(recorderStream);
      recorderChunks = [];
      recorder.addEventListener("dataavailable", (evt) => {
        if (evt.data.size > 0) recorderChunks.push(evt.data);
      });
      recorder.addEventListener("stop", async () => {
        const blob = new Blob(recorderChunks, { type: recorder.mimeType || "audio/webm" });
        const upload = await api("/api/uploads/audio", {
          method: "POST",
          body: JSON.stringify({ dataUrl: await blobToDataUrl(blob), mimeType: blob.type || "audio/webm" }),
        });
        await addAttachment(task.id, { id: crypto.randomUUID(), type: "audio", name: "voice-message", url: upload.url });
        recorderStream.getTracks().forEach((track) => track.stop());
      });
      recorder.start();
      startRecordBtn.disabled = true;
      stopRecordBtn.disabled = false;
      recordStatus.textContent = "Идет запись...";
    } catch (error) {
      alert("Нет доступа к микрофону.");
    }
  });
  stopRecordBtn.addEventListener("click", () => {
    if (!recorder || recorder.state !== "recording") return;
    recorder.stop();
    startRecordBtn.disabled = false;
    stopRecordBtn.disabled = true;
    recordStatus.textContent = "Не записывается";
  });

  card.addEventListener("dragstart", (event) => {
    if (event.target.closest("button, input, textarea, select, details, summary, form, audio, a")) {
      event.preventDefault();
      return;
    }
    state.draggedTaskId = task.id;
  });
  card.addEventListener("dragend", () => {
    state.draggedTaskId = null;
  });

  return card;
}

function renderStatusText(status) {
  if (status === "todo") return "Сделать";
  if (status === "in-progress") return "В работе";
  return "Сделано";
}

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (options.useAuth !== false && state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
