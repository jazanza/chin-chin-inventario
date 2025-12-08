import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import InventoryDashboard from "./pages/InventoryDashboard";
import OrdersPage from "./pages/OrdersPage";
import NotFound from "./pages/NotFound";
import { Layout } from "./components/Layout";
import { InventoryProvider } from "./context/InventoryContext"; // Importar el proveedor de contexto

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <InventoryProvider> {/* Envolver con InventoryProvider */}
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/inventario" replace />} />
              <Route path="inventario" element={<InventoryDashboard />} />
              <Route path="pedidos" element={<OrdersPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </InventoryProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;