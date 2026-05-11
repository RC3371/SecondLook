import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseOrgId } from "@/lib/getSupabaseOrgId";
import { referralSendSchema } from "@/lib/validation/inputValidation";

export async function POST(req: NextRequest) {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = referralSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid referral payload" }, { status: 400 });
  }

  const { candidate_id, req_id, to_recruiter_id } = parsed.data;

  try {
    const supabase = await createClient();

    const supabaseOrgId = await getSupabaseOrgId(supabase, orgId);
    if (!supabaseOrgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { data: sender } = await supabase
      .from("recruiters")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("org_id", supabaseOrgId)
      .single();

    if (!sender) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: targetRecruiter } = await supabase
      .from("recruiters")
      .select("id")
      .eq("id", to_recruiter_id)
      .eq("org_id", supabaseOrgId)
      .single();

    if (!targetRecruiter) {
      return NextResponse.json(
        { error: "Cross-org referrals are not allowed" },
        { status: 400 }
      );
    }

    const { data: reqRecord } = await supabase
      .from("requisitions")
      .select("id")
      .eq("id", req_id)
      .eq("org_id", supabaseOrgId)
      .single();

    if (!reqRecord) {
      return NextResponse.json({ error: "Requisition not found" }, { status: 404 });
    }

    const { data: candidateRecord } = await supabase
      .from("candidates")
      .select("id")
      .eq("id", candidate_id)
      .eq("req_id", req_id)
      .single();

    if (!candidateRecord) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const { error } = await supabase.from("referrals").insert({
      org_id: supabaseOrgId,
      from_recruiter_id: (sender as { id: string }).id,
      to_recruiter_id,
      req_id,
      candidate_id,
      status: "pending",
    });

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
