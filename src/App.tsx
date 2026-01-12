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
import { useEffect } from "react";

// Componente para manejar la sincronización inicial
const AppInitializer = () => {
  const { syncFromSupabase } = useInventoryContext();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Siempre intentar sincronizar desde Supabase al inicio
        await syncFromSupabase();
      } catch (error) {
        console.error("Error during app initialization:", error);
      }
    };

    initializeApp();
  }, [syncFromSupabase]); // Dependencia de syncFromSupabase para asegurar que se ejecute una vez

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