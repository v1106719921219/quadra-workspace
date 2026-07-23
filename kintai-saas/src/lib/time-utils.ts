/**
 * 15分刻み丸め・JST日付ユーティリティ
 */

/**
 * JSTの今日の日付 (YYYY-MM-DD) — 実行環境のTZに依存しない
 */
export function jstToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * JSTの現在の年・月 — 実行環境のTZに依存しない
 */
export function jstYearMonth(): { year: number; month: number } {
  const [y, m] = jstToday().split("-").map(Number);
  return { year: y, month: m };
}

/**
 * "YYYY-MM-DD" の曜日 (0=日〜6=土) — TZ非依存
 */
export function jstDayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

/**
 * "YYYY-MM-DD" に日数を加算した "YYYY-MM-DD" を返す — TZ非依存
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 出勤時間を指定分単位で切り上げ（例: 6:56 → 7:00）
 */
export function roundUpToInterval(date: Date, intervalMinutes: number = 15): Date {
  const ms = intervalMinutes * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

/**
 * 退勤時間を指定分単位で切り下げ（例: 17:52 → 17:45）
 */
export function roundDownToInterval(date: Date, intervalMinutes: number = 15): Date {
  const ms = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/**
 * 丸め後の実働時間を計算（時間単位で返す）
 */
export function calcRoundedHours(
  clockIn: Date,
  clockOut: Date,
  breakMinutes: number,
  roundingMinutes: number = 15
): number {
  const roundedIn = roundUpToInterval(clockIn, roundingMinutes);
  const roundedOut = roundDownToInterval(clockOut, roundingMinutes);
  const diffMinutes = (roundedOut.getTime() - roundedIn.getTime()) / 60000 - breakMinutes;
  return Math.max(0, diffMinutes / 60);
}

/**
 * 時間を HH:MM 形式でフォーマット
 */
export function formatTimeHHMM(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

/**
 * 時間数を "8.25h" 形式でフォーマット（15分=0.25刻み）
 */
export function formatHours(hours: number): string {
  // 0.25刻みに丸め
  const rounded = Math.round(hours * 4) / 4;
  return `${rounded.toFixed(2)}h`;
}
