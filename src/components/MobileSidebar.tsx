import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const MobileSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const closeSheet = () => setIsOpen(false);

  return (
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
            onClick={closeSheet}
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
            onClick={closeSheet}
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
            onClick={closeSheet}
          >
            Configuración
          </NavLink>
        </nav>
      </SheetContent>
    </Sheet>
  );
};