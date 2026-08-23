const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  selectDirectory: () => ipcRenderer.invoke("workspace:select-directory"),
  wasRecoveredFromCrash: () => ipcRenderer.invoke("app:recovered-from-crash"),
  toggleOverlay: () => ipcRenderer.invoke("overlay:toggle"),
  isOverlayOpen: () => ipcRenderer.invoke("overlay:isOpen"),
  safeStorage: {
    isAvailable: () => ipcRenderer.invoke("secrets:isAvailable"),
    encryptString: (plaintext) => ipcRenderer.invoke("secrets:encrypt", plaintext),
    decryptString: (encrypted) => ipcRenderer.invoke("secrets:decrypt", encrypted),
  },
});
