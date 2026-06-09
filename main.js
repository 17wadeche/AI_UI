import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { existsSync } from "fs";
import { execFile, exec } from "child_process";
import { promisify } from "util";

process.env.PORT = process.env.PORT || "3487";

await import("./server.js");

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_URL = `http://localhost:${process.env.PORT}`;

let currentProjectRoot = null;
let lastAppliedPatch = null;

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
  "coverage",
  ".DS_Store"
]);

const ALLOWED_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".html", ".css", ".scss",
  ".json", ".md", ".txt", ".yml", ".yaml",
  ".py", ".java", ".c", ".cpp", ".h", ".hpp",
  ".go", ".rs", ".php", ".rb", ".swift",
  ".sql", ".env", ".example", ".toml", ".xml"
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1020,
    minHeight: 700,
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

function isAllowedFile(fileName) {
  const lower = fileName.toLowerCase();
  const ext = path.extname(lower);
  const allowedSpecial = [
    ".env.example",
    "dockerfile",
    "makefile",
    "package.json",
    "vite.config.js",
    "next.config.js",
    "tailwind.config.js",
    "tsconfig.json"
  ].includes(lower);

  return ALLOWED_EXTENSIONS.has(ext) || allowedSpecial;
}

async function scanProjectFolder(root) {
  const files = [];
  const maxFiles = 1500;
  const maxSizeBytes = 500_000;

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
        if (!SKIP_DIRS.has(entry.name)) await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!isAllowedFile(entry.name)) continue;

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > maxSizeBytes) continue;

        files.push({
          relativePath,
          size: stat.size,
          ext: path.extname(entry.name).toLowerCase()
        });
      } catch {
        // Ignore unreadable files.
      }
    }
  }

  await walk(root);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function safeProjectPath(relativePath) {
  if (!currentProjectRoot) throw new Error("No project folder selected.");

  const fullPath = path.resolve(currentProjectRoot, relativePath);
  const root = path.resolve(currentProjectRoot);

  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) {
    throw new Error("Blocked unsafe file path.");
  }

  return fullPath;
}

function getReposDir() {
  return path.join(app.getPath("userData"), "repos");
}

function safeRepoName(url) {
  const clean = url
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean || `repo-${Date.now()}`;
}

function validateGithubUrl(url) {
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/i.test(url.trim())) {
    throw new Error("Use a public GitHub repo URL like https://github.com/user/repo");
  }
}

async function isGitRepo(root) {
  return existsSync(path.join(root, ".git"));
}

async function runGit(args, cwd = currentProjectRoot) {
  if (!cwd) throw new Error("No repo/project selected.");
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024
  });

  return { stdout, stderr };
}

ipcMain.handle("project:selectFolder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select a project folder",
    properties: ["openDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  currentProjectRoot = result.filePaths[0];
  const files = await scanProjectFolder(currentProjectRoot);

  return {
    canceled: false,
    folder: currentProjectRoot,
    files,
    isGitRepo: await isGitRepo(currentProjectRoot)
  };
});

ipcMain.handle("project:readFiles", async (_event, relativePaths = []) => {
  const maxFiles = 16;
  const maxCharactersPerFile = 90_000;
  const selected = relativePaths.slice(0, maxFiles);
  const results = [];

  for (const relativePath of selected) {
    const fullPath = safeProjectPath(relativePath);
    const content = await fs.readFile(fullPath, "utf8");

    results.push({
      relativePath,
      content: content.slice(0, maxCharactersPerFile)
    });
  }

  return results;
});

ipcMain.handle("project:searchFiles", async (_event, query = "") => {
  if (!currentProjectRoot) throw new Error("No project selected.");

  const files = await scanProjectFolder(currentProjectRoot);
  const q = query.trim().toLowerCase();

  if (!q) return files.slice(0, 200).map((file) => ({ ...file, score: 1, matches: [] }));

  const results = [];

  for (const file of files) {
    let score = 0;
    const matches = [];

    if (file.relativePath.toLowerCase().includes(q)) {
      score += 10;
      matches.push("path");
    }

    try {
      const fullPath = safeProjectPath(file.relativePath);
      const content = await fs.readFile(fullPath, "utf8");
      const lower = content.toLowerCase();

      if (lower.includes(q)) {
        const index = lower.indexOf(q);
        score += 5;
        matches.push(content.slice(Math.max(0, index - 80), index + q.length + 120));
      }
    } catch {
      // Ignore unreadable files.
    }

    if (score > 0) results.push({ ...file, score, matches });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 50);
});

