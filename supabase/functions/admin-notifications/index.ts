import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EMAIL_FROM = "Ɛdan <onboarding@resend.dev>";
const ADMIN_TO = "huangnehemiah10@gmail.com";
const ADMIN_CC = "hiba@edan.studio";

const PRACTICE_LABELS: Record<string, string> = {
  researcher: "Researcher",
  creative: "Creative",
  spatial_practitioner: "Spatial practitioner",
  collective: "Collective",
  student: "Student",
  partner_institution: "Partner institution",
  other: "Other",
};

const BASED_LABELS: Record<string, string> = {
  accra: "Accra",
  passing_through: "Passing through",
};

const TIER_LABELS: Record<string, string> = {
  monthly: "Monthly affiliate (GH₵ 1,000 / month)",
  annual: "Annual affiliate (GH₵ 8,000 / year)",
};

type Email = { to: string[]; cc: string[]; subject: string; html: string; text: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safe(value: string | null | undefined): string {
  return value ?? "";
}

function emailShell(title: string, bodyHtml: string): string {
  return `
<div style="background:#F2EAD9;padding:24px 12px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;background:#FFFFFF;border-radius:12px;overflow:hidden">
    <div style="background:#DDB29A;padding:24px 28px">
      <div style="font-size:28px;font-weight:700;color:#2B2118">Ɛdan</div>
      <div style="font-size:14px;color:#2B2118;margin-top:2px">${escapeHtml(title)}</div>
    </div>
    <div style="padding:28px">
      ${bodyHtml}
    </div>
    <div style="padding:0 28px 24px">
      <p style="margin:0;font-size:12px;line-height:1.5;color:#A89880">This is an automated notification from the Ɛdan website dashboard.</p>
    </div>
  </div>
</div>`;
}

function detailTable(rows: [string, string][]): string {
  return `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:15px;margin-top:8px">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 16px;color:#6B5E50;border-bottom:1px solid #E8DCC8;width:40%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 16px;color:#2B2118;font-weight:600;border-bottom:1px solid #E8DCC8;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join("")}</table>`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function formatMoney(amount: number): string {
  return `GH₵ ${amount.toLocaleString("en-GB")}`;
}

async function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase not configured");
  return { client: createClient(url, key, { auth: { persistSession: false } }), url };
}

async function sendEmail(email: Email) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) throw new Error("RESEND_API_KEY not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: email.to, cc: email.cc, subject: email.subject, html: email.html, text: email.text }),
  });
  if (!response.ok) throw new Error(`Resend failed (${response.status})`);
}

async function hasNotified(client: ReturnType<typeof createClient>, type: string, refId: string): Promise<boolean> {
  const { data } = await client.from("notification_log").select("id").eq("notification_type", type).eq("ref_id", refId).limit(1);
  return (data?.length ?? 0) > 0;
}

async function markNotified(client: ReturnType<typeof createClient>, type: string, refId: string) {
  await client.from("notification_log").insert({ notification_type: type, ref_id: refId }).then(() => {});
}

async function hasReminded(client: ReturnType<typeof createClient>, type: string, date: string): Promise<boolean> {
  const { data } = await client.from("reminder_log").select("id").eq("reminder_type", type).eq("reminder_date", date).limit(1);
  return (data?.length ?? 0) > 0;
}

async function markReminded(client: ReturnType<typeof createClient>, type: string, date: string) {
  try {
    await client.from("reminder_log").insert({ reminder_type: type, reminder_date: date });
  } catch {
    // unique constraint — already reminded today
  }
}

// ── Signup notification ──
function buildSignupEmail(user: { id: string; email: string; full_name: string; created_at: string }): Email {
  const rows: [string, string][] = [
    ["Full name", safe(user.full_name)],
    ["Email", safe(user.email)],
    ["Account ID", safe(user.id)],
    ["Registered", formatDateTime(user.created_at)],
  ];
  const subject = `New account signup — ${user.full_name || user.email}`;
  const text = `A new account has been registered on the Ɛdan website.\n\n${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}`;
  const html = emailShell(
    "New account signup",
    `<p style="margin:0 0 8px;font-size:16px;color:#2B2118">A new account has been registered.</p>${detailTable(rows)}`,
  );
  return { to: [ADMIN_TO], cc: [ADMIN_CC], subject, html, text };
}

