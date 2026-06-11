/* ========================================================
   Hermes Kanban — Application Logic
   ======================================================== */

const AGENTS = {
  kaveh:   { name: "Kaveh",   color: "#e5ad2f", icon: "crown" },
  dariush: { name: "Dariush", color: "#4f8ee8", icon: "wrench" },
  nazanin: { name: "Nazanin", color: "#d66fa8", icon: "palette" },
  shirin:  { name: "Shirin",  color: "#9175dc", icon: "pen-line" },
  aylin:   { name: "Aylin",   color: "#2fa9b5", icon: "search" },
  reza:    { name: "Reza",    color: "#4aa96c", icon: "zap" },
  yasaman: { name: "Yasaman", color: "#d9803a", icon: "chart-no-axes-column-increasing" }
};

const STATUSES = ["backlog", "ready", "running", "done", "blocked"];
const STATUS_LABELS = {
  backlog: "Backlog",
  ready: "To do",
  running: "In progress",
  done: "Done",
  blocked: "Blocked",
  archived: "Archived"
};
const STATUS_STYLES = {
  backlog:  ["#aab0ba", "rgba(170,176,186,.1)"],
  ready:    ["var(--violet)", "var(--violet-soft)"],
  running:  ["var(--blue)", "var(--blue-soft)"],
  done:     ["var(--green)", "var(--green-soft)"],
  blocked:  ["var(--red)", "var(--red-soft)"],
  archived: ["var(--faint)", "rgba(101,108,120,.1)"]
};
const PRIORITIES = {
  0: { label: "Normal", color: "#f5b82e" },
  1: { label: "High",   color: "#ff7d7d" },
  2: { label: "Low",    color: "#68d391" }
};

let authUser = sessionStorage.getItem("kanban_user") || "";
let authPass = sessionStorage.getItem("kanban_pass") || "";
let authHeader = authUser ? "Basic " + btoa(authUser + ":" + authPass) : "";

function setCredentials(user, pass) {
  authUser = user;
  authPass = pass;
  authHeader = "Basic " + btoa(user + ":" + pass);
  sessionStorage.setItem("kanban_user", user);
  sessionStorage.setItem("kanban_pass", pass);
}

function clearCredentials() {
  authUser = "";
  authPass = "";
  authHeader = "";
  sessionStorage.removeItem("kanban_user");
  sessionStorage.removeItem("kanban_pass");
}

const loginOverlay = document.getElementById("loginOverlay");
const loginError = document.getElementById("loginError");
const loginForm = document.getElementById("loginForm");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = document.getElementById("loginUser").value.trim();
  const pass = document.getElementById("loginPass").value;
  if (!user || !pass) return;
  setCredentials(user, pass);
  loginError.classList.remove("visible");
  try {
    await fetchJson("/api/tasks");
    loginOverlay.classList.add("hidden");
    lucide.createIcons();
    loadBoard();
  } catch (err) {
    clearCredentials();
    loginError.classList.add("visible");
    document.getElementById("loginPass").value = "";
  }
});

function logout() {
  clearCredentials();
  loginOverlay.classList.remove("hidden");
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPass").value = "";
  loginError.classList.remove("visible");
  tasks = [];
  renderBoard();
}

document.getElementById("logoutButton").addEventListener("click", logout);

let tasks = [];
let selectedAgent = "all";
let searchTerm = "";
let showArchived = false;
let dragTaskId = null;
let pointerDrag = null;
let toastTimer = null;
let suppressClickUntil = 0;
let activeMobileStatus = "backlog";
let latestAgentStats = [];

const board = document.getElementById("board");
const searchInput = document.getElementById("searchInput");
const agentFilters = document.getElementById("agentFilters");
const mobileBottomNav = document.getElementById("mobileBottomNav");
const mobileQuery = window.matchMedia("(max-width: 768px)");
const STATUS_ICONS = {
  backlog: "archive",
  ready: "circle-dashed",
  running: "loader-circle",
  done: "circle-check",
  blocked: "octagon-alert",
  archived: "archive"
};

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeStatus(status) {
  return status === "failed"
    ? "blocked"
    : (STATUSES.includes(status) || status === "archived" ? status : "blocked");
}

function relativeTime(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
}

