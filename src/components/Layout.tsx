import { Outlet, NavLink } from "react-router-dom";
import { MobileSidebar } from "./MobileSidebar";


export const Layout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-white px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
        <MobileSidebar />
        <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Chin Chin App</h1> {/* Aquí está el título */}
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
        </nav>
      </header>
      <main className="flex-1 flex flex-col p-4 sm:px-6 sm:py-0">
        <Outlet />
      </main>
      
    </div>
  );
};