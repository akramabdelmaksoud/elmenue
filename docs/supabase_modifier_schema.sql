-- TableTab: relational schema for item modifiers (option groups and options).
--
-- HOW THIS FITS TODAY: the running app keeps each café as one JSON document (table `tenants`, column `doc`)
-- and each item carries its modifiers inline: item.options = [ { id, name, name_ar, type: 'one'|'many',
-- required, max, count?: { max, unit, unit_ar, price }, choices: [ { id, name, name_ar, price, def } ] } ],
-- and item.steps = true for the step-by-step builder. The server (features.js optClean / optResolve) validates
-- every choice and recomputes prices, so nothing here is needed for the app to run.
--
-- Use this schema if you want modifiers as real rows: for reporting in SQL, a Supabase dashboard, or when the
-- platform moves from one-document-per-café to relational tables. It mirrors the same model 1:1.
-- Run in the Supabase SQL editor. Safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- modifier_groups: one question on an item ("Sugar", "Add-ons", "Base", "Flavour", "Toppings")
-- ---------------------------------------------------------------------------------------------
create table if not exists public.modifier_groups (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,                       -- tenants.id, e.g. 'r_saraya-cafe'
  item_id       text not null,                       -- the menu item this group belongs to
  name          text not null check (char_length(name) between 1 and 40),
  name_ar       text not null default '' check (char_length(name_ar) <= 40),
  -- 'one'  = single select (radio)        e.g. Sugar: Sada / Mazboot / Zeyada
  -- 'many' = multi select (checkboxes)    e.g. Tea add-ons: Mint +5, Lemon +5
  kind          text not null default 'one' check (kind in ('one', 'many')),
  required      boolean not null default false,
  max_picks     int not null default 1 check (max_picks between 1 and 16),   -- only used when kind = 'many'
  step_no       int not null default 0,              -- order in the step-by-step builder (0 = first)
  -- optional exact counter / slider, e.g. spoons of sugar. All null = no counter.
  count_max     int check (count_max between 1 and 20),
  count_unit    text check (char_length(count_unit) <= 16),
  count_unit_ar text check (char_length(count_unit_ar) <= 16),
  count_price   numeric(10,2) not null default 0 check (count_price >= 0),   -- price added per counted unit
  created_at    timestamptz not null default now()
);
create index if not exists modifier_groups_item_idx on public.modifier_groups (tenant_id, item_id, step_no);

-- ---------------------------------------------------------------------------------------------
-- modifier_options: one answer inside a group ("Mint", "Zeyada", "Chocolate base")
-- ---------------------------------------------------------------------------------------------
create table if not exists public.modifier_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.modifier_groups(id) on delete cascade,
  tenant_id   text not null,                         -- denormalised so row level security stays cheap
  name        text not null check (char_length(name) between 1 and 40),
  name_ar     text not null default '' check (char_length(name_ar) <= 40),
  price_delta numeric(10,2) not null default 0 check (price_delta >= 0 and price_delta <= 100000),  -- added to the item price
  is_default  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists modifier_options_group_idx on public.modifier_options (group_id, sort_order);
-- at most one default per single-select group is enforced by the app (features.js optClean)

-- ---------------------------------------------------------------------------------------------
-- What a guest picked, stored on the order line so the receipt and the kitchen ticket read the same way
-- ---------------------------------------------------------------------------------------------
create table if not exists public.order_line_modifiers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null,
  order_line_id text not null,
  group_name   text not null,                        -- snapshot: renaming a group later never rewrites old orders
  option_name  text not null,
  qty          int not null default 1,               -- 1 for a checkbox/radio, N for a counter ("3 spoons")
  price_delta  numeric(10,2) not null default 0      -- total added by this row (price_delta * qty)
);
create index if not exists order_line_modifiers_line_idx on public.order_line_modifiers (tenant_id, order_line_id);

-- ---------------------------------------------------------------------------------------------
-- Row level security: the server uses the service key (bypasses RLS). These policies protect direct access
-- with the anon / authenticated keys: guests may read their café's menu modifiers, nobody may write.
-- Writes go only through the server, which checks the owner's login first.
-- ---------------------------------------------------------------------------------------------
alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.order_line_modifiers enable row level security;

drop policy if exists modifier_groups_read on public.modifier_groups;
create policy modifier_groups_read on public.modifier_groups for select to anon, authenticated using (true);
drop policy if exists modifier_options_read on public.modifier_options;
create policy modifier_options_read on public.modifier_options for select to anon, authenticated using (true);
-- order_line_modifiers: no policy on purpose, so only the server (service key) can read or write it.

-- ---------------------------------------------------------------------------------------------
-- The three examples from the spec, as data (replace 'r_demo' / 'i_tea' with real ids)
-- ---------------------------------------------------------------------------------------------
-- 1) Tea 20 EGP + Mint (+5): total 25
--   insert into modifier_groups (tenant_id,item_id,name,name_ar,kind,max_picks) values ('r_demo','i_tea','Add-ons','إضافات','many',3) returning id;
--   insert into modifier_options (group_id,tenant_id,name,name_ar,price_delta) values ('<group id>','r_demo','Mint','نعناع',5);
-- 2) Coffee: Sugar preset + exact spoons
--   insert into modifier_groups (tenant_id,item_id,name,name_ar,kind,count_max,count_unit,count_unit_ar,count_price)
--     values ('r_demo','i_coffee','Sugar','السكر','one',6,'spoon','معلقة',0) returning id;
--   -- options: Sada / Mazboot (default) / Zeyada, all price_delta 0
-- 3) Milkshake builder: three groups with step_no 0,1,2 (Base, Flavour, Toppings); the app shows one group per
--    step and a summary at the end. The cart line text is built from the picked options, e.g.
--    'Vanilla base · Strawberry · Oreo, Sprinkles'.
