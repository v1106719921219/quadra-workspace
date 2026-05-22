// 源泉徴収税額表（月額表）
// 令和7年分以降対応
// 甲欄: 社会保険料等控除後の給与等の金額に基づく

interface TaxBracket {
  min: number;      // 以上
  max: number;      // 未満
  base: number;     // 基本税額（扶養0人）
  perDependent: number; // 扶養1人あたり控除額
}

// 甲欄（扶養0人ベースの税額と1人あたり控除額）
// 社会保険料等控除後の給与金額に対する税額
const KOU_TABLE: TaxBracket[] = [
  { min: 0, max: 88000, base: 0, perDependent: 0 },
  { min: 88000, max: 89000, base: 130, perDependent: 130 },
  { min: 89000, max: 90000, base: 180, perDependent: 180 },
  { min: 90000, max: 91000, base: 230, perDependent: 230 },
  { min: 91000, max: 92000, base: 290, perDependent: 290 },
  { min: 92000, max: 93000, base: 340, perDependent: 340 },
  { min: 93000, max: 94000, base: 390, perDependent: 390 },
  { min: 94000, max: 95000, base: 440, perDependent: 440 },
  { min: 95000, max: 96000, base: 490, perDependent: 490 },
  { min: 96000, max: 97000, base: 540, perDependent: 540 },
  { min: 97000, max: 98000, base: 590, perDependent: 590 },
  { min: 98000, max: 99000, base: 640, perDependent: 640 },
  { min: 99000, max: 101000, base: 720, perDependent: 720 },
  { min: 101000, max: 103000, base: 830, perDependent: 830 },
  { min: 103000, max: 105000, base: 930, perDependent: 930 },
  { min: 105000, max: 107000, base: 1030, perDependent: 1030 },
  { min: 107000, max: 109000, base: 1130, perDependent: 1130 },
  { min: 109000, max: 111000, base: 1240, perDependent: 1240 },
  { min: 111000, max: 113000, base: 1340, perDependent: 1340 },
  { min: 113000, max: 115000, base: 1440, perDependent: 1440 },
  { min: 115000, max: 117000, base: 1540, perDependent: 1540 },
  { min: 117000, max: 119000, base: 1640, perDependent: 1640 },
  { min: 119000, max: 121000, base: 1750, perDependent: 1750 },
  { min: 121000, max: 123000, base: 1850, perDependent: 1850 },
  { min: 123000, max: 125000, base: 1950, perDependent: 1950 },
  { min: 125000, max: 127000, base: 2050, perDependent: 2050 },
  { min: 127000, max: 129000, base: 2150, perDependent: 2150 },
  { min: 129000, max: 131000, base: 2260, perDependent: 2260 },
  { min: 131000, max: 133000, base: 2360, perDependent: 2360 },
  { min: 133000, max: 135000, base: 2460, perDependent: 2460 },
  { min: 135000, max: 137000, base: 2550, perDependent: 2550 },
  { min: 137000, max: 139000, base: 2610, perDependent: 2610 },
  { min: 139000, max: 141000, base: 2680, perDependent: 2680 },
  { min: 141000, max: 143000, base: 2740, perDependent: 2740 },
  { min: 143000, max: 145000, base: 2810, perDependent: 2810 },
  { min: 145000, max: 147000, base: 2870, perDependent: 2870 },
  { min: 147000, max: 149000, base: 2940, perDependent: 2940 },
  { min: 149000, max: 151000, base: 3000, perDependent: 3000 },
  { min: 151000, max: 153000, base: 3140, perDependent: 3070 },
  { min: 153000, max: 155000, base: 3300, perDependent: 3140 },
  { min: 155000, max: 157000, base: 3470, perDependent: 3200 },
  { min: 157000, max: 159000, base: 3630, perDependent: 3270 },
  { min: 159000, max: 161000, base: 3800, perDependent: 3340 },
  { min: 161000, max: 163000, base: 3960, perDependent: 3410 },
  { min: 163000, max: 165000, base: 4130, perDependent: 3470 },
  { min: 165000, max: 167000, base: 4290, perDependent: 3540 },
  { min: 167000, max: 169000, base: 4460, perDependent: 3610 },
  { min: 169000, max: 171000, base: 4630, perDependent: 3680 },
  { min: 171000, max: 173000, base: 4790, perDependent: 3740 },
  { min: 173000, max: 175000, base: 4960, perDependent: 3810 },
  { min: 175000, max: 177000, base: 5130, perDependent: 3880 },
  { min: 177000, max: 179000, base: 5290, perDependent: 3950 },
  { min: 179000, max: 181000, base: 5460, perDependent: 4010 },
  { min: 181000, max: 183000, base: 5620, perDependent: 4080 },
  { min: 183000, max: 185000, base: 5790, perDependent: 4150 },
  { min: 185000, max: 187000, base: 5960, perDependent: 4220 },
  { min: 187000, max: 189000, base: 6120, perDependent: 4280 },
  { min: 189000, max: 191000, base: 6290, perDependent: 4350 },
  { min: 191000, max: 193000, base: 6450, perDependent: 4420 },
  { min: 193000, max: 195000, base: 6620, perDependent: 4490 },
  { min: 195000, max: 197000, base: 6780, perDependent: 4550 },
  { min: 197000, max: 199000, base: 6950, perDependent: 4620 },
  { min: 199000, max: 201000, base: 7120, perDependent: 4690 },
  { min: 201000, max: 203000, base: 7280, perDependent: 4760 },
  { min: 203000, max: 205000, base: 7450, perDependent: 4820 },
  { min: 205000, max: 207000, base: 7610, perDependent: 4890 },
  { min: 207000, max: 209000, base: 7780, perDependent: 4960 },
  { min: 209000, max: 211000, base: 7940, perDependent: 5030 },
  { min: 211000, max: 213000, base: 8110, perDependent: 5090 },
  { min: 213000, max: 215000, base: 8270, perDependent: 5160 },
  { min: 215000, max: 217000, base: 8440, perDependent: 5230 },
  { min: 217000, max: 219000, base: 8610, perDependent: 5300 },
  { min: 219000, max: 221000, base: 8770, perDependent: 5360 },
  { min: 221000, max: 224000, base: 9020, perDependent: 5470 },
  { min: 224000, max: 227000, base: 9350, perDependent: 5600 },
  { min: 227000, max: 230000, base: 9680, perDependent: 5730 },
  { min: 230000, max: 233000, base: 10010, perDependent: 5860 },
  { min: 233000, max: 236000, base: 10340, perDependent: 5990 },
  { min: 236000, max: 239000, base: 10670, perDependent: 6120 },
  { min: 239000, max: 242000, base: 11000, perDependent: 6250 },
  { min: 242000, max: 245000, base: 11330, perDependent: 6380 },
  { min: 245000, max: 248000, base: 11660, perDependent: 6510 },
  { min: 248000, max: 251000, base: 11990, perDependent: 6640 },
  { min: 251000, max: 254000, base: 12320, perDependent: 6770 },
  { min: 254000, max: 257000, base: 12650, perDependent: 6910 },
  { min: 257000, max: 260000, base: 12980, perDependent: 7040 },
  { min: 260000, max: 263000, base: 13310, perDependent: 7170 },
  { min: 263000, max: 266000, base: 13640, perDependent: 7300 },
  { min: 266000, max: 269000, base: 13970, perDependent: 7430 },
  { min: 269000, max: 272000, base: 14300, perDependent: 7560 },
  { min: 272000, max: 275000, base: 14630, perDependent: 7690 },
  // 275,000以上はブラケット計算（概算）
  { min: 275000, max: 300000, base: 15900, perDependent: 8420 },
  { min: 300000, max: 350000, base: 19400, perDependent: 10200 },
  { min: 350000, max: 400000, base: 25500, perDependent: 12800 },
  { min: 400000, max: 450000, base: 32600, perDependent: 15400 },
  { min: 450000, max: 500000, base: 40500, perDependent: 18200 },
  { min: 500000, max: 550000, base: 49100, perDependent: 21100 },
  { min: 550000, max: 600000, base: 58200, perDependent: 24200 },
  { min: 600000, max: 700000, base: 71700, perDependent: 28700 },
  { min: 700000, max: 800000, base: 95500, perDependent: 37200 },
  { min: 800000, max: Infinity, base: 120400, perDependent: 46700 },
];

