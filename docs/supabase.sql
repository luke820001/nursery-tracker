-- 吳平種苗廠 育苗排程 — Supabase 資料表（方案 B，選用）
-- 在 Supabase Dashboard → SQL Editor 貼上執行。
-- 表結構刻意極簡：id / updated_at / deleted / data(jsonb)，前端欄位變動不需要改表。

create table if not exists crops     (id text primary key, updated_at timestamptz not null, deleted boolean default false, data jsonb not null);
create table if not exists customers (id text primary key, updated_at timestamptz not null, deleted boolean default false, data jsonb not null);
create table if not exists locations (id text primary key, updated_at timestamptz not null, deleted boolean default false, data jsonb not null);
create table if not exists batches   (id text primary key, updated_at timestamptz not null, deleted boolean default false, data jsonb not null);
create table if not exists events    (id text primary key, updated_at timestamptz not null, deleted boolean default false, data jsonb not null);

create index if not exists batches_updated_at on batches (updated_at);
create index if not exists events_updated_at  on events  (updated_at);

-- 小團隊、不做帳號登入：允許 anon key 讀寫。
-- ⚠ anon key 外洩即可讀寫資料；若需要更嚴格，改用 Supabase Auth + 以 auth.uid() 為條件的 policy。
alter table crops     enable row level security;
alter table customers enable row level security;
alter table locations enable row level security;
alter table batches   enable row level security;
alter table events    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['crops','customers','locations','batches','events'] loop
    execute format('drop policy if exists team_all on %I', t);
    execute format('create policy team_all on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- 可讀的檢視表（方便在 Supabase / Metabase 看報表）
create or replace view batches_report as
select
  id,
  data->>'status'          as status,
  data->>'cropName'        as crop,
  data->>'variety'         as variety,
  (data->>'trayCells')::int  as tray_cells,
  (data->>'trayCount')::int  as tray_count,
  (data->>'targetPlants')::int as target_plants,
  (data->>'lossTrays')::int  as loss_trays,
  data->>'customerName'    as customer,
  data->>'deliveryMethod'  as delivery,
  (data->>'unitPrice')::numeric as unit_price,
  data->>'locationName'    as location,
  data->>'sowDate'         as sow_date,
  data->>'hardenDate'      as harden_date,
  data->>'readyDate'       as ready_date,
  data->>'targetShipDate'  as target_ship_date,
  data->>'actualSowDate'   as actual_sow_date,
  data->>'actualShipDate'  as actual_ship_date,
  (data->>'shippedTrays')::int as shipped_trays,
  updated_at
from batches
where deleted = false;
