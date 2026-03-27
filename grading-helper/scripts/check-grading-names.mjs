import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://krhkezbiknxsywtsoosn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyaGtlemJpa254c3l3dHNvb3NuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQzMTkyNywiZXhwIjoyMDg4MDA3OTI3fQ.tyT8phkQbHdoviNpsd9NMwxAwaDzUhvIMKnFxHbbTRQ'
);

const japanesePattern = /[\u3000-\u9FFF\uF900-\uFAFF]/;

// 全カード数
const { count: totalCount } = await supabase
  .from('cards')
  .select('*', { count: 'exact', head: true });

console.log(`全カード数: ${totalCount}件`);

// name_enが入っているカード
const { count: enCount } = await supabase
  .from('cards')
  .select('*', { count: 'exact', head: true })
  .not('name_en', 'is', null);

console.log(`name_enあり: ${enCount}件`);

// grading_nameが入っているカード
const { count: gradingCount } = await supabase
  .from('cards')
  .select('*', { count: 'exact', head: true })
  .not('grading_name', 'is', null);

console.log(`grading_nameあり: ${gradingCount}件（0が正常）`);

// name_enのサンプル表示
const { data: samples } = await supabase
  .from('cards')
  .select('set_code, card_number, name_ja, name_en, grading_name')
  .not('name_en', 'is', null)
  .limit(20);

console.log('\n--- name_enが入っているカード例 ---');
samples?.forEach(c => {
  console.log(`${c.set_code}-${c.card_number} | ${c.name_ja} | EN: ${c.name_en}`);
});

// name_enに日本語が混入していないかチェック
let allEnCards = [];
let page = 0;
while (true) {
  const { data } = await supabase
    .from('cards')
    .select('set_code, card_number, name_ja, name_en')
    .not('name_en', 'is', null)
    .range(page * 1000, (page + 1) * 1000 - 1);
  if (!data || data.length === 0) break;
  allEnCards = allEnCards.concat(data);
  if (data.length < 1000) break;
  page++;
}

const jaInEn = allEnCards.filter(c => japanesePattern.test(c.name_en));
console.log(`\nname_enに日本語混入: ${jaInEn.length}件`);
if (jaInEn.length > 0) {
  console.log('--- 日本語混入例 ---');
  jaInEn.slice(0, 20).forEach(c => {
    console.log(`${c.set_code}-${c.card_number} | ${c.name_ja} | EN: ${c.name_en}`);
  });
}

// name_enがないカードのサンプル（非ポケモン）
const { data: noEn } = await supabase
  .from('cards')
  .select('set_code, card_number, name_ja')
  .is('name_en', null)
  .limit(10);

console.log('\n--- name_enなし（非ポケモン）例 ---');
noEn?.forEach(c => {
  console.log(`${c.set_code}-${c.card_number} | ${c.name_ja}`);
});