function formatDate(iso) {
  return iso
    ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "Not set";
}

function agentFor(key) {
  return AGENTS[key] || { name: key || "Unassigned", color: "#5f6672", icon: "user" };
}

function avatarMarkup(key) {
  const agent = agentFor(key);
  return `<span class="avatar" style="background:${agent.color}"><img src="/static/avatars/${escapeHtml(key || "unknown")}.jpg" alt="${escapeHtml(agent.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"></span>`;
}

function isMobile() {
  return mobileQuery.matches;
}

function agentFilterMarkup(counts = {}) {
  const activeKeys = Object.keys(AGENTS).filter(key => counts[key] || tasks.some(task => task.assignee === key));
  return `
    <button class="agent-chip ${selectedAgent === "all" ? "active" : ""}" type="button" data-agent="all">
      All agents <span class="agent-count">${tasks.length}</span>
    </button>
    ${activeKeys.map(key => {
      const agent = AGENTS[key];
      return `<button class="agent-chip ${selectedAgent === key ? "active" : ""}" type="button" data-agent="${key}">
        <span class="agent-dot" style="background:${agent.color}"></span>${agent.name}<span class="agent-count">${counts[key] || 0}</span>
      </button>`;
    }).join("")}`;
}

function mobileControlsMarkup() {
  return `
    <div class="mobile-column-controls">
      <label class="search">
        <span class="sr-only">Search tasks</span>
        ${icon("search")}
        <input class="mobile-search-input" type="search" placeholder="Search tasks" autocomplete="off" value="${escapeHtml(searchTerm)}">
      </label>
      <div class="agent-filters mobile-agent-filters">${agentFilterMarkup(Object.fromEntries(latestAgentStats.map(item => [item.assignee || item.name, item.total || 0])))}</div>
    </div>`;
}

function ensureMobileColumnControls() {
  document.querySelectorAll(".column").forEach(column => {
    let controls = column.querySelector(".mobile-column-controls");
    if (!controls) {
      column.querySelector(".column-header").insertAdjacentHTML("afterend", mobileControlsMarkup());
    } else {
      controls.querySelector(".mobile-search-input").value = searchTerm;
      controls.querySelector(".mobile-agent-filters").innerHTML = agentFilterMarkup(
        Object.fromEntries(latestAgentStats.map(item => [item.assignee || item.name, item.total || 0]))
      );
    }
  });
}

function setActiveMobileStatus(status, { focus = false } = {}) {
  const available = showArchived ? [...STATUSES, "archived"] : STATUSES;
  activeMobileStatus = available.includes(status) ? status : "backlog";
  document.querySelectorAll(".column").forEach(column => {
    column.classList.toggle("mobile-active", column.dataset.status === activeMobileStatus);
  });
  mobileBottomNav.querySelectorAll(".mobile-nav-tab").forEach(tab => {
    const active = tab.dataset.status === activeMobileStatus;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
    if (active && focus) tab.focus();
  });
}

function renderMobileNavigation() {
  const statuses = showArchived ? [...STATUSES, "archived"] : STATUSES;
  if (!statuses.includes(activeMobileStatus)) activeMobileStatus = "backlog";
  mobileBottomNav.innerHTML = statuses.map(status => `
    <button class="mobile-nav-tab ${status === activeMobileStatus ? "active" : ""}" type="button"
      data-status="${status}" aria-label="${STATUS_LABELS[status]}" ${status === activeMobileStatus ? 'aria-current="page"' : ""}>
      ${icon(STATUS_ICONS[status])}
      <span class="mobile-nav-tab-label">${STATUS_LABELS[status]}</span>
      <span class="mobile-nav-count">${document.getElementById(`count-${status}`)?.textContent || "0"}</span>
    </button>`).join("");
  setActiveMobileStatus(activeMobileStatus);
}

