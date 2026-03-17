import { PrescriptionTrustLevel, ReadinessStatus } from "./readinessTypes";

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

export function formatPrescriptionTrust(level: PrescriptionTrustLevel) {
  switch (level) {
    case "high":
      return "High";
    case "moderate":
      return "Moderate";
    case "low":
      return "Low";
    default:
      return "Unknown";
  }
}

