import nodemailer from 'nodemailer';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const from = process.env.SMTP_FROM || 'Budget App <noreply@example.com>';
  const transport = createTransport();
  await transport.sendMail({
    from,
    to,
    subject: 'Reset your password',
    text: `Click the link below to reset your password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you did not request this, ignore this email.</p>`,
  });
}
