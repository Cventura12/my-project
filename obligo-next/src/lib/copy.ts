export const DOCTRINE =
  "Obligo is an AI-powered verification system that detects unstructured student obligations, tracks their dependencies and proof, and prevents silent administrative failure.";

export const NAV_LABELS = {
  today: "Today",
  inbox: "Inbox (Signals)",
  obligations: "Obligations",
  approvals: "Approvals",
  schools: "Schools",
  settings: "Settings",
  product: "Product",
} as const;

export const STATUS_LABELS = {
  pending: "Unresolved",
  submitted: "Submitted - unverified",
  verified: "Verified",
  blocked: "Blocked by dependency",
  proofMissing: "Verification missing",
  atRisk: "Time-sensitive",
  failed: "Requirement failed",
} as const;

export const BUTTON_LABELS = {
  uploadProof: "Attach verification",
  reviewVerification: "Review verification",
  verify: "Confirm verification",
  submit: "Mark as submitted",
  dismiss: "Dismiss signal",
  open: "Review signal",
  reviewObligation: "Review obligation",
} as const;

export const EMPTY_STATES = {
  today:
    "No immediate action required.\nAll known obligations are verified or not time-sensitive.",
  obligations:
    "No obligations recorded.\nThis does not guarantee compliance.\nConnect email or add requirements to detect missing obligations.",
  inbox:
    "No actionable signals detected.\nNon-actionable messages are not shown.",
  approvals:
    "No approvals pending.\nFollow-ups appear here when confirmation is missing.",
  schools:
    "No schools recorded.\nAdd a school to track institution-specific requirements.",
  blocked: "No blocked items.",
} as const;
