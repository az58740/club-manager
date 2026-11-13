import { Suspense } from "react";
import ScheduleView from "./view";

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <ScheduleView />
    </Suspense>
  );
}