function filteredTasks() {
  return tasks.filter(task => {
    const isArchived = task.status === "archived";
    if (isArchived && !showArchived) return false;
    const haystack = `${task.title || ""} ${task.body || ""} ${task.assignee || ""}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    const matchesAgent = selectedAgent === "all" || task.assignee === selectedAgent;
    return matchesSearch && matchesAgent;
  });
}

function renderCard(task) {
  const priority = PRIORITIES[Number(task.priority)] || PRIORITIES[0];
  const agent = agentFor(task.assignee);
  const shortId = String(task.id || "").replace(/^t_/, "").slice(0, 8);
  return `
    <article class="task-card" draggable="true" tabindex="0" role="button"
      data-task-id="${escapeHtml(task.id)}"
      aria-label="${escapeHtml(task.title)}. Open task details."
      style="--priority-color:${priority.color}">
      <div class="task-top">
        <span class="priority">${priority.label}</span>
        <span class="task-id">#${escapeHtml(shortId)}</span>
      </div>
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      ${task.body ? `<p class="task-description">${escapeHtml(task.body)}</p>` : ""}
      <div class="task-footer">
        ${task.assignee ? `${avatarMarkup(task.assignee)}<span class="assignee">${escapeHtml(agent.name)}</span>` : `<span class="unassigned">Unassigned</span>`}
        <span class="task-age">${relativeTime(task.created_at)}</span>
      </div>
    </article>`;
}

function renderBoard() {
  const visible = filteredTasks();
  const grouped = Object.fromEntries(STATUSES.map(status => [status, []]));
  const archivedTasks = [];
  visible.forEach(task => {
    if (task.status === "archived") archivedTasks.push(task);
    else grouped[normalizeStatus(task.status)].push(task);
  });

  STATUSES.forEach(status => {
    const column = document.getElementById(`column-${status}`);
    const statusTasks = grouped[status];
    column.innerHTML = statusTasks.length
      ? statusTasks.map(renderCard).join("")
      : `<div class="empty">${icon("inbox")}<span>${searchTerm || selectedAgent !== "all" ? "No matching tasks" : "Drop tasks here"}</span></div>`;
    document.getElementById(`count-${status}`).textContent = statusTasks.length;
  });

  // Dynamic archived column
  let archivedCol = document.getElementById("column-archived");
  const boardEl = document.getElementById("board");
  if (showArchived) {
    if (!archivedCol) {
      boardEl.insertAdjacentHTML("beforeend", `
        <section class="column" data-status="archived" id="archivedSection">
          <header class="column-header"><span class="status-icon"><i data-lucide="archive"></i></span><span class="column-title">Archived</span><span class="column-count" id="count-archived">0</span></header>
          <div class="column-body" id="column-archived"></div>
        </section>`);
      archivedCol = document.getElementById("column-archived");
      boardEl.style.gridTemplateColumns = "repeat(6, minmax(220px, 1fr))";
    }
    archivedCol.innerHTML = archivedTasks.length
      ? archivedTasks.map(renderCard).join("")
      : `<div class="empty">${icon("inbox")}<span>No archived tasks</span></div>`;
    document.getElementById("count-archived").textContent = archivedTasks.length;
  } else {
    const section = document.getElementById("archivedSection");
    if (section) section.remove();
    boardEl.style.gridTemplateColumns = "";
  }

  const open = tasks.filter(task => !["done", "archived"].includes(normalizeStatus(task.status))).length;
  const active = tasks.filter(task => ["ready", "running"].includes(normalizeStatus(task.status))).length;
  const done = tasks.filter(task => normalizeStatus(task.status) === "done").length;
  document.getElementById("metricOpen").textContent = open;
  document.getElementById("metricActive").textContent = active;
  document.getElementById("metricDone").textContent = done;
  ensureMobileColumnControls();
  renderMobileNavigation();
  lucide.createIcons();
}

function renderAgentFilters(agentStats = []) {
  latestAgentStats = agentStats;
  const counts = Object.fromEntries(agentStats.map(item => [item.assignee || item.name, item.total || 0]));
  agentFilters.innerHTML = agentFilterMarkup(counts);
  ensureMobileColumnControls();
}

function renderSkeletons() {
  STATUSES.forEach(status => {
    document.getElementById(`column-${status}`).innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  });
}

async function fetchJson(url, options) {
  const headers = { ...(options?.headers || {}) };
  if (authHeader) headers["Authorization"] = authHeader;
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    clearCredentials();
    loginOverlay.classList.remove("hidden");
    throw new Error("Authentication required");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

async function loadBoard({ quiet = false } = {}) {
  if (!quiet && tasks.length === 0) renderSkeletons();
  const refreshIcon = document.querySelector("#refreshButton svg");
  if (refreshIcon) refreshIcon.style.animation = "spin .4s ease-out 1";
  try {
    const [taskData, agentData] = await Promise.all([
      fetchJson("/api/tasks"),
      fetchJson("/api/agents")
    ]);
    tasks = taskData.tasks || [];
    renderAgentFilters(agentData.agents || []);
    renderBoard();
  } catch (error) {
    if (error.message === "Authentication required") {
      STATUSES.forEach(status => {
        document.getElementById(`column-${status}`).innerHTML = "";
      });
      lucide.createIcons();
    } else {
      showToast(error.message || "Could not load the board", true);
      if (tasks.length === 0) {
        STATUSES.forEach(status => {
          document.getElementById(`column-${status}`).innerHTML = `<div class="empty">${icon("cloud-off")}<span>Board unavailable</span></div>`;
        });
        lucide.createIcons();
      }
    }
  } finally {
    if (refreshIcon) refreshIcon.style.animation = "";
  }
}

async function moveTask(taskId, nextStatus) {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return;
  const currentStatus = task.status;
  if (normalizeStatus(currentStatus) === nextStatus) return;

  task.status = nextStatus;
  renderBoard();
  document.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`)?.classList.add("is-moving");

  try {
    await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    showToast(`Moved to ${STATUS_LABELS[nextStatus]}`);
    await loadBoard({ quiet: true });
  } catch (error) {
    task.status = currentStatus;
    renderBoard();
    showToast(error.message || "Move failed. The task was restored.", true);
  }
}

function clearDropTargets() {
  document.querySelectorAll(".column.is-over").forEach(column => column.classList.remove("is-over"));
  document.querySelectorAll(".mobile-nav-tab.is-over").forEach(tab => tab.classList.remove("is-over"));
}

board.addEventListener("dragstart", event => {
  const card = event.target.closest(".task-card");
  if (!card || pointerDrag) return;
  dragTaskId = card.dataset.taskId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragTaskId);
  requestAnimationFrame(() => card.classList.add("is-dragging"));
});

