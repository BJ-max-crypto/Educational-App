import { PlannerView } from "@/components/planner-view";
import { WeeklySummaryCard } from "@/components/weekly-summary-card";

export default function PlannerPage() {
  return (
    <>
      <WeeklySummaryCard />
      <PlannerView />
    </>
  );
}
