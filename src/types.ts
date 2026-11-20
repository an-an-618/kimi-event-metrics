export type Metric = { key: string; name: string; current: number; baseline: number; relativeDrop: number; absoluteDrop: number; abnormal: boolean; recovered: boolean }
export type Rules = { relativeDrop: number; absoluteDrop: number; recovery: number; samples: number; minDenominator: number }
export type Counts = { dau: number; impressions: number; clicks: number; initiated: number; succeeded: number }
export type Evidence = {
  businessDate: string; sourceVersion: number; eventId: string; counts: Counts; rules: Rules; analyzedAt?: string;
  baseline: { samples: number; dates: string[]; sums: Counts; observations: { date: string; ctr: number; dau: number; completion: number }[] };
  metrics: Metric[];
  groups: { valid: boolean; reason: string | null; rows: { name: string; impressions: number; clicks: number; baseline_impressions: number; baseline_clicks: number; rate: number; baselineRate: number; missingClicks: number }[] };
  releases: { platform: string; date: string; label: string }[];
}
export type Task = { id: string; draftId: string; sessionId: string; title: string; request: string; status: string; desiredStatus: string; dataStatus: string; dataReason: string; rules: Rules; createdAt: string; lastReceivedAt?: string; lastCheckedAt: string | null; lastSuccessfulDate: string | null; checks: number; latestEvidence?: Evidence }
export type Incident = { id: string; taskId: string; metric: string; status: string; muted: boolean; openedAt: string; openedDate: string; updatedAt: string; evidence: Evidence; updates: { date: string; current: number; baseline: number }[] }
export type Message = { id: string; taskId: string; incidentId: string; type: string; title: string; text: string; read: boolean; createdAt: string; businessDate: string; evidence: Evidence }
export type Session = { id: string; title: string; messages: { id: string; role: string; text: string; draftId?: string; at: string }[] }
export type State = {
  source: { id: string; name: string; connected: boolean }; task: Task | null; incidents: Incident[]; messages: Message[];
  sessions: Session[]; drafts: { id: string; sessionId: string; request: string; rules: Rules }[];
  logs: { id: string; type: string; text: string; businessDate: string | null; at: string }[];
  events: { id: string; date: string; version: number; receivedAt: string; result: { status: string; reason?: string } }[];
  history: { business_date: string; counts: Counts }[]; storage: string; persistent: boolean; workspace: string;
}
