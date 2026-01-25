import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import InventoryDashboard from "./pages/InventoryDashboard";
import OrdersPage from "./pages/OrdersPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";
import { Layout } from "./components/Layout";
import { InventoryProvider, useInventoryContext } from "./context/InventoryContext";
import { useEffect, useRef } from "react"; // Importar useRef

// Componente para manejar la sincronización inicial y de visibilidad
const AppInitializer = () => {
  const { syncFromSupabase, handleVisibilityChangeSync } = useInventoryContext();
  const initialSyncDoneRef = useRef(false); // Cambiado a useRef

  useEffect(() => {
    const initializeApp = async () => {
      if (!initialSyncDoneRef.current) { // Usar la referencia
        try {
          // Siempre intentar sincronizar desde Supabase al inicio
          await syncFromSupabase("AppInitializer"); // Pasar el origen
          initialSyncDoneRef.current = true; // Marcar como hecho en la referencia
        } catch (error) {
          console.error("Error during app initialization:", error);
        }
      }
    };

    initializeApp();

    // Añadir listener para el cambio de visibilidad de la pestaña
    document.addEventListener('visibilitychange', handleVisibilityChangeSync);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChangeSync);
    };
  }, [syncFromSupabase, handleVisibilityChangeSync]); // Dependencias para asegurar que se ejecute una vez y se limpie

  return null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <InventoryProvider>
          <AppInitializer />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/inventario" replace />} />
              <Route path="inventario" element={<InventoryDashboard />} />
              <Route path="pedidos" element={<OrdersPage />} />
              <Route path="configuracion" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </InventoryProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;