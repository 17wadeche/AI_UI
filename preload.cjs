const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cheyAPI", {
  isDesktop: true,
  selectProjectFolder: () => ipcRenderer.invoke("project:selectFolder"),
  readProjectFiles: (relativePaths) => ipcRenderer.invoke("project:readFiles", relativePaths)
});