// ── Affiliate application notification ──
function buildApplicationEmail(app: {
  full_name: string;
  applicant_email: string;
  phone: string;
  practice_type: string;
  based_in: string;
  membership_tier: string;
  about_work: string;
  submitted_at: string;
  created_at: string;
}): Email {
  const rows: [string, string][] = [
    ["Full name", safe(app.full_name)],
    ["Email", safe(app.applicant_email)],
    ["Phone", safe(app.phone)],
    ["Practice", PRACTICE_LABELS[app.practice_type] ?? safe(app.practice_type)],
    ["Based in", BASED_LABELS[app.based_in] ?? safe(app.based_in)],
    ["Membership", TIER_LABELS[app.membership_tier] ?? safe(app.membership_tier)],
    ["Submitted", formatDate(app.submitted_at)],
  ];
  const subject = `New affiliate application — ${app.full_name || app.applicant_email}`;
  const text = `A new affiliate application has been submitted.\n\n${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}\n\nAbout their work:\n${app.about_work ?? ""}`;
  const html = emailShell(
    "New affiliate application",
    `<p style="margin:0 0 8px;font-size:16px;color:#2B2118">A new affiliate application has been submitted.</p>${detailTable(rows)}<p style="margin:20px 0 8px;font-size:14px;font-weight:700;color:#2B2118">About their work</p><p style="margin:0;font-size:14px;line-height:1.6;color:#2B2118;white-space:pre-wrap">${escapeHtml(safe(app.about_work))}</p>`,
  );
  return { to: [ADMIN_TO], cc: [ADMIN_CC], subject, html, text };
}

// ── Booking notification (full admin-view details) ──
function buildBookingEmail(booking: {
  booking_reference: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  room_name: string;
  check_in: string;
  check_out: string;
  guests: number;
  breakfast_included: boolean;
  nightly_rate_ghs: number;
  total_ghs: number;
  status: string;
  source: string;
  notes: string;
  checked_in_at: string | null;
}): Email {
  const checkIn = new Date(booking.check_in + "T00:00:00");
  const checkOut = new Date(booking.check_out + "T00:00:00");
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);
  const statusLabels: Record<string, string> = {
    pending_payment: "Pending payment",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    payment_failed: "Payment failed",
  };
  const rows: [string, string][] = [
    ["Reference", safe(booking.booking_reference)],
    ["Status", statusLabels[booking.status] ?? safe(booking.status)],
    ["Room", safe(booking.room_name)],
    ["Check-in", formatDate(booking.check_in)],
    ["Check-out", formatDate(booking.check_out)],
    ["Nights", String(nights)],
    ["Guests", String(booking.guests)],
    ["Rate", `${booking.breakfast_included ? "With breakfast" : "Room only"} (${formatMoney(booking.nightly_rate_ghs)} / night)`],
    ["Total", formatMoney(booking.total_ghs)],
    ["Payment source", booking.source === "manual" ? "Manual booking (not linked to Paystack)" : "Online booking (Paystack)"],
    ["Guest name", safe(booking.guest_name)],
    ["Email", safe(booking.guest_email)],
    ["Phone", safe(booking.guest_phone)],
  ];
  if (booking.checked_in_at) {
    rows.push(["Checked in", formatDateTime(booking.checked_in_at)]);
  }
  if (booking.notes) {
    rows.push(["Notes", safe(booking.notes)]);
  }
  const subject = `New stay booking — ${booking.booking_reference} — ${booking.guest_name}`;
  const text = `A new stay booking has been created.\n\n${rows.map(([l, v]) => `${l}: ${v}`).join("\n")}`;
  const html = emailShell(
    "New stay booking",
    `<p style="margin:0 0 8px;font-size:16px;color:#2B2118">A new stay booking has been created.</p>${detailTable(rows)}`,
  );
  return { to: [ADMIN_TO], cc: [ADMIN_CC], subject, html, text };
}

// ── Approval notification (to applicant with payment link) ──
function buildApprovalEmail(app: {
  full_name: string;
  applicant_email: string;
  membership_tier: string;
  site_url: string;
}): Email {
  const tierLabel = TIER_LABELS[app.membership_tier] ?? safe(app.membership_tier);
  const paymentUrl = `${app.site_url}/members/`;
  const subject = "Your Ɛdan membership has been approved";
  const text = `Hi ${app.full_name},\n\nYour Ɛdan membership application has been approved.\n\nMembership: ${tierLabel}\n\nTo complete your membership, please pay by visiting:\n${paymentUrl}\n\nWith thanks,\nThe Ɛdan team`;
  const html = emailShell(
    "Membership approved",
    `<p style="margin:0 0 12px;font-size:16px;color:#2B2118">Hi ${escapeHtml(safe(app.full_name))},</p><p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#2B2118">Your Ɛdan membership application has been approved.</p>${detailTable([["Membership", tierLabel]])}<p style="margin:24px 0 12px;font-size:16px;line-height:1.5;color:#2B2118">To complete your membership, please pay by clicking the link below:</p><p style="margin:0 0 24px"><a href="${escapeHtml(paymentUrl)}" style="display:inline-block;padding:12px 28px;background:#DDB29A;color:#2B2118;text-decoration:none;font-weight:700;border-radius:6px;font-size:15px">Pay for your membership</a></p><p style="margin:0;font-size:14px;color:#6B5E50">With thanks,<br>The Ɛdan team</p>`,
  );
  return { to: [app.applicant_email], cc: [], subject, html, text };
}

