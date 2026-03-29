-- Run in Supabase SQL Editor (Dashboard → SQL).
-- Enables RLS, allows anonymous SELECT for Realtime on the dashboard (personal use; rotate keys if exposed).

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null,
  description text not null,
  category text not null,
  raw_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_created_at_idx on public.transactions (created_at desc);

alter table public.transactions enable row level security;

-- Inserts go through Next.js with the service role (bypasses RLS).
-- Open read for anon so the browser can subscribe to Realtime inserts.
create policy "Allow anon read transactions"
  on public.transactions
  for select
  to anon
  using (true);

-- Realtime: add table to supabase_realtime publication (ignore error if already added).
alter publication supabase_realtime add table public.transactions;
