create extension if not exists moddatetime with schema extensions;

alter table public.inventory_sessions replica identity full;
alter table public.product_rules replica identity full;

drop policy if exists "Full Access Anon" on public.inventory_sessions;
drop policy if exists "Full Access Anon" on public.product_rules;
drop policy if exists "Allow All" on public.product_rules;

alter table public.product_rules drop constraint if exists product_rules_productid_unique;
