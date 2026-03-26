import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { MobileSidebar } from "./MobileSidebar";
import { useInventoryContext } from "@/context/InventoryContext";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export const Layout = () => {
  const { hasUnsavedChanges, saveCurrentSession, filteredInventoryData, inventoryType, setHasUnsavedChanges } = useInventoryContext();
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      setPendingPath(path);
      setShowExitDialog(true);
    }
  };

  const confirmExitAndSave = async () => {
    if (inventoryType && filteredInventoryData.length > 0) {
      await saveCurrentSession(filteredInventoryData, inventoryType, new Date());
    }
    setShowExitDialog(false);
    if (pendingPath) navigate(pendingPath);
  };

  const confirmExitWithoutSaving = () => {
    setHasUnsavedChanges(false);
    setShowExitDialog(false);
    if (pendingPath) navigate(pendingPath);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-white px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
        <MobileSidebar />
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Chin Chin App</h1>
        <nav className="hidden md:flex md:items-center md:gap-5 lg:gap-6 text-lg font-medium md:text-sm ml-auto">
          <NavLink
            to="/inventario"
            className={({ isActive }) =>
              `transition-colors hover:text-gray-900 ${
                isActive ? "text-blue-600 font-semibold" : "text-gray-500"
              }`
            }
            onClick={(e) => handleNavigation(e, "/inventario")}
          >
            Inventario
          </NavLink>
          <NavLink
            to="/pedidos"
            className={({ isActive }) =>
              `transition-colors hover:text-gray-900 ${
                isActive ? "text-blue-600 font-semibold" : "text-gray-500"
              }`
            }
            onClick={(e) => handleNavigation(e, "/pedidos")}
          >
            Pedidos
          </NavLink>
          <NavLink
            to="/configuracion"
            className={({ isActive }) =>
              `transition-colors hover:text-gray-900 ${
                isActive ? "text-blue-600 font-semibold" : "text-gray-500"
              }`
            }
            onClick={(e) => handleNavigation(e, "/configuracion")}
          >
            Configuración
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 flex flex-col p-4 sm:px-6 sm:py-0">
        <Outlet />
      </main>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Cambios sin guardar
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas guardar los cambios antes de salir? Si no los guardas, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowExitDialog(false)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmExitWithoutSaving}>No guardar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={confirmExitAndSave}>Guardar y Salir</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};