board.addEventListener("dragend", event => {
  event.target.closest(".task-card")?.classList.remove("is-dragging");
  dragTaskId = null;
  clearDropTargets();
});

board.addEventListener("dragenter", event => {
  const column = event.target.closest(".column");
  if (!dragTaskId || !column) return;
  event.preventDefault();
  clearDropTargets();
  column.classList.add("is-over");
});

board.addEventListener("dragover", event => {
  const column = event.target.closest(".column");
  if (!dragTaskId || !column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  column.classList.add("is-over");
});

board.addEventListener("dragleave", event => {
  const column = event.target.closest(".column");
  if (column && !column.contains(event.relatedTarget)) column.classList.remove("is-over");
});

board.addEventListener("drop", event => {
  const column = event.target.closest(".column");
  if (!column) return;
  event.preventDefault();
  const taskId = event.dataTransfer.getData("text/plain") || dragTaskId;
  clearDropTargets();
  if (taskId) moveTask(taskId, column.dataset.status);
});

function cancelPointerHold() {
  if (!pointerDrag) return;
  clearTimeout(pointerDrag.timer);
  if (!pointerDrag.active) pointerDrag = null;
}

board.addEventListener("pointerdown", event => {
  const card = event.target.closest(".task-card");
  if (!card || event.target.closest("button") || event.pointerType === "mouse") return;
  pointerDrag = {
    pointerId: event.pointerId,
    card,
    taskId: card.dataset.taskId,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    ghost: null,
    timer: setTimeout(() => startPointerDrag(event.clientX, event.clientY), 320)
  };
});

board.addEventListener("pointermove", event => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  if (!pointerDrag.active) {
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (distance > 9) cancelPointerHold();
    return;
  }
  event.preventDefault();
  positionGhost(event.clientX, event.clientY);
  updatePointerTarget(event.clientX, event.clientY);
});

board.addEventListener("pointerup", finishPointerDrag);
board.addEventListener("pointercancel", event => finishPointerDrag(event, true));

