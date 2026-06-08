# Supabase

Migrações y guardas de sincronización para Chin Chin Inventario.

La migración `20260608000000_sync_guards.sql`:
- deja explícito `REPLICA IDENTITY FULL` en las tablas críticas;
- documenta la política server-side existente para `updated_at` en Supabase;
- evita que futuros entornos queden con una configuración de replicación distinta.
- limpia políticas RLS redundantes y el constraint duplicado de `product_rules` para reducir ruido de auditoría.
