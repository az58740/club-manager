import { Suspense } from "react";
import PlayersView from "./view";

export default function PlayersPage() {
  return (
    <Suspense fallback={null}>
      <PlayersView />
    </Suspense>
  );
}
