import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useInventoryContext } from "@/context/InventoryContext";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const MobileSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const { hasUnsavedChanges, saveCurrentSession, filteredInventoryData, inventoryType, setHasUnsavedChanges } = useInventoryContext();
  const navigate = useNavigate();

  const closeSheet = () => setIsOpen(false);

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      setPendingPath(path);
      setShowExitDialog(true);
      closeSheet();
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
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[250px] sm:w-[300px] bg-white p-4">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-2xl font-bold text-gray-900">Navegación</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-4">
            <NavLink
              to="/inventario"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-gray-900 ${
                  isActive ? "bg-blue-100 text-blue-700 font-semibold" : ""
                }`
              }
              onClick={(e) => { handleNavigation(e, "/inventario"); closeSheet(); }}
            >
              Inventario
            </NavLink>
            <NavLink
              to="/pedidos"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-gray-900 ${
                  isActive ? "bg-blue-100 text-blue-700 font-semibold" : ""
                }`
              }
              onClick={(e) => { handleNavigation(e, "/pedidos"); closeSheet(); }}
            >
              Pedidos
            </NavLink>
            <NavLink
              to="/configuracion"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-gray-900 ${
                  isActive ? "bg-blue-100 text-blue-700 font-semibold" : ""
                }`
              }
              onClick={(e) => { handleNavigation(e, "/configuracion"); closeSheet(); }}
            >
              Configuración
            </NavLink>
          </nav>
        </SheetContent>
      </Sheet>

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
    </>
  );
};