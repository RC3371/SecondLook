"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ── Shared types (imported by page.tsx) ───────────────────────────────────────

export interface RiskSignals {
  keyword_stuffing: boolean;
  possible_ai_generated: boolean;
  prompt_injection: boolean;
  suspiciously_short: boolean;
}

export interface TriageReasoning {
  matched: string[];
  missing: string[];
  preferred_hits: string[];
  risk_flags?: Partial<RiskSignals>;
  pre_filter_reason?: string;
  confidence: number;
  summary: string;
}

export type Tier = "top" | "strong" | "review" | "auto_reject";

export interface Application {
  candidate_id: string;
  req_id: string;
  org_id: string;
  tier: Tier;
  triage_reasoning: TriageReasoning;
  status: string;
  recruiter_note?: string | null;
  candidates?: { id: string; name?: string | null; resume_text?: string | null } | null;
}

export interface Req {
  id: string;
  title: string;
  criteria: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<Tier, number> = { top: 0, strong: 1, review: 2, auto_reject: 3 };

type FilterKey = Tier | "top+strong" | "all";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "top+strong", label: "Top & Strong" },
  { key: "top", label: "Top" },
  { key: "strong", label: "Strong" },
  { key: "review", label: "Review" },
  { key: "auto_reject", label: "Auto-Reject" },
  { key: "all", label: "All" },
];

const TIER_STYLES: Record<Tier, string> = {
  top: "bg-emerald-100 text-emerald-800 border-emerald-200",
  strong: "bg-blue-100 text-blue-800 border-blue-200",
  review: "bg-amber-100 text-amber-800 border-amber-200",
  auto_reject: "bg-red-100 text-red-800 border-red-200",
};

const TIER_LABELS: Record<Tier, string> = {
  top: "Top",
  strong: "Strong",
  review: "Review",
  auto_reject: "Auto-Reject",
};

const RISK_DESCRIPTIONS: Record<keyof RiskSignals, string> = {
  keyword_stuffing: "Skills section has excessive keywords with minimal context",
  possible_ai_generated: "High buzzword density or repetitive sentence structure detected",
  prompt_injection: "Resume contains instruction-hijacking language targeting AI systems",
  suspiciously_short: "Resume is under 300 words — limited signal for analysis",
};

const RISK_LABELS: Record<keyof RiskSignals, string> = {
  keyword_stuffing: "Keyword stuffing",
  possible_ai_generated: "Possibly AI-written",
  prompt_injection: "Prompt injection",
  suspiciously_short: "Short resume",
};

// ── Helper components ─────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <Badge className={`border ${TIER_STYLES[tier]} text-xs font-medium`}>
      {TIER_LABELS[tier]}
    </Badge>
  );
}

function RiskFlag({ flag }: { flag: keyof RiskSignals }) {
  return (
    <span className="group relative inline-flex cursor-help items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">
      <AlertTriangle className="size-3 shrink-0" />
      {RISK_LABELS[flag]}
      <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-56 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {RISK_DESCRIPTIONS[flag]}
      </span>
    </span>
  );
}

