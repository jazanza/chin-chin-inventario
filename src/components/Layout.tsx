import { Outlet, NavLink, Navigate } from "react-router-dom";
import { MobileSidebar } from "./MobileSidebar";
import { SyncStatusIndicator } from "./SyncStatusIndicator"; // Importar el nuevo componente
import { Button } from "@/components/ui/button";
import { CloudDownload } from "lucide-react";
import { useInventoryContext } from "@/context/InventoryContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


export const Layout = () => {
  const { forceSyncFromCloud, loading, isOnline, syncStatus } = useInventoryContext();

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
          >
            Configuración
          </NavLink>
        </nav>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={forceSyncFromCloud}
                disabled={loading || !isOnline || syncStatus === 'syncing'}
                className="ml-4 text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white text-xs sm:text-sm"
              >
                <CloudDownload className="h-4 w-4 mr-1" />
                Sincronizar con la Nube
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Descargar configuraciones de productos desde la nube (sobrescribe lo local).</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <SyncStatusIndicator /> {/* Integrar el indicador de estado de sincronización */}
      </header>
      <main className="flex-1 flex flex-col p-4 sm:px-6 sm:py-0">
        <Outlet />
      </main>
      
    </div>
  );
};