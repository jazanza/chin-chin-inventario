# Chin Chin Inventarios y Pedidos

Una aplicación web y de escritorio (Electron) diseñada para optimizar la gestión de inventarios de productos a partir de bases de datos Aronium `.db`. Permite generar listas de pedidos inteligentes basadas en reglas de stock configurables y mantiene todo sincronizado en tiempo real con la nube.

## 🚀 Características Principales

*   **Carga de Base de Datos Aronium:** Lee archivos `.db` directamente (vía Electron o Web) para extraer stock actual y proveedores.
*   **Gestión de Sesiones:** Historial completo de inventarios realizados, permitiendo cargar, editar o eliminar sesiones pasadas.
*   **Tipos de Inventario Inteligentes:** Soporte para inventarios "Semanales" y "Mensuales" con filtrado automático de productos.
*   **Edición Interactiva:** Tabla de inventario con cálculo de discrepancias en tiempo real y métricas de efectividad.
*   **Generación de Pedidos Automática:** Aplica reglas de negocio (ej: "Si stock <= 5, pedir 24") para sugerir pedidos por proveedor.
*   **Arquitectura de Espejo (Cloud Sync):** Los cambios se guardan primero en IndexedDB y luego se consolidan con Supabase cuando hay conexión.
*   **Sincronización entre Dispositivos:** La app escucha cambios remotos y rehidrata el estado local, pero no ofrece coedición simultánea tipo documento compartido.
*   **Configuración Centralizada:** Gestión de proveedores, reglas de pedido y visibilidad de productos (soft delete) desde una interfaz dedicada.

## 🛠️ Tecnologías

*   **Frontend:** React 18, TypeScript, Vite.
*   **Estilos:** Tailwind CSS + shadcn/ui.
*   **Base de Datos Local:** `sql.js` (lectura de Aronium) y `Dexie.js` (persistencia en IndexedDB).
*   **Backend/Nube:** Supabase (PostgreSQL + Realtime para cambios de tablas críticas).
*   **Escritorio:** Electron.

## 📁 Estructura del Proyecto

*   `src/context/InventoryContext.tsx`: El "cerebro" de la app. Gestiona el estado global, la lógica de procesamiento de la DB y la sincronización con Supabase.
*   `src/lib/persistence.ts`: Configuración de Dexie para el almacenamiento local.
*   `src/pages/`: Vistas principales (Inventario, Pedidos, Configuración).
*   `src/components/`: Componentes de UI reutilizables y módulos lógicos.

## 🧠 Lógica de Sincronización

La aplicación utiliza una estrategia de **Offline-First**:
1.  **Guardado Local:** Cualquier cambio se guarda en Dexie y se marca con `sync_pending: true`.
2.  **Sincronización:** La app intenta subir los cambios a Supabase cuando hay conexión; si falla, quedan pendientes para reintento.
3.  **Resolución de Conflictos:** Se usa `updated_at` para evitar que una copia más vieja pise una más nueva.
4.  **Realtime / Rehidratación:** La app escucha cambios remotos y vuelve a cargar el estado local cuando detecta cambios en Supabase.

## ⚠️ Requisitos de Supabase (Esquema)

Para que la sincronización funcione, las tablas en Supabase deben usar **camelCase** exactamente como se define en el código:

### Tabla `product_rules`
*   `productId` (int4, Primary Key)
*   `productName` (text)
*   `supplierName` (text)
*   `rules` (jsonb)
*   `isHidden` (bool)
*   `inventory_type` (text)
*   `updated_at` (timestamptz, default: now())

### Notas operativas

*   `Forzar Sincronización Total` hoy sirve para rehidratar la instalación local desde la nube, no para coeditar en vivo.
*   `Guardar cambios` y `Guardar pedido` siguen siendo acciones necesarias para persistir cambios locales antes de que se sincronicen.

### Tabla `inventory_sessions`
*   `dateKey` (text, Primary Key)
*   `inventoryType` (text)
*   `inventoryData` (jsonb)
*   `timestamp` (timestamptz)
*   `effectiveness` (float8)
*   `ordersBySupplier` (jsonb)
*   `updated_at` (timestamptz, default: now())

---
Desarrollado para Chin Chin.
