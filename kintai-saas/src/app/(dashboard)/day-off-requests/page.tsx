import { getDayOffRequestsByMonth } from "./actions";
import { DayOffRequestsClient } from "./day-off-requests-client";
import { jstYearMonth } from "@/lib/time-utils";

export const dynamic = "force-dynamic";

export default async function DayOffRequestsPage() {
  const { year: nowYear, month: nowMonth } = jstYearMonth();
  // デフォルトは翌月
  const year = nowMonth === 12 ? nowYear + 1 : nowYear;
  const month = nowMonth === 12 ? 1 : nowMonth + 1;

  const requests = await getDayOffRequestsByMonth(year, month) as unknown as Parameters<typeof DayOffRequestsClient>[0]["initialRequests"];

  return <DayOffRequestsClient initialRequests={requests} initialYear={year} initialMonth={month} />;
}
