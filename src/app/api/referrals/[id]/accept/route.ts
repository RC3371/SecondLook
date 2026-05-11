import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, context: RouteContext) {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const supabase = await createClient();

    const { data: recruiter } = await supabase
      .from("recruiters")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("org_id", orgId)
      .single();

    if (!recruiter) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: referral } = await supabase
      .from("referrals")
      .select("id, to_recruiter_id, status")
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (!referral) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if ((referral as { to_recruiter_id: string }).to_recruiter_id !== (recruiter as { id: string }).id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if ((referral as { status: string }).status !== "pending") {
      return NextResponse.json({ error: "Referral is not pending" }, { status: 400 });
    }

    const { error } = await supabase
      .from("referrals")
      .update({ status: "accepted" })
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
