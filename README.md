# Chin Chin Inventarios y Pedidos

Una aplicación web y de escritorio (Electron) para gestionar inventarios de productos desde una base de datos Aronium `.db`, generar listas de pedidos inteligentes basadas en reglas configurables y sincronizar todos los datos con la nube.

## 🚀 Características Principales

*   **Carga de Base de Datos Local:** Carga archivos `.db` de Aronium directamente desde tu sistema de archivos (Electron) o mediante un selector de archivos web.
*   **Gestión de Sesiones de Inventario:** Guarda, carga y elimina sesiones de inventario para continuar el trabajo donde lo dejaste.
*   **Tipos de Inventario:** Selecciona entre inventario "Semanal" o "Mensual" con consultas SQL específicas.
*   **Edición de Inventario Interactiva:** Tabla intuitiva para ajustar cantidades físicas, con indicadores visuales de discrepancias y cálculo automático de efectividad.
*   **Generación de Pedidos Inteligente:** Crea listas de pedidos agrupadas por proveedor, aplicando automáticamente **reglas de negocio configurables por producto** (ej: "Si stock <= 5, pedir 24").
*   **Edición Manual de Pedidos:** Ajusta las cantidades sugeridas antes de copiarlas.
*   **Configuración de Productos Centralizada:** Gestiona proveedores, crea y edita múltiples reglas de pedido, y oculta productos que ya no deseas ver.
*   **Sincronización Automática en la Nube (Supabase):** Todos los datos (sesiones, configuraciones) se guardan localmente y se sincronizan automáticamente con una base de datos en la nube.
*   **Persistencia Offline:** Funciona completamente sin conexión. Los cambios se guardan localmente y se sincronizan cuando hay internet.
*   **Actualizaciones en Tiempo Real:** Refleja inmediatamente los cambios realizados en otros dispositivos o por otros usuarios.
*   **Herramientas de Mantenimiento:** Forzar sincronización total o limpiar la base de datos local.

## 🛠️ Tecnologías

*   **Frontend:** React 18 (TypeScript)
*   **Bundler:** Vite
*   **Estilos:** Tailwind CSS, shadcn/ui
*   **Enrutamiento:** React Router DOM
*   **Gestión de Estado:** React Context API + `useReducer`
*   **Base de Datos Cliente:** `sql.js` (para leer `.db`), `Dexie.js` (IndexedDB Wrapper)
*   **Base de Datos Nube:** Supabase (PostgreSQL + Realtime)
*   **Utilidades:** `date-fns`, `lodash.debounce`, `sonner` (toasts)
*   **Entorno de Escritorio:** Electron (para carga de archivos nativa)

## 📁 Estructura del Proyecto

```
src/
├── components/       # Componentes UI reutilizables (shadcn/ui, FileUploader, InventoryTable, etc.)
├── context/          # InventoryContext para gestión de estado global
├── data/             # Datos estáticos (product-data.json)
├── hooks/            # Hooks personalizados (use-mobile)
├── lib/              # Lógica de negocio y utilidades (db, persistence, supabase, dates)
├── pages/            # Páginas principales de la aplicación (Inventario, Pedidos, Configuración)
├── utils/            # Funciones auxiliares (toast, utils)
├── App.tsx           # Configuración de rutas y proveedores
├── main.tsx          # Punto de entrada de la aplicación
├── globals.css       # Estilos globales de Tailwind
├── electron.d.ts     # Tipos para la integración con Electron
electron/              # Código específico para la aplicación de escritorio Electron
public/               # Archivos estáticos
```

## 🧠 Funcionamiento de la Aplicación

### 1. Inicio y Sincronización

1.  Al iniciar, la aplicación intenta una **sincronización bidireccional total** con Supabase (`syncFromSupabase`).
2.  Descarga las últimas sesiones y configuraciones de productos.
3.  Sube cualquier cambio local pendiente.
4.  Si hay sesiones guardadas, se muestra el `SessionManager`. De lo contrario, se muestra el `FileUploader`.

### 2. Flujo de Inventario

1.  **Cargar `.db`:** El usuario selecciona un archivo de base de datos Aronium.
2.  **Seleccionar Tipo:** Se elige "Inventario Semanal" o "Mensual".
3.  **Procesar Datos:**
    *   La app ejecuta una consulta SQL específica en el archivo `.db`.
    *   Crea o actualiza automáticamente el **Catálogo Maestro de Productos** en la base de datos local (`Dexie`) y en la nube (`Supabase`), preservando las configuraciones existentes.
    *   Se crea y guarda una **nueva sesión de inventario**.
