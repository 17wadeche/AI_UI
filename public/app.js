const DEFAULT_SYSTEM = `You are Chey's local coding assistant.

Answer directly and keep responses concise unless I ask for more detail.
Do not reveal hidden reasoning, planning, chain-of-thought, or <think> blocks.
Be honest when you are unsure.
Do not invent APIs, packages, files, or commands.
For code, prefer simple working examples.
When writing code, always use fenced code blocks with the correct language, like \`\`\`html, \`\`\`css, \`\`\`javascript, or \`\`\`python.
If you propose file edits, prefer a unified git diff in a \`\`\`diff code block.
Explain things clearly and step by step.
When debugging, ask for the error message or file contents if needed.
Do not overcomplicate small projects.
Focus on JavaScript, HTML, CSS, Python, React, APIs, VS Code, GitHub, and app development.`;

const PRESETS = {
  coding: DEFAULT_SYSTEM,
  appBuilder: `You are Chey's local app-building assistant.

Answer directly. Do not reveal hidden reasoning or <think> blocks.
Help plan, build, and improve apps step by step.
Prefer simple, working code over complicated architecture.
When giving code, use fenced code blocks with correct languages.
Explain where each file should go.
Ask for missing requirements instead of guessing.
Warn about risky commands before using them.`,
  bugFixer: `You are Chey's local debugging assistant.

Answer directly. Do not reveal hidden reasoning or <think> blocks.
Focus on finding the exact cause of bugs.
Do not guess. Ask for the error message, file contents, or command output if needed.
Give the smallest safe fix first.
Explain why the bug happened.
When giving code, use fenced code blocks with correct languages.`
};

const els = {
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  modelStatus: document.getElementById("modelStatus"),
  refreshStatus: document.getElementById("refreshStatus"),
  downloadModel: document.getElementById("downloadModel"),
  downloadProgress: document.getElementById("downloadProgress"),

  selectChats: document.getElementById("selectChats"),
  deleteSelectedChats: document.getElementById("deleteSelectedChats"),
  cancelSelectChats: document.getElementById("cancelSelectChats"),
  deleteAllChats: document.getElementById("deleteAllChats"),
  chatSearch: document.getElementById("chatSearch"),
  newChat: document.getElementById("newChat"),
  chatList: document.getElementById("chatList"),
  exportFormat: document.getElementById("exportFormat"),
  exportChat: document.getElementById("exportChat"),
  themeToggle: document.getElementById("themeToggle"),

  messages: document.getElementById("messages"),
  input: document.getElementById("input"),
  send: document.getElementById("send"),
  stop: document.getElementById("stop"),
  footerStatus: document.getElementById("status"),

  model: document.getElementById("model"),
  contextPreset: document.getElementById("contextPreset"),
  context: document.getElementById("context"),
  temperature: document.getElementById("temperature"),
  tempValue: document.getElementById("tempValue"),
  thinking: document.getElementById("thinking"),
  tokenBar: document.getElementById("tokenBar"),
  tokenEstimate: document.getElementById("tokenEstimate"),
  tokenWarning: document.getElementById("tokenWarning"),
  promptPreset: document.getElementById("promptPreset"),
  applyPreset: document.getElementById("applyPreset"),
  system: document.getElementById("system"),

  hideSettings: document.getElementById("hideSettings"),
  showSettings: document.getElementById("showSettings"),

  githubUrl: document.getElementById("githubUrl"),
  cloneRepo: document.getElementById("cloneRepo"),
  gitPull: document.getElementById("gitPull"),
  selectFolder: document.getElementById("selectFolder"),
  refreshProject: document.getElementById("refreshProject"),
  clearProject: document.getElementById("clearProject"),
  projectStatus: document.getElementById("projectStatus"),

  gitStatusBtn: document.getElementById("gitStatusBtn"),
  gitDiffBtn: document.getElementById("gitDiffBtn"),
  commitMsgBtn: document.getElementById("commitMsgBtn"),
  undoPatchBtn: document.getElementById("undoPatchBtn"),
  gitOutput: document.getElementById("gitOutput"),

  projectSearch: document.getElementById("projectSearch"),
  searchCodeBtn: document.getElementById("searchCodeBtn"),
  selectSearchResults: document.getElementById("selectSearchResults"),
  projectSelectedCount: document.getElementById("projectSelectedCount"),
  projectFiles: document.getElementById("projectFiles"),

  explainProjectBtn: document.getElementById("explainProjectBtn"),
  bugFinderBtn: document.getElementById("bugFinderBtn"),
  diffPromptBtn: document.getElementById("diffPromptBtn"),
  logAnalyzerBtn: document.getElementById("logAnalyzerBtn"),
  patchPreview: document.getElementById("patchPreview"),
  applyPatchBtn: document.getElementById("applyPatchBtn"),
  terminalCommand: document.getElementById("terminalCommand"),
  runCommandBtn: document.getElementById("runCommandBtn")
};

