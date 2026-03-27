-- PSA Pop Report からスクレイピングしたカードスペック
create table psa_card_specs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  set_name text not null,
  card_number text,
  description text not null,
  year text,
  created_at timestamptz not null default now()
);

-- 同じユーザー・同じdescriptionの重複を防ぐ
create unique index idx_psa_card_specs_unique on psa_card_specs(user_id, description);
create index idx_psa_card_specs_set on psa_card_specs(user_id, set_name);
create index idx_psa_card_specs_desc on psa_card_specs(description);

alter table psa_card_specs enable row level security;

create policy "psa_card_specs_select" on psa_card_specs
  for select to authenticated using (user_id = auth.uid());

create policy "psa_card_specs_insert" on psa_card_specs
  for insert to authenticated with check (user_id = auth.uid());

create policy "psa_card_specs_delete" on psa_card_specs
  for delete to authenticated using (user_id = auth.uid());
