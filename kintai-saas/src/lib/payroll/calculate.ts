import type {
  EmployeeForPayroll,
  TimeRecordForPayroll,
  DailyWorkDetail,
  PayrollCalculation,
} from "./types";
import { calculateIncomeTax } from "./tax-table";

// 社保料率（概算）
const HEALTH_INSURANCE_RATE = 0.05; // 健康保険 5%
const PENSION_RATE = 0.0915; // 厚生年金 9.15%
const EMPLOYMENT_INSURANCE_RATE = 0.006; // 雇用保険 0.6%

// 深夜時間帯（22:00-05:00）
const LATE_NIGHT_START = 22;
const LATE_NIGHT_END = 5;

// 1日の所定労働時間（分）
const STANDARD_DAILY_MINUTES = 480; // 8時間

/**
 * 日付が土日（休日）かどうか判定
 */
function isHoliday(dateStr: string): boolean {
  const date = new Date(dateStr + "T00:00:00+09:00");
  const day = date.getDay();
  return day === 0 || day === 6; // 日曜=0, 土曜=6
}

/**
 * clock_in〜clock_outのうち22:00-05:00に重なる分数を計算
 */
function calcLateNightMinutes(clockIn: Date, clockOut: Date): number {
  let total = 0;
  // 日付をまたぐ可能性があるので、1日ずつチェック
  const current = new Date(clockIn);

  while (current < clockOut) {
    // この日の22:00
    const dayStart = new Date(current);
    dayStart.setHours(0, 0, 0, 0);

    const lateStart = new Date(dayStart);
    lateStart.setHours(LATE_NIGHT_START, 0, 0, 0);

    const nextDay = new Date(dayStart);
    nextDay.setDate(nextDay.getDate() + 1);

    const lateEnd = new Date(dayStart);
    lateEnd.setHours(LATE_NIGHT_END, 0, 0, 0);

    // 0:00-5:00の深夜帯
    if (lateEnd > clockIn && dayStart < clockOut) {
      const overlapStart = new Date(Math.max(clockIn.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(clockOut.getTime(), lateEnd.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }

    // 22:00-24:00の深夜帯
    if (nextDay > clockIn && lateStart < clockOut) {
      const overlapStart = new Date(Math.max(clockIn.getTime(), lateStart.getTime()));
      const overlapEnd = new Date(Math.min(clockOut.getTime(), nextDay.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 60000;
      }
    }

    // 次の日へ
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return total;
}

/**
 * 1日分の勤務詳細を計算
 */
function calculateDailyWork(record: TimeRecordForPayroll): DailyWorkDetail | null {
  if (!record.clock_out) return null;

  const clockIn = new Date(record.clock_in);
  const clockOut = new Date(record.clock_out);
  const totalMinutes = (clockOut.getTime() - clockIn.getTime()) / 60000 - record.break_minutes;

  if (totalMinutes <= 0) return null;

  const overtimeMinutes = Math.max(0, totalMinutes - STANDARD_DAILY_MINUTES);
  const normalMinutes = totalMinutes - overtimeMinutes;
  const lateNightMinutes = calcLateNightMinutes(clockIn, clockOut);
  const holiday = isHoliday(record.work_date);

  return {
    date: record.work_date,
    clockIn: record.clock_in,
    clockOut: record.clock_out,
    breakMinutes: record.break_minutes,
    totalMinutes,
    normalMinutes,
    overtimeMinutes,
    lateNightMinutes,
    isHoliday: holiday,
    dailyAllowance: record.work_types?.daily_allowance || 0,
    workTypeName: record.work_types?.name || "",
  };
}

/**
 * 従業員1人分の月次給与を計算
 */
export function calculateEmployeePayroll(
  employee: EmployeeForPayroll,
  records: TimeRecordForPayroll[]
): PayrollCalculation {
  // 日次計算
  const dailyDetails: DailyWorkDetail[] = [];
  for (const record of records) {
    const detail = calculateDailyWork(record);
    if (detail) dailyDetails.push(detail);
  }

  // 勤怠サマリ
  const workDays = dailyDetails.length;
  let totalMinutes = 0;
  let overtimeMinutes = 0;
  let lateNightMinutes = 0;
  let holidayMinutes = 0;
  let dailyAllowanceTotal = 0;

  for (const d of dailyDetails) {
    totalMinutes += d.totalMinutes;
    overtimeMinutes += d.overtimeMinutes;
    lateNightMinutes += d.lateNightMinutes;
    if (d.isHoliday) holidayMinutes += d.totalMinutes;
    dailyAllowanceTotal += d.dailyAllowance;
  }

  const totalHours = totalMinutes / 60;
  const overtimeHours = overtimeMinutes / 60;
  const lateNightHoursVal = lateNightMinutes / 60;
  const holidayHours = holidayMinutes / 60;

  // 時給計算のベースレート
  const hourlyBase = employee.employee_type === "part_time"
    ? (employee.hourly_rate || 0)
    : (employee.monthly_salary || 0) / 160; // 月給÷所定時間(160h)

  // 基本給計算
  let basePay: number;
  if (employee.employee_type === "part_time") {
    // パート: 通常時間×時給（休日分も含む総労働時間から残業分を除いた部分）
    const normalHours = totalHours - overtimeHours;
    basePay = Math.round(normalHours * hourlyBase);
  } else {
    // 社員: 月給固定
    basePay = employee.monthly_salary || 0;
  }

  // 割増計算
  let overtimePay: number;
  let lateNightPay: number;
  let holidayPay: number;

  if (employee.employee_type === "part_time") {
    // パート: 全額を割増率で支給
    overtimePay = Math.round(overtimeHours * hourlyBase * 1.25);
    lateNightPay = Math.round(lateNightHoursVal * hourlyBase * 0.25); // 深夜割増分のみ追加
    holidayPay = Math.round(holidayHours * hourlyBase * 0.35); // 休日割増分のみ追加
  } else {
    // 社員: 割増分のみ
    overtimePay = Math.round(overtimeHours * hourlyBase * 0.25); // 基本給に含まれるため割増分のみ
    lateNightPay = Math.round(lateNightHoursVal * hourlyBase * 0.25);
    holidayPay = Math.round(holidayHours * hourlyBase * 0.35);
  }

  const transportationAllowance = employee.transportation_allowance || 0;

  const grossPay = basePay + overtimePay + lateNightPay + holidayPay
    + dailyAllowanceTotal + transportationAllowance;

  // 社保控除（概算）
  let healthInsurance = 0;
  let pension = 0;
  if (employee.social_insurance_enrolled) {
    // 社保は通勤手当を含む総支給額ベース
    const socialInsuranceBase = grossPay;
    healthInsurance = Math.round(socialInsuranceBase * HEALTH_INSURANCE_RATE);
    pension = Math.round(socialInsuranceBase * PENSION_RATE);
  }
  // 雇用保険は全員対象
  const employmentInsurance = Math.round(grossPay * EMPLOYMENT_INSURANCE_RATE);

  const totalSocialInsurance = healthInsurance + pension + employmentInsurance;

  // 所得税（課税対象 = 総支給 - 社保 - 非課税通勤手当）
  const taxableAmount = Math.max(0, grossPay - totalSocialInsurance - transportationAllowance);
  const incomeTax = calculateIncomeTax(taxableAmount, employee.tax_column, employee.dependents_count);

  const totalDeductions = totalSocialInsurance + incomeTax;
  const netPay = grossPay - totalDeductions;

  return {
    employee,
    workDays,
    totalHours: Math.round(totalHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    lateNightHours: Math.round(lateNightHoursVal * 100) / 100,
    holidayHours: Math.round(holidayHours * 100) / 100,
    basePay,
    overtimePay,
    lateNightPay,
    holidayPay,
    dailyAllowanceTotal,
    transportationAllowance,
    grossPay,
    healthInsurance,
    pension,
    employmentInsurance,
    incomeTax,
    totalDeductions,
    netPay,
    dailyDetails,
  };
}
