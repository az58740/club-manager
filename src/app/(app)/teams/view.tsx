"use client";

import { useSearchParams } from "next/navigation";
import TeamDetail from "./detail";
import TeamsList from "./list";

export default function TeamsView() {
  const recordId = useSearchParams()?.get("id") ?? null;
  return recordId ? <TeamDetail recordId={recordId} /> : <TeamsList />;
}
