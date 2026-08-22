const { app, BrowserWindow, Menu, dialog, ipcMain, session, safeStorage, shell } = require("electron");
const { fork } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const ENC_PREFIX = "enc:v1:";
const DEFAULT_START_URL = "http://localhost:3000";
const DEFAULT_SERVER_PORT = 3210;
const MAX_SERVER_RESTARTS = 5;
const SERVER_READY_TIMEOUT_MS = 90_000;

let mainWindow = null;
let serverChild = null;
let isQuitting = false;
let serverRestarts = 0;
let renderCrashes = 0;
let recoveredFromCrash = false;
let serverReady = false;

// --- logging ---

function userDataDir() {
  return app.getPath("userData");
}

function log(scope, message) {
  const line = `[${new Date().toISOString()}] [${scope}] ${String(message)}`;
  try {
    fs.mkdirSync(path.join(userDataDir(), "logs"), { recursive: true });
    fs.appendFileSync(path.join(userDataDir(), "logs", "main.log"), `${line}\n`, "utf8");
  } catch {
    // Logging is best-effort; never crash the app because of it.
  }
  console.log(line);
}

// --- session state (window bounds + crash recovery) ---

function statePath() {
  return path.join(userDataDir(), "session-state.json");
}

function markerPath() {
  return path.join(userDataDir(), "running.marker");
}

function loadSessionState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSessionState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const state = {
      ...loadSessionState(),
      bounds: mainWindow.getBounds(),
      maximized: mainWindow.isMaximized(),
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // ignore
  }
}

// --- embedded Next.js server ---

function standaloneServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone", "server.js");
  }
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

function lastLines(text, maxLines) {
  return String(text)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(-maxLines)
    .join("\n");
}

function scheduleServerRestart() {
  serverChild = null;
  if (isQuitting) return;

  if (!serverReady) {
    log("server", "Not restarting: embedded server never became ready (startup error already reported).");
    return;
  }
  if (serverRestarts >= MAX_SERVER_RESTARTS) {
    log("server", `Not restarting: reached max restart attempts (${MAX_SERVER_RESTARTS}).`);
    return;
  }

  serverRestarts += 1;
  log("server", `Restarting embedded server in 1s (attempt ${serverRestarts}/${MAX_SERVER_RESTARTS})...`);
  setTimeout(() => {
    if (!isQuitting) startEmbeddedServer().catch((error) => log("server", `Restart failed: ${error.message}`));
  }, 1000);
}

function startEmbeddedServer() {
  const serverPath = standaloneServerPath();
  if (!fs.existsSync(serverPath)) {
    const message = `Standalone server not found at ${serverPath}. Run "npm run build:standalone" first.`;
    log("server", message);
    return Promise.reject(new Error(message));
  }

  const port = Number(process.env.ELECTRON_SERVER_PORT || DEFAULT_SERVER_PORT);
  const dbPath = path.join(userDataDir(), "dev.db");
  const migrationsDir = path.join(path.dirname(serverPath), "drizzle");
  const staticDir = path.join(path.dirname(serverPath), ".next", "static");

  // Make sure the data directory exists before the server opens the SQLite file.
  try {
    fs.mkdirSync(userDataDir(), { recursive: true });
  } catch (error) {
    log("server", `Warning: could not create data dir: ${error.message}`);
  }

  log("server", `Starting embedded Next.js server on 0.0.0.0:${port}`);
  log("server", `Database: ${dbPath}`);
  log("server", `Migrations dir: ${migrationsDir} (${fs.existsSync(migrationsDir) ? "found" : "MISSING"})`);
  log("server", `Static dir: ${staticDir} (${fs.existsSync(staticDir) ? "found" : "missing"})`);

  serverReady = false;

  serverChild = fork(serverPath, [], {
    env: {
      ...process.env,
      // Run the child as plain Node.js (not a second Electron instance).
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      PORT: String(port),
      DATABASE_URL: `file:${dbPath}`,
      ELECTRON_VAULT: "1",
      DRIZZLE_MIGRATIONS_DIR: migrationsDir,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  let startupOutput = "";

  serverChild.stdout.on("data", (chunk) => {
    const text = String(chunk).trimEnd();
    if (text) {
      startupOutput += `${text}\n`;
      log("server", text);
    }
  });
  serverChild.stderr.on("data", (chunk) => {
    const text = String(chunk).trimEnd();
    if (text) {
      startupOutput += `${text}\n`;
      log("server", text);
    }
  });

  serverChild.on("message", (message) => {
    if (!message || message.type !== "vault:decrypt" || !message.id) return;
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        serverChild.send({ type: "vault:decrypt:reply", id: message.id, error: "SafeStorage is not available" });
        return;
      }
      const plaintext = safeStorage.decryptString(Buffer.from(String(message.data || ""), "base64"));
      serverChild.send({ type: "vault:decrypt:reply", id: message.id, plaintext });
    } catch (error) {
      serverChild.send({ type: "vault:decrypt:reply", id: message.id, error: error instanceof Error ? error.message : "decrypt failed" });
    }
  });

  return new Promise((resolve, reject) => {
    const healthUrl = `http://0.0.0.0:${port}/api/health`;
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
    let settled = false;

    const settle = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else {
        serverReady = true;
        log("server", "Embedded server is ready.");
        resolve();
      }
    };

    const onExit = (code, signal) => {
      const tail = startupOutput ? `\nLast server output:\n${lastLines(startupOutput, 40)}` : "";
      if (!settled) {
        log("server", `Server process exited before ready (code=${code}, signal=${signal}).${tail}`);
        settle(new Error(`Embedded server exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "none"}).${tail}`));
      } else {
        log("server", `Server process exited (code=${code}, signal=${signal}).`);
      }
      scheduleServerRestart();
    };
    serverChild.on("exit", onExit);

    const attempt = () => {
      if (settled) return;
      const req = http.get(healthUrl, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) settle();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (settled) return;
      if (Date.now() > deadline) {
        const tail = startupOutput ? `\nLast server output:\n${lastLines(startupOutput, 40)}` : "";
        settle(new Error(`Embedded server did not become ready in time (${SERVER_READY_TIMEOUT_MS}ms).${tail}`));
        return;
      }
      setTimeout(attempt, 300);
    };

    attempt();
  });
}

