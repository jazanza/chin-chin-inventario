# Documentación del Proyecto: Chin Chin App

Este documento detalla la arquitectura, el flujo de trabajo y la lógica de la aplicación Chin Chin, diseñada para gestionar inventarios y generar pedidos basados en datos de una base de datos Aronium, con capacidades de sincronización en la nube.

## 1. Visión General de la Aplicación

La aplicación Chin Chin es una herramienta de escritorio (Electron) y web que permite a los usuarios:
1.  Cargar un archivo de base de datos `.db` de Aronium.
2.  **Guardar, cargar y eliminar sesiones de inventario** para continuar trabajando donde lo dejaron o gestionar entradas duplicadas.
3.  **Sincronizar automáticamente** sesiones de inventario y configuraciones de productos con una base de datos en la nube (Supabase), implementando una **arquitectura de "espejo" en tiempo real**.
4.  Seleccionar un tipo de inventario (Semanal o Mensual).
5.  Visualizar y editar el inventario actual de productos, registrando las discrepancias.
6.  Generar listas de pedidos para diferentes proveedores, aplicando **reglas de negocio configurables por producto** y permitiendo la edición manual de las cantidades a pedir.
7.  **Configurar productos individualmente**, incluyendo su proveedor, reglas de pedido y visibilidad (ocultar/mostrar).
8.  Copiar fácilmente los pedidos generados para su comunicación.

El objetivo principal es optimizar el proceso de gestión de stock y la creación de pedidos, reduciendo errores manuales y ahorrando tiempo, con la ventaja adicional de la persistencia y sincronización en la nube.

## 2. Pila Tecnológica (Tech Stack)

*   **Frontend**: React (con TypeScript)
*   **Bundler**: Vite
*   **Estilos**: Tailwind CSS (con shadcn/ui para componentes preconstruidos)
*   **Enrutamiento**: React Router DOM
*   **Gestión de Estado Global**: React Context API (`InventoryContext` con `useReducer`)
*   **Base de Datos (Cliente)**: `sql.js` (para leer y consultar archivos `.db` en el navegador o Electron)
*   **Persistencia de Sesiones y Configuraciones (Local)**: `Dexie.js` (IndexedDB Wrapper)
*   **Base de Datos (Nube)**: `Supabase` (para sincronización de sesiones y configuraciones maestras)
*   **Utilidades de Fecha**: `date-fns`
*   **Utilidades de Rendimiento**: `lodash.debounce`
*   **Notificaciones**: `sonner` (para toasts)
*   **Entorno de Escritorio**: Electron (para la funcionalidad de carga de archivos nativa)

## 3. Flujo General de la Aplicación

1.  **Inicio y Sincronización Inicial**:
    *   Al iniciar la aplicación, `AppInitializer` intenta una **sincronización bidireccional total** con Supabase (`syncFromSupabase`). Esto sube cualquier cambio local pendiente y descarga las últimas sesiones y configuraciones de la nube.
    *   Si existen sesiones guardadas (localmente o descargadas de la nube), se muestra el `SessionManager` para que el usuario elija cargar una sesión existente o iniciar una nueva.
    *   Si no hay sesiones, se muestra directamente el `FileUploader`.
    *   La sincronización también se dispara automáticamente cuando la pestaña del navegador se vuelve visible (`visibilitychange`).
    *   **Arquitectura de Espejo (Realtime):** La aplicación implementa una arquitectura de "espejo" utilizando las capacidades de Realtime de Supabase. Esto significa que cada cliente mantiene una copia local de los datos relevantes (sesiones de inventario y configuraciones de productos). Cualquier cambio realizado en la base de datos de Supabase (ya sea por otro cliente o directamente en el backend) se transmite instantáneamente a todos los clientes suscritos, quienes actualizan su copia local y su interfaz de usuario en tiempo real. Esto garantiza que todos los usuarios estén siempre viendo la información más actualizada.
2.  **Gestión de Sesiones**:
    *   El usuario puede **eliminar sesiones** no deseadas desde el `SessionManager`. Las eliminaciones se sincronizan con la nube.
3.  **Carga de Archivo DB**:
    *   El usuario selecciona un archivo `.db` (ya sea a través del diálogo nativo de Electron o un input de archivo web).
    *   El contenido del archivo (como `Uint8Array`) se guarda en el `InventoryContext`.
    *   La carga de un archivo DB también dispara `processDbForMasterConfigs` para **actualizar o añadir nuevos productos al catálogo maestro** en Dexie y Supabase, manteniendo las configuraciones existentes.
4.  **Selección de Tipo de Inventario**:
    *   Una vez cargado el archivo DB, se muestra el `InventoryTypeSelector`.
    *   El usuario elige entre "Inventario Semanal" o "Inventario Mensual".
    *   Esta selección se guarda en el `InventoryContext` y dispara el procesamiento de los datos, **creando y guardando automáticamente una nueva sesión** en IndexedDB y sincronizándola con Supabase.
5.  **Visualización y Edición del Inventario**:
    *   Los datos procesados (filtrados por las configuraciones maestras) se muestran en la `InventoryTable`.
    *   El usuario puede ajustar manualmente la "Cantidad Real" de cada producto utilizando un input con botones de incremento/decremento.
    *   **Persistencia Automática**: Cada cambio en la cantidad física se guarda automáticamente en la sesión actual de IndexedDB (con un `debounce` para optimizar el rendimiento) y se marca como `sync_pending` para su posterior sincronización con Supabase.
    *   La tabla muestra discrepancias entre la cantidad del sistema (Aronium) y la cantidad física.
    *   Se muestra un resumen de la efectividad del inventario.
    *   Un botón "Nueva Sesión" permite al usuario resetear el estado y volver a la pantalla de gestión de sesiones o carga de archivo.
