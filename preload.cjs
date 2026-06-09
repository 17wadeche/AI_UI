const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cheyAPI", {
  isDesktop: true,
  selectProjectFolder: () => ipcRenderer.invoke("project:selectFolder"),
  readProjectFiles: (relativePaths) => ipcRenderer.invoke("project:readFiles", relativePaths),
  searchProjectFiles: (query) => ipcRenderer.invoke("project:searchFiles", query),
  refreshProjectFiles: () => ipcRenderer.invoke("project:refreshFiles"),
  cloneGithubRepo: (url) => ipcRenderer.invoke("github:cloneRepo", url),
  gitStatus: () => ipcRenderer.invoke("git:status"),
  gitDiff: () => ipcRenderer.invoke("git:diff"),
  gitPull: () => ipcRenderer.invoke("git:pull"),
  applyPatch: (patchText) => ipcRenderer.invoke("git:applyPatch", patchText),
  undoLastPatch: () => ipcRenderer.invoke("git:undoLastPatch"),
  runCommand: (command) => ipcRenderer.invoke("terminal:runCommand", command),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url)
});