ipcMain.handle("project:refreshFiles", async () => {
  if (!currentProjectRoot) throw new Error("No project selected.");
  return {
    folder: currentProjectRoot,
    files: await scanProjectFolder(currentProjectRoot),
    isGitRepo: await isGitRepo(currentProjectRoot)
  };
});

ipcMain.handle("github:cloneRepo", async (_event, url) => {
  validateGithubUrl(url);

  const reposDir = getReposDir();
  await fs.mkdir(reposDir, { recursive: true });

  const repoName = safeRepoName(url);
  const target = path.join(reposDir, `${repoName}-${Date.now()}`);

  await execFileAsync("git", ["clone", "--depth", "1", url, target], {
    timeout: 240_000,
    maxBuffer: 20 * 1024 * 1024
  });

  currentProjectRoot = target;

  return {
    folder: target,
    files: await scanProjectFolder(target),
    isGitRepo: true
  };
});

ipcMain.handle("git:status", async () => {
  if (!currentProjectRoot) return { isGitRepo: false, status: "No project selected." };

  if (!(await isGitRepo(currentProjectRoot))) {
    return { isGitRepo: false, status: "Selected folder is not a git repo." };
  }

  const branch = await runGit(["branch", "--show-current"]);
  const status = await runGit(["status", "--short", "--branch"]);

  return {
    isGitRepo: true,
    branch: branch.stdout.trim() || "unknown",
    status: status.stdout.trim() || "Clean working tree."
  };
});

ipcMain.handle("git:diff", async () => {
  if (!currentProjectRoot) throw new Error("No project selected.");
  if (!(await isGitRepo(currentProjectRoot))) throw new Error("Selected folder is not a git repo.");

  const diff = await runGit(["diff", "--", "."]);
  return diff.stdout || "No local changes.";
});

ipcMain.handle("git:pull", async () => {
  if (!currentProjectRoot) throw new Error("No project selected.");
  if (!(await isGitRepo(currentProjectRoot))) throw new Error("Selected folder is not a git repo.");

  const result = await runGit(["pull", "--ff-only"]);
  return `${result.stdout}\n${result.stderr}`.trim() || "Pull complete.";
});

ipcMain.handle("git:applyPatch", async (_event, patchText) => {
  if (!currentProjectRoot) throw new Error("No project selected.");
  if (!(await isGitRepo(currentProjectRoot))) throw new Error("Patch apply requires a git repo.");

  const patchPath = path.join(app.getPath("temp"), `chey-ai-${Date.now()}.patch`);
  await fs.writeFile(patchPath, patchText, "utf8");

  await execFileAsync("git", ["apply", "--check", patchPath], {
    cwd: currentProjectRoot,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024
  });

  await execFileAsync("git", ["apply", patchPath], {
    cwd: currentProjectRoot,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024
  });

  lastAppliedPatch = patchText;

  return "Patch applied. Use Undo Last Patch if needed.";
});

ipcMain.handle("git:undoLastPatch", async () => {
  if (!currentProjectRoot) throw new Error("No project selected.");
  if (!lastAppliedPatch) throw new Error("No patch to undo.");

  const patchPath = path.join(app.getPath("temp"), `chey-ai-undo-${Date.now()}.patch`);
  await fs.writeFile(patchPath, lastAppliedPatch, "utf8");

  await execFileAsync("git", ["apply", "-R", patchPath], {
    cwd: currentProjectRoot,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024
  });

  lastAppliedPatch = null;

  return "Last patch undone.";
});

ipcMain.handle("terminal:runCommand", async (_event, command) => {
  if (!currentProjectRoot) throw new Error("No project selected.");

  const blocked = [
    "rm -rf /",
    "sudo rm",
    ":(){",
    "mkfs",
    "diskutil erase",
    "shutdown",
    "reboot"
  ];

  if (blocked.some((bad) => command.includes(bad))) {
    throw new Error("Blocked dangerous command.");
  }

  const { stdout, stderr } = await execAsync(command, {
    cwd: currentProjectRoot,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    shell: "/bin/zsh"
  });

  return `${stdout}${stderr}`.trim() || "Command finished with no output.";
});

ipcMain.handle("app:openExternal", async (_event, url) => {
  await shell.openExternal(url);
  return true;
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