6.  **Generación de Pedidos**:
    *   En la página `/pedidos`, el `OrderGenerationModule` utiliza los datos de inventario (incluyendo las cantidades físicas editadas y las reglas de pedido de las configuraciones maestras) para calcular los pedidos.
    *   Los pedidos se agrupan por proveedor.
    *   El usuario puede seleccionar un proveedor para ver su pedido detallado.
    *   Se muestran todos los productos activos del proveedor, incluso si la cantidad sugerida es 0.
    *   La columna "Sugerencia" muestra la cantidad calculada, y la columna "Pedir" permite al usuario ajustar manualmente esta cantidad con inputs y botones.
    *   Se aplica una lógica especial para el proveedor "Belbier" para mostrar el resumen de cajas.
    *   El usuario puede copiar el pedido al portapapeles, utilizando las cantidades de la columna "Pedir".
    *   **Persistencia de Pedidos**: Al copiar un pedido, los pedidos finales (`finalOrders`) también se guardan en la sesión actual de IndexedDB y se marcan como `sync_pending`.
7.  **Configuración de Productos (`SettingsPage`)**:
    *   Permite al usuario subir un archivo `.db` para **actualizar el catálogo maestro de productos** (detectar nuevos productos, actualizar nombres).
    *   Ofrece una interfaz para **gestionar las reglas de pedido por producto**, permitiendo añadir, editar y eliminar condiciones de stock/cantidad a pedir.
    *   Permite **cambiar el proveedor** asociado a un producto.
    *   Incluye un toggle para **mostrar/ocultar productos** (soft delete), lo que afecta su visibilidad en el inventario y los pedidos.
    *   Proporciona herramientas de base de datos como "Forzar Sincronización Total" y "Limpiar Base de Datos Local".
8.  **Sincronización en Segundo Plano**: Un mecanismo de reintento automático (`retryPendingSyncs`) se ejecuta periódicamente para subir a Supabase cualquier sesión o configuración de producto que esté marcada como `sync_pending` (por ejemplo, debido a una pérdida de conexión temporal).

## 4. Componentes Clave y su Lógica

### `src/main.tsx`
*   Punto de entrada de la aplicación. Renderiza el componente `App`.
*   Importa `globals.css` para los estilos globales de Tailwind.

### `src/App.tsx`
*   Configura el `QueryClientProvider` para `react-query`.
*   Configura `TooltipProvider`, `Toaster` (para `shadcn/ui/toast`) y `Sonner` (para `sonner` toasts).
*   Define el enrutamiento principal con `React Router DOM`:
    *   Ruta raíz (`/`) redirige a `/inventario`.
    *   Ruta `/inventario` renderiza `InventoryDashboard`.
    *   Ruta `/pedidos` renderiza `OrdersPage`.
    *   Ruta `/configuracion` renderiza `SettingsPage`.
    *   Ruta `*` (catch-all) renderiza `NotFound`.
*   Envuelve las rutas con `InventoryProvider` para que el estado global del inventario esté disponible en toda la aplicación.
*   Utiliza el componente `Layout` para la estructura de navegación y el encabezado.
*   **`AppInitializer`**: Un componente que se encarga de la sincronización inicial con Supabase (`syncFromSupabase`) al cargar la aplicación. Utiliza un `useRef` (`initialSyncDoneRef`) para asegurar que esta sincronización se ejecute solo una vez por sesión de navegador, incluso si el componente se re-monta. También gestiona la sincronización al cambiar la visibilidad de la pestaña.

### `src/components/Layout.tsx`
*   Define la estructura general de la interfaz de usuario, incluyendo el encabezado (`header`) y el área de contenido principal (`main`).
*   Incluye `MobileSidebar` para la navegación en dispositivos móviles.
*   Muestra enlaces de navegación (`NavLink`) para "Inventario", "Pedidos" y "Configuración".
*   Renderiza el contenido de la ruta actual a través de `<Outlet />`.
*   Incluye el componente `SyncStatusIndicator` para mostrar el estado de la conexión y sincronización.

### `src/pages/Index.tsx`
*   Un componente simple que redirige (`<Navigate>`) al usuario a la ruta `/inventario` al cargar la aplicación.

### `src/pages/InventoryDashboard.tsx`
*   **Estado Local y Contexto**: Utiliza `useInventoryContext` para acceder y modificar el estado global.
*   **Flujo Condicional Mejorado**: La lógica de renderizado prioriza la visualización de la `InventoryTable` si una sesión está activa, ya sea recién creada o cargada del historial.
    1.  Si `sessionId`, `inventoryType` y `filteredInventoryData` están presentes (indicando una sesión activa y cargada), muestra `InventoryTable` junto con un botón "Nueva Sesión".
    2.  Si no hay `dbBuffer` cargado, `showFileUploader` es `false` y `hasSessionHistory` es `true` (o `initialSyncDone` es `true` y hay historial), muestra `SessionManager` (para elegir una sesión existente).
    3.  Si no hay `dbBuffer` cargado o `showFileUploader` es `true` (ej. se hizo clic en "Nueva Sesión"), muestra `FileUploader` (para cargar un nuevo archivo DB).
    4.  Si `dbBuffer` está cargado pero `inventoryType` aún no ha sido seleccionado, muestra `InventoryTypeSelector`.
