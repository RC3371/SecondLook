// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Module mocks (hoisted) ─────────────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({
  useOrganization: vi.fn(() => ({ organization: { id: "org-1" } })),
  useUser: vi.fn(() => ({ user: { id: "user-1" } })),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

import { createClient } from "@/lib/supabase/client";
import TriagePage from "../[id]/TriagePage";
import type { Application, Req } from "../[id]/TriagePage";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const mockReq: Req = {
  id: "req-1",
  title: "Senior Software Engineer",
  criteria: {},
};

const mockApplications: Application[] = [
  {
    candidate_id: "cand-top",
    req_id: "req-1",
    org_id: "org-1",
    tier: "top",
    triage_reasoning: {
      matched: ["TypeScript", "5+ years experience"],
      missing: [],
      preferred_hits: ["GraphQL"],
      risk_flags: { keyword_stuffing: false, possible_ai_generated: false, prompt_injection: false, suspiciously_short: false },
      confidence: 0.95,
      summary: "Exceptional match across all criteria",
    },
    status: "pending",
    candidates: { id: "cand-top", name: "Alice Top", resume_text: "..." },
  },
  {
    candidate_id: "cand-strong",
    req_id: "req-1",
    org_id: "org-1",
    tier: "strong",
    triage_reasoning: {
      matched: ["TypeScript"],
      missing: [],
      preferred_hits: [],
      risk_flags: { keyword_stuffing: false, possible_ai_generated: false, prompt_injection: false, suspiciously_short: false },
      confidence: 0.8,
      summary: "Solid candidate, meets all requirements",
    },
    status: "pending",
    candidates: { id: "cand-strong", name: "Bob Strong", resume_text: "..." },
  },
  {
    candidate_id: "cand-review",
    req_id: "req-1",
    org_id: "org-1",
    tier: "review",
    triage_reasoning: {
      matched: [],
      missing: ["5+ years experience"],
      preferred_hits: [],
      risk_flags: { keyword_stuffing: false, possible_ai_generated: true, prompt_injection: false, suspiciously_short: false },
      confidence: 0.6,
      summary: "Needs closer review",
    },
    status: "pending",
    candidates: { id: "cand-review", name: "Charlie Review", resume_text: "..." },
  },
  {
    candidate_id: "cand-reject",
    req_id: "req-1",
    org_id: "org-1",
    tier: "auto_reject",
    triage_reasoning: {
      matched: [],
      missing: ["TypeScript", "5+ years experience"],
      preferred_hits: [],
      risk_flags: { keyword_stuffing: true, possible_ai_generated: false, prompt_injection: true, suspiciously_short: false },
      confidence: 0.9,
      summary: "Does not meet minimum requirements",
      pre_filter_reason: "Only 1 year of experience; role requires 5+",
    },
    status: "pending",
    candidates: { id: "cand-reject", name: "Diana Reject", resume_text: "..." },
  },
];

// ── Supabase mock state ────────────────────────────────────────────────────────

let mockChannelObj: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let mockChannel: ReturnType<typeof vi.fn>;
let mockRemoveChannel: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockUpdate: ReturnType<typeof vi.fn>;

function buildSupabaseMock() {
  mockChannelObj = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  mockChannel = vi.fn().mockReturnValue(mockChannelObj);
  mockRemoveChannel = vi.fn();

  // applications update chain: .update().eq().eq() → resolves
  const mockUpdateEq2 = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockUpdateEq1 = vi.fn().mockReturnValue({ eq: mockUpdateEq2 });
  mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq1 });

  // candidates select chain: .select().eq() → resolves with candidates
  const mockCandidatesEq = vi.fn().mockResolvedValue({
    data: [{ id: "c1", resume_text: "resume text" }],
    error: null,
  });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockCandidatesEq });

  mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "candidates") return { select: mockSelect };
    return { update: mockUpdate };
  });

  vi.mocked(createClient).mockReturnValue({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    from: mockFrom,
  } as never);
}

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  buildSupabaseMock();
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ processed: 1, failed: 0 }), { status: 200 })
  );
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderPage(apps = mockApplications) {
  return render(<TriagePage req={mockReq} initialApplications={apps} />);
}

