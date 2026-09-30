import { prisma } from "@/lib/db";

// Notification service (SRS §35): email + in-app. Transport is pluggable so a
// real SMTP/SMS provider can be added without touching call sites.

export interface NotifyParams {
  userId: string;
  subject?: string;
  body: string;
  channel?: "EMAIL" | "IN_APP";
}

async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  // Dev transport: log to server console. Replace with SMTP/Resend/etc. in production.
  console.log(`\n[notify:email] to=${to} subject="${subject}"\n${body}\n`);
  return true;
}

export async function notifyUser(params: NotifyParams) {
  const channel = params.channel ?? "EMAIL";
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      channel,
      subject: params.subject,
      body: params.body,
      status: "PENDING",
    },
  });

  if (channel === "EMAIL") {
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { email: true } });
    if (user) {
      const sent = await sendEmail(user.email, params.subject ?? "Notification", params.body);
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: sent ? "SENT" : "FAILED", sentAt: sent ? new Date() : null },
      });
    }
  } else {
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  }
  return notification;
}
