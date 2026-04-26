/**
 * 日本の祝日判定
 * 2024〜2030年の祝日に対応
 */

// 春分の日・秋分の日の計算（近似式）
function getVernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getAutumnalEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getFixedHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();

  const vernalEquinox = getVernalEquinox(year);
  const autumnalEquinox = getAutumnalEquinox(year);

  // 固定祝日
  holidays.set(`${year}-01-01`, "元日");
  holidays.set(`${year}-02-11`, "建国記念の日");
  holidays.set(`${year}-02-23`, "天皇誕生日");
  holidays.set(`${year}-03-${String(vernalEquinox).padStart(2, "0")}`, "春分の日");
  holidays.set(`${year}-04-29`, "昭和の日");
  holidays.set(`${year}-05-03`, "憲法記念日");
  holidays.set(`${year}-05-04`, "みどりの日");
  holidays.set(`${year}-05-05`, "こどもの日");
  holidays.set(`${year}-08-11`, "山の日");
  holidays.set(`${year}-09-${String(autumnalEquinox).padStart(2, "0")}`, "秋分の日");
  holidays.set(`${year}-11-03`, "文化の日");
  holidays.set(`${year}-11-23`, "勤労感謝の日");

  // ハッピーマンデー（第2月曜・第3月曜）
  holidays.set(getNthMonday(year, 1, 2), "成人の日");
  holidays.set(getNthMonday(year, 7, 3), "海の日");
  holidays.set(getNthMonday(year, 9, 3), "敬老の日");
  holidays.set(getNthMonday(year, 10, 2), "スポーツの日");

  return holidays;
}

function getNthMonday(year: number, month: number, n: number): string {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) break;
    if (d.getDay() === 1) {
      count++;
      if (count === n) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }
  return "";
}

function buildHolidaysForYear(year: number): Map<string, string> {
  const holidays = getFixedHolidays(year);

  // 振替休日: 祝日が日曜の場合、翌日（月曜）以降の最初の平日
  const sortedDates = Array.from(holidays.keys()).sort();
  for (const dateStr of sortedDates) {
    const d = new Date(dateStr + "T00:00:00+09:00");
    if (d.getDay() === 0) {
      let substitute = new Date(d);
      substitute.setDate(substitute.getDate() + 1);
      while (holidays.has(formatDateStr(substitute))) {
        substitute.setDate(substitute.getDate() + 1);
      }
      holidays.set(formatDateStr(substitute), "振替休日");
    }
  }

  // 国民の休日: 祝日に挟まれた平日
  const allDates = Array.from(holidays.keys()).sort();
  for (let i = 0; i < allDates.length - 1; i++) {
    const current = new Date(allDates[i] + "T00:00:00+09:00");
    const next = new Date(allDates[i + 1] + "T00:00:00+09:00");
    const diff = (next.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 2) {
      const between = new Date(current);
      between.setDate(between.getDate() + 1);
      const betweenStr = formatDateStr(between);
      if (!holidays.has(betweenStr) && between.getDay() !== 0) {
        holidays.set(betweenStr, "国民の休日");
      }
    }
  }

  return holidays;
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// キャッシュ
const cache = new Map<number, Map<string, string>>();

function getHolidaysForYear(year: number): Map<string, string> {
  if (!cache.has(year)) {
    cache.set(year, buildHolidaysForYear(year));
  }
  return cache.get(year)!;
}

/**
 * 指定日が日本の祝日かどうか判定
 * @param dateStr "YYYY-MM-DD" 形式
 * @returns 祝日名 or null
 */
export function getHolidayName(dateStr: string): string | null {
  const year = parseInt(dateStr.slice(0, 4));
  const holidays = getHolidaysForYear(year);
  return holidays.get(dateStr) || null;
}

/**
 * 指定日が日本の祝日かどうか
 */
export function isJapaneseHoliday(dateStr: string): boolean {
  return getHolidayName(dateStr) !== null;
}

/**
 * Date オブジェクトから祝日判定
 */
export function isHolidayDate(date: Date): boolean {
  return isJapaneseHoliday(formatDateStr(date));
}

/**
 * Date オブジェクトから祝日名取得
 */
export function getHolidayNameFromDate(date: Date): string | null {
  return getHolidayName(formatDateStr(date));
}
