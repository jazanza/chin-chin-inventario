# 🚀 AGENTE DE INGENIERÍA: CHIN CHIN INVENTARIO V1.1 (V2026)
> Propósito: Gestión de inventarios de alta precisión. Estética Industrial (Vercel/Linear), rendimiento optimizado para hardware legacy y sincronización robusta.

---

## 1. IDENTIDAD OPERATIVA (UI/UX)
* **Familia de Diseño**: Operaciones & Core (Industrial / Clean).
* **Tema UI**: Estética inspirada en Vercel/Linear. Usa estrictamente la paleta Zinc/Slate de Shadcn UI (`background: #ffffff` o modo oscuro estándar).
* **Tipografía**: Fuentes nativas de sistema (`ui-sans-serif`, `system-ui`).
* **Directriz Principal**: Prioridad absoluta a la **densidad de datos** en tablas y formularios.
* **Restricción Estricta**: PROHIBIDO el uso de estilos Brutalistas, colores de acento neón o decoraciones innecesarias. Este proyecto debe verse corporativo, utilitario y rápido.

---

## 2. CONTEXTO TÉCNICO Y REGLAS DE NEGOCIO (PREVENCIÓN DE REGRESIONES)
> **¡ADVERTENCIA CRÍTICA!** Has entrado a un entorno con arquitectura de sincronización "Hybrid Edge" (sql.js + Dexie + Supabase). No rompas este delicado ecosistema:

* **Arquitectura de Sincronización y Conflictos**: La persistencia usa un enfoque "El último en llegar gana" basado en el timestamp `updated_at`. El servidor (Supabase) gestiona los timestamps mediante Triggers (`moddatetime`). NUNCA manipules o sobrescribas el `updated_at` manualmente en payloads de cliente.
* **Manejo de Eliminaciones (Supabase)**: Supabase requiere `REPLICA IDENTITY FULL` en tablas críticas (`product_rules`, `inventory_sessions`) para que los eventos de `DELETE` locales se sincronicen correctamente.
* **Web Workers & Performance**: Procesamiento pesado de archivos `.db` (Aronium) mediante `sql.js` DEBE ocurrir de forma optimizada. Para listas mayores a 50 ítems, asume que estás corriendo en una MacBook 2017: usa técnicas de virtualización si tocas componentes de tablas para evitar lag.
* **Reglas de Pedido (Aronium)**: El acceso a Aronium debe considerarse como **control de stock global**. Al trabajar con reglas de pedido, respeta estrictamente la interfaz existente (`{ minStock: number, orderAmount: number }[]`) almacenada como JSONB. No modifiques esta estructura.
* **Entorno Electrón vs Web**: Funcionalidades nativas (como lectura directa del FileSystem en lugar de usar inputs HTML) deben estar envueltas en condicionales chequeando la disponibilidad de `window.electronAPI` (o equivalente definido en `src/electron.d.ts`).

---

## 3. LIBRERÍA DE SKILLS (MODOS DE ACTIVACIÓN)
- **/sdd [objetivo]**: Inicia el **Software Design Document**. Define el cambio, esquemas de datos y criterios de aceptación. **Pausa obligatoria** antes de escribir código.
- **/bug**: [MODO DETECTIVE] Escaneo exhaustivo. Para bugs de UI, revisa virtualización. Para bugs de datos, revisa el flag `sync_pending`, el estado del `syncLockRef` y el `updated_at` en Dexie.
- **/view**: [AUDITOR DE UI] Simula la renderización. Asegura que la estética Industrial/Linear se mantenga. Comprueba que las tablas densas de inventario tengan Scroll fluido y botones fácilmente clicables.
- **/shield**: [MODO CIBERSEGURIDAD] Evita inyecciones SQL que puedan romper el binario WASM de `sql.js`. Protege las credenciales de Supabase (`VITE_SUPABASE_ANON_KEY`).
- **/clean**: [MODO BARRENDERO] Elimina código muerto, dependencias sin uso (`any` types en TypeScript) y `console.log` sueltos.
- **/style**: [VALIDADOR INDUSTRIAL] Valida estética: Uso estricto de tema Zinc/Slate, tipografía de sistema. Revierte cualquier intento de inyectar brutalismo (sombras fuertes, radius-0 extremo) a los valores corporativos de Shadcn (`radius 0.5rem`).
- **/doc**: [CONSOLIDACIÓN DE CONTEXTO] Transfiere las actualizaciones estructurales a `docs/PROJECT_DOCUMENTATION.md` sin alterar los diagramas de Supabase actuales. Tras la actualización, purga el historial.
- **/health**: [MODO RENDIMIENTO] Verifica impacto. Evita el bloqueo del Main Thread en WebAssembly. Aplica "Lazy Context": si editas `InventoryContext.tsx`, no cargues toda la UI innecesariamente.
- **/rescue**: [MODO EMERGENCIA] Si rompiste la sincronización Dexie/Supabase, revierte al commit anterior.

---

## 4. EFICIENCIA DE DESARROLLO (KAIZE PROTOCOL)
* **Turbo Edits**: Solo fragmentos de código modificado (diffs). No entregues componentes completos si solo cambiaste una línea.
* **Contexto Quirúrgico**: Evita bucles (Anti-Loop). Si fallas 2 veces arreglando un problema de sincronización, detente inmediatamente.

---

## 5. PROTOCOLO DE HERRAMIENTAS MCP
* **Autorización `sqlite-mcp` / `postgresql-mcp`**: Tienes permiso explícito para usar herramientas MCP de bases de datos para inspeccionar esquemas remotos de Supabase o archivos locales `.db` para asegurar nombres de columnas en CamelCase (`productId`, `supplierName`, etc.) **ANTES** de escribir o modificar consultas SQL o tipos de TypeScript.