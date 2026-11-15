export type Stance = "approve" | "change" | "blocker" | "unknown";

export type VoteInput = { agent: string; role: string; stance: Stance; note?: string };

export type VoteTally = {
  approve: number;
  change: number;
  blocker: number;
  total: number;
  /** Any explicit blocker means the Lead must answer it, not ignore it. */
  blocked: boolean;
  /** Majority of the decisive votes. */
  majority: Stance;
  summary: string;
};

/**
 * Vote counting for the orchestrator. The skeptic is deliberately privileged:
 * a single blocker from it stops the "everyone agrees" scenario.
 */
export function tallyVotes(votes: VoteInput[], locale: "ru" | "en" = "ru"): VoteTally {
  let approve = 0;
  let change = 0;
  let blocker = 0;
  let total = 0;

  for (const vote of votes) {
    if (vote.stance === "unknown") continue;
    total += 1;
    if (vote.stance === "approve") approve += 1;
    else if (vote.stance === "change") change += 1;
    else blocker += 1;
  }

  const skepticBlocked = votes.some((vote) => vote.role === "skeptic" && vote.stance === "blocker");
  const blocked = blocker > 0;
  const majority: Stance = total === 0
    ? "unknown"
    : approve >= change && approve >= blocker && !skepticBlocked
      ? "approve"
      : blocker > 0 && blocker >= approve
        ? "blocker"
        : "change";

  const ru = locale === "ru";
  const summary = total === 0
    ? (ru ? "Советники не дали вердиктов" : "No verdicts from the advisors")
    : (ru
      ? `Голоса: approve ${approve}, change ${change}, blocker ${blocker}${skepticBlocked ? " (есть блокер от Фомы)" : ""}`
      : `Votes: approve ${approve}, change ${change}, blocker ${blocker}${skepticBlocked ? " (blocker from the skeptic)" : ""}`);

  return { approve, change, blocker, total, blocked, majority, summary };
}

/** Blockers that the Lead is obliged to answer explicitly. */
export function blockerLines(votes: VoteInput[]): string[] {
  return votes
    .filter((vote) => vote.stance === "blocker")
    .map((vote) => `- ${vote.agent} (${vote.role}): ${(vote.note ?? "").trim().slice(0, 400) || "—"}`);
}

/**
 * True when the Lead's decision visibly addresses every blocker. We accept a
 * mention of the agent name or of the file mentioned in the objection.
 */
export function decisionAddressesBlockers(decision: string, votes: VoteInput[]): boolean {
  const text = decision.toLowerCase();
  const blockers = votes.filter((vote) => vote.stance === "blocker");
  if (blockers.length === 0) return true;

  return blockers.every((vote) => {
    const name = vote.agent.toLowerCase();
    if (name && text.includes(name)) return true;
    const fileMatch = (vote.note ?? "").match(/[\w./-]+\.(?:tsx?|jsx?|json|css|md|sql|ya?ml)/i);
    return Boolean(fileMatch && text.includes(fileMatch[0].toLowerCase()));
  });
}
