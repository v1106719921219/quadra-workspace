import { StaffBoardClient } from "./staff-board-client";
import {
  getActiveJobSites,
  getActiveEmployees,
  getAssignments,
  getSiteDailyLabels,
} from "./actions";

export default async function StaffBoardPage() {
  const [jobSites, employees] = await Promise.all([
    getActiveJobSites(),
    getActiveEmployees(),
  ]);

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
    <div className="min-h-screen bg-gray-50 p-2">
      <StaffBoardClient
        initialJobSites={jobSites}
        initialEmployees={employees}
        initialAssignments={assignments}
        initialDailyLabels={dailyLabels}
      />
    </div>
  );
}
