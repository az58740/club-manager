"use client";

import { useSearchParams } from "next/navigation";
import PlayerDetail from "./detail";
import PlayersList from "./list";

export default function PlayersView() {
  const recordId = useSearchParams()?.get("id") ?? null;
  return recordId ? <PlayerDetail recordId={recordId} /> : <PlayersList />;
}
