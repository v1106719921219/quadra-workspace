import { getDayOffRequestsByMonth } from "./actions";
import { DayOffRequestsClient } from "./day-off-requests-client";

export const dynamic = "force-dynamic";

export default async function DayOffRequestsPage() {
  const now = new Date();
  // デフォルトは翌月
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2;

  const requests = await getDayOffRequestsByMonth(year, month) as unknown as Parameters<typeof DayOffRequestsClient>[0]["initialRequests"];

  return <DayOffRequestsClient initialRequests={requests} initialYear={year} initialMonth={month} />;
}