*   **Manejo de Eventos**:
    *   `handleFileLoaded`: Actualiza `dbBuffer` en el contexto y resetea `inventoryType`.
    *   `handleInventoryTypeSelect`: Actualiza `inventoryType` en el contexto, lo que dispara el `processInventoryData` y el guardado de la nueva sesión.
    *   `handleStartNewSession`: Resetea el estado del inventario, fuerza la carga de un nuevo archivo DB y muestra el `FileUploader` para una nueva sesión.

### `src/pages/OrdersPage.tsx`
*   Obtiene `filteredInventoryData`, `loading` y `error` del `useInventoryContext`.
*   Muestra mensajes de carga o error según el estado del contexto.
*   Si no hay datos de inventario, instruye al usuario a cargar un archivo.
*   Si hay datos, renderiza `OrderGenerationModule` pasándole `filteredInventoryData`.

### `src/pages/SettingsPage.tsx`
*   Nueva página para gestionar las configuraciones de la aplicación.
*   **Actualizar Catálogo de Productos**: Contiene un `FileUploader` que, al cargar un archivo `.db`, llama a `processDbForMasterConfigs` para actualizar el catálogo maestro de productos en Dexie y Supabase.
*   **Reglas de Pedido por Producto**:
    *   Muestra una lista de productos agrupados por proveedor, obtenida de `masterProductConfigs`.
    *   Incluye un `Switch` para `showHiddenProducts` que permite alternar la visibilidad de los productos ocultos.
    *   Para cada producto, permite editar el proveedor (`Select`) y gestionar múltiples reglas de pedido (`minStock`, `orderAmount`).
    *   Los cambios se guardan automáticamente en Dexie y se sincronizan con Supabase (`saveMasterProductConfig`).
    *   Un botón `Trash2` (o `Eye` si está oculto) permite ocultar/restaurar un producto (`deleteMasterProductConfig` realiza un soft delete).
    *   Muestra el estado de guardado (`saving`, `saved`, `error`) para cada producto.
*   **Herramientas de Base de Datos**:
    *   **Forzar Sincronización Total**: Un botón que llama a `syncFromSupabase("SettingsPage_UserAction", true)` para forzar una sincronización bidireccional completa, subiendo cambios locales y descargando de la nube.
    *   **Limpiar Base de Datos Local**: Un botón que llama a `clearLocalDatabase` para eliminar todos los datos de IndexedDB localmente.

### `src/components/FileUploader.tsx`
*   Permite al usuario seleccionar un archivo `.db`.
*   **Lógica Condicional (Electron vs. Web)**:
    *   Detecta si `window.electronAPI` está disponible (indicando que la app corre en Electron).
    *   Si es Electron, usa `electronAPI.openDbFile()` para abrir un diálogo de archivo nativo.
    *   Si es web, usa un `input type="file"` estándar.
*   Lee el archivo como `ArrayBuffer` y lo convierte a `Uint8Array` antes de pasarlo a `onFileLoaded`.
*   Muestra un estado de carga (`loading`).

### `src/components/InventoryTypeSelector.tsx`
*   Presenta dos botones para que el usuario elija entre "Inventario Semanal" o "Inventario Mensual".
*   Llama a la función `onSelect` con el tipo elegido.
*   Deshabilita los botones durante el estado de carga.

### `src/components/InventoryTable.tsx`
*   Muestra los productos del inventario en una tabla interactiva.
*   **Estado Local**: `editableInventory` para gestionar los cambios en la cantidad física.
*   **Sincronización**: `useEffect` para actualizar `editableInventory` cuando `filteredInventoryData` del contexto cambia.
*   **Edición de Cantidad Física**:
    *   `Input` de tipo número para la `physicalQuantity`.
    *   Botones `+` y `-` para incrementar/decrementar la cantidad.
    *   `updateInventoryItem`: Función para actualizar un ítem específico y marcarlo como `hasBeenEdited`.
*   **Guardado Automático**: Utiliza `saveCurrentSession` del `InventoryContext` con un `debounce` para guardar los cambios en IndexedDB cada vez que se edita una cantidad física.
*   **Visualización de Discrepancias**:
    *   Muestra un icono de `Check` si `systemQuantity` y `physicalQuantity` coinciden o si no ha sido editado.
    *   Muestra `ArrowUp` (exceso) o `ArrowDown` (déficit) si hay una discrepancia y ha sido editado.
*   **Resumen de Inventario (`useMemo`)**: Calcula y muestra:
    *   Total de productos.
    *   Cantidad de aciertos (coincidencias).
    *   Cantidad de desaciertos positivos (exceso).
    *   Cantidad de desaciertos negativos (déficit).
    *   Porcentaje de efectividad en stock.
*   **Estilos**: Utiliza clases de Tailwind CSS para un diseño responsivo y `custom-scrollbar` para la tabla.