function getCards() {
  return document.querySelectorAll("[data-slot='card']");
}

// ── Rendering ──────────────────────────────────────────────────────────────────

describe("rendering", () => {
  it("shows tier summary bar with correct counts for each tier", () => {
    renderPage();

    // Accessible names concatenate label + count span without space: "Top1", "Review1", etc.
    expect(screen.getByRole("button", { name: /^Top1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Strong1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Review1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Auto-Reject1$/ })).toBeInTheDocument();
  });

  it("default view shows only Top and Strong candidates (2 cards)", () => {
    renderPage();
    expect(getCards()).toHaveLength(2);
    expect(screen.getByText("Alice Top")).toBeInTheDocument();
    expect(screen.getByText("Bob Strong")).toBeInTheDocument();
    expect(screen.queryByText("Charlie Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Diana Reject")).not.toBeInTheDocument();
  });

  it("clicking Review filter shows only review candidates", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Review1$/ }));

    expect(getCards()).toHaveLength(1);
    expect(screen.getByText("Charlie Review")).toBeInTheDocument();
    expect(screen.queryByText("Alice Top")).not.toBeInTheDocument();
  });

  it("clicking Auto-Reject filter shows auto-rejected candidates", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Auto-Reject1$/ }));

    expect(getCards()).toHaveLength(1);
    expect(screen.getByText("Diana Reject")).toBeInTheDocument();
    expect(screen.queryByText("Alice Top")).not.toBeInTheDocument();
  });

  it("clicking the active filter or Top & Strong resets to default view", async () => {
    renderPage();

    // Switch away from default
    await userEvent.click(screen.getByRole("button", { name: /^Review1$/ }));
    expect(getCards()).toHaveLength(1);

    // Click Top & Strong to return to default
    await userEvent.click(screen.getByRole("button", { name: /Top & Strong/ }));
    expect(getCards()).toHaveLength(2);
    expect(screen.getByText("Alice Top")).toBeInTheDocument();
    expect(screen.getByText("Bob Strong")).toBeInTheDocument();
  });
});

// ── Candidate card ─────────────────────────────────────────────────────────────

describe("candidate card", () => {
  it("top tier card has green badge", () => {
    renderPage();
    const aliceCard = screen.getByText("Alice Top").closest("[data-slot='card']")!;
    const badge = within(aliceCard as HTMLElement).getByText("Top", { selector: "[data-slot='badge']" });
    expect(badge).toHaveClass("bg-emerald-100");
  });

  it("strong tier card has blue badge", () => {
    renderPage();
    const bobCard = screen.getByText("Bob Strong").closest("[data-slot='card']")!;
    const badge = within(bobCard as HTMLElement).getByText("Strong", { selector: "[data-slot='badge']" });
    expect(badge).toHaveClass("bg-blue-100");
  });

  it("review tier card has yellow badge", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Review1$/ }));
    const charlieCard = screen.getByText("Charlie Review").closest("[data-slot='card']")!;
    const badge = within(charlieCard as HTMLElement).getByText("Review", { selector: "[data-slot='badge']" });
    expect(badge).toHaveClass("bg-amber-100");
  });

  it("auto-reject card has red badge", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Auto-Reject1$/ }));
    const dianaCard = screen.getByText("Diana Reject").closest("[data-slot='card']")!;
    const badge = within(dianaCard as HTMLElement).getByText("Auto-Reject", { selector: "[data-slot='badge']" });
    expect(badge).toHaveClass("bg-red-100");
  });

  it("matched skills render as green pills with check mark", () => {
    renderPage();
    const aliceCard = screen.getByText("Alice Top").closest("[data-slot='card']")!;
    const tsPill = within(aliceCard as HTMLElement).getByText(/✓ TypeScript/);
    expect(tsPill).toHaveClass("bg-emerald-100");
  });

  it("missing requirements render as red pills with cross mark", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Review1$/ }));
    const charlieCard = screen.getByText("Charlie Review").closest("[data-slot='card']")!;
    const missingPill = within(charlieCard as HTMLElement).getByText(/✗ 5\+ years experience/);
    expect(missingPill).toHaveClass("bg-red-100");
  });

  it("risk flags render as labelled warning icons", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Auto-Reject1$/ }));

    // Diana Reject has keyword_stuffing and prompt_injection flags
    expect(screen.getByRole("img", { name: "Keyword stuffing" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Prompt injection" })).toBeInTheDocument();
  });

  it("AI summary text is visible on each card", () => {
    renderPage();
    expect(screen.getByText(/Exceptional match across all criteria/)).toBeInTheDocument();
    expect(screen.getByText(/Solid candidate, meets all requirements/)).toBeInTheDocument();
  });

  it("confidence score is displayed on each card", () => {
    renderPage();
    // Alice: 95%, Bob: 80%
    expect(screen.getByText("95% confidence")).toBeInTheDocument();
    expect(screen.getByText("80% confidence")).toBeInTheDocument();
  });
});

