/// <reference path="../electron.d.ts" />

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

// Declaración de tipos local para asegurar que TypeScript reconozca electronAPI
declare global {
  interface Window {
    electronAPI?: {
      openDbFile: () => Promise<Uint8Array | null>;
    };
  }
}

interface FileUploaderProps {
  onFileLoaded: (buffer: Uint8Array) => void;
  loading: boolean;
}

export const FileUploader = ({ onFileLoaded, loading }: FileUploaderProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lógica para Electron
  const handleElectronUpload = async () => {
    const electronAPI = (window as unknown as Window).electronAPI;
    if (electronAPI) {
      const dbBuffer = await electronAPI.openDbFile();
      if (dbBuffer) {
        onFileLoaded(dbBuffer);
      }
    }
  };

  // Lógica para el navegador web
  const handleWebUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          onFileLoaded(new Uint8Array(arrayBuffer));
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // Si la API de Electron está disponible, muestra el botón de Electron
  const electronAPI = (window as unknown as Window).electronAPI;
  if (electronAPI) {
    return (
      <Button onClick={handleElectronUpload} size="lg" disabled={loading}>
        {loading ? (
          "Procesando..."
        ) : (
          <>
            <Upload className="mr-2 h-5 w-5" />
            Cargar Archivo .db
          </>
        )}
      </Button>
    );
  }

  // Si no, muestra el botón de carga web estándar
  return (
    <>
      <input
        type="file"
        accept=".db"
        ref={fileInputRef}
        onChange={handleWebUpload}
        className="hidden"
      />
      <Button onClick={() => fileInputRef.current?.click()} size="lg" disabled={loading}>
        {loading ? (
          "Procesando..."
        ) : (
          <>
            <Upload className="mr-2 h-5 w-5" />
            Cargar Archivo .db
          </>
        )}
      </Button>
    </>
  );
};