let chats = [];
let currentChatId = null;
let abortController = null;
let project = { folder: null, files: [], visibleFiles: [] };
let chatSelectionMode = false;
let selectedChatIds = new Set();

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCurrentChat() {
  return chats.find((chat) => chat.id === currentChatId);
}

function cleanModelOutput(content) {
  let text = content || "";
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const closingThink = text.toLowerCase().lastIndexOf("</think>");
  if (closingThink !== -1) {
    text = text.slice(closingThink + "</think>".length).trim();
  }

  text = text.replace(/^Answer:\s*/i, "").trim();
  return text;
}

function loadState() {
  const settings = JSON.parse(localStorage.getItem("chey-ai-settings") || "{}");

  els.model.value = settings.model || "qwen3:4b";
  els.context.value = settings.context || "8192";
  els.contextPreset.value = ["4096", "8192", "16384", "32768"].includes(els.context.value) ? els.context.value : "8192";
  els.temperature.value = settings.temperature ?? "0";
  els.thinking.checked = Boolean(settings.thinking);
  els.system.value = settings.system || DEFAULT_SYSTEM;

  document.body.dataset.theme = settings.theme || "dark";
  document.body.classList.toggle("settings-hidden", Boolean(settings.settingsHidden));
  els.showSettings?.classList.toggle("hidden", !document.body.classList.contains("settings-hidden"));
  els.themeToggle.textContent = document.body.dataset.theme === "dark" ? "☀︎" : "☾";

  chats = JSON.parse(localStorage.getItem("chey-ai-chats") || "[]");
  currentChatId = localStorage.getItem("chey-ai-current-chat");

  if (!chats.length || !getCurrentChat()) createNewChat(false);
}

function saveSettings() {
  localStorage.setItem("chey-ai-settings", JSON.stringify({
    model: els.model.value,
    context: els.context.value,
    temperature: els.temperature.value,
    thinking: els.thinking.checked,
    system: els.system.value,
    theme: document.body.dataset.theme,
    settingsHidden: document.body.classList.contains("settings-hidden")
  }));
}

function saveChats() {
  localStorage.setItem("chey-ai-chats", JSON.stringify(chats));
  localStorage.setItem("chey-ai-current-chat", currentChatId);
}

function createNewChat(render = true, folder = "General") {
  const chat = {
    id: uid(),
    title: "New chat",
    folder,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  };

  chats.unshift(chat);
  currentChatId = chat.id;
  saveChats();

  if (render) {
    renderChatList();
    renderMessages();
    updateContextEstimate();
  }
}

