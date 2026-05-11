import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseOrgId } from "@/lib/getSupabaseOrgId";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const supabase = await createClient();

    const supabaseOrgId = await getSupabaseOrgId(supabase, orgId);
    if (!supabaseOrgId) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { data } = await supabase
      .from("referrals")
      .select("id, status, candidate_id, req_id, to_recruiter_id")
      .eq("id", id)
      .eq("org_id", supabaseOrgId)
      .single();

    if (!data) {
      return NextResponse.json({ error: "Referral not found" }, { status: 404 });
    }

    return NextResponse.json({ referral: data });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
