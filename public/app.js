const DEFAULT_SYSTEM = `You are Chey's local coding assistant.

Be honest when you are unsure.
Do not invent APIs, packages, files, or commands.
For code, prefer simple working examples.
When writing code, always use fenced code blocks with the correct language, like \`\`\`html, \`\`\`css, \`\`\`javascript, or \`\`\`python.
Answer directly and keep responses concise unless I ask for more detail.
Do not reveal hidden reasoning, planning, chain-of-thought, or <think> blocks.
When debugging, ask for the error message or file contents if needed.
Do not overcomplicate small projects.
Focus on JavaScript, HTML, CSS, Python, React, APIs, VS Code, and app development.`;

const PRESETS = {
  coding: DEFAULT_SYSTEM,
  appBuilder: `You are Chey's local app-building assistant.

Help plan, build, and improve apps step by step.
Prefer simple, working code over complicated architecture.
When giving code, use fenced code blocks with correct languages.
Explain where each file should go.
Ask for missing requirements instead of guessing.
Warn about risky commands before using them.`,
  bugFixer: `You are Chey's local debugging assistant.

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
  selectFolder: document.getElementById("selectFolder"),
  clearProject: document.getElementById("clearProject"),
  projectStatus: document.getElementById("projectStatus"),
  projectSearch: document.getElementById("projectSearch"),
  projectSelectedCount: document.getElementById("projectSelectedCount"),
  projectFiles: document.getElementById("projectFiles"),
  hideSettings: document.getElementById("hideSettings"),
  showSettings: document.getElementById("showSettings")
};

let chats = [];
let currentChatId = null;
let abortController = null;
let project = { folder: null, files: [] };
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
  if (els.showSettings) {
    els.showSettings.classList.toggle("hidden", !document.body.classList.contains("settings-hidden"));
  }
  if (els.themeToggle) {
    els.themeToggle.textContent = document.body.dataset.theme === "dark" ? "☀︎" : "☾";
  }

  chats = JSON.parse(localStorage.getItem("chey-ai-chats") || "[]");
  currentChatId = localStorage.getItem("chey-ai-current-chat");

  if (!chats.length || !getCurrentChat()) {
    createNewChat(false);
  }
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

function createNewChat(render = true) {
  const chat = {
    id: uid(),
    title: "New chat",
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

  for (const chat of chats) {
    if (chatSelectionMode) {
      const label = document.createElement("label");
      label.className = `chat-select-row ${chat.id === currentChatId ? "active" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedChatIds.has(chat.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedChatIds.add(chat.id);
        } else {
          selectedChatIds.delete(chat.id);
        }
        updateDeleteSelectionUI();
      });

      const title = document.createElement("span");
      title.textContent = chat.title;

      label.appendChild(checkbox);
      label.appendChild(title);
      els.chatList.appendChild(label);
      continue;
    }

    const button = document.createElement("button");
    button.className = `chat-item ${chat.id === currentChatId ? "active" : ""}`;
    button.textContent = chat.title;
    button.addEventListener("click", () => {
      currentChatId = chat.id;
      saveChats();
      renderChatList();
      renderMessages();
      updateContextEstimate();
    });
    els.chatList.appendChild(button);
  }

  updateDeleteSelectionUI();
}

function updateDeleteSelectionUI() {
  const count = selectedChatIds.size;

  if (els.deleteSelectedChats) {
    els.deleteSelectedChats.disabled = count === 0;
    els.deleteSelectedChats.textContent = count ? `Delete ${count}` : "Delete";
  }

  if (els.cancelSelectChats) {
    els.cancelSelectChats.classList.toggle("hidden", !chatSelectionMode);
  }

  if (els.selectChats) {
    els.selectChats.classList.toggle("hidden", chatSelectionMode);
  }
}

function setChatSelectionMode(enabled) {
  chatSelectionMode = enabled;
  selectedChatIds = new Set();
  renderChatList();
}

