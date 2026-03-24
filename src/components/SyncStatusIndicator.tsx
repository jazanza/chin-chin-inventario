import React from 'react';
import { Loader2, Cloud, CloudOff } from "lucide-react";
import { useInventoryContext } from "@/context/InventoryContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const SyncStatusIndicator = () => {
  const { syncStatus, isOnline } = useInventoryContext();

  const getStatusIcon = () => {
    if (!isOnline) return <CloudOff className="h-4 w-4 text-gray-500" />;
    
    switch (syncStatus) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'pending':
        return <Cloud className="h-4 w-4 text-yellow-500" />;
      case 'synced':
        return <Cloud className="h-4 w-4 text-green-500" />;
      case 'error':
        return <CloudOff className="h-4 w-4 text-red-500" />;
      default:
        return <Cloud className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTooltipContent = () => {
    if (!isOnline) return "Sin conexión a internet. Los cambios se guardarán localmente.";
    switch (syncStatus) {
      case 'syncing':
        return "Sincronizando con la nube...";
      case 'pending':
        return "Hay cambios locales pendientes de subir.";
      case 'synced':
        return "Todos los datos están al día en la nube.";
      case 'error':
        return "Error de sincronización. Se reintentará automáticamente.";
      default:
        return "Estado de conexión: Online";
    }
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full transition-colors",
              !isOnline && "bg-gray-100",
              isOnline && syncStatus === 'pending' && "bg-yellow-50",
              isOnline && syncStatus === 'synced' && "bg-green-50",
              isOnline && syncStatus === 'error' && "bg-red-50",
              isOnline && syncStatus === 'syncing' && "bg-blue-50"
            )}>
              {getStatusIcon()}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getTooltipContent()}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};