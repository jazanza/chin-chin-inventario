import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import chokidar from "chokidar";

// --- CONFIGURATION ---
// IMPORTANT: Replace this with the actual path to your Aronium database file.
const DB_FILE_PATH = "C:\\Aronium\\data\\Aronium.db";
// --- END CONFIGURATION ---

let mainWindow: BrowserWindow | null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupFileWatcher() {
  console.log(`Watching for changes on: ${DB_FILE_PATH}`);
  const watcher = chokidar.watch(DB_FILE_PATH, {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("change", (path) => {
    console.log(`File ${path} has been changed. Notifying renderer.`);
    mainWindow?.webContents.send("db-file-updated");
  });

  watcher.on("error", (error) => {
    console.error(`Watcher error: ${error}`);
  });
}

app.whenReady().then(() => {
  // IPC handler to read the database file and send it to the renderer
  ipcMain.handle("get-db-buffer", async () => {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const buffer = await fs.promises.readFile(DB_FILE_PATH);
        console.log(`Reading DB file, size: ${buffer.length} bytes.`);
        return buffer;
      }
      console.warn(`Database file not found at: ${DB_FILE_PATH}`);
      return null;
    } catch (error) {
      console.error("Error reading database file:", error);
      return null;
    }
  });

  createWindow();
  setupFileWatcher();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});