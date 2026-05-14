# 🤖 CONFIGURACIÓN DE AGENTE: CHIN CHIN INVENTARIOS (V2026)
> Propósito: Gestión de inventarios de alta precisión. Estética Industrial (Vercel/Linear), rendimiento optimizado para MacBook 2017 y sincronización robusta.

---

## 1. STACK TECNOLÓGICO Y ARQUITECTURA
* **Frontend**: React 18 + TypeScript + Vite 6 + Electron.
* **UI/UX**: Estética "Industrial/Clean" (Vercel/Linear). Prioridad a **shadcn/ui** para tablas densas y formularios.
* **Data Engine**: 
    * **Lectura**: `sql.js` (SQLite Aronium) via **Web Workers** obligatorios (No bloquear UI).
    * **Persistencia Local**: `Dexie.js` con flags de `sync_pending: boolean`.
    * **Cloud**: Supabase (CamelCase en tablas: `product_rules`, `inventory_sessions`).

---

## 2. REGLAS DE ORO DE INGENIERÍA (SKILLS)

### ⚡ Performance MacBook 2017 (Anti-Lag Skill)
* **Web Workers**: Todo procesamiento de archivos `.db` pesados DEBE ocurrir fuera del hilo principal.
* **Virtualización**: Si una tabla de inventario supera los 50 elementos, utiliza técnicas de renderizado eficiente para evitar lag en el scroll.
* **Lazy Context**: No leas toda la base de código. Si vas a trabajar en `InventoryContext.tsx`, no abras innecesariamente los componentes de la UI.

### 🔄 Sincronización y Conflictos (Data Skill)
* **Estrategia**: "El último en llegar gana" basado en `updated_at`.
* **Manual Save**: No implementes auto-guardado en cada tecla. Implementa un botón de **"Guardar Cambios"** centralizado para disparar la sincronización a Supabase.
* **CamelCase Stricto**: Respeta exactamente el esquema de Supabase (`productId`, `supplierName`, `dateKey`, etc.) para evitar errores de cast en TypeScript.

### 🛡️ Reglas de Negocio Estrictas
* **Reglas de Pedido**: Usa siempre la interfaz `{ minStock: number, orderAmount: number }[]`. No inventes campos nuevos en el JSONB de `rules`.
* **Entorno Electron vs Web**: Usa condicionales para mostrar "Exportar a Excel" o diálogos de archivos nativos solo cuando `window.electron` esté disponible.

---

## 3. PROTOCOLO DE DESARROLLO (VIBE-CODING)

### 🛑 Prevención de Bucles (Anti-Loop)
1.  **Diagnóstico Primero**: Ante un error de SQL o Sincronización, analiza la causa raíz antes de cambiar el código.
2.  **Límite de Fallos**: Si no resuelves un bug tras 2 intentos, DETENTE. Resume qué falló y espera instrucciones de José.
3.  **No Junk Code**: Limpia `console.log` y tipos `any` antes de entregar.

### 📝 Auto-Documentación Técnica
* Actualiza automáticamente `README.md` si cambias la lógica de sincronización o el flujo de carga de Aronium.
* Documenta en `TECHNICAL_AUDIT.md` cualquier cambio en el esquema de Dexie.js para evitar corrupción de datos locales.

---

## 4. ESTÁNDARES DE UI/UX (ESTILO INDUSTRIAL)
* **Layout**: Tablas limpias, tipografía Geist o Inter, espaciado preciso.
* **Feedback**: Usa **Sonner** para confirmar guardados exitosos y errores de carga de DB.
* **Fricción Cero**: Entrega componentes listos para usar e impórtalos directamente en las páginas de `src/pages/`.