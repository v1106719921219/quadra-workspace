-- ============================================================
-- Grading Helper - 初期スキーマ
-- ============================================================

-- プロファイル
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TCGゲーム種別
create table tcg_games (
  id text primary key, -- pokemon, yugioh, mtg, onepiece
  name text not null,
  name_en text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- カード拡張セット
create table card_sets (
  id uuid primary key default gen_random_uuid(),
  tcg_game_id text not null references tcg_games(id),
  code text not null, -- SV1, SV6a, etc.
  name_ja text,
  name_en text,
  release_year int,
  total_cards int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tcg_game_id, code)
);

-- カード情報
create table cards (
  id uuid primary key default gen_random_uuid(),
  tcg_game_id text not null references tcg_games(id),
  card_set_id uuid references card_sets(id),
  set_code text not null, -- SV6a
  card_number text not null, -- 001/053
  name_ja text, -- リザードンex
  name_en text, -- Charizard ex
  grading_name text, -- 2024 POKEMON JAPANESE 001 CHARIZARD EX (生成済み英語名)
  rarity text,
  card_type text, -- pokemon, trainer, energy
  year int,
  image_url text,
  tcgdex_id text, -- TCGdex API ID
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tcg_game_id, set_code, card_number)
);

-- ポケモン名 JP→EN マッピング
create table pokemon_names (
  id serial primary key,
  name_ja text not null unique, -- リザードン
  name_en text not null, -- CHARIZARD
  pokedex_number int,
  generation int,
  created_at timestamptz not null default now()
);

-- グレーディング会社
create table grading_companies (
  id text primary key, -- psa, cgc, bgs
  name text not null,
  format_template text not null default '{YEAR} POKEMON JAPANESE {NUMBER} {NAME} {SUFFIX}',
  website_url text,
  form_selectors jsonb, -- フォームセレクタ設定（Chrome拡張用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 提出バッチ
create table submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  grading_company_id text not null references grading_companies(id),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'returned')),
  notes text,
  submitted_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 提出カード明細
create table submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  card_id uuid references cards(id),
  sort_order int not null default 0,
  set_code text not null,
  card_number text not null,
  name_ja text,
  grading_name text not null, -- 提出時点の英語名を保持
  declared_value decimal(10,2),
  notes text,
  created_at timestamptz not null default now()
);

-- Chrome拡張用 APIキー
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  name text not null, -- キーの説明（例: "Chrome拡張 - PC"）
  key_hash text not null unique, -- SHA-256ハッシュ
  key_prefix text not null, -- 表示用プレフィックス（例: "gh_abc1..."）
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- インデックス
-- ============================================================
create index idx_card_sets_tcg_game on card_sets(tcg_game_id);
create index idx_cards_tcg_game on cards(tcg_game_id);
create index idx_cards_set_code on cards(set_code);
create index idx_cards_card_number on cards(card_number);
create index idx_cards_name_ja on cards(name_ja);
create index idx_cards_grading_name on cards(grading_name);
create index idx_pokemon_names_ja on pokemon_names(name_ja);
create index idx_pokemon_names_en on pokemon_names(name_en);
create index idx_submissions_user on submissions(user_id);
create index idx_submissions_status on submissions(status);
create index idx_submission_items_submission on submission_items(submission_id);
create index idx_api_keys_user on api_keys(user_id);
create index idx_api_keys_hash on api_keys(key_hash);

-- ============================================================
-- RLS ポリシー（認証済みユーザーは全データアクセス可）
-- ============================================================
alter table profiles enable row level security;
alter table tcg_games enable row level security;
alter table card_sets enable row level security;
alter table cards enable row level security;
alter table pokemon_names enable row level security;
alter table grading_companies enable row level security;
alter table submissions enable row level security;
alter table submission_items enable row level security;
alter table api_keys enable row level security;

-- profiles: 自分のプロファイルのみ
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_update" on profiles for update to authenticated using (id = auth.uid());

-- 参照テーブル: 認証済みユーザーは読み取り可能
create policy "tcg_games_select" on tcg_games for select to authenticated using (true);
create policy "card_sets_select" on card_sets for select to authenticated using (true);
create policy "card_sets_all" on card_sets for all to authenticated using (true);
create policy "cards_select" on cards for select to authenticated using (true);
create policy "cards_all" on cards for all to authenticated using (true);
create policy "pokemon_names_select" on pokemon_names for select to authenticated using (true);
create policy "pokemon_names_all" on pokemon_names for all to authenticated using (true);
create policy "grading_companies_select" on grading_companies for select to authenticated using (true);
create policy "grading_companies_all" on grading_companies for all to authenticated using (true);

-- submissions: 自分の提出のみ
create policy "submissions_select" on submissions for select to authenticated using (user_id = auth.uid());
create policy "submissions_insert" on submissions for insert to authenticated with check (user_id = auth.uid());
create policy "submissions_update" on submissions for update to authenticated using (user_id = auth.uid());
create policy "submissions_delete" on submissions for delete to authenticated using (user_id = auth.uid());

-- submission_items: 自分の提出のアイテムのみ
create policy "submission_items_select" on submission_items for select to authenticated
  using (submission_id in (select id from submissions where user_id = auth.uid()));
create policy "submission_items_insert" on submission_items for insert to authenticated
  with check (submission_id in (select id from submissions where user_id = auth.uid()));
create policy "submission_items_update" on submission_items for update to authenticated
  using (submission_id in (select id from submissions where user_id = auth.uid()));
create policy "submission_items_delete" on submission_items for delete to authenticated
  using (submission_id in (select id from submissions where user_id = auth.uid()));

-- api_keys: 自分のキーのみ
create policy "api_keys_select" on api_keys for select to authenticated using (user_id = auth.uid());
create policy "api_keys_insert" on api_keys for insert to authenticated with check (user_id = auth.uid());
create policy "api_keys_delete" on api_keys for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- トリガー: updated_at 自動更新
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_profiles_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger trigger_card_sets_updated_at before update on card_sets
  for each row execute function update_updated_at();
create trigger trigger_cards_updated_at before update on cards
  for each row execute function update_updated_at();
create trigger trigger_grading_companies_updated_at before update on grading_companies
  for each row execute function update_updated_at();
create trigger trigger_submissions_updated_at before update on submissions
  for each row execute function update_updated_at();

-- ============================================================
-- トリガー: 新規ユーザー登録時にprofileを自動作成
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 初期データ
-- ============================================================

-- TCGゲーム種別
insert into tcg_games (id, name, name_en, sort_order) values
  ('pokemon', 'ポケモンカードゲーム', 'Pokemon TCG', 1),
  ('yugioh', '遊戯王OCG', 'Yu-Gi-Oh! OCG', 2),
  ('mtg', 'マジック:ザ・ギャザリング', 'Magic: The Gathering', 3),
  ('onepiece', 'ワンピースカードゲーム', 'One Piece Card Game', 4);

-- グレーディング会社
insert into grading_companies (id, name, format_template, website_url) values
  ('psa', 'PSA (Professional Sports Authenticator)', '{YEAR} POKEMON JAPANESE {NUMBER} {NAME} {SUFFIX}', 'https://www.psacard.com'),
  ('cgc', 'CGC (Certified Guaranty Company)', '{YEAR} POKEMON JAPANESE {NUMBER} {NAME} {SUFFIX}', 'https://www.cgccomics.com/cards'),
  ('bgs', 'BGS (Beckett Grading Services)', '{YEAR} POKEMON JAPANESE {NUMBER} {NAME} {SUFFIX}', 'https://www.beckett.com/grading');
