# Documentación del Proyecto: Chin Chin App

Este documento detalla la arquitectura, el flujo de trabajo y la lógica de la aplicación Chin Chin, diseñada para gestionar inventarios y generar pedidos basados en datos de una base de datos Aronium.

## 1. Visión General de la Aplicación

La aplicación Chin Chin es una herramienta de escritorio (Electron) y web que permite a los usuarios:
1.  Cargar un archivo de base de datos `.db` de Aronium.
2.  **Guardar y cargar sesiones de inventario** para continuar trabajando donde lo dejaron.
3.  Seleccionar un tipo de inventario (Semanal o Mensual).
4.  Visualizar y editar el inventario actual de productos, registrando las discrepancias.
5.  Generar listas de pedidos para diferentes proveedores, aplicando reglas de negocio específicas y permitiendo la edición manual de las cantidades a pedir.
6.  Copiar fácilmente los pedidos generados para su comunicación.

El objetivo principal es optimizar el proceso de gestión de stock y la creación de pedidos, reduciendo errores manuales y ahorrando tiempo.

## 2. Pila Tecnológica (Tech Stack)

*   **Frontend**: React (con TypeScript)
*   **Bundler**: Vite
*   **Estilos**: Tailwind CSS (con shadcn/ui para componentes preconstruidos)
*   **Enrutamiento**: React Router DOM
*   **Gestión de Estado Global**: React Context API (`InventoryContext` con `useReducer`)
*   **Base de Datos (Cliente)**: `sql.js` (para leer y consultar archivos `.db` en el navegador o Electron)
*   **Persistencia de Sesiones**: `Dexie.js` (IndexedDB Wrapper)
*   **Utilidades de Fecha**: `date-fns`
*   **Utilidades de Rendimiento**: `lodash.debounce`
*   **Notificaciones**: `sonner` (para toasts)
*   **Entorno de Escritorio**: Electron (para la funcionalidad de carga de archivos nativa)

## 3. Flujo General de la Aplicación

1.  **Inicio**: La aplicación redirige automáticamente a `/inventario`.
2.  **Gestión de Sesiones**:
    *   Al iniciar, si existen sesiones guardadas, se muestra el `SessionManager` para que el usuario elija cargar una sesión existente o iniciar una nueva.
    *   Si no hay sesiones guardadas, se muestra directamente el `FileUploader`.
3.  **Carga de Archivo DB**:
    *   El usuario selecciona un archivo `.db` (ya sea a través del diálogo nativo de Electron o un input de archivo web).
    *   El contenido del archivo (como `Uint8Array`) se guarda en el `InventoryContext`.
4.  **Selección de Tipo de Inventario**:
    *   Una vez cargado el archivo DB, se muestra el `InventoryTypeSelector`.
    *   El usuario elige entre "Inventario Semanal" o "Inventario Mensual".
    *   Esta selección se guarda en el `InventoryContext` y dispara el procesamiento de los datos, **creando y guardando automáticamente una nueva sesión** en IndexedDB.
5.  **Visualización y Edición del Inventario**:
    *   Los datos procesados se muestran en el `InventoryTable`.
    *   El usuario puede ajustar manualmente la "Cantidad Real" de cada producto utilizando un input con botones de incremento/decremento.
    *   **Persistencia Automática**: Cada cambio en la cantidad física se guarda automáticamente en la sesión actual de IndexedDB (con un `debounce` para optimizar el rendimiento).
    *   La tabla muestra discrepancias entre la cantidad del sistema (Aronium) y la cantidad física.
    *   Se muestra un resumen de la efectividad del inventario.
6.  **Generación de Pedidos**:
    *   En la página `/pedidos`, el `OrderGenerationModule` utiliza los datos de inventario (incluyendo las cantidades físicas editadas) para calcular los pedidos.
    *   Los pedidos se agrupan por proveedor.
    *   El usuario puede seleccionar un proveedor para ver su pedido detallado.
    *   Se muestran todos los productos activos del proveedor, incluso si la cantidad sugerida es 0.
    *   La columna "Sugerencia" muestra la cantidad calculada, y la columna "Pedir" permite al usuario ajustar manualmente esta cantidad con inputs y botones.
    *   Se aplica una lógica especial para el proveedor "Belbier" para mostrar el resumen de cajas.
    *   El usuario puede copiar el pedido al portapapeles, utilizando las cantidades de la columna "Pedir".
    *   **Persistencia de Pedidos**: Al copiar un pedido, los pedidos finales (`finalOrders`) también se guardan en la sesión actual de IndexedDB.

