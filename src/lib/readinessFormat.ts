import { ReadinessStatus } from "./readinessTypes";

export function formatReadinessLabel(status: ReadinessStatus) {

  switch (status) {
    case "ready_to_push":
      return "Ready to Push";

    case "watch_fatigue":
      return "Watch Fatigue";

    case "recovery_constrained":
      return "Recovery Constrained";

    case "low_signal_confidence":
      return "Low Signal Confidence";

    default:
      return "Stable";
  }
}
