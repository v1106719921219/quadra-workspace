import { BoardClient } from "./board-client";
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

  // 今週の月曜〜日曜の日付範囲
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const startDate = monday.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const endDate = sunday.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

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