### `src/components/OrderGenerationModule.tsx`
*   **Estado Local**: `selectedSupplier` para filtrar los pedidos por proveedor, y `finalOrders` para gestionar las cantidades editables.
*   **Cálculo de Pedidos (`useMemo`)**:
    *   Itera sobre `inventoryData` (que es `filteredInventoryData` del contexto).
    *   Para cada producto, aplica las `rules` definidas en su `MasterProductConfig` para calcular `quantityToOrder`.
    *   Incluye *todos* los productos activos del proveedor, incluso si `adjustedQuantity` es 0.
    *   Agrupa los pedidos por `supplier`.
    *   Ordena los productos alfabéticamente dentro de cada proveedor.
*   **Sincronización `finalOrders`**: `useEffect` para inicializar `finalOrders` con los `adjustedQuantity` calculados cuando `ordersBySupplier` cambia.
*   **Edición de Cantidad Final (`handleFinalOrderQuantityChange`)**: Permite al usuario modificar la `finalOrderQuantity` de cada producto con un input y botones `+`/`-`. Al cambiar, también se llama a `saveCurrentSession` para guardar los pedidos en la sesión y marcarlos como `sync_pending`.
*   **Resumen Especial para "Belbier" (`useMemo`)**:
    *   Si `selectedSupplier` es "Belbier", calcula el `totalFinalOrderQuantity` (usando las cantidades editadas), `totalBoxes` y `missingUnits`.
    *   Este resumen se muestra en la UI, pero **no se incluye en el texto copiado**.
*   **Selección de Proveedor**: Botones para cada proveedor con pedidos generados.
*   **Detalle del Pedido**:
    *   Muestra una tabla con el `product`, `adjustedQuantity` (columna "Sugerencia" centrada) y `finalOrderQuantity` (columna "Pedir" editable) para el `selectedSupplier`.
    *   Botón "Copiar Pedido" que genera un texto formateado y lo copia al portapapeles, utilizando las `finalOrderQuantity` editadas.
*   **Guardado de Pedidos**: Al copiar el pedido, se llama a `saveCurrentSession` para guardar el estado actual de los pedidos en la sesión de IndexedDB y marcarlos como `sync_pending`.
*   **Toasts**: Utiliza `showSuccess` y `showError` de `src/utils/toast.ts` para feedback al usuario.

### `src/components/SessionManager.tsx`
*   Muestra una lista de sesiones de inventario guardadas en IndexedDB.
*   Obtiene el historial de sesiones usando `getSessionHistory` del `InventoryContext`.
*   Permite al usuario cargar una sesión existente (`loadSession`) o iniciar una nueva (`onStartNewSession`).
*   Cada fila de sesión incluye un botón con el icono `Trash2` que permite eliminar la sesión de la base de datos local y de Supabase.
*   Muestra la fecha, tipo de inventario y porcentaje de efectividad de cada sesión.

### `src/components/SyncStatusIndicator.tsx`
*   Un componente que muestra el estado actual de la sincronización (`syncStatus`: `idle`, `syncing`, `pending`, `synced`, `error`) y la conectividad (`isOnline`).
*   Utiliza iconos (`Loader2`, `Cloud`, `CloudOff`) y texto para comunicar el estado al usuario.
*   Proporciona tooltips con información detallada sobre cada estado.

### `src/context/InventoryContext.tsx`
*   **Context API con `useReducer`**: Proporciona un estado global para `dbBuffer`, `inventoryType`, `rawInventoryItemsFromDb`, `masterProductConfigs`, `loading`, `error`, `sessionId`, `syncStatus`, `isOnline`, `isSupabaseSyncInProgress`, `isSyncBlockedWarningActive`.
*   **Estado Global Clave**:
    *   `dbBuffer`: `Uint8Array` del archivo DB cargado.
    *   `inventoryType`: "weekly" o "monthly".
    *   `rawInventoryItemsFromDb`: Array de `InventoryItem` tal como se extraen inicialmente de la DB (antes de aplicar filtros de `MasterProductConfig`).
    *   `masterProductConfigs`: Array de `MasterProductConfig` que contienen las reglas de pedido, proveedor y estado de visibilidad de cada producto.
    *   `loading`: Booleano para indicar si se están procesando datos o sincronizando.
    *   `error`: String para mensajes de error.
    *   `sessionId`: `dateKey` de la sesión actualmente cargada.
    *   `syncStatus`: Estado de la sincronización (`idle`, `syncing`, `pending`, `synced`, `error`).
    *   `isOnline`: Estado de la conexión a internet.
    *   `isSupabaseSyncInProgress`: Booleano para bloquear múltiples sincronizaciones simultáneas.
    *   `isSyncBlockedWarningActive`: Booleano para controlar la advertencia de bloqueo de sincronización.
    *   `realtimeStatus`: Estado del canal de Realtime de Supabase.
*   **`filteredInventoryData` (`useMemo`)**: Una propiedad computada que toma `rawInventoryItemsFromDb` y aplica las `masterProductConfigs` (filtrando productos ocultos, asignando reglas y proveedor correctos) para generar la lista final de `InventoryItem` que se muestra en la tabla. Preserva `physicalQuantity` y `hasBeenEdited` de la sesión actual.
*   **`processInventoryData` (`useCallback`)**:
    *   Función asíncrona que toma el `buffer` y el `type` de inventario.
    *   Inicializa `sql.js`, carga la base de datos, ejecuta consultas SQL (con lógica de último proveedor y filtro de activo), y **actualiza/crea `MasterProductConfig`** en Dexie y Supabase para los productos encontrados.
    *   Guarda automáticamente los datos como una nueva sesión en IndexedDB y Supabase, y establece `sessionId`.
