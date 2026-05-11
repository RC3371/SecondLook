"use client";

import { useEffect, useRef, useState } from "react";
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

export interface ParsedResume {
  years_of_experience: number | null;
  most_recent_title: string | null;
  most_recent_company: string | null;
  education: { degree: string | null; field: string | null; institution: string | null };
  skills: string[];
  employment_gaps: boolean;
  total_jobs: number;
  avg_tenure_months: number | null;
}

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
  id: string;
  applicant_id: string;
  job_posting_id: string;
  ai_tier: Tier | null;
  ai_score: number | null;
  ai_reasoning: TriageReasoning | null;
  status: string;
  applicants?: {
    id: string;
    name?: string | null;
    resume_text?: string | null;
    parsed_resume?: ParsedResume | null;
  } | null;
}

export interface Req {
  id: string;
  title: string;
  criteria: unknown;
}

interface TriageApiResult {
  processed: number;
  failed: number;
  total_applications?: number;
  eligible_candidates?: number;
  skipped_candidates?: number;
  skipped_by_status?: Record<string, number>;
  message?: string;
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

const EMPTY_REASONING: TriageReasoning = {
  matched: [],
  missing: [],
  preferred_hits: [],
  confidence: 0,
  summary: "Not yet triaged",
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
    <span
      role="img"
      aria-label={RISK_LABELS[flag]}
      className="group relative inline-flex cursor-help items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200"
    >
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
}: {
  app: Application;
  onTierChange: (applicationId: string, tier: Tier) => Promise<void>;
}) {
  const tier = app.ai_tier ?? "review";
  const r = app.ai_reasoning ?? EMPTY_REASONING;
  const risks = r.risk_flags ?? {};
  const activeRisks = (Object.keys(risks) as (keyof RiskSignals)[]).filter(
    (k) => risks[k]
  );

  const label =
    app.applicants?.name ??
    `Candidate ${app.applicant_id.slice(0, 8).toUpperCase()}`;

  const pr = app.applicants?.parsed_resume;
  const expLabel = pr?.years_of_experience != null
    ? `${pr.years_of_experience} yr${pr.years_of_experience !== 1 ? "s" : ""}`
    : null;
  const roleLabel = [pr?.most_recent_title, pr?.most_recent_company]
    .filter(Boolean)
    .join(" at ") || null;

  return (
    <Card>
      <CardHeader className="border-b pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <TierBadge tier={tier} />
            <span className="text-sm font-medium">{label}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {Math.round(r.confidence * 100)}% confidence
          </span>
        </div>
        {(expLabel || roleLabel) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {[expLabel, roleLabel].filter(Boolean).join(" · ")}
          </p>
        )}
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
      </CardContent>

      <CardFooter className="gap-2">
        {/* Tier override */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Override:
          <select
            value={tier}
            onChange={(e) => onTierChange(app.id, e.target.value as Tier)}
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
            <DialogFooter />
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [triageNotice, setTriageNotice] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  // ── Auto-detect background processing ─────────────────────────────────────
  useEffect(() => {
    const checkBackgroundProcessing = async () => {
      const supabase = createClient();
      const { count: pendingCount } = await supabase
        .from("applications")
        .select("*", { count: "exact", head: true })
        .eq("job_posting_id", req.id)
        .is("ai_tier", null);

      if (pendingCount !== null && pendingCount > 0) {
        setIsProcessing(true);
        isProcessingRef.current = true;
      }
    };
    checkBackgroundProcessing();
  }, [req.id]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`applications:job:${req.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "applications",
          filter: `job_posting_id=eq.${req.id}`,
        },
        (payload) => {
          const updated = payload.new as Application;
          if (isProcessingRef.current) {
            setProgress((prev) =>
              prev ? { ...prev, done: Math.min(prev.done + 1, prev.total) } : null
            );
          }
          setApplications((prev) => {
            const exists = prev.some((a) => a.id === updated.id);
            const next = exists
              ? prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
              : [...prev, updated];
            return next.sort((a, b) => {
              const ta = a.ai_tier ? TIER_ORDER[a.ai_tier] : 99;
              const tb = b.ai_tier ? TIER_ORDER[b.ai_tier] : 99;
              return ta - tb;
            });
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
    (acc, a) => {
      const t = a.ai_tier ?? "review";
      return { ...acc, [t]: (acc[t] ?? 0) + 1 };
    },
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
        ? applications.filter((a) => a.ai_tier === "top" || a.ai_tier === "strong")
        : applications.filter((a) => (a.ai_tier ?? "review") === activeFilter);
  const triagedCount = applications.filter((a) => !!a.ai_tier).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRunTriage = async () => {
    setIsProcessing(true);
    setTriageNotice(null);
    if (applications.length > 0) {
      setProgress({ done: 0, total: applications.length });
    }
    isProcessingRef.current = true;
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_posting_id: req.id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Triage request failed");
      }

      const result = (await res.json()) as TriageApiResult;
      const summary =
        result.message ??
        `Processed ${result.processed} candidate${result.processed !== 1 ? "s" : ""}` +
          (result.failed ? ` · ${result.failed} failed` : "");
      const skipped = result.skipped_candidates ?? 0;

      if (result.failed > 0 || skipped > 0) {
        setTriageNotice(summary);
        toast.error(summary);
      } else {
        setTriageNotice(null);
        toast.success(summary);
      }
      if ((result.total_applications ?? 0) > 0) {
        setProgress({
          done: result.processed,
          total: result.total_applications ?? result.processed,
        });
      } else {
        setProgress(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Processing failed";
      setTriageNotice(message);
      toast.error(message);
      setProgress(null);
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
      setTimeout(() => setProgress(null), 1500);
    }
  };

  const handleTierChange = async (applicationId: string, newTier: Tier) => {
    setApplications((prev) =>
      prev
        .map((a) => (a.id === applicationId ? { ...a, ai_tier: newTier } : a))
        .sort((a, b) => {
          const ta = a.ai_tier ? TIER_ORDER[a.ai_tier] : 99;
          const tb = b.ai_tier ? TIER_ORDER[b.ai_tier] : 99;
          return ta - tb;
        })
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("applications")
      .update({ ai_tier: newTier })
      .eq("id", applicationId);

    if (error) {
      toast.error("Failed to update tier — please try again");
    }
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
            {triagedCount} / {applications.length} candidate{applications.length !== 1 ? "s" : ""} triaged
          </p>
        </div>

        <Button
          onClick={handleRunTriage}
          disabled={isProcessing}
          className="shrink-0"
        >
          {isProcessing && <Loader2 className="animate-spin" />}
          {isProcessing ? "Processing…" : "Run triage"}
        </Button>
      </div>

      {triageNotice && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{triageNotice}</p>
        </div>
      )}

      {/* Progress bar */}
      {(progress || isProcessing) && (
        <div className="mb-6 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {progress
                ? (progress.done < progress.total ? "Processing candidates…" : "Processing complete")
                : "AI is analyzing resumes…"}
            </span>
            {progress && (
              <span className="tabular-nums">
                {progress.done} / {progress.total}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={[
                "h-full rounded-full bg-primary transition-all duration-300 ease-out",
                !progress && "animate-pulse"
              ].filter(Boolean).join(" ")}
              style={{
                width: progress
                  ? `${Math.round((progress.done / progress.total) * 100)}%`
                  : "100%",
              }}
            />
          </div>
        </div>
      )}

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
            {isProcessing
              ? "AI is currently analyzing your resumes. Results will appear here automatically…"
              : applications.length === 0
                ? 'No candidates yet. Upload resumes or click "Run triage" to start.'
                : `No candidates in the "${FILTER_OPTIONS.find((f) => f.key === activeFilter)?.label}" tier.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((app) => (
            <CandidateCard
              key={app.id}
              app={app}
              onTierChange={handleTierChange}
            />
          ))}
        </div>
      )}
    </main>
  );
}