## 4. Componentes Clave y su Lógica

### `src/main.tsx`
*   Punto de entrada de la aplicación. Renderiza el componente `App`.
*   Importa `globals.css` para los estilos globales de Tailwind.

### `src/App.tsx`
*   Configura el `QueryClientProvider` para `react-query` (aunque no se usa activamente en la lógica actual, está preparado).
*   Configura `TooltipProvider`, `Toaster` (para `shadcn/ui/toast`) y `Sonner` (para `sonner` toasts).
*   Define el enrutamiento principal con `React Router DOM`:
    *   Ruta raíz (`/`) redirige a `/inventario`.
    *   Ruta `/inventario` renderiza `InventoryDashboard`.
    *   Ruta `/pedidos` renderiza `OrdersPage`.
    *   Ruta `*` (catch-all) renderiza `NotFound`.
*   Envuelve las rutas con `InventoryProvider` para que el estado global del inventario esté disponible en toda la aplicación.
*   Utiliza el componente `Layout` para la estructura de navegación y el encabezado.

### `src/components/Layout.tsx`
*   Define la estructura general de la interfaz de usuario, incluyendo el encabezado (`header`) y el área de contenido principal (`main`).
*   Incluye `MobileSidebar` para la navegación en dispositivos móviles.
*   Muestra enlaces de navegación (`NavLink`) para "Inventario" y "Pedidos".
*   Renderiza el contenido de la ruta actual a través de `<Outlet />`.
*   Incluye el componente `MadeWithDyad` en el pie de página.

### `src/pages/Index.tsx`
*   Un componente simple que redirige (`<Navigate>`) al usuario a la ruta `/inventario` al cargar la aplicación.

### `src/pages/InventoryDashboard.tsx`
*   **Estado Local**: Utiliza `useInventoryContext` para acceder y modificar el estado global.
*   **Flujo Condicional Mejorado**:
    *   Al inicio, verifica si hay sesiones guardadas (`hasSessionHistory`).
    *   Si hay historial y no se ha forzado la carga de un nuevo archivo (`showFileUploader` es `false`), muestra `SessionManager`.
    *   Si no hay historial o se ha elegido iniciar una nueva sesión, muestra `FileUploader`.
    *   Una vez cargado el `dbBuffer`, si `inventoryType` no está seleccionado, muestra `InventoryTypeSelector`.
    *   Finalmente, si `dbBuffer` y `inventoryType` están presentes, muestra `InventoryTable`.
*   **Manejo de Eventos**:
    *   `handleFileLoaded`: Actualiza `dbBuffer` en el contexto y resetea `inventoryType`.
    *   `handleInventoryTypeSelect`: Actualiza `inventoryType` en el contexto, lo que dispara el `processInventoryData` y el guardado de la nueva sesión.
    *   `handleInventoryChange`: Actualiza `inventoryData` en el contexto.
    *   `handleStartNewSession`: Resetea el estado del inventario y fuerza la visualización del `FileUploader` para una nueva carga.

### `src/pages/OrdersPage.tsx`
*   Obtiene `inventoryData`, `loading` y `error` del `useInventoryContext`.
*   Muestra mensajes de carga o error según el estado del contexto.
*   Si no hay datos de inventario, instruye al usuario a cargar un archivo.
*   Si hay datos, renderiza `OrderGenerationModule` pasándole `inventoryData`.

### `src/components/FileUploader.tsx`
*   Permite al usuario seleccionar un archivo `.db`.
*   **Lógica Condicional (Electron vs. Web)**:
    *   Detecta si `window.electronAPI` está disponible (indicando que la app corre en Electron).
    *   Si es Electron, usa `electronAPI.openDbFile()` para abrir un diálogo de archivo nativo.
    *   Si es web, usa un `input type="file"` estándar.
*   Lee el archivo como `ArrayBuffer` y lo convierte a `Uint8Array` antes de pasarlo a `onFileLoaded`.
*   Muestra un estado de carga (`loading`).

