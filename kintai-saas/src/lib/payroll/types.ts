// 給与計算関連の型定義

export interface EmployeeForPayroll {
  id: string;
  name: string;
  employee_number: string | null;
  employee_type: "part_time" | "full_time";
  hourly_rate: number | null;
  monthly_salary: number | null;
  transportation_allowance: number;
  dependents_count: number;
  tax_column: "kou" | "otsu";
  social_insurance_enrolled: boolean;
  employment_insurance_enrolled: boolean;
  standard_monthly_remuneration: number;
  resident_tax: number;
  savings_deduction: number;
}

export interface TimeRecordForPayroll {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  actual_hours_override: number | null;
  work_types: { name: string; daily_allowance: number; hourly_rate: number | null };
  is_driver: boolean;
  // 配置ボード（ホワイトボード）から取得した現場情報
  site_daily_allowance: number;    // 正社員向け日当加算（配置された現場から）
  site_hourly_rate: number | null; // パート向け時給（配置された現場から）
  site_name: string | null;        // 現場名（明細表示用）
}

export interface DailyWorkDetail {
  date: string;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  totalMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  lateNightMinutes: number;
  isHoliday: boolean;
  dailyAllowance: number;
  workTypeName: string;
  isDriver: boolean;
  hourlyRate: number;
  siteName: string | null; // 現場名（明細表示用）
}

export interface PayrollCalculation {
  employee: EmployeeForPayroll;

  // 勤怠サマリ
  workDays: number;
  totalHours: number;
  overtimeHours: number;
  lateNightHours: number;
  holidayHours: number;

  // 支給
  basePay: number;
  overtimePay: number;
  lateNightPay: number;
  holidayPay: number;
  absenceDeduction: number; // 不就労控除（マイナス値）
  dailyAllowanceTotal: number;
  driverDays: number;
  driverAllowance: number;
  transportationAllowance: number;
  grossPay: number;

  // 控除
  healthInsurance: number;
  pension: number;
  childSupportContribution: number; // 子ども・子育て支援金
  employmentInsurance: number;
  incomeTax: number;
  residentTax: number;       // 住民税
  savingsDeduction: number;  // 積立金
  totalDeductions: number;

  // 差引支給額
  netPay: number;

  // 明細
  dailyDetails: DailyWorkDetail[];
}