/**
 * 甲欄の源泉徴収税額を計算
 */
export function calculateKouTax(taxableAmount: number, dependentsCount: number): number {
  if (taxableAmount < 88000) return 0;

  for (const bracket of KOU_TABLE) {
    if (taxableAmount >= bracket.min && taxableAmount < bracket.max) {
      const tax = bracket.base - bracket.perDependent * dependentsCount;
      return Math.max(0, Math.floor(tax));
    }
  }

  // 最高ブラケット
  const last = KOU_TABLE[KOU_TABLE.length - 1];
  const tax = last.base - last.perDependent * dependentsCount;
  return Math.max(0, Math.floor(tax));
}

/**
 * 乙欄の源泉徴収税額を計算
 */
export function calculateOtsuTax(taxableAmount: number): number {
  if (taxableAmount <= 0) return 0;

  // 乙欄: 甲欄0人の約1.5倍、最低3.063%
  const kouTax = calculateKouTax(taxableAmount, 0);
  const otsuTax = Math.max(
    Math.floor(taxableAmount * 0.03063),
    Math.floor(kouTax * 1.5)
  );
  return otsuTax;
}

/**
 * 源泉徴収税額を計算（甲欄/乙欄対応）
 */
export function calculateIncomeTax(
  taxableAmount: number,
  taxColumn: "kou" | "otsu",
  dependentsCount: number
): number {
  if (taxColumn === "otsu") {
    return calculateOtsuTax(taxableAmount);
  }
  return calculateKouTax(taxableAmount, dependentsCount);
}
