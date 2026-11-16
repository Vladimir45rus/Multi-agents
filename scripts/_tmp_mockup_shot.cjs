// Renders design/mockup.html to design/mockup.png (one-off helper).
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: "#0b1020",
    webPreferences: { offscreen: false },
  });
  await win.loadFile(path.join(__dirname, "..", "design", "mockup.html"));
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const image = await win.webContents.capturePage();
  const target = path.join(__dirname, "..", "design", "mockup.png");
  fs.writeFileSync(target, image.toPNG());
  console.log("saved", target, image.getSize());
  app.quit();
}).catch((error) => {
  console.error("capture failed:", error);
  app.exit(1);
});