### `src/components/InventoryTypeSelector.tsx`
*   Presenta dos botones para que el usuario elija entre "Inventario Semanal" y "Inventario Mensual".
*   Llama a la función `onSelect` con el tipo elegido.
*   Deshabilita los botones durante el estado de carga.

### `src/components/InventoryTable.tsx`
*   Muestra los productos del inventario en una tabla interactiva.
*   **Estado Local**: `editableInventory` para gestionar los cambios en la cantidad física.
*   **Sincronización**: `useEffect` para actualizar `editableInventory` cuando `inventoryData` del contexto cambia.
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
    *   Itera sobre `inventoryData`.
    *   Para cada producto, busca una regla de pedido en `productOrderRules`.
    *   Calcula `quantityToOrder` (cantidad bruta a pedir) y `adjustedQuantity` (cantidad ajustada según el `multiple` del producto, redondeando hacia arriba a la caja completa más cercana).
    *   **Importante**: Ahora incluye *todos* los productos activos del proveedor, incluso si `adjustedQuantity` es 0.
    *   Agrupa los pedidos por `supplier`.
    *   Ordena los productos alfabéticamente dentro de cada proveedor.
*   **Sincronización `finalOrders`**: `useEffect` para inicializar `finalOrders` con los `adjustedQuantity` calculados cuando `ordersBySupplier` cambia.
*   **Edición de Cantidad Final (`handleFinalOrderQuantityChange`)**: Permite al usuario modificar la `finalOrderQuantity` de cada producto con un input y botones `+`/`-`. Al cambiar, también se llama a `saveCurrentSession` para guardar los pedidos en la sesión.
*   **Resumen Especial para "Belbier" (`useMemo`)**:
    *   Si `selectedSupplier` es "Belbier", calcula el `totalFinalOrderQuantity` (usando las cantidades editadas), `totalBoxes` y `missingUnits`.
    *   Este resumen se muestra en la UI, pero **no se incluye en el texto copiado**.
*   **Selección de Proveedor**: Botones para cada proveedor con pedidos generados.
*   **Detalle del Pedido**:
    *   Muestra una tabla con el `product`, `adjustedQuantity` (columna "Sugerencia" centrada) y `finalOrderQuantity` (columna "Pedir" editable) para el `selectedSupplier`.
    *   Botón "Copiar Pedido" que genera un texto formateado y lo copia al portapapeles, utilizando las `finalOrderQuantity` editadas.
*   **Guardado de Pedidos**: Al copiar el pedido, se llama a `saveCurrentSession` para guardar el estado actual de los pedidos en la sesión de IndexedDB.
*   **Toasts**: Utiliza `showSuccess` y `showError` de `src/utils/toast.ts` para feedback al usuario.

### `src/components/SessionManager.tsx` (Nuevo)
*   Muestra una lista de sesiones de inventario guardadas en IndexedDB.
*   Obtiene el historial de sesiones usando `getSessionHistory` del `InventoryContext`.
*   Permite al usuario cargar una sesión existente (`loadSession`) o iniciar una nueva (`onStartNewSession`).
*   Muestra la fecha, tipo de inventario y porcentaje de efectividad de cada sesión.

### `src/context/InventoryContext.tsx`
*   **Context API con `useReducer`**: Proporciona un estado global para `dbBuffer`, `inventoryType`, `inventoryData`, `loading`, `error` y `sessionId`.
*   **Estado Global**:
    *   `dbBuffer`: `Uint8Array` del archivo DB cargado.
    *   `inventoryType`: "weekly" o "monthly".
    *   `inventoryData`: Array de `InventoryItem` procesados.
    *   `loading`: Booleano para indicar si se están procesando datos.
    *   `error`: String para mensajes de error.
    *   `sessionId`: `dateKey` de la sesión actualmente cargada.
*   **Funciones de Actualización**: `setDbBuffer`, `setInventoryType`, `setInventoryData`, `resetInventoryState`.
*   **`processInventoryData` (`useCallback`)**:
    *   Función asíncrona que toma el `buffer` y el `type` de inventario.
    *   Inicializa `sql.js`, carga la base de datos, ejecuta consultas SQL (con lógica de último proveedor y filtro de activo), combina con `product-data.json`.
    *   **Guardado de Nueva Sesión**: Al finalizar el procesamiento, guarda automáticamente los datos como una nueva sesión en IndexedDB y establece `sessionId`.
    *   Actualiza `inventoryData`, `loading` y `error` en el estado global.