// ── Interactions ───────────────────────────────────────────────────────────────

describe("interactions", () => {
  it("override tier dropdown changes the displayed tier badge", async () => {
    renderPage();

    // Switch to All so Alice stays visible after her tier changes
    await userEvent.click(screen.getByRole("button", { name: /^All\d/ }));

    // Find Alice's override select (currently "top")
    const aliceCard = screen.getByText("Alice Top").closest("[data-slot='card']")!;
    const select = within(aliceCard as HTMLElement).getByRole("combobox");

    // Change tier to "strong"
    await userEvent.selectOptions(select, "strong");

    // Alice's badge now shows "Strong"
    const badge = within(aliceCard as HTMLElement).getByText("Strong", { selector: "[data-slot='badge']" });
    expect(badge).toHaveClass("bg-blue-100");
  });

  it("recruiter note textarea saves to Supabase on blur", async () => {
    renderPage();

    const aliceCard = screen.getByText("Alice Top").closest("[data-slot='card']")!;
    const textarea = within(aliceCard as HTMLElement).getByPlaceholderText(/recruiter note/i);

    await userEvent.type(textarea, "Strong hire, fast-track to final round");
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ recruiter_note: "Strong hire, fast-track to final round" });
    });
  });

  it("Process resumes button shows loading state while in-flight", async () => {
    // Supabase candidates query never resolves — keeps handler suspended
    const mockCandidatesEq = vi.fn().mockReturnValue(new Promise(() => {}));
    const mockSelect = vi.fn().mockReturnValue({ eq: mockCandidatesEq });
    mockFrom.mockImplementation((table: string) => {
      if (table === "candidates") return { select: mockSelect };
      return { update: mockUpdate };
    });

    renderPage();

    const button = screen.getByRole("button", { name: /process resumes/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /processing/i })).toBeInTheDocument();
    });
    expect(button).toBeDisabled();
  });

  it("Refer to colleague button is present and clickable", async () => {
    renderPage();
    const aliceCard = screen.getByText("Alice Top").closest("[data-slot='card']")!;
    const referBtn = within(aliceCard as HTMLElement).getByRole("button", { name: /refer to colleague/i });

    expect(referBtn).toBeInTheDocument();
    // Clicking opens the dialog without errors
    await userEvent.click(referBtn);
    expect(screen.getByText(/refer candidate/i)).toBeInTheDocument();
  });
});

// ── Real-time ──────────────────────────────────────────────────────────────────

describe("real-time", () => {
  it("sets up a Supabase subscription scoped to the req on mount", () => {
    renderPage();

    expect(mockChannel).toHaveBeenCalledWith(`applications:req:${mockReq.id}`);
    expect(mockChannelObj.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ filter: `req_id=eq.${mockReq.id}` }),
      expect.any(Function)
    );
    expect(mockChannelObj.subscribe).toHaveBeenCalled();
  });

  it("removes the Supabase channel on unmount (no memory leak)", () => {
    const { unmount } = renderPage();
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledOnce();
  });
});
