import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs";

let mainWindow: BrowserWindow | null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

app.whenReady().then(() => {
  // IPC handler para abrir el diálogo de selección de archivos y leer el archivo de la base de datos
  ipcMain.handle("open-db-file", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Seleccionar archivo de base de datos de Aronium",
        buttonLabel: "Abrir",
        properties: ["openFile"],
        filters: [{ name: "Database Files", extensions: ["db"] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        console.log("Selección de archivo cancelada.");
        return null;
      }

      const filePath = result.filePaths[0];
      const buffer = await fs.promises.readFile(filePath);
      console.log(`Leyendo archivo DB, tamaño: ${buffer.length} bytes.`);
      return buffer;
    } catch (error) {
      console.error("Error al leer el archivo de la base de datos:", error);
      return null;
    }
  });

  createWindow();

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