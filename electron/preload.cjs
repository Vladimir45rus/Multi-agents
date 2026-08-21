const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  selectDirectory: () => ipcRenderer.invoke("workspace:select-directory"),
  wasRecoveredFromCrash: () => ipcRenderer.invoke("app:recovered-from-crash"),
  safeStorage: {
    isAvailable: () => ipcRenderer.invoke("secrets:isAvailable"),
    encryptString: (plaintext) => ipcRenderer.invoke("secrets:encrypt", plaintext),
    decryptString: (encrypted) => ipcRenderer.invoke("secrets:decrypt", encrypted),
  },
});