*   **`saveCurrentSession` (`useCallback`)**:
    *   Guarda el estado actual de `inventoryData`, `inventoryType`, `timestamp`, `effectiveness` y opcionalmente `ordersBySupplier` en IndexedDB.
    *   Utiliza `db.sessions.put()` para insertar o actualizar la sesión por `dateKey`.
*   **`loadSession` (`useCallback`)**:
    *   Carga una sesión específica de IndexedDB por `dateKey`.
    *   Actualiza el estado del contexto (`inventoryType`, `inventoryData`, `sessionId`) con los datos de la sesión cargada.
*   **`getSessionHistory` (`useCallback`)**:
    *   Recupera todas las sesiones guardadas de IndexedDB, ordenadas por `timestamp` descendente.
*   **`useEffect`**: Dispara `processInventoryData` cuando `dbBuffer` o `inventoryType` cambian, pero solo si no hay una `sessionId` activa (para evitar reprocesar si se cargó una sesión).
*   **`useInventoryContext`**: Hook personalizado para consumir el contexto.

### `src/lib/db.ts`
*   **`initDb()`**: Inicializa la librería `sql.js` cargando el módulo WASM.
*   **`loadDb(buffer)`**: Crea una instancia de `SQL.Database` a partir de un `ArrayBuffer` o `Uint8Array`.
*   **`queryData(db, query)`**: Ejecuta una consulta SQL en la base de datos y devuelve los resultados como un array de objetos.

### `src/lib/persistence.ts` (Nuevo)
*   Define la interfaz `InventorySession` que incluye `dateKey`, `inventoryType`, `inventoryData`, `timestamp`, `effectiveness` y `ordersBySupplier`.
*   Define la clase `SessionDatabase` que extiende `Dexie` para configurar la base de datos IndexedDB y la tabla `sessions`.
*   Exporta una instancia de `SessionDatabase` (`db`) para su uso en toda la aplicación.

### `src/lib/order-rules.ts`
*   Define un `Map` (`productOrderRules`) que asocia nombres de productos con funciones (`OrderRule`) para calcular las cantidades a pedir.

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

1.  **Inicio App**: `InventoryDashboard` verifica `getSessionHistory`.
2.  **Sin Historial**: `InventoryDashboard` muestra `FileUploader`.
3.  **Con Historial**: `InventoryDashboard` muestra `SessionManager`.
    *   Usuario selecciona "Cargar Sesión": `SessionManager` llama `loadSession` (en `InventoryContext`) -> `db.sessions.get()` -> `InventoryContext` actualiza estado (`inventoryType`, `inventoryData`, `sessionId`).
    *   Usuario selecciona "Nueva Sesión": `SessionManager` llama `onStartNewSession` (en `InventoryDashboard`) -> `resetInventoryState`, `setDbBuffer(null)`, `setInventoryType(null)` -> `InventoryDashboard` muestra `FileUploader`.
4.  **Carga de Archivo**: `FileUploader` -> `setDbBuffer` (en `InventoryContext`).
5.  **Selección de Tipo**: `InventoryTypeSelector` -> `setInventoryType` (en `InventoryContext`).
6.  **Procesamiento DB**: `InventoryContext` (`useEffect` dispara `processInventoryData`) -> `sql.js` lee `dbBuffer` -> ejecuta consultas SQL -> combina con `product-data.json` -> `InventoryContext` actualiza estado (`inventoryData`, `loading`, `error`, `inventoryType`) -> **`saveCurrentSession` guarda la nueva sesión en IndexedDB** -> `InventoryContext` establece `sessionId`.
7.  **Edición de Inventario**: `InventoryTable` lee `inventoryData` (del `InventoryContext`) -> usuario edita `physicalQuantity` -> `updateInventoryItem` llama `onInventoryChange` (en `InventoryDashboard`) -> `setInventoryData` (en `InventoryContext`) -> **`debouncedSave` llama `saveCurrentSession` para actualizar la sesión en IndexedDB**.
8.  **Generación de Pedidos**: `OrdersPage` -> `OrderGenerationModule` lee `inventoryData` (del `InventoryContext`) -> aplica `productOrderRules` -> calcula `adjustedQuantity` -> permite edición manual de `finalOrderQuantity`.
9.  **Copia de Pedido**: `OrderGenerationModule` -> `copyOrderToClipboard` -> **llama `saveCurrentSession` para guardar `finalOrders` en la sesión de IndexedDB**.

