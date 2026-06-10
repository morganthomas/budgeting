import sgMail from '@sendgrid/mail';

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  const from = process.env.EMAIL_FROM || 'noreply@example.com';

  await sgMail.send({
    to,
    from,
    subject: 'Reset your password',
    text: `Click the link below to reset your password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    html: `<p>Click the link below to reset your password. It expires in 1 hour.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you did not request this, ignore this email.</p>`,
  });
}
