create extension if not exists moddatetime with schema extensions;

alter table public.inventory_sessions replica identity full;
alter table public.product_rules replica identity full;