function startPointerDrag(x, y) {
  if (!pointerDrag) return;
  pointerDrag.active = true;
  pointerDrag.card.setPointerCapture?.(pointerDrag.pointerId);
  pointerDrag.card.classList.add("is-dragging");
  pointerDrag.ghost = pointerDrag.card.cloneNode(true);
  pointerDrag.ghost.classList.remove("is-dragging");
  pointerDrag.ghost.classList.add("drag-ghost");
  pointerDrag.ghost.removeAttribute("draggable");
  document.body.appendChild(pointerDrag.ghost);
  document.body.classList.add("pointer-dragging");
  navigator.vibrate?.(20);
  positionGhost(x, y);
  updatePointerTarget(x, y);
}

function positionGhost(x, y) {
  if (!pointerDrag?.ghost) return;
  pointerDrag.ghost.style.left = `${x + 14}px`;
  pointerDrag.ghost.style.top = `${y + 14}px`;
}

function updatePointerTarget(x, y) {
  if (!pointerDrag?.ghost) return;
  pointerDrag.ghost.hidden = true;
  const target = document.elementFromPoint(x, y)?.closest(".column, .mobile-nav-tab");
  pointerDrag.ghost.hidden = false;
  clearDropTargets();
  target?.classList.add("is-over");
}

function finishPointerDrag(event, cancelled = false) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  clearTimeout(pointerDrag.timer);
  if (!pointerDrag.active) {
    pointerDrag = null;
    return;
  }

  const { card, ghost, taskId } = pointerDrag;
  ghost.hidden = true;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".column, .mobile-nav-tab");
  ghost.remove();
  card.classList.remove("is-dragging");
  document.body.classList.remove("pointer-dragging");
  clearDropTargets();
  pointerDrag = null;
  suppressClickUntil = Date.now() + 450;
  if (!cancelled && target?.dataset.status) moveTask(taskId, target.dataset.status);
}

board.addEventListener("click", event => {
  if (Date.now() < suppressClickUntil) return;
  const card = event.target.closest(".task-card");
  if (card) showTaskDetail(card.dataset.taskId);
});

board.addEventListener("keydown", event => {
  if (!event.target.matches(".task-card")) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    showTaskDetail(event.target.dataset.taskId);
  }
});

function updateSearch(value) {
  searchTerm = value.toLowerCase().trim();
  searchInput.value = value;
  document.querySelectorAll(".mobile-search-input").forEach(input => {
    if (input.value !== value) input.value = value;
  });
  renderBoard();
}

searchInput.addEventListener("input", event => {
  updateSearch(event.target.value);
});

board.addEventListener("input", event => {
  if (!event.target.matches(".mobile-search-input")) return;
  updateSearch(event.target.value);
});

function selectAgent(agent) {
  selectedAgent = agent;
  renderAgentFilters(latestAgentStats);
  renderBoard();
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-agent]");
  if (!button) return;
  selectAgent(button.dataset.agent);
});

mobileBottomNav.addEventListener("click", event => {
  const tab = event.target.closest(".mobile-nav-tab");
  if (tab) setActiveMobileStatus(tab.dataset.status);
});

mobileBottomNav.addEventListener("dragover", event => {
  const tab = event.target.closest(".mobile-nav-tab");
  if (!dragTaskId || !tab) return;
  event.preventDefault();
  clearDropTargets();
  tab.classList.add("is-over");
});

mobileBottomNav.addEventListener("drop", event => {
  const tab = event.target.closest(".mobile-nav-tab");
  if (!tab) return;
  event.preventDefault();
  const taskId = event.dataTransfer.getData("text/plain") || dragTaskId;
  clearDropTargets();
  if (taskId) moveTask(taskId, tab.dataset.status);
});

mobileQuery.addEventListener("change", () => {
  setActiveMobileStatus(activeMobileStatus);
  const hasOpenPanel = Boolean(document.querySelector(".modal-backdrop.open"));
  document.body.classList.toggle("mobile-panel-open", isMobile() && hasOpenPanel);
});

function toggleMobileMenu(force) {
  const menu = document.getElementById("mobileMenu");
  const nextOpen = typeof force === "boolean" ? force : !menu.classList.contains("open");
  menu.classList.toggle("open", nextOpen);
  document.getElementById("mobileMenuButton").setAttribute("aria-expanded", String(nextOpen));
}