*   **`processDbForMasterConfigs` (`useCallback`)**:
    *   Similar a `processInventoryData` pero utiliza `ALL_PRODUCTS_QUERY` para obtener *todos* los productos habilitados de la DB.
    *   Su objetivo principal es **actualizar o crear `MasterProductConfig`** en Dexie y Supabase, sin crear una sesión de inventario. Se usa en la página de configuración.
*   **`saveCurrentSession` (`useCallback`)**:
    *   Guarda el estado actual de `inventoryData` (la lista filtrada), `inventoryType`, `timestamp`, `effectiveness` y `ordersBySupplier` en IndexedDB.
    *   Marca la sesión como `sync_pending: true`.
    *   Intenta sincronizar inmediatamente con Supabase. Si tiene éxito, marca `sync_pending: false`. Si falla, permanece `sync_pending: true`.
*   **`loadSession` (`useCallback`)**: Carga una sesión específica de IndexedDB y actualiza el estado del contexto.
*   **`deleteSession` (`useCallback`)**: Elimina una sesión de IndexedDB y de Supabase.
*   **`getSessionHistory` (`useCallback`)**: Recupera todas las sesiones guardadas de IndexedDB.
*   **`loadMasterProductConfigs` (`useCallback`)**: Carga las configuraciones de producto de Dexie (opcionalmente incluyendo las ocultas) y actualiza el estado `masterProductConfigs`. **Optimizado para no disparar `dispatch` si los datos no han cambiado.**
*   **`saveMasterProductConfig` (`useCallback`)**: Guarda una `MasterProductConfig` en Dexie (marcando `sync_pending: true`) e intenta sincronizarla con Supabase.
*   **`deleteMasterProductConfig` (`useCallback`)**: Realiza un "soft delete" de una `MasterProductConfig` (cambia `isHidden` a `true`) en Dexie y Supabase.
*   **`syncFromSupabase` (`useCallback`)**:
    *   La función central de sincronización bidireccional.
    *   **Bloqueo de seguridad (`syncLockRef`):** Utiliza `syncLockRef` para evitar que múltiples operaciones de sincronización o guardado se ejecuten simultáneamente, lo que podría causar conflictos o pérdida de datos. Este `useRef` se establece en `true` al inicio de la operación y se garantiza su liberación (`false`) en un bloque `finally`.
    *   Primero, sube todos los ítems `sync_pending: true` de Dexie a Supabase.
    *   Luego, descarga todas las sesiones y configuraciones de producto de Supabase y las fusiona con los datos locales en Dexie, priorizando la versión más reciente (`updated_at`).
    *   Actualiza `lastSyncTimestampRef` al finalizar.
*   **`handleVisibilityChangeSync` (`useCallback`)**: Se dispara cuando la pestaña del navegador se vuelve visible, llamando a `syncFromSupabase("VisibilityChange")`.
*   **`resetAllProductConfigs` (`useCallback`)**: Elimina todas las configuraciones de producto de Dexie y Supabase, y luego las recarga desde un archivo `.db` proporcionado.
*   **`clearLocalDatabase` (`useCallback`)**: Elimina toda la base de datos IndexedDB localmente y resetea el estado de la aplicación.
*   **`retryPendingSyncs` (`useCallback`)**: Un mecanismo de reintento automático que se ejecuta periódicamente para subir a Supabase cualquier sesión o configuración de producto que esté marcada como `sync_pending`.
*   **`useEffect` para `checkLongPendingSyncs`**: Un intervalo que verifica periódicamente si hay ítems `sync_pending` que llevan mucho tiempo sin sincronizarse y muestra un `toast` de advertencia.

### `src/lib/db.ts`
*   **`initDb()`**: Inicializa la librería `sql.js` cargando el módulo WASM.
*   **`loadDb(buffer)`**: Crea una instancia de `SQL.Database` a partir de un `ArrayBuffer` o `Uint8Array`.
*   **`queryData(db, query)`**: Ejecuta una consulta SQL en la base de datos y devuelve los resultados como un array de objetos.
*   Contiene las consultas SQL (`WEEKLY_INVENTORY_QUERY`, `MONTHLY_INVENTORY_QUERY`, `ALL_PRODUCTS_QUERY`) para extraer datos de la base de datos Aronium.

### `src/lib/persistence.ts`
*   Define la interfaz `InventorySession` que incluye `dateKey`, `inventoryType`, `inventoryData`, `timestamp`, `effectiveness`, `ordersBySupplier`, `sync_pending` y `updated_at`.
*   Define la interfaz `MasterProductConfig` que incluye `productId`, `productName`, `rules`, `supplier`, `isHidden`, `sync_pending` y `updated_at`.
*   Define la clase `SessionDatabase` que extiende `Dexie` para configurar la base de datos IndexedDB y las tablas `sessions`, `productRules` y `supplierConfigs`.
*   Gestiona las versiones de la base de datos para migraciones (añadiendo `sync_pending`, `isHidden`, `updated_at` y sus índices).
*   Exporta una instancia de `SessionDatabase` (`db`) para su uso en toda la aplicación.

### `src/lib/supabase.ts`
*   Configura el cliente de Supabase utilizando las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
*   Define la interfaz `Database` para tipar las tablas de Supabase (`inventory_sessions`, `product_rules`, `supplier_configs`).
*   Exporta la instancia del cliente `supabase`.