function renderChatList() {
  els.chatList.innerHTML = "";

  const q = (els.chatSearch?.value || "").toLowerCase();

  const filtered = chats
    .filter((chat) => {
      const text = [chat.title, chat.folder, ...chat.messages.map((m) => m.content)].join(" ").toLowerCase();
      return !q || text.includes(q);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt));

  for (const chat of filtered) {
    if (chatSelectionMode) {
      const label = document.createElement("label");
      label.className = `chat-select-row ${chat.id === currentChatId ? "active" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedChatIds.has(chat.id);
      checkbox.addEventListener("change", () => {
        checkbox.checked ? selectedChatIds.add(chat.id) : selectedChatIds.delete(chat.id);
        updateDeleteSelectionUI();
      });

      const title = document.createElement("span");
      title.textContent = `${chat.pinned ? "📌 " : ""}${chat.folder || "General"} / ${chat.title}`;

      label.appendChild(checkbox);
      label.appendChild(title);
      els.chatList.appendChild(label);
      continue;
    }

    const row = document.createElement("div");
    row.className = "chat-item-row";

    const pin = document.createElement("button");
    pin.className = `pin-button ${chat.pinned ? "pinned" : ""}`;
    pin.textContent = "★";
    pin.title = "Pin/unpin chat";
    pin.addEventListener("click", () => {
      chat.pinned = !chat.pinned;
      saveChats();
      renderChatList();
    });

    const button = document.createElement("button");
    button.className = `chat-item ${chat.id === currentChatId ? "active" : ""}`;
    button.textContent = `${chat.folder || "General"} / ${chat.title}`;
    button.addEventListener("click", () => {
      currentChatId = chat.id;
      saveChats();
      renderChatList();
      renderMessages();
      updateContextEstimate();
    });

    row.appendChild(pin);
    row.appendChild(button);
    els.chatList.appendChild(row);
  }

  updateDeleteSelectionUI();
}

function updateDeleteSelectionUI() {
  const count = selectedChatIds.size;

  if (els.deleteSelectedChats) {
    els.deleteSelectedChats.disabled = count === 0;
    els.deleteSelectedChats.textContent = count ? `Delete ${count}` : "Delete";
  }

  els.cancelSelectChats?.classList.toggle("hidden", !chatSelectionMode);
  els.selectChats?.classList.toggle("hidden", chatSelectionMode);
}

function setChatSelectionMode(enabled) {
  chatSelectionMode = enabled;
  selectedChatIds = new Set();
  renderChatList();
}

function deleteSelectedChats() {
  if (!selectedChatIds.size) return;

  const count = selectedChatIds.size;
  if (!confirm(`Delete ${count} selected chat${count === 1 ? "" : "s"}?`)) return;

  chats = chats.filter((chat) => !selectedChatIds.has(chat.id));

  if (!chats.length) {
    selectedChatIds = new Set();
    chatSelectionMode = false;
    createNewChat(false);
  }

  if (!getCurrentChat()) currentChatId = chats[0].id;

  selectedChatIds = new Set();
  chatSelectionMode = false;

  saveChats();
  renderChatList();
  renderMessages();
  updateContextEstimate();
}

function deleteAllChats() {
  if (!confirm("Delete ALL saved chats? This cannot be undone.")) return;

  chats = [];
  currentChatId = null;
  createNewChat(false);
  saveChats();
  renderChatList();
  renderMessages();
}

function renderMessageContent(container, content) {
  container.innerHTML = "";

  const codeBlockRegex = /```([a-zA-Z0-9+#.-]*)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore) appendText(container, textBefore);

    const language = match[1] || "code";
    const code = match[2].trim();
    appendCodeBlock(container, language, code);
    lastIndex = codeBlockRegex.lastIndex;
  }

  const textAfter = content.slice(lastIndex);
  if (textAfter) appendText(container, textAfter);
}

function appendText(container, text) {
  const textEl = document.createElement("div");
  textEl.className = "message-text";
  textEl.textContent = text;
  container.appendChild(textEl);
}

function appendCodeBlock(container, language, code) {
  const codeWrapper = document.createElement("div");
  codeWrapper.className = "code-block";

  const codeHeader = document.createElement("div");
  codeHeader.className = "code-header";

  const languageLabel = document.createElement("span");
  languageLabel.textContent = language;

  const actions = document.createElement("div");
  actions.className = "code-action-row";

  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      copyButton.textContent = "Copied!";
    } catch {
      copyButton.textContent = "Failed";
    }
    setTimeout(() => (copyButton.textContent = "Copy"), 1200);
  });

  actions.appendChild(copyButton);

  if (language.toLowerCase() === "diff" || code.startsWith("diff --git") || code.startsWith("--- ")) {
    const patchButton = document.createElement("button");
    patchButton.className = "copy-button patch-button";
    patchButton.textContent = "Use as Patch";
    patchButton.addEventListener("click", () => {
      els.patchPreview.value = code;
      els.patchPreview.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    actions.appendChild(patchButton);
  }

  if (["bash", "sh", "zsh", "shell"].includes(language.toLowerCase())) {
    const runButton = document.createElement("button");
    runButton.className = "copy-button run-button";
    runButton.textContent = "Run";
    runButton.addEventListener("click", () => {
      els.terminalCommand.value = code;
      runTerminalCommand();
    });
    actions.appendChild(runButton);
  }

  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.textContent = code;
  pre.appendChild(codeEl);

  codeHeader.appendChild(languageLabel);
  codeHeader.appendChild(actions);
  codeWrapper.appendChild(codeHeader);
  codeWrapper.appendChild(pre);
  container.appendChild(codeWrapper);
}

function addMessageToScreen(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const roleEl = document.createElement("div");
  roleEl.className = "role";
  roleEl.textContent = role === "user" ? "You" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  renderMessageContent(bubble, content);

  wrapper.appendChild(roleEl);
  wrapper.appendChild(bubble);
  els.messages.appendChild(wrapper);
  els.messages.scrollTop = els.messages.scrollHeight;

  return bubble;
}

function renderMessages() {
  const chat = getCurrentChat();
  els.messages.innerHTML = "";
  for (const message of chat.messages) addMessageToScreen(message.role, message.content);
}

function updateSettingsUI() {
  els.tempValue.textContent = els.temperature.value;

  const context = Number(els.context.value);
  if (["4096", "8192", "16384", "32768"].includes(String(context))) {
    els.contextPreset.value = String(context);
  }

  saveSettings();
  updateContextEstimate();
}

function updateContextEstimate() {
  const chat = getCurrentChat();
  const text = [
    els.system.value,
    els.input.value,
    ...(chat?.messages || []).map((message) => message.content)
  ].join("\n");

  const selectedProjectEstimate = getSelectedProjectFiles()
    .reduce((sum, file) => sum + estimateTokens("x".repeat(file.size || 0)), 0);

  const tokens = estimateTokens(text) + selectedProjectEstimate;
  const max = Number(els.context.value) || 8192;
  const percent = Math.min(100, Math.round((tokens / max) * 100));

  els.tokenBar.style.width = `${percent}%`;
  els.tokenEstimate.textContent = `${tokens.toLocaleString()} estimated tokens / ${max.toLocaleString()} context`;

  if (max > 16384) {
    els.tokenWarning.textContent = "Large context can slow down or freeze an 8 GB Mac.";
  } else if (percent > 80) {
    els.tokenWarning.textContent = "This chat is getting close to the context limit. Start a new chat soon.";
  } else {
    els.tokenWarning.textContent = "";
  }
}

async function checkOllamaStatus() {
  try {
    const response = await fetch("/api/ollama-status");
    const data = await response.json();

    if (!data.running) {
      els.statusDot.className = "dot red";
      els.statusText.textContent = "Ollama not running";
      els.modelStatus.textContent = data.error || "Start Ollama, then refresh.";
      els.downloadModel.classList.add("hidden");
      return;
    }

    els.statusDot.className = "dot green";
    els.statusText.textContent = "Ollama running";

    if (data.hasDefaultModel) {
      els.modelStatus.textContent = "qwen3:4b is installed.";
      els.downloadModel.classList.add("hidden");
    } else {
      els.modelStatus.textContent = "qwen3:4b is missing.";
      els.downloadModel.classList.remove("hidden");
    }
  } catch (error) {
    els.statusDot.className = "dot red";
    els.statusText.textContent = "Status check failed";
    els.modelStatus.textContent = error.message;
  }
}

async function downloadDefaultModel() {
  els.downloadModel.disabled = true;
  els.downloadProgress.textContent = "Starting download...";

  try {
    const response = await fetch("/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen3:4b" })
    });

    await readNdjsonStream(response, (data) => {
      if (data.error) {
        els.downloadProgress.textContent = `Error: ${data.error}`;
        return;
      }

      if (data.status) {
        const completed = data.completed || 0;
        const total = data.total || 0;
        const percent = total ? ` ${Math.round((completed / total) * 100)}%` : "";
        els.downloadProgress.textContent = `${data.status}${percent}`;
      }
    });

    els.downloadProgress.textContent = "Download complete.";
    await checkOllamaStatus();
  } catch (error) {
    els.downloadProgress.textContent = `Download failed: ${error.message}`;
  } finally {
    els.downloadModel.disabled = false;
  }
}