document.getElementById("mobileMenuButton").addEventListener("click", event => {
  event.stopPropagation();
  toggleMobileMenu();
});

document.addEventListener("click", event => {
  if (!event.target.closest(".mobile-menu-wrap")) toggleMobileMenu(false);
});

document.getElementById("mobileRefreshButton").addEventListener("click", () => {
  toggleMobileMenu(false);
  loadBoard();
});

document.getElementById("mobileLogoutButton").addEventListener("click", () => {
  toggleMobileMenu(false);
  logout();
});

function toggleArchived() {
  showArchived = !showArchived;
  if (showArchived && isMobile()) activeMobileStatus = "archived";
  if (!showArchived && activeMobileStatus === "archived") activeMobileStatus = "backlog";
  const btn = document.getElementById("archiveToggleButton");
  const mobileBtn = document.getElementById("mobileArchiveButton");
  btn.style.color = showArchived ? "var(--brand)" : "";
  btn.title = showArchived ? "Hide archived tasks" : "Show archived tasks";
  mobileBtn.style.color = showArchived ? "var(--brand)" : "";
  mobileBtn.querySelector("span").textContent = showArchived ? "Hide archived" : "Show archived";
  toggleMobileMenu(false);
  renderBoard();
}

document.getElementById("mobileArchiveButton").addEventListener("click", toggleArchived);

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
  if (isMobile()) document.body.classList.add("mobile-panel-open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  if (!document.querySelector(".modal-backdrop.open")) document.body.style.overflow = "";
  if (!document.querySelector(".modal-backdrop.open")) document.body.classList.remove("mobile-panel-open");
  if (id === "detailModal" && window.location.hash) {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
}

document.getElementById("newTaskButton").addEventListener("click", () => {
  document.getElementById("newTaskForm").reset();
  document.getElementById("taskPriority").value = "0";
  document.getElementById("taskWorkflow").value = "auto";
  openModal("newTaskModal");
  setTimeout(() => document.getElementById("taskTitle").focus(), 50);
});

document.getElementById("refreshButton").addEventListener("click", () => loadBoard());

document.getElementById("archiveToggleButton").addEventListener("click", toggleArchived);

document.querySelectorAll("[data-close-modal]").forEach(button => {
  button.addEventListener("click", () => closeModal(button.dataset.closeModal));
});

document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) closeModal(backdrop.id);
  });
});

document.getElementById("newTaskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = event.submitter;
  const title = document.getElementById("taskTitle").value.trim();
  if (!title) return;
  submitButton.disabled = true;
  try {
    await fetchJson("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body: document.getElementById("taskBody").value.trim() || null,
        assignee: document.getElementById("taskAssignee").value || null,
        priority: Number(document.getElementById("taskPriority").value),
        workflow: document.getElementById("taskWorkflow").value || "auto"
      })
    });
    closeModal("newTaskModal");
    showToast("Task added to the backlog");
    await loadBoard({ quiet: true });
  } catch (error) {
    showToast(error.message || "Could not create the task", true);
  } finally {
    submitButton.disabled = false;
  }
});