### `src/utils/toast.ts`
*   Proporciona funciones de utilidad (`showSuccess`, `showError`, `showLoading`, `dismissToast`) para mostrar notificaciones `sonner`.

### Integración con Electron (`src/electron.d.ts`, `electron/main.ts`, `electron/preload.ts`)
*   **`src/electron.d.ts`**: Define la interfaz `IElectronAPI` y extiende `Window` para que TypeScript reconozca `window.electronAPI`.
*   **`electron/preload.ts`**: Usa `contextBridge` para exponer la función `openDbFile` del proceso principal al proceso de renderizado (frontend), manteniendo la seguridad (`contextIsolation`).
*   **`electron/main.ts`**:
    *   Configura la ventana principal de Electron (`BrowserWindow`).
    *   Maneja el evento `open-db-file` a través de `ipcMain.handle`.
    *   Cuando se invoca `open-db-file` desde el frontend, abre un diálogo nativo para seleccionar archivos (`dialog.showOpenDialog`).
    *   Lee el archivo seleccionado usando `fs.promises.readFile` y devuelve su contenido como un `Buffer` (que se convierte a `Uint8Array` en el frontend).

## 5. Flujo de Datos

1.  **Inicio App**: `AppInitializer` llama a `syncFromSupabase("AppInitializer")` para sincronización inicial. `InventoryDashboard` verifica `getSessionHistory`.
2.  **Sin Historial (o después de limpiar DB)**: `InventoryDashboard` muestra `FileUploader`.
3.  **Con Historial (o después de sincronizar)**: `InventoryDashboard` muestra `SessionManager`.
    *   Usuario selecciona "Cargar Sesión": `SessionManager` llama `loadSession` (en `InventoryContext`) -> `db.sessions.get()` -> `InventoryContext` actualiza estado (`inventoryType`, `rawInventoryItemsFromDb`, `sessionId`).
    *   Usuario selecciona "Eliminar Sesión": `SessionManager` llama `deleteSession` (en `InventoryContext`) -> `db.sessions.delete()` y `supabase.from('inventory_sessions').delete()` -> `InventoryContext` resetea estado si era la sesión activa -> `SessionManager` recarga historial.
    *   Usuario selecciona "Nueva Sesión": `SessionManager` llama `onStartNewSession` (en `InventoryDashboard`) -> `resetInventoryState`, `setDbBuffer(null)`, `setInventoryType(null)` -> `InventoryDashboard` muestra `FileUploader`.
4.  **Carga de Archivo DB**: `FileUploader` -> `setDbBuffer` (en `InventoryContext`). También, si es desde `SettingsPage`, `handleDbFileLoadedFromSettings` llama a `processDbForMasterConfigs`.
5.  **Selección de Tipo (solo en InventoryDashboard)**: `InventoryTypeSelector` -> `setInventoryType` (en `InventoryContext`).
6.  **Procesamiento DB para Inventario**: `InventoryContext` (`useEffect` dispara `processInventoryData` si `dbBuffer` y `inventoryType` están presentes y NO hay `sessionId` activa) -> `sql.js` lee `dbBuffer` -> ejecuta consultas SQL -> **actualiza/crea `MasterProductConfig` en Dexie y Supabase** -> `InventoryContext` actualiza `rawInventoryItemsFromDb` -> **`saveCurrentSession` guarda la nueva sesión en IndexedDB y Supabase** -> `InventoryContext` establece `sessionId`.
7.  **Edición de Inventario**: `InventoryTable` lee `filteredInventoryData` (del `InventoryContext`) -> usuario edita `physicalQuantity` -> `updateInventoryItem` actualiza estado local -> `debouncedSave` llama `saveCurrentSession` para actualizar la sesión en IndexedDB y marcarla como `sync_pending`.
8.  **Generación de Pedidos**: `OrdersPage` -> `OrderGenerationModule` lee `filteredInventoryData` (del `InventoryContext`) -> aplica `rules` de `masterProductConfigs` -> calcula `adjustedQuantity` -> permite edición manual de `finalOrderQuantity`.
9.  **Copia de Pedido**: `OrderGenerationModule` -> `copyOrderToClipboard` -> **llama `saveCurrentSession` para guardar `finalOrders` en la sesión de IndexedDB y marcarlos como `sync_pending`**.
10. **Configuración de Productos (SettingsPage)**:
    *   Carga de archivo DB: `FileUploader` -> `handleDbFileLoadedFromSettings` -> `processDbForMasterConfigs` (en `InventoryContext`) -> `sql.js` lee `ALL_PRODUCTS_QUERY` -> **actualiza/crea `MasterProductConfig` en Dexie y Supabase**.
    *   Edición de `MasterProductConfig` (proveedor, reglas, ocultar): `SettingsPage` edita `editableProductConfigs` -> `handleProductSupplierChange`, `handleAddRule`, `handleRuleBlur`, `handleDeleteRule`, `handleHideProductConfig` llaman a `saveMasterProductConfig` o `deleteMasterProductConfig` (en `InventoryContext`) -> actualiza Dexie y Supabase.
    *   Forzar Sincronización Total: `SettingsPage` llama `syncFromSupabase("SettingsPage_UserAction", true)`.
    *   Limpiar DB Local: `SettingsPage` llama `clearLocalDatabase`.
11. **Sincronización en Segundo Plano**: `retryPendingSyncs` (en `InventoryContext`) se ejecuta periódicamente, buscando ítems `sync_pending: true` en Dexie y reintentando subirlos a Supabase.