// --- window ---

function createWindow(startUrl) {
  const state = loadSessionState();
  const bounds = state.bounds || { width: 1680, height: 1050 };

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 1100,
    minHeight: 700,
    title: "Multi-Agent Code Studio",
    backgroundColor: "#1e1e1e",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (state.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => mainWindow.show());
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  }, 4000);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("console-message", (_event, details) => {
    const level = ["verbose", "info", "warning", "error"][details.level] ?? details.level;
    log("renderer", `[${level}] ${details.message} (${details.sourceUrl}:${details.lineNumber})`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log("app", `Page failed to load: ${errorDescription} (code=${errorCode}) url=${validatedURL} mainFrame=${isMainFrame}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log("app", "Page finished loading.");
  });

  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSessionState, 500);
  };
  mainWindow.on("resize", scheduleSave);
  mainWindow.on("move", scheduleSave);
  mainWindow.on("close", () => {
    clearTimeout(saveTimer);
    saveSessionState();
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    log("app", `Renderer process gone: ${details.reason}`);
    renderCrashes += 1;
    if (!isQuitting && mainWindow && renderCrashes <= 3) {
      mainWindow.webContents.reload();
    }
  });

  mainWindow.loadURL(startUrl);
}

function installApplicationMenu() {
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC handlers ---

ipcMain.handle("workspace:select-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select project directory",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle("secrets:isAvailable", () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
});

ipcMain.handle("secrets:encrypt", (_event, plaintext) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("SafeStorage is not available on this system");
  const value = String(plaintext ?? "");
  return ENC_PREFIX + safeStorage.encryptString(value).toString("base64");
});

ipcMain.handle("secrets:decrypt", (_event, encrypted) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("SafeStorage is not available on this system");
  const raw = String(encrypted ?? "");
  const base64 = raw.startsWith(ENC_PREFIX) ? raw.slice(ENC_PREFIX.length) : raw;
  return safeStorage.decryptString(Buffer.from(base64, "base64"));
});

ipcMain.handle("app:recovered-from-crash", () => recoveredFromCrash);

// --- lifecycle ---

process.on("uncaughtException", (error) => {
  log("app", `Uncaught exception: ${error && error.stack ? error.stack : error}`);
});

app.whenReady().then(async () => {
  recoveredFromCrash = fs.existsSync(markerPath());
  if (recoveredFromCrash) log("app", "Detected previous unclean shutdown — recovering session.");

  try {
    fs.writeFileSync(markerPath(), String(Date.now()), "utf8");
  } catch {
    // ignore
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  installApplicationMenu();

  const embedded = app.isPackaged || process.env.ELECTRON_EMBED_SERVER === "1";
  const port = Number(process.env.ELECTRON_SERVER_PORT || DEFAULT_SERVER_PORT);
  let startUrl = embedded ? `http://127.0.0.1:${port}` : process.env.ELECTRON_START_URL || DEFAULT_START_URL;

  if (embedded) {
    try {
      await startEmbeddedServer();
    } catch (error) {
      log("server", `Failed to start embedded server: ${error.message}`);
      dialog.showErrorBox("Server error", error.message);
    }
  }

  createWindow(startUrl);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  saveSessionState();
  try {
    fs.unlinkSync(markerPath());
  } catch {
    // ignore
  }
  if (serverChild) {
    try {
      serverChild.kill();
    } catch {
      // ignore
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