function CandidateCard({
  app,
  onTierChange,
  onNoteSave,
}: {
  app: Application;
  onTierChange: (candidateId: string, tier: Tier) => Promise<void>;
  onNoteSave: (candidateId: string, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(app.recruiter_note ?? "");
  const r = app.triage_reasoning;
  const risks = r.risk_flags ?? {};
  const activeRisks = (Object.keys(risks) as (keyof RiskSignals)[]).filter(
    (k) => risks[k]
  );

  const label =
    app.candidates?.name ??
    `Candidate ${app.candidate_id.slice(0, 8).toUpperCase()}`;

  return (
    <Card>
      <CardHeader className="border-b pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <TierBadge tier={app.tier} />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {Math.round(r.confidence * 100)}% confidence
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-3">
        {/* AI summary */}
        <p className="text-sm italic text-muted-foreground">
          &ldquo;{r.summary}&rdquo;
        </p>

        {/* Skill pills */}
        <div className="space-y-1.5">
          {r.matched.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.matched.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700"
                >
                  ✓ {m}
                </span>
              ))}
            </div>
          )}
          {r.missing.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.missing.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600"
                >
                  ✗ {m}
                </span>
              ))}
            </div>
          )}
          {r.preferred_hits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.preferred_hits.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600"
                >
                  ★ {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Risk flags */}
        {activeRisks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeRisks.map((flag) => (
              <RiskFlag key={flag} flag={flag} />
            ))}
          </div>
        )}

        {/* Pre-filter note */}
        {r.pre_filter_reason && (
          <p className="text-xs text-muted-foreground">
            Pre-filtered: {r.pre_filter_reason}
          </p>
        )}

        {/* Recruiter note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => onNoteSave(app.candidate_id, note)}
          placeholder="Add a recruiter note…"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
        />
      </CardContent>

      <CardFooter className="gap-2">
        {/* Tier override */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Override:
          <select
            value={app.tier}
            onChange={(e) => onTierChange(app.candidate_id, e.target.value as Tier)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="top">Top</option>
            <option value="strong">Strong</option>
            <option value="review">Review</option>
            <option value="auto_reject">Auto-Reject</option>
          </select>
        </label>

        {/* Refer to colleague */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Refer to colleague
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refer candidate</DialogTitle>
              <DialogDescription>
                Team referral will be available in a future update. Share the
                candidate link with a colleague for now.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TriagePage({
  req,
  initialApplications,
}: {
  req: Req;
  initialApplications: Application[];
}) {
  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("top+strong");
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`applications:req:${req.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
          filter: `req_id=eq.${req.id}`,
        },
        (payload) => {
          const updated = payload.new as Application;
          setApplications((prev) => {
            const exists = prev.some(
              (a) => a.candidate_id === updated.candidate_id
            );
            const next = exists
              ? prev.map((a) =>
                  a.candidate_id === updated.candidate_id
                    ? { ...a, ...updated }
                    : a
                )
              : [...prev, updated];
            return next.sort(
              (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [req.id]);

  // ── Tier counts ───────────────────────────────────────────────────────────
  const counts = applications.reduce(
    (acc, a) => ({ ...acc, [a.tier]: (acc[a.tier] ?? 0) + 1 }),
    {} as Record<Tier, number>
  );
  const countFor = (k: FilterKey) => {
    if (k === "top+strong") return (counts.top ?? 0) + (counts.strong ?? 0);
    if (k === "all") return applications.length;
    return counts[k] ?? 0;
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const visible =
    activeFilter === "all"
      ? applications
      : activeFilter === "top+strong"
      ? applications.filter((a) => a.tier === "top" || a.tier === "strong")
      : applications.filter((a) => a.tier === activeFilter);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleProcessResumes = async () => {
    setIsProcessing(true);
    try {
      const supabase = createClient();
      const { data: candidates, error } = await supabase
        .from("candidates")
        .select("id, resume_text")
        .eq("req_id", req.id);

      if (error) throw new Error(error.message);
      if (!candidates?.length) {
        toast.info("No candidates found for this requisition.");
        return;
      }

      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ req_id: req.id, candidates }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Triage request failed");
      }

      const result = (await res.json()) as {
        processed: number;
        failed: number;
      };
      toast.success(
        `Processed ${result.processed} candidate${result.processed !== 1 ? "s" : ""}` +
          (result.failed ? ` · ${result.failed} failed` : "")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTierChange = async (candidateId: string, newTier: Tier) => {
    // Optimistic update
    setApplications((prev) =>
      prev
        .map((a) => (a.candidate_id === candidateId ? { ...a, tier: newTier } : a))
        .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("applications")
      .update({ tier: newTier })
      .eq("candidate_id", candidateId)
      .eq("req_id", req.id);

    if (error) {
      toast.error("Failed to update tier — please try again");
      // Realtime will sync the DB state back on its own
    }
  };

  const handleNoteSave = async (candidateId: string, note: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("applications")
      .update({ recruiter_note: note })
      .eq("candidate_id", candidateId)
      .eq("req_id", req.id);

    if (error) toast.error("Note failed to save");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/reqs"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Requisitions
          </Link>
          <h1 className="text-xl font-semibold">{req.title}</h1>
          <p className="text-sm text-muted-foreground">
            {applications.length} candidate{applications.length !== 1 ? "s" : ""} triaged
          </p>
        </div>

        <Button
          onClick={handleProcessResumes}
          disabled={isProcessing}
          className="shrink-0"
        >
          {isProcessing && <Loader2 className="animate-spin" />}
          {isProcessing ? "Processing…" : "Process resumes"}
        </Button>
      </div>

      {/* Tier summary / filter bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map(({ key, label }) => {
          const n = countFor(key);
          const isActive = activeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? key === "top"
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : key === "strong"
                    ? "border-blue-300 bg-blue-100 text-blue-800"
                    : key === "review"
                    ? "border-amber-300 bg-amber-100 text-amber-800"
                    : key === "auto_reject"
                    ? "border-red-300 bg-red-100 text-red-800"
                    : "border-foreground/20 bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
              ].join(" ")}
            >
              {label}
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  isActive ? "bg-white/30" : "bg-muted",
                ].join(" ")}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Application list */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {applications.length === 0
              ? 'No candidates triaged yet. Upload resumes or click "Process resumes" to start.'
              : `No candidates in the "${FILTER_OPTIONS.find((f) => f.key === activeFilter)?.label}" tier.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((app) => (
            <CandidateCard
              key={app.candidate_id}
              app={app}
              onTierChange={handleTierChange}
              onNoteSave={handleNoteSave}
            />
          ))}
        </div>
      )}
    </main>
  );
}