## 6. Cómo Añadir Nuevos Productos o Reglas de Pedido

La gestión de productos y reglas de pedido ahora se centraliza en la aplicación a través de la página de **Configuración**.

### Añadir un Nuevo Producto
1.  **Sube un archivo `.db` actualizado**: En la página de **Configuración**, en la sección "Actualizar Catálogo de Productos", sube un archivo `.db` de Aronium que contenga el nuevo producto.
2.  La aplicación detectará automáticamente el nuevo producto y lo añadirá a tu catálogo maestro de productos (en IndexedDB y Supabase) con reglas vacías y un proveedor detectado.
3.  Podrás ver y configurar el nuevo producto en la sección "Reglas de Pedido por Producto".

### Añadir o Modificar una Regla de Pedido
1.  **Navega a la página de Configuración**: Ve a la sección "Reglas de Pedido por Producto".
2.  **Encuentra el producto**: Expande el acordeón del proveedor correspondiente y busca el producto deseado.
3.  **Añadir una nueva regla**: Haz clic en el botón "Añadir Condición" debajo del producto.
4.  **Editar una regla existente**: Modifica los valores de "Si Stock es <=" y "Pedir" para la regla deseada.
5.  **Eliminar una regla**: Haz clic en el icono de la papelera junto a la regla.
6.  **Guardado Automático**: Los cambios se guardan automáticamente en IndexedDB y se sincronizan con Supabase.

### Ocultar/Restaurar un Producto
1.  En la página de **Configuración**, en la sección "Reglas de Pedido por Producto", busca el producto.
2.  Haz clic en el icono `Trash2` (papelera) para ocultarlo. El producto desaparecerá de las vistas de Inventario y Pedidos.
3.  Para ver y restaurar productos ocultos, activa el `Switch` "Mostrar ocultos". El icono cambiará a `Eye`. Haz clic en `Eye` para restaurar el producto.

## 7. Configuración de Desarrollo

