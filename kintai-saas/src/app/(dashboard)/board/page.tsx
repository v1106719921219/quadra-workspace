import { BoardClient } from "./board-client";
import { jstToday, jstDayOfWeek, addDaysToDateStr } from "@/lib/time-utils";
import {
  getActiveJobSites,
  getActiveEmployees,
  getAssignments,
  getSiteDailyLabels,
  getTenantSettings,
} from "./actions";

export default async function BoardPage() {
  const [jobSites, employees, settings] = await Promise.all([
    getActiveJobSites(),
    getActiveEmployees(),
    getTenantSettings(),
  ]);

  // 今週の月曜〜日曜の日付範囲（JST基準・TZ非依存）
  const today = jstToday();
  const day = jstDayOfWeek(today);
  const diff = day === 0 ? -6 : 1 - day;
  const startDate = addDaysToDateStr(today, diff);
  const endDate = addDaysToDateStr(startDate, 6);

  const [assignments, dailyLabels] = await Promise.all([
    getAssignments(startDate, endDate),
    getSiteDailyLabels(startDate, endDate),
  ]);

  return (
    <BoardClient
      initialJobSites={jobSites}
      initialEmployees={employees}
      initialAssignments={assignments}
      initialDailyLabels={dailyLabels}
      initialSettings={settings}
    />
  );
}
