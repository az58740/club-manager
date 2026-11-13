import { Suspense } from "react";
import TeamsView from "./view";

export default function TeamsPage() {
  return (
    <Suspense fallback={null}>
      <TeamsView />
    </Suspense>
  );
}
