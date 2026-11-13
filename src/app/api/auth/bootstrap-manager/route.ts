import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// The route is server-side and cannot read the browser's language choice, so it
// returns a code and the client renders the matching bilingual message.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : ""

  if (!email || password.length < 6 || !fullName) {
    return NextResponse.json({ code: "incomplete", error: "اطلاعات مدیر کامل نیست." }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })

  if (countError) {
    return NextResponse.json(
      { code: "check_failed", error: "امکان بررسی وضعیت اولیه باشگاه وجود ندارد." },
      { status: 500 },
    )
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { code: "already_initialized", error: "باشگاه قبلاً راه‌اندازی شده است." },
      { status: 409 },
    )
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, requested_role: "manager" },
  })

  if (error || !data.user) {
    return NextResponse.json(
      { code: "create_failed", error: error?.message ?? "ثبت مدیر انجام نشد." },
      { status: 400 },
    )
  }

  return NextResponse.json({ userId: data.user.id })
}
