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
import { InventoryProvider } from "./context/InventoryContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <InventoryProvider>
          {/* AppInitializer eliminado. La carga inicial se maneja dentro de InventoryProvider. */}
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