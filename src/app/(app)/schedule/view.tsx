"use client";

import { useSearchParams } from "next/navigation";
import EventDetail from "./detail";
import ScheduleList from "./list";

export default function ScheduleView() {
  const recordId = useSearchParams()?.get("id") ?? null;
  return recordId ? <EventDetail recordId={recordId} /> : <ScheduleList />;
}