## 6. Cómo Añadir Nuevos Productos o Reglas de Pedido

### Añadir un Nuevo Producto
1.  **`src/data/product-data.json`**:
    *   Abre este archivo.
    *   Añade un nuevo objeto JSON al array con la siguiente estructura:
        ```json
        {
          "productId": [ID_ÚNICO],
          "productName": "[NOMBRE_EXACTO_DEL_PRODUCTO_EN_ARONIUML]",
          "category": "[CATEGORÍA]",
          "supplier": "[ESTE_CAMPO_YA_NO_ES_LA_FUENTE_PRINCIPAL_DEL_PROVEEDOR]",
          "averageSales": [VENTAS_PROMEDIO_NUMÉRICO],
          "multiple": [UNIDADES_POR_CAJA_O_MÚLTIPLO_DE_PEDIDO]
        }
        ```
    *   Asegúrate de que `productName` coincida *exactamente* con el nombre del producto en la base de datos de Aronium para que el mapeo funcione correctamente.
    *   `multiple` es crucial para el cálculo de pedidos por cajas. Si se pide por unidad, usa `1`.
    *   **Nota**: El campo `supplier` en este archivo ya no es la fuente principal para determinar el proveedor en la aplicación. Ahora se extrae dinámicamente de la base de datos Aronium basándose en el último documento de compra y se aplican reglas de remapeo específicas.

### Añadir o Modificar una Regla de Pedido
1.  **`src/lib/order-rules.ts`**:
    *   Abre este archivo.
    *   Localiza el `Map` `productOrderRules`.
    *   Para añadir una nueva regla, usa:
        ```typescript
        productOrderRules.set("[NOMBRE_EXACTO_DEL_PRODUCTO]", (physicalQuantity) => {
          // Lógica para calcular la cantidad a pedir
          // Ejemplo: si la cantidad física es <= 5, pedir 12 unidades.
          if (physicalQuantity <= 5) {
            return 12;
          }
          return 0; // No pedir nada si no cumple la condición
        });
        ```
    *   Asegúrate de que el `[NOMBRE_EXACTO_DEL_PRODUCTO]` coincida con el `productName` en `product-data.json` y en la base de datos de Aronium.
    *   La función de la regla debe devolver la cantidad *bruta* a pedir. El `OrderGenerationModule` se encargará de ajustarla al `multiple` si es necesario y de permitir la edición manual.

## 7. Configuración de Desarrollo

1.  **Clonar el repositorio**: `git clone [URL_DEL_REPOSITORIO]`
2.  **Instalar dependencias**: `npm install` o `yarn install`
3.  **Ejecutar en modo desarrollo (web)**: `npm run dev` o `yarn dev`
4.  **Ejecutar Electron en desarrollo**: `npm run build:electron` (esto construirá la app y luego la ejecutará en Electron).

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
*   **Consultas SQL en `InventoryContext.tsx`**: Cualquier cambio en `WEEKLY_INVENTORY_QUERY` o `MONTHLY_INVENTORY_QUERY` puede alterar drásticamente los datos de inventario. La nueva lógica de subconsulta para el proveedor (incluyendo el filtro `IsEnabled`) es crítica.
    *   **Prevención**: Siempre prueba las consultas SQL directamente en una herramienta de base de datos (ej. DB Browser for SQLite) con un archivo `.db` de muestra antes de integrarlas. Asegúrate de que los nombres de las columnas (`Categoria`, `Producto`, `Stock_Actual`, `SupplierName`) coincidan con las interfaces (`InventoryItemFromDB`). Verifica que la subconsulta devuelva el proveedor correcto del último documento de compra y que solo se incluyan proveedores activos.