4.  **Editar Inventario:** El usuario ajusta las cantidades físicas en la `InventoryTable`. Los cambios se **guardan automáticamente** en la sesión local y se marcan para sincronizar con la nube.
5.  **Nueva Sesión:** El botón "Nueva Sesión" permite comenzar un inventario completamente nuevo.

### 3. Generación de Pedidos

1.  En la página `/pedidos`, el `OrderGenerationModule` toma los datos del inventario actual.
2.  Para cada producto, aplica las **reglas de pedido configuradas** (ej: "Si stock <= 10, pedir 24").
3.  Muestra una lista de productos por proveedor, incluyendo aquellos con cantidad sugerida 0.
4.  El usuario puede **editar manualmente** las cantidades finales a pedir.
5.  El botón "Copiar Pedido" genera un texto formateado con las cantidades finales y lo copia al portapapeles. Este pedido también se guarda en la sesión.

### 4. Configuración de Productos

1.  En la página `/configuracion`, el usuario puede:
    *   **Actualizar Catálogo:** Subir un nuevo `.db` para detectar productos nuevos o actualizar nombres existentes.
    *   **Gestionar Reglas:** Ver productos agrupados por proveedor, editar el proveedor asociado, crear/editar/eliminar múltiples reglas de stock/pedido por producto.
    *   **Ocultar Productos:** Ocultar productos que ya no se desean ver en inventarios ni pedidos.
    *   **Herramientas de DB:** Forzar una sincronización total o limpiar la base de datos local.

### 5. Sincronización con la Nube

*   **Automática y en Segundo Plano:** Cambios locales se marcan como `sync_pending` y se intentan sincronizar inmediatamente con Supabase.
*   **Persistencia Offline:** Si no hay conexión, los datos se guardan localmente y se sincronizan cuando se restablece la conexión.
*   **Reintentos Automáticos:** Un mecanismo periódico (`retryPendingSyncs`) reintenta sincronizar los datos pendientes.
*   **Actualización en Tiempo Real:** La app se suscribe a cambios en Supabase (`Realtime`). Cuando otro usuario modifica datos, estos cambios se reflejan **inmediatamente** en la UI de todos los clientes conectados.
*   **Reconciliación de Conflictos:** La sincronización bidireccional (`syncFromSupabase`) y la lógica de `updated_at` en `Dexie` aseguran que la versión más reciente de los datos prevalezca.
*   **Sincronización al Volver al Primer Plano:** En móviles o pestañas inactivas, al volver a la app se dispara una sincronización rápida.

## 📦 Desarrollo

### Prerrequisitos

*   Node.js (versión recomendada en `package.json`)
*   npm o yarn

### Instalación

```bash
# Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd <NOMBRE_DEL_PROYECTO>

# Instalar dependencias
npm install
# o
yarn install
```

### Configuración de Supabase

1.  Crea un proyecto en [Supabase](https://supabase.com/).
2.  Crea las tablas `inventory_sessions` y `product_rules` según las interfaces definidas en `src/lib/persistence.ts`.
3.  Habilita el servicio `Realtime` en la configuración de tu proyecto Supabase.
4.  Crea un archivo `.env.local` en la raíz del proyecto y agrega tus claves:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase
```

### Ejecutar en Modo Desarrollo

```bash
# Para la aplicación web
npm run dev
# o
yarn dev

# Para la aplicación de escritorio (Electron)
npm run build:electron
# o
yarn build:electron
```

### Construir para Producción

```bash
# Para la web
npm run build
# o
yarn build

# Para Electron (genera ejecutables)
npm run build:electron
# o
yarn build:electron
```

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - consulta el archivo `LICENSE` para más detalles.

## 🙏 Agradecimientos

*   [shadcn/ui](https://ui.shadcn.com/) por los excelentes componentes.
*   [Supabase](https://supabase.com/) por la increíble plataforma backend.
*   [sql.js](https://github.com/sql-js/sql.js/) por permitirnos trabajar con SQLite en el navegador.
*   [Dexie.js](https://dexie.org/) por simplificar IndexedDB.