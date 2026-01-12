import React from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, Cloud, CloudOff, RefreshCcw } from "lucide-react";
import { useInventoryContext } from "@/context/InventoryContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const SyncStatusIndicator = () => {
  const { syncStatus, forceFullSync, loading, isOnline } = useInventoryContext();

  const getStatusIcon = () => {
    switch (syncStatus) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'pending':
        return <CloudOff className="h-4 w-4 text-yellow-500" />;
      case 'synced':
        return <Cloud className="h-4 w-4 text-green-500" />;
      case 'error':
        return <CloudOff className="h-4 w-4 text-red-500" />;
      default:
        return <Cloud className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    if (!isOnline) return "Offline";
    switch (syncStatus) {
      case 'syncing':
        return "Sincronizando...";
      case 'pending':
        return "Pendiente de sincronizar";
      case 'synced':
        return "Sincronizado";
      case 'error':
        return "Error de sincronización";
      default:
        return "Sincronizado";
    }
  };

  const getTooltipContent = () => {
    if (!isOnline) return "No hay conexión a internet. Los cambios se guardarán localmente.";
    switch (syncStatus) {
      case 'syncing':
        return "Sincronizando datos con la nube. Por favor, espera.";
      case 'pending':
        return "Hay cambios locales pendientes de subir a la nube. Se reintentará automáticamente.";
      case 'synced':
        return "Todos los datos están sincronizados con la nube.";
      case 'error':
        return "Hubo un error al sincronizar con la nube. Intenta la sincronización forzada.";
      default:
        return "Estado de sincronización desconocido.";
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1 text-sm px-2 py-1 rounded-md",
              !isOnline && "bg-gray-100 text-gray-600",
              isOnline && syncStatus === 'pending' && "bg-yellow-50 text-yellow-700",
              isOnline && syncStatus === 'synced' && "bg-green-50 text-green-700",
              isOnline && syncStatus === 'error' && "bg-red-50 text-red-700",
              isOnline && syncStatus === 'syncing' && "bg-blue-50 text-blue-700"
            )}>
              {getStatusIcon()}
              <span className="hidden sm:inline">{getStatusText()}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getTooltipContent()}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={forceFullSync}
              disabled={loading || syncStatus === 'syncing' || !isOnline}
              className="h-8 w-8 text-gray-600 hover:text-blue-600 hover:border-blue-600"
            >
              <RefreshCcw className={cn("h-4 w-4", syncStatus === 'syncing' && "animate-spin")} />
              <span className="sr-only">Forzar Sincronización</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Forzar Sincronización Completa</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};