*   **Mapeo de `productData.json`**: Si los `productName` en `product-data.json` no coinciden con los nombres de los productos de la DB, los datos enriquecidos (ventas promedio, múltiplos) no se aplicarán correctamente.
    *   **Prevención**: Mantén `productData.json` actualizado y verifica los nombres de los productos. Considera añadir un log de advertencia si un producto de la DB no encuentra un match en `productData.json`.
*   **Lógica de `order-rules.ts`**: Las reglas de pedido son el corazón de la generación de pedidos. Errores aquí resultarán en pedidos incorrectos.
    *   **Prevención**: Prueba exhaustivamente cada nueva regla o modificación con diferentes `physicalQuantity` para asegurar que el `quantityToOrder` sea el esperado.
*   **`InventoryContext.tsx`**: Es el centro de la gestión de estado. Cambios aquí pueden tener efectos en cascada en toda la aplicación. La refactorización a `useReducer` mejora la previsibilidad, pero requiere atención.
    *   **Prevención**: Entiende completamente el flujo de datos y las dependencias antes de modificar el contexto. Asegúrate de que las acciones del `reducer` sean atómicas y que los `payloads` sean correctos.
*   **`OrderGenerationModule.tsx` (Lógica de `finalOrders` y Copiado)**: La introducción de la columna "Pedir" editable y la dependencia del copiado en `finalOrderQuantity` es un área crítica.
    *   **Prevención**: Asegúrate de que `finalOrders` se inicialice correctamente con `adjustedQuantity` y que los cambios del usuario se reflejen solo en `finalOrderQuantity`. Verifica que la función `copyOrderToClipboard` siempre use `finalOrderQuantity` y que el resumen de Belbier se maneje como se espera (visible en UI, no en copiado).
*   **Persistencia de Sesiones (`src/lib/persistence.ts`, `InventoryContext.tsx`, `InventoryTable.tsx`, `OrderGenerationModule.tsx`)**: La integración de Dexie.js y el manejo de `sessionId` es fundamental.
    *   **Prevención**: Prueba los escenarios de guardar, cargar, iniciar nueva sesión, y guardar pedidos. Asegúrate de que los datos se persistan y recuperen correctamente, y que el `debounce` funcione como se espera sin perder datos. Verifica que la interfaz `InventorySession` sea consistente en todos los lugares donde se usa.

### Buenas Prácticas Generales
*   **Inmutabilidad**: Al actualizar arrays u objetos en el estado de React (o Context), siempre crea nuevas copias en lugar de mutar directamente los objetos existentes (ej. `[...array]`, `{...object}`). Esto se sigue en `InventoryTable` y `InventoryContext`.
*   **Tipado Fuerte (TypeScript)**: Utiliza las interfaces (`InventoryItem`, `InventoryItemFromDB`, `OrderItem`, `InventorySession`) para asegurar la consistencia de los datos y atrapar errores en tiempo de desarrollo.
*   **Modularización**: Mantén los componentes y módulos pequeños y con una única responsabilidad (ej. `FileUploader` solo carga archivos, `InventoryTable` solo muestra y edita la tabla, `SessionManager` gestiona sesiones).
*   **Comentarios Claros**: Añade comentarios donde la lógica sea compleja o no obvia.
*   **Pruebas (Futuro)**: Implementar pruebas unitarias y de integración para los componentes críticos y la lógica de negocio (ej. `order-rules.ts`, `processInventoryData`, `OrderGenerationModule`, `saveCurrentSession`, `loadSession`).

## 10. Posibles Mejoras Futuras

*   **Gestión de Proveedores**: Una interfaz para gestionar proveedores y sus reglas de pedido directamente en la UI, en lugar de en `product-data.json` y `order-rules.ts`.
*   **Historial de Pedidos Detallado**: Una vista dedicada para explorar los pedidos guardados en cada sesión.
*   **Exportación de Pedidos**: Exportar pedidos a otros formatos (CSV, PDF).
*   **Autenticación**: Si la aplicación crece y necesita acceso a recursos protegidos.
*   **Optimización de Consultas**: Para bases de datos muy grandes, optimizar las consultas SQL o considerar un ORM.
*   **Temas (Dark Mode)**: Implementar un modo oscuro completo.

Esta documentación debería servir como una guía sólida para entender, mantener y expandir la aplicación Chin Chin.