1.  **Clonar el repositorio**: `git clone [URL_DEL_REPOSITORIO]`
2.  **Instalar dependencias**: `npm install` o `yarn install`
3.  **Configurar Supabase**: Asegúrate de tener las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` configuradas en tu archivo `.env.local`.
    **¡Importante! Configuración de `REPLICA IDENTITY FULL` en Supabase:**
    Para que la sincronización en tiempo real de eventos `DELETE` funcione correctamente y la aplicación pueda identificar los registros eliminados, es **esencial** configurar `REPLICA IDENTITY FULL` en las tablas `inventory_sessions` y `product_rules` de tu base de datos Supabase. Puedes hacerlo ejecutando los siguientes comandos SQL en el editor de consultas de Supabase:
    ```sql
    ALTER TABLE public.inventory_sessions REPLICA IDENTITY FULL;
    ALTER TABLE public.product_rules REPLICA IDENTITY FULL;
    ```
    Sin esta configuración, los eventos `DELETE` de Realtime no contendrán la información `old` necesaria para que la aplicación elimine el registro correspondiente en la base de datos local.
4.  **Ejecutar en modo desarrollo (web)**: `npm run dev` o `yarn dev`
5.  **Ejecutar Electron en desarrollo**: `npm run build:electron` (esto construirá la app y luego la ejecutará en Electron).

**Ajustes de Configuración para `tailwindcss-animate`:**
Se han realizado ajustes en la configuración para resolver problemas de resolución de módulos con `tailwindcss-animate` en el entorno de desarrollo de Vite:
*   En `tailwind.config.ts`, la importación de `tailwindcss-animate` se cambió de `require()` a `import` para compatibilidad con ES Modules.
*   En `vite.config.ts`, `tailwindcss-animate` se añadió a `optimizeDeps.include` para asegurar que Vite lo pre-bundle correctamente y evite errores de "Cannot find module".

## 8. Despliegue

La aplicación está configurada para ser desplegada como una aplicación de escritorio Electron.
*   `npm run build:electron` o `yarn build:electron` generará los ejecutables para las plataformas configuradas en `package.json` (sección `build`).
*   Para despliegue web, se puede usar `npm run build` y luego servir la carpeta `dist`.

## 9. Regresiones Técnicas y Cómo Evitarlas

### Áreas Críticas
*   **Consultas SQL en `InventoryContext.tsx`**: Cualquier cambio en `WEEKLY_INVENTORY_QUERY`, `MONTHLY_INVENTORY_QUERY` o `ALL_PRODUCTS_QUERY` puede alterar drásticamente los datos de inventario o el catálogo de productos.
    *   **Prevención**: Siempre prueba las consultas SQL directamente en una herramienta de base de datos (ej. DB Browser for SQLite) con un archivo `.db` de muestra antes de integrarlas. Asegúrate de que los nombres de las columnas (`Categoria`, `Producto`, `Stock_Actual`, `SupplierName`) coincidan con las interfaces (`InventoryItemFromDB`). Verifica que la subconsulta devuelva el proveedor correcto del último documento de compra y que solo se incluyan proveedores activos.
*   **Lógica de `InventoryContext.tsx` (Estado Global y Sincronización)**: Es el centro de la gestión de estado y la sincronización. Cambios aquí pueden tener efectos en cascada en toda la aplicación. La refactorización a `useReducer` mejora la previsibilidad, pero requiere atención.
    *   **Prevención**: Entiende completamente el flujo de datos y las dependencias antes de modificar el contexto. Asegúrate de que las acciones del `reducer` sean atómicas y que los `payloads` sean correctos. Presta especial atención a `syncFromSupabase`, `saveCurrentSession`, `saveMasterProductConfig` y sus interacciones con `isSupabaseSyncInProgress`, `lastSyncTimestampRef` y `sync_pending`.
*   **Persistencia de Sesiones y Configuraciones (`src/lib/persistence.ts`, `InventoryContext.tsx`)**: La integración de Dexie.js y el manejo de `sessionId`, `sync_pending`, `updated_at` y `isHidden` es fundamental.
    *   **Prevención**: Prueba los escenarios de guardar, cargar, iniciar nueva sesión, guardar pedidos, eliminar sesiones, crear/editar/ocultar configuraciones de producto. Asegúrate de que los datos se persistan y recuperen correctamente, que el `debounce` funcione como se espera sin perder datos, y que la eliminación de una sesión (especialmente la activa) resetea el estado de la aplicación de forma coherente. Verifica que las interfaces (`InventorySession`, `MasterProductConfig`) sean consistentes en todos los lugares donde se usan.
*   **Sincronización con Supabase (`src/lib/supabase.ts`, `InventoryContext.tsx`)**: La lógica de `syncFromSupabase` (subida de pendientes, descarga y fusión) es compleja y crítica para la integridad de los datos.
    *   **Prevención**: Realiza pruebas exhaustivas de sincronización en diferentes escenarios: con y sin conexión, con cambios locales pendientes, con cambios remotos, y con conflictos (aunque la estrategia actual es "last write wins" basada en `updated_at`). Monitorea los logs de Supabase para detectar errores.
    *   **Requisito `REPLICA IDENTITY FULL`**: Es crucial que las tablas `inventory_sessions` y `product_rules` en Supabase tengan configurado `REPLICA IDENTITY FULL`. Esto asegura que los eventos `DELETE` de Realtime incluyan los datos `old` (como `dateKey` o `productId`) en el `payload`, permitiendo que la aplicación identifique y elimine correctamente el registro local. Sin esta configuración, los eventos de borrado remoto no se reflejarán correctamente en la aplicación.
*   **`OrderGenerationModule.tsx` (Lógica de `finalOrders` y Copiado)**: La introducción de la columna "Pedir" editable y la dependencia del copiado en `finalOrderQuantity` es un área crítica.
    *   **Prevención**: Asegúrate de que `finalOrders` se inicialice correctamente con `adjustedQuantity` y que los cambios del usuario se reflejen solo en `finalOrderQuantity`. Verifica que la función `copyOrderToClipboard` siempre use `finalOrderQuantity` y que el resumen de Belbier se maneje como se espera (visible en UI, no en copiado).
*   **`SettingsPage.tsx` (Gestión de Configuraciones)**: La interfaz para editar proveedores, reglas y ocultar productos es nueva y afecta directamente el comportamiento del inventario y los pedidos.
    *   **Prevención**: Prueba la creación de nuevas reglas, la edición de valores, la eliminación de reglas, el cambio de proveedor y la funcionalidad de ocultar/restaurar productos. Verifica que los cambios se reflejen correctamente en `InventoryTable` y `OrderGenerationModule`.

### Buenas Prácticas Generales
*   **Inmutabilidad**: Al actualizar arrays u objetos en el estado de React (o Context), siempre crea nuevas copias en lugar de mutar directamente los objetos existentes (ej. `[...array]`, `{...object}`). Esto se sigue en `InventoryTable` y `InventoryContext`.
*   **Tipado Fuerte (TypeScript)**: Utiliza las interfaces (`InventoryItem`, `InventoryItemFromDB`, `OrderItem`, `InventorySession`, `MasterProductConfig`, `ProductRule`) para asegurar la consistencia de los datos y atrapar errores en tiempo de desarrollo.
*   **Modularización**: Mantén los componentes y módulos pequeños y con una única responsabilidad (ej. `FileUploader` solo carga archivos, `InventoryTable` solo muestra y edita la tabla, `SessionManager` gestiona sesiones).
*   **Comentarios Claros**: Añade comentarios donde la lógica sea compleja o no obvia.
*   **Pruebas (Futuro)**: Implementar pruebas unitarias y de integración para los componentes críticos y la lógica de negocio (ej. `processInventoryData`, `OrderGenerationModule`, `saveCurrentSession`, `loadSession`, `deleteSession`, `syncFromSupabase`, `saveMasterProductConfig`).

## 10. Posibles Mejoras Futuras

*   **Gestión de Proveedores**: Una interfaz dedicada para gestionar proveedores (añadir, editar, eliminar) y sus configuraciones.
*   **Historial de Pedidos Detallado**: Una vista dedicada para explorar los pedidos guardados en cada sesión.
*   **Exportación de Pedidos**: Exportar pedidos a otros formatos (CSV, PDF).
*   **Autenticación**: Si la aplicación crece y necesita acceso a recursos protegidos (más allá de la clave anónima de Supabase).
*   **Optimización de Consultas**: Para bases de datos muy grandes, optimizar las consultas SQL o considerar un ORM.
*   **Temas (Dark Mode)**: Implementar un modo oscuro completo.

Esta documentación debería servir como una guía sólida para entender, mantener y expandir la aplicación Chin Chin.