async function readNdjsonStream(response, onJson) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onJson(JSON.parse(line));
      } catch {
        // Ignore partial/non-JSON lines.
      }
    }
  }
}

function getSelectedProjectFiles() {
  return Array.from(document.querySelectorAll(".project-checkbox:checked")).map((checkbox) => {
    const file = project.files.find((item) => item.relativePath === checkbox.value);
    return file || { relativePath: checkbox.value, size: 0 };
  });
}

async function buildProjectContext() {
  if (!window.cheyAPI?.readProjectFiles) return "";

  const selected = getSelectedProjectFiles().map((file) => file.relativePath).slice(0, 16);
  if (!selected.length) return "";

  const files = await window.cheyAPI.readProjectFiles(selected);

  return `Project context from selected files:\n\n${files.map((file) => `--- ${file.relativePath} ---\n${file.content}`).join("\n\n")}`;
}

async function sendMessage() {
  const text = els.input.value.trim();
  if (!text || abortController) return;

  const chat = getCurrentChat();
  els.input.value = "";

  chat.messages.push({ role: "user", content: text });
  if (chat.title === "New chat") chat.title = text.slice(0, 48);
  chat.updatedAt = new Date().toISOString();
  saveChats();
  renderChatList();

  addMessageToScreen("user", text);
  const assistantBubble = addMessageToScreen("assistant", "");

  abortController = new AbortController();
  els.send.disabled = true;
  els.stop.disabled = false;
  els.footerStatus.textContent = "Streaming from local Ollama...";

  let answer = "";

  try {
    const projectContext = await buildProjectContext();
    const noThinkPrefix = els.thinking.checked ? "" : "/no_think\n\n";

    const sendMessages = chat.messages.map((message, index) => {
      const isLast = index === chat.messages.length - 1;

      if (isLast && message.role === "user" && projectContext) {
        return {
          role: "user",
          content: `${projectContext}\n\nUser request:\n${noThinkPrefix}${message.content}`
        };
      }

      if (isLast && message.role === "user") {
        return {
          role: "user",
          content: `${noThinkPrefix}${message.content}`
        };
      }

      return message;
    });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        model: els.model.value.trim() || "qwen3:4b",
        messages: sendMessages,
        system: els.system.value,
        temperature: Number(els.temperature.value),
        context: Number(els.context.value),
        thinking: els.thinking.checked
      })
    });

    await readNdjsonStream(response, (data) => {
      if (data.error) {
        answer += `\nError: ${data.error}`;
        renderMessageContent(assistantBubble, answer);
        return;
      }

      if (data.message?.content) answer += data.message.content;

      const cleanedAnswer = cleanModelOutput(answer);
      renderMessageContent(assistantBubble, cleanedAnswer || "Writing...");
      els.messages.scrollTop = els.messages.scrollHeight;
    });

    answer = cleanModelOutput(answer);
    if (!answer.trim()) answer = "[No answer returned]";

    chat.messages.push({ role: "assistant", content: answer });
    chat.updatedAt = new Date().toISOString();
    saveChats();
    els.footerStatus.textContent = `Done. Context: ${els.context.value}, temp: ${els.temperature.value}`;
  } catch (error) {
    const stopped = error.name === "AbortError";
    answer = stopped ? "Generation stopped." : `Error: ${error.message}`;
    renderMessageContent(assistantBubble, answer);
    if (!stopped) chat.messages.push({ role: "assistant", content: answer });
    saveChats();
    els.footerStatus.textContent = stopped ? "Stopped." : "Something went wrong.";
  } finally {
    abortController = null;
    els.send.disabled = false;
    els.stop.disabled = true;
    updateContextEstimate();
  }
}

function stopGeneration() {
  if (abortController) abortController.abort();
}

function exportCurrentChat() {
  const chat = getCurrentChat();
  const ext = els.exportFormat.value;
  const lines = [`# ${chat.title}`, ""];

  for (const message of chat.messages) {
    lines.push(`## ${message.role === "user" ? "You" : "AI"}`, "", message.content, "");
  }

  const blob = new Blob([lines.join("\n")], { type: ext === "md" ? "text/markdown" : "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${chat.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "chat"}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

async function setProject(result) {
  project = {
    folder: result.folder,
    files: result.files || [],
    visibleFiles: result.files || [],
    isGitRepo: result.isGitRepo
  };

  els.projectStatus.textContent = `${project.files.length} readable files found in ${project.folder}`;
  renderProjectFiles();
  updateContextEstimate();
  await updateGitStatus();
}

async function selectProjectFolder() {
  if (!window.cheyAPI?.selectProjectFolder) {
    els.projectStatus.textContent = "Project folder mode only works in the desktop app.";
    return;
  }

  const result = await window.cheyAPI.selectProjectFolder();
  if (result.canceled) return;
  await setProject(result);
}

async function cloneGithubRepo() {
  const url = els.githubUrl.value.trim();
  if (!url) return alert("Paste a GitHub repo URL first.");
  if (!confirm(`Clone this repo?\n\n${url}`)) return;

  els.projectStatus.textContent = "Cloning repo...";
  try {
    const result = await window.cheyAPI.cloneGithubRepo(url);
    await setProject(result);
    els.projectStatus.textContent = `Cloned repo. ${result.files.length} readable files found.`;
  } catch (error) {
    els.projectStatus.textContent = `Clone failed: ${error.message}`;
  }
}

async function refreshProject() {
  if (!window.cheyAPI?.refreshProjectFiles) return;
  try {
    const result = await window.cheyAPI.refreshProjectFiles();
    await setProject(result);
  } catch (error) {
    els.projectStatus.textContent = error.message;
  }
}

function clearProject() {
  project = { folder: null, files: [], visibleFiles: [] };
  els.projectStatus.textContent = "No project folder selected.";
  els.projectFiles.innerHTML = "";
  els.projectSearch.value = "";
  els.projectSelectedCount.textContent = "0 files selected";
  els.gitOutput.textContent = "";
  updateContextEstimate();
}

function renderProjectFiles() {
  els.projectFiles.innerHTML = "";

  const files = project.visibleFiles || project.files || [];

  for (const file of files.slice(0, 300)) {
    const row = document.createElement("label");
    row.className = "project-file-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "project-checkbox";
    checkbox.value = file.relativePath;
    checkbox.addEventListener("change", updateProjectCount);

    const text = document.createElement("span");
    text.textContent = `${file.relativePath} (${Math.ceil(file.size / 1024)} KB)`;

    row.appendChild(checkbox);
    row.appendChild(text);
    els.projectFiles.appendChild(row);
  }

  updateProjectCount();
}

function updateProjectCount() {
  const count = getSelectedProjectFiles().length;
  els.projectSelectedCount.textContent = `${count} file${count === 1 ? "" : "s"} selected`;
  updateContextEstimate();
}

async function searchCode() {
  const q = els.projectSearch.value.trim();
  if (!q) {
    project.visibleFiles = project.files;
    renderProjectFiles();
    return;
  }

  try {
    const results = await window.cheyAPI.searchProjectFiles(q);
    project.visibleFiles = results;
    renderProjectFiles();
    els.projectStatus.textContent = `${results.length} search results for "${q}"`;
  } catch (error) {
    els.projectStatus.textContent = error.message;
  }
}

function selectSearchResults() {
  document.querySelectorAll(".project-checkbox").forEach((box) => {
    box.checked = true;
  });
  updateProjectCount();
}

async function updateGitStatus() {
  if (!window.cheyAPI?.gitStatus) return;
  try {
    const result = await window.cheyAPI.gitStatus();
    els.gitOutput.textContent = result.status || "No git status.";
  } catch (error) {
    els.gitOutput.textContent = error.message;
  }
}

async function viewGitDiff() {
  try {
    els.gitOutput.textContent = await window.cheyAPI.gitDiff();
  } catch (error) {
    els.gitOutput.textContent = error.message;
  }
}

async function gitPull() {
  if (!confirm("Run git pull --ff-only on this project?")) return;

  try {
    els.gitOutput.textContent = "Pulling...";
    els.gitOutput.textContent = await window.cheyAPI.gitPull();
    await refreshProject();
  } catch (error) {
    els.gitOutput.textContent = error.message;
  }
}

async function applyPatch() {
  const patch = els.patchPreview.value.trim();
  if (!patch) return alert("Paste a git diff into Patch Preview first.");
  if (!confirm("Apply this patch to your selected git repo?")) return;

  try {
    els.gitOutput.textContent = await window.cheyAPI.applyPatch(patch);
    await refreshProject();
  } catch (error) {
    els.gitOutput.textContent = `Patch failed: ${error.message}`;
  }
}

async function undoLastPatch() {
  if (!confirm("Undo the last patch applied by Chey Local AI?")) return;

  try {
    els.gitOutput.textContent = await window.cheyAPI.undoLastPatch();
    await refreshProject();
  } catch (error) {
    els.gitOutput.textContent = error.message;
  }
}

async function runTerminalCommand() {
  const command = els.terminalCommand.value.trim();
  if (!command) return alert("Enter a terminal command first.");

  const ok = confirm(`Run this command in the selected project?\n\n${command}`);
  if (!ok) return;

  try {
    els.gitOutput.textContent = "Running command...";
    els.gitOutput.textContent = await window.cheyAPI.runCommand(command);
  } catch (error) {
    els.gitOutput.textContent = `Command failed: ${error.message}`;
  }
}

function askWithPrompt(prompt) {
  els.input.value = prompt;
  els.input.focus();
  updateContextEstimate();
}

function explainSelectedFiles() {
  askWithPrompt("Explain the selected project files. Tell me what this code does, how the pieces connect, and what I should know before editing it.");
}

function findBugsInSelectedFiles() {
  askWithPrompt("Review the selected project files for bugs, fragile logic, bad assumptions, or simple improvements. Be specific and reference file names.");
}

function makePatchPrompt() {
  askWithPrompt("Based on the selected project files, propose a safe improvement. Return the change as a unified git diff in a ```diff code block. Do not apply it automatically.");
}

function analyzeLogsPrompt() {
  askWithPrompt("Analyze this error/log output. Explain the likely cause and the smallest safe fix. I will paste the logs below:\n\n");
}

function commitMessagePrompt() {
  askWithPrompt("Look at the current git diff/status I pasted or selected and write a clean conventional commit message. Give 3 options.");
}

function applySettingsPanelVisibility(hidden) {
  document.body.classList.toggle("settings-hidden", hidden);
  els.showSettings?.classList.toggle("hidden", !hidden);
  saveSettings();
}

function toggleTheme() {
  document.body.dataset.theme = document.body.dataset.theme === "dark" ? "light" : "dark";
  els.themeToggle.textContent = document.body.dataset.theme === "dark" ? "☀︎" : "☾";
  saveSettings();
}

els.refreshStatus.addEventListener("click", checkOllamaStatus);
els.downloadModel.addEventListener("click", downloadDefaultModel);

els.selectChats.addEventListener("click", () => setChatSelectionMode(true));
els.cancelSelectChats.addEventListener("click", () => setChatSelectionMode(false));
els.deleteSelectedChats.addEventListener("click", deleteSelectedChats);
els.deleteAllChats.addEventListener("click", deleteAllChats);
els.chatSearch.addEventListener("input", renderChatList);

els.newChat.addEventListener("click", () => {
  setChatSelectionMode(false);
  const folder = prompt("Chat folder name?", "General") || "General";
  createNewChat(true, folder);
});

els.exportChat.addEventListener("click", exportCurrentChat);
els.themeToggle.addEventListener("click", toggleTheme);

els.send.addEventListener("click", sendMessage);
els.stop.addEventListener("click", stopGeneration);
els.input.addEventListener("input", updateContextEstimate);
els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

els.contextPreset.addEventListener("change", () => {
  els.context.value = els.contextPreset.value;
  updateSettingsUI();
});

for (const el of [els.model, els.context, els.temperature, els.thinking, els.system]) {
  el.addEventListener("input", updateSettingsUI);
  el.addEventListener("change", updateSettingsUI);
}

els.applyPreset.addEventListener("click", () => {
  els.system.value = PRESETS[els.promptPreset.value] || DEFAULT_SYSTEM;
  updateSettingsUI();
});

els.hideSettings?.addEventListener("click", () => applySettingsPanelVisibility(true));
els.showSettings?.addEventListener("click", () => applySettingsPanelVisibility(false));

els.selectFolder.addEventListener("click", selectProjectFolder);
els.cloneRepo.addEventListener("click", cloneGithubRepo);
els.gitPull.addEventListener("click", gitPull);
els.refreshProject.addEventListener("click", refreshProject);
els.clearProject.addEventListener("click", clearProject);

els.searchCodeBtn.addEventListener("click", searchCode);
els.selectSearchResults.addEventListener("click", selectSearchResults);
els.projectSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchCode();
});

els.gitStatusBtn.addEventListener("click", updateGitStatus);
els.gitDiffBtn.addEventListener("click", viewGitDiff);
els.commitMsgBtn.addEventListener("click", commitMessagePrompt);
els.undoPatchBtn.addEventListener("click", undoLastPatch);
els.applyPatchBtn.addEventListener("click", applyPatch);
els.runCommandBtn.addEventListener("click", runTerminalCommand);

els.explainProjectBtn.addEventListener("click", explainSelectedFiles);
els.bugFinderBtn.addEventListener("click", findBugsInSelectedFiles);
els.diffPromptBtn.addEventListener("click", makePatchPrompt);
els.logAnalyzerBtn.addEventListener("click", analyzeLogsPrompt);

loadState();
renderChatList();
renderMessages();
updateSettingsUI();
checkOllamaStatus();
setInterval(checkOllamaStatus, 15000);