async function showTaskDetail(taskId) {
  try {
    const task = await fetchJson(`/api/tasks/${encodeURIComponent(taskId)}`);
    const agent = agentFor(task.assignee);
    const status = normalizeStatus(task.status);
    const [statusColor, statusBackground] = STATUS_STYLES[status];
    const priority = PRIORITIES[Number(task.priority)] || PRIORITIES[0];

    document.getElementById("detailTitle").textContent = task.title;
    document.getElementById("detailBody").innerHTML = `
      <div class="field">
        <label for="editTitle">Title</label>
        <input id="editTitle" type="text" value="${escapeHtml(task.title)}" maxlength="160" placeholder="Task title">
      </div>
      <div class="field">
        <label for="editBody">Description</label>
        <textarea id="editBody" placeholder="Add context and details...">${escapeHtml(task.body || "")}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="editAssignee">Assignee</label>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="assigneeAvatar" style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0">${task.assignee ? `<img src="/static/avatars/${escapeHtml(task.assignee)}.jpg" alt="" style="width:100%;height:100%;object-fit:cover">` : ""}</span>
            <select id="editAssignee" style="flex:1">
              <option value="" ${!task.assignee ? "selected" : ""}>Unassigned</option>
            <option value="kaveh" ${task.assignee === "kaveh" ? "selected" : ""}>Kaveh</option>
            <option value="dariush" ${task.assignee === "dariush" ? "selected" : ""}>Dariush</option>
            <option value="nazanin" ${task.assignee === "nazanin" ? "selected" : ""}>Nazanin</option>
            <option value="shirin" ${task.assignee === "shirin" ? "selected" : ""}>Shirin</option>
            <option value="aylin" ${task.assignee === "aylin" ? "selected" : ""}>Aylin</option>
            <option value="reza" ${task.assignee === "reza" ? "selected" : ""}>Reza</option>
            <option value="yasaman" ${task.assignee === "yasaman" ? "selected" : ""}>Yasaman</option>
          </select>
          </div>
        </div>
        <div class="field">
          <label for="editPriority">Priority</label>
          <select id="editPriority">
            <option value="2" ${Number(task.priority) === 2 ? "selected" : ""}>Low</option>
            <option value="0" ${Number(task.priority) === 0 ? "selected" : ""}>Normal</option>
            <option value="1" ${Number(task.priority) === 1 ? "selected" : ""}>High</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="editStatus">Status</label>
        <select id="editStatus">
          ${STATUSES.map(value => `<option value="${value}" ${value === status ? "selected" : ""}>${STATUS_LABELS[value]}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="editWorkflow">Workflow</label>
        <select id="editWorkflow">
          <option value="auto" ${(task.workflow || "auto") === "auto" ? "selected" : ""}>Auto — Start immediately</option>
          <option value="ask" ${task.workflow === "ask" ? "selected" : ""}>Ask — Ask questions first</option>
          <option value="plan" ${task.workflow === "plan" ? "selected" : ""}>Plan — Present plan, wait for approval</option>
        </select>
      </div>
      ${status === "done" ? `
      <div class="field">
        <label for="editCompletionNote">Completion Note</label>
        <textarea id="editCompletionNote" placeholder="What was done? Any important notes...">${escapeHtml(task.completion_note || "")}</textarea>
      </div>
      ` : ""}
      <div class="detail-facts">
        <div class="detail-fact">${icon("calendar-days")} Created ${formatDate(task.created_at)}</div>
        ${task.started_at ? `<div class="detail-fact">${icon("play")} Started ${formatDate(task.started_at)}</div>` : ""}
        ${task.completed_at ? `<div class="detail-fact">${icon("circle-check")} Completed ${formatDate(task.completed_at)}</div>` : ""}
        <div class="detail-fact">${icon("hash")} ${escapeHtml(task.id)}</div>
      </div>
      ${task.comments?.length ? `
        <div class="comments-title">Activity</div>
        ${task.comments.map(comment => {
          const author = agentFor(comment.author);
          return `<div class="comment"><div class="comment-head">${avatarMarkup(comment.author)}${escapeHtml(author.name)}<span class="comment-time">${relativeTime(comment.created_at)}</span></div><div class="comment-body">${escapeHtml(comment.body)}</div></div>`;
        }).join("")}` : ""}`;

    document.getElementById("detailFooter").innerHTML = `
      <button class="button button-danger" type="button" id="deleteTaskButton">${icon("trash-2")}Delete</button>
      ${status !== "archived" ? `<button class="button" type="button" id="archiveTaskButton" style="margin-left:8px">${icon("archive")}Archive</button>` : `<button class="button" type="button" id="restoreTaskButton" style="margin-left:8px">${icon("undo-2")}Restore</button>`}
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="button" type="button" data-close-modal="detailModal">Cancel</button>
        <button class="button button-primary" type="button" id="saveTaskButton">${icon("save")}Save changes</button>
      </div>`;
    document.getElementById("copyLinkHeader").addEventListener("click", () => {
      const url = window.location.origin + "/#" + task.id;
      navigator.clipboard.writeText(url).then(() => showToast("Link copied")).catch(() => {
        prompt("Copy this link:", url);
      });
    });
    document.getElementById("editAssignee").addEventListener("change", (e) => {
      const avatar = document.getElementById("assigneeAvatar");
      const val = e.target.value;
      avatar.innerHTML = val ? `<img src="/static/avatars/${escapeHtml(val)}.jpg" alt="" style="width:100%;height:100%;object-fit:cover">` : "";
    });
    document.getElementById("deleteTaskButton").addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this task?")) return;
      const btn = document.getElementById("deleteTaskButton");
      btn.disabled = true;
      try {
        await fetchJson(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
        closeModal("detailModal");
        showToast("Task deleted");
        await loadBoard({ quiet: true });
      } catch (error) {
        showToast(error.message || "Could not delete the task", true);
      } finally {
        btn.disabled = false;
      }
    });
    const archiveBtn = document.getElementById("archiveTaskButton");
    if (archiveBtn) archiveBtn.addEventListener("click", async () => {
      archiveBtn.disabled = true;
      try {
        await fetchJson(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" })
        });
        closeModal("detailModal");
        showToast("Task archived");
        await loadBoard({ quiet: true });
      } catch (error) {
        showToast(error.message || "Could not archive task", true);
      } finally { archiveBtn.disabled = false; }
    });
    const restoreBtn = document.getElementById("restoreTaskButton");
    if (restoreBtn) restoreBtn.addEventListener("click", async () => {
      restoreBtn.disabled = true;
      try {
        await fetchJson(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "backlog" })
        });
        closeModal("detailModal");
        showToast("Task restored to backlog");
        await loadBoard({ quiet: true });
      } catch (error) {
        showToast(error.message || "Could not restore task", true);
      } finally { restoreBtn.disabled = false; }
    });
    document.getElementById("saveTaskButton").addEventListener("click", async () => {
      const newTitle = document.getElementById("editTitle").value.trim();
      if (!newTitle) return;
      const btn = document.getElementById("saveTaskButton");
      btn.disabled = true;
      try {
        const body = {
          title: newTitle,
          body: document.getElementById("editBody").value.trim() || null,
          assignee: document.getElementById("editAssignee").value || null,
          priority: Number(document.getElementById("editPriority").value),
          status: document.getElementById("editStatus").value,
          workflow: document.getElementById("editWorkflow").value || "auto"
        };
        const completionNoteEl = document.getElementById("editCompletionNote");
        if (completionNoteEl) {
          body.completion_note = completionNoteEl.value.trim() || null;
        }
        await fetchJson(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        closeModal("detailModal");
        showToast("Task updated");
        await loadBoard({ quiet: true });
      } catch (error) {
        showToast(error.message || "Could not update the task", true);
      } finally {
        btn.disabled = false;
      }
    });
    document.querySelectorAll("[data-close-modal='detailModal']").forEach(el => {
      el.addEventListener("click", () => closeModal("detailModal"));
    });
    openModal("detailModal");
    window.location.hash = task.id;
    lucide.createIcons();
  } catch (error) {
    showToast(error.message || "Could not open task details", true);
  }
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  clearTimeout(toastTimer);
  toast.className = `toast visible${isError ? " error" : ""}`;
  toast.innerHTML = `${icon(isError ? "circle-alert" : "circle-check")}<span>${escapeHtml(message)}</span>`;
  lucide.createIcons();
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") document.querySelectorAll(".modal-backdrop.open").forEach(modal => closeModal(modal.id));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
    event.preventDefault();
    document.getElementById("newTaskButton").click();
  }
});

lucide.createIcons();
if (authHeader) {
  loginOverlay.classList.add("hidden");
  loadBoard().then(() => {
    if (window.location.hash) showTaskDetail(window.location.hash.slice(1));
  });
} else {
  loginOverlay.classList.remove("hidden");
}
setInterval(() => { if (authHeader) loadBoard({ quiet: true }); }, 30000);

const savedTheme = localStorage.getItem("kanban_theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
document.querySelector('meta[name="theme-color"]').content = savedTheme === "light" ? "#f5f6f8" : "#0b0d10";
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("kanban_theme", next);
  document.querySelector('meta[name="theme-color"]').content = next === "light" ? "#f5f6f8" : "#0b0d10";
  lucide.createIcons();
}
document.getElementById("themeToggle").addEventListener("click", toggleTheme);

window.addEventListener("hashchange", () => {
  if (window.location.hash) showTaskDetail(window.location.hash.slice(1));
  else closeModal("detailModal");
});
