# Documentación Técnica: Chin Chin App

## 1. Arquitectura General

La aplicación Chin Chin opera bajo un modelo de **Arquitectura de Espejo**. Cada cliente mantiene una copia completa y funcional de los datos necesarios en su base de datos local (IndexedDB vía Dexie), la cual se sincroniza de forma asíncrona con una base de datos maestra en la nube (Supabase).

### Flujo de Datos de Inventario
1.  **Extracción:** Se carga el archivo `.db` de Aronium. `sql.js` ejecuta consultas para obtener el stock actual y el último proveedor registrado para cada producto.
2.  **Enriquecimiento:** Los datos crudos de la DB se cruzan con el `MasterProductConfig` local para aplicar reglas de pedido y nombres de proveedores personalizados.
3.  **Sesión:** Se crea una `InventorySession`. Esta sesión captura el estado del inventario en un momento dado.
4.  **Persistencia:** La sesión se guarda en Dexie y se dispara el proceso de sincronización hacia Supabase.

## 2. Lógica de Sincronización y Realtime

### El Flag `sync_pending`
Cada registro en Dexie tiene un booleano `sync_pending`. 
- Al editar un dato localmente, se pone en `true`.
- El proceso de sincronización busca registros en `true`, los envía a Supabase mediante un `upsert` y, tras recibir la confirmación del servidor, los vuelve a poner en `false`.

### Manejo de Conflictos
Se utiliza un enfoque de "el último gana" basado en el timestamp `updated_at`. Durante la sincronización inicial (`syncFromSupabase`), la aplicación compara los registros locales con los remotos y actualiza Dexie solo si el registro de la nube es más reciente.

### Supabase Realtime
La aplicación se suscribe a los canales de cambios en las tablas `product_rules` e `inventory_sessions`. Cuando otro usuario realiza un cambio, el cliente recibe el evento y actualiza su base de datos local automáticamente, manteniendo la UI sincronizada en todos los dispositivos.

## 3. Componentes y Módulos Críticos

### `InventoryContext.tsx`
Es el núcleo de la aplicación. Implementa un `useReducer` para gestionar un estado complejo que incluye:
- El buffer de la base de datos cargada.
- El catálogo maestro de productos.
- El estado de la conexión y sincronización.
- La lógica para procesar archivos SQL y transformarlos en objetos de inventario.

### `OrderGenerationModule.tsx`
Este módulo no solo muestra datos, sino que aplica la lógica de negocio:
- **Reglas de Stock:** Itera sobre las reglas de cada producto (ej. "Si stock < 10, pedir 24").
- **Agrupación:** Organiza los productos por proveedor para facilitar la comunicación de pedidos.
- **Edición Final:** Permite al usuario ajustar las cantidades sugeridas antes de guardar el pedido definitivo en la sesión.

### `SettingsPage.tsx`
Permite la gestión del "Catálogo Maestro". Aquí es donde se definen los proveedores reales y las reglas de stock que alimentan al resto de la aplicación. También incluye herramientas de mantenimiento para forzar sincronizaciones o limpiar datos locales.

## 4. Convenciones de Nombres (Importante)

Debido a la integración con Supabase y PostgREST, es crítico mantener la consistencia en los nombres de las columnas. La aplicación utiliza **camelCase** para las propiedades de los objetos y las columnas de la base de datos:

- `productId` (ID único de Aronium)
- `productName` (Nombre para mostrar)
- `supplierName` (Nombre del proveedor en la nube)
- `isHidden` (Estado de visibilidad)

Cualquier discrepancia en estos nombres resultará en errores 400 (Bad Request) por parte de la API de Supabase.

## 5. Requisitos de Implementación en Supabase

Para que la aplicación funcione correctamente, las tablas en Supabase deben tener habilitado:
1.  **Realtime:** Para la actualización instantánea entre dispositivos.
2.  **Replica Identity Full:** Necesario para que los eventos de eliminación (`DELETE`) incluyan los datos antiguos y el cliente sepa qué registro borrar localmente.
3.  **Triggers de `updated_at`:** Para asegurar que el servidor gestione los timestamps de forma centralizada.