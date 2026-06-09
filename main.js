import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

process.env.PORT = process.env.PORT || "3487";

await import("./server.js");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_URL = `http://localhost:${process.env.PORT}`;

let currentProjectRoot = null;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".vercel",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  "coverage"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".html", ".css", ".scss",
  ".json", ".md", ".txt", ".yml", ".yaml",
  ".py", ".java", ".c", ".cpp", ".h", ".hpp",
  ".go", ".rs", ".php", ".rb", ".swift",
  ".sql", ".env", ".example"
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "Chey Local AI",
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL(SERVER_URL);
}

async function scanProjectFolder(root) {
  const files = [];
  const maxFiles = 500;
  const maxSizeBytes = 300_000;

  async function walk(dir) {
    if (files.length >= maxFiles) return;

    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const allowedSpecialFile = [".env.example", "dockerfile", "makefile", "package.json"].includes(entry.name.toLowerCase());

      if (!ALLOWED_EXTENSIONS.has(ext) && !allowedSpecialFile) continue;

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > maxSizeBytes) continue;

        files.push({
          relativePath,
          size: stat.size
        });
      } catch {
        // Ignore unreadable files.
      }
    }
  }

  await walk(root);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function safeJoinProjectPath(relativePath) {
  if (!currentProjectRoot) throw new Error("No project folder selected.");

  const fullPath = path.resolve(currentProjectRoot, relativePath);
  const root = path.resolve(currentProjectRoot);

  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) {
    throw new Error("Blocked unsafe file path.");
  }

  return fullPath;
}

ipcMain.handle("project:selectFolder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select a project folder",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  currentProjectRoot = result.filePaths[0];
  const files = await scanProjectFolder(currentProjectRoot);

  return {
    canceled: false,
    folder: currentProjectRoot,
    files
  };
});

ipcMain.handle("project:readFiles", async (_event, relativePaths = []) => {
  const maxFiles = 12;
  const maxCharactersPerFile = 80_000;
  const selected = relativePaths.slice(0, maxFiles);
  const results = [];

  for (const relativePath of selected) {
    const fullPath = safeJoinProjectPath(relativePath);
    const content = await fs.readFile(fullPath, "utf8");

    results.push({
      relativePath,
      content: content.slice(0, maxCharactersPerFile)
    });
  }

  return results;
});

app.whenReady().then(() => {
  setTimeout(createWindow, 500);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