// ── Daily reminder email ──
function buildReminderEmail(digest: {
  pending_applications: unknown[];
  expired_memberships: unknown[];
  upcoming_block_ends: unknown[];
}): Email {
  const sections: string[] = [];
  const textParts: string[] = [];

  type PendingApp = {
    full_name: string;
    applicant_email: string;
    phone: string;
    practice_type: string;
    based_in: string;
    membership_tier: string;
    submitted_at: string;
  };
  if (digest.pending_applications.length > 0) {
    const apps = digest.pending_applications as PendingApp[];
    const rows = apps.map((a) => {
      const r: [string, string][] = [
        ["Name", safe(a.full_name)],
        ["Email", safe(a.applicant_email)],
        ["Phone", safe(a.phone)],
        ["Membership", TIER_LABELS[a.membership_tier] ?? safe(a.membership_tier)],
        ["Submitted", formatDate(a.submitted_at)],
      ];
      return detailTable(rows);
    });
    sections.push(
      `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#2B2118">Pending applications awaiting review (${apps.length})</p>${rows.join('<div style="height:16px"></div>')}`,
    );
    textParts.push(`Pending applications (${apps.length}):\n${apps.map((a) => `  - ${a.full_name} (${a.applicant_email}) — ${TIER_LABELS[a.membership_tier] ?? a.membership_tier}`).join("\n")}`);
  }

  type ExpiredM = {
    member_email: string;
    membership_tier: string;
    membership_status: string;
    expires_at: string;
  };
  if (digest.expired_memberships.length > 0) {
    const mems = digest.expired_memberships as ExpiredM[];
    const expiredRows: [string, string][] = [];
    mems.forEach((member) => {
      expiredRows.push(
        ["Email", safe(member.member_email)],
        ["Tier", safe(member.membership_tier)],
        ["Status", "Expired"],
        ["Expires", formatDate(member.expires_at)],
      );
    });
    sections.push(
      `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#2B2118">Expired memberships (${mems.length})</p>${detailTable(expiredRows)}`,
    );
    textParts.push(`Expired memberships (${mems.length}):\n${mems.map((m) => `  - ${m.member_email} — expired ${formatDate(m.expires_at)}`).join("\n")}`);
  }

  type Block = {
    room_name: string;
    starts_on: string;
    ends_on: string;
    reason: string;
  };
  if (digest.upcoming_block_ends.length > 0) {
    const blocks = digest.upcoming_block_ends as Block[];
    const blockRows: [string, string][] = [];
    blocks.forEach((block) => {
      blockRows.push(
        ["Room", safe(block.room_name)],
        ["From", formatDate(block.starts_on)],
        ["Until (first day free)", formatDate(block.ends_on)],
        ["Reason", safe(block.reason)],
      );
    });
    sections.push(
      `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#2B2118">Blocked dates ending soon (${blocks.length})</p>${detailTable(blockRows)}`,
    );
    textParts.push(`Blocked dates ending soon (${blocks.length}):\n${blocks.map((b) => `  - ${b.room_name}: ${formatDate(b.starts_on)} to ${formatDate(b.ends_on)}`).join("\n")}`);
  }

  const hasContent = sections.length > 0;
  const bodyHtml = hasContent
    ? sections.join('<div style="height:24px"></div>')
    : `<p style="margin:0;font-size:16px;color:#2B2118">No pending items today. Everything is up to date.</p>`;
  const subject = hasContent ? "Ɛdan daily summary — action needed" : "Ɛdan daily summary — all clear";
  const text = hasContent ? textParts.join("\n\n") : "No pending items today. Everything is up to date.";

  return { to: [ADMIN_TO], cc: [ADMIN_CC], subject, html: emailShell("Daily summary", bodyHtml), text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { client, url } = await getAdminClient();

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine for daily reminder
    }

    const type = (body.type as string) ?? "";
    const accessToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!accessToken) return json({ error: "Sign in required" }, 401);

    const { data: callerData, error: callerError } = await client.auth.getUser(accessToken);
    if (callerError || !callerData.user) return json({ error: "Sign in required" }, 401);
    const callerId = callerData.user.id;

    const { data: callerAdmin } = await client.from("admins").select("user_id").eq("user_id", callerId).maybeSingle();
    const callerIsAdmin = Boolean(callerAdmin);

    // ── Daily reminder ──
    if (type === "daily_reminder") {
      if (!callerIsAdmin) return json({ error: "Admin access required" }, 403);

      const today = new Date().toISOString().slice(0, 10);
      const reminderType = "daily_digest";

      if (await hasReminded(client, reminderType, today)) {
        return json({ sent: false, reason: "already_sent_today" });
      }

      // Fetch digest using the user's token (for is_edan_admin check)
      const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false },
      });
      const { data: digest, error: digestError } = await userClient.rpc("get_daily_admin_digest");
      if (digestError) {
        return json({ error: digestError.message }, 500);
      }

      await sendEmail(buildReminderEmail(digest));
      await markReminded(client, reminderType, today);
      return json({ sent: true, digest });
    }

    // ── Signup notification ──
    if (type === "signup") {
      const userId = body.user_id as string;
      if (!userId) return json({ error: "user_id required" }, 400);
      if (userId !== callerId && !callerIsAdmin) return json({ error: "Not authorised" }, 403);

      if (await hasNotified(client, "signup", userId)) {
        return json({ sent: false, reason: "already_sent" });
      }

      const { data: user, error } = await client.auth.admin.getUserById(userId);
      if (error || !user.user) return json({ error: "User not found" }, 404);

      const u = user.user;
      const email = buildSignupEmail({
        id: u.id,
        email: u.email ?? "",
        full_name: (u.user_metadata?.full_name as string) ?? "",
        created_at: u.created_at,
      });
      await sendEmail(email);
      await markNotified(client, "signup", userId);
      return json({ sent: true });
    }

    // ── Application notification ──
    if (type === "application") {
      const appId = body.application_id as string;
      if (!appId) return json({ error: "application_id required" }, 400);

      if (await hasNotified(client, "application", appId)) {
        return json({ sent: false, reason: "already_sent" });
      }

      const { data: app, error } = await client
        .from("membership_applications")
        .select("full_name,applicant_email,phone,practice_type,based_in,membership_tier,about_work,submitted_at,created_at")
        .eq("id", appId)
        .maybeSingle();
      if (error || !app) return json({ error: "Application not found" }, 404);
      const { data: appOwner } = await client.from("membership_applications").select("user_id").eq("id", appId).maybeSingle();
      if (!callerIsAdmin && appOwner?.user_id !== callerId) return json({ error: "Not authorised" }, 403);

      await sendEmail(buildApplicationEmail(app));
      await markNotified(client, "application", appId);
      return json({ sent: true });
    }

    // ── Booking notification ──
    if (type === "booking") {
      const bookingId = body.booking_id as string;
      if (!bookingId) return json({ error: "booking_id required" }, 400);

      if (await hasNotified(client, "booking", bookingId)) {
        return json({ sent: false, reason: "already_sent" });
      }

      const { data: booking, error } = await client
        .from("stay_bookings")
        .select("booking_reference,guest_name,guest_email,guest_phone,check_in,check_out,guests,breakfast_included,nightly_rate_ghs,total_ghs,status,source,notes,checked_in_at,stay_rooms(name)")
        .eq("id", bookingId)
        .maybeSingle();
      if (error || !booking) return json({ error: "Booking not found" }, 404);
      const { data: bookingOwner } = await client.from("stay_bookings").select("user_id").eq("id", bookingId).maybeSingle();
      if (!callerIsAdmin && bookingOwner?.user_id !== callerId) return json({ error: "Not authorised" }, 403);

      const flat = { ...booking, room_name: booking.stay_rooms?.name ?? "—" };
      await sendEmail(buildBookingEmail(flat));
      await markNotified(client, "booking", bookingId);
      return json({ sent: true });
    }

    // ── Approval notification (to applicant) ──
    if (type === "approval") {
      if (!callerIsAdmin) return json({ error: "Admin access required" }, 403);
      const appId = body.application_id as string;
      if (!appId) return json({ error: "application_id required" }, 400);

      if (await hasNotified(client, "approval", appId)) {
        return json({ sent: false, reason: "already_sent" });
      }

      const { data: app, error } = await client
        .from("membership_applications")
        .select("full_name,applicant_email,membership_tier")
        .eq("id", appId)
        .maybeSingle();
      if (error || !app) return json({ error: "Application not found" }, 404);

      const siteUrl = (body.site_url as string) ?? Deno.env.get("SITE_URL") ?? "https://edan.studio";
      await sendEmail(buildApprovalEmail({ ...app, site_url: siteUrl }));
      await markNotified(client, "approval", appId);
      return json({ sent: true });
    }

    return json({ error: "Unknown notification type. Use: signup, application, booking, approval, daily_reminder" }, 400);
  } catch (error) {
    console.error("admin-notifications failed:", error instanceof Error ? error.message : error);
    return json({ error: "Notification failed" }, 500);
  }
});