function deleteSelectedChats() {
  if (!selectedChatIds.size) return;

  const count = selectedChatIds.size;
  const confirmed = confirm(`Delete ${count} selected chat${count === 1 ? "" : "s"}?`);

  if (!confirmed) return;

  chats = chats.filter((chat) => !selectedChatIds.has(chat.id));

  if (!chats.length) {
    selectedChatIds = new Set();
    chatSelectionMode = false;
    createNewChat(false);
  }

  if (!getCurrentChat()) {
    currentChatId = chats[0].id;
  }

  selectedChatIds = new Set();
  chatSelectionMode = false;

  saveChats();
  renderChatList();
  renderMessages();
  updateContextEstimate();
}

function applySettingsPanelVisibility(hidden) {
  document.body.classList.toggle("settings-hidden", hidden);

  if (els.showSettings) {
    els.showSettings.classList.toggle("hidden", !hidden);
  }

  saveSettings();
}

function cleanModelOutput(content) {
  let text = content || "";

  // Remove full <think>...</think> blocks if the model leaks them.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // If the model only leaked a closing </think>, keep only what comes after it.
  const closingThink = text.toLowerCase().lastIndexOf("</think>");
  if (closingThink !== -1) {
    text = text.slice(closingThink + "</think>".length).trim();
  }

  // Remove common markdown-ish artifacts some local models output.
  text = text.replace(/^Answer:\s*/i, "").trim();

  return text;
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

  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.textContent = code;
  pre.appendChild(codeEl);

  codeHeader.appendChild(languageLabel);
  codeHeader.appendChild(copyButton);
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

  for (const message of chat.messages) {
    addMessageToScreen(message.role, message.content);
  }
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

  const selectedProjectEstimate = getSelectedProjectFiles().reduce((sum, file) => sum + estimateTokens("x".repeat(file.size || 0)), 0);
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

  if (buffer.trim()) {
    try {
      onJson(JSON.parse(buffer));
    } catch {
      // Ignore final malformed line.
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

  const selected = getSelectedProjectFiles().map((file) => file.relativePath).slice(0, 12);
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

      if (data.message?.content) {
        answer += data.message.content;
      }

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

async function selectProjectFolder() {
  if (!window.cheyAPI?.selectProjectFolder) {
    els.projectStatus.textContent = "Project folder mode only works in the desktop app.";
    return;
  }

  const result = await window.cheyAPI.selectProjectFolder();
  if (result.canceled) return;

  project = { folder: result.folder, files: result.files || [] };
  els.projectStatus.textContent = `${project.files.length} readable files found.`;
  renderProjectFiles();
  updateContextEstimate();
}

function clearProject() {
  project = { folder: null, files: [] };
  els.projectStatus.textContent = "No project folder selected.";
  els.projectFiles.innerHTML = "";
  els.projectSearch.value = "";
  els.projectSelectedCount.textContent = "0 files selected";
  updateContextEstimate();
}

function renderProjectFiles() {
  const filter = els.projectSearch.value.toLowerCase();
  els.projectFiles.innerHTML = "";

  for (const file of project.files.filter((item) => item.relativePath.toLowerCase().includes(filter))) {
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
els.newChat.addEventListener("click", () => {
  setChatSelectionMode(false);
  createNewChat(true);
});
els.exportChat.addEventListener("click", exportCurrentChat);
els.themeToggle.addEventListener("click", toggleTheme);
els.hideSettings.addEventListener("click", () => applySettingsPanelVisibility(true));
els.showSettings.addEventListener("click", () => applySettingsPanelVisibility(false));
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

els.selectFolder.addEventListener("click", selectProjectFolder);
els.clearProject.addEventListener("click", clearProject);
els.projectSearch.addEventListener("input", renderProjectFiles);

loadState();
renderChatList();
renderMessages();
updateSettingsUI();
checkOllamaStatus();
setInterval(checkOllamaStatus, 15000);
