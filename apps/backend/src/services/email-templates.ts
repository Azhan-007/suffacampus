/**
 * Email templates â€” pre-built HTML emails for subscription lifecycle,
 * fee reminders, and system events.
 *
 * Each template returns `{ subject, html, text }` ready for sendEmail().
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 32px; margin-bottom: 32px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .header { background: #1a73e8; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; }
    .body { padding: 32px; color: #333; line-height: 1.6; font-size: 15px; }
    .body h2 { font-size: 18px; color: #1a73e8; margin-top: 0; }
    .cta { display: inline-block; background: #1a73e8; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; margin: 16px 0; }
    .footer { padding: 16px 32px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
    .highlight { background: #e8f0fe; padding: 16px; border-radius: 6px; margin: 16px 0; }
    .highlight strong { color: #1a73e8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>SuffaCampus</h1></div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} SuffaCampus. All rights reserved.<br/>
      You received this email because you are a registered administrator.
    </div>
  </div>
</body>
</html>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Subscription templates
// ---------------------------------------------------------------------------

export function trialExpiringEmail(schoolName: string, daysLeft: number) {
  const subject = `â° Your SuffaCampus trial expires in ${daysLeft} day(s)`;
  const html = layout(subject, `
    <h2>Trial Expiring Soon</h2>
    <p>Hi ${schoolName} Admin,</p>
    <p>Your free trial expires in <strong>${daysLeft} day(s)</strong>. After that, your account will be limited to the Free plan.</p>
    <div class="highlight">
      <strong>Don't lose access</strong> â€” upgrade now to keep using all features including reports, timetable, library, and more.
    </div>
    <a href="https://app.SuffaCampus.in/pricing" class="cta">Upgrade Now</a>
    <p>If you have questions, reply to this email â€” we're here to help.</p>
  `);
  return { subject, html, text: stripHtml(html) };
}

export function subscriptionExpiredEmail(schoolName: string) {
  const subject = `ðŸ”’ Your SuffaCampus subscription has expired`;
  const html = layout(subject, `
    <h2>Subscription Expired</h2>
    <p>Hi ${schoolName} Admin,</p>
    <p>Your subscription has expired. Your data is safe, but premium features are now locked.</p>
    <div class="highlight">
      <strong>Your data will be retained for 90 days.</strong> Renew anytime to restore full access instantly.
    </div>
    <a href="https://app.SuffaCampus.in/pricing" class="cta">Renew Subscription</a>
  `);
  return { subject, html, text: stripHtml(html) };
}

export function paymentReceivedEmail(
  schoolName: string,
  plan: string,
  amountPaise: number,
  periodEnd: string
) {
  const amount = `â‚¹${(amountPaise / 100).toFixed(2)}`;
  const subject = `âœ… Payment received â€” ${plan} plan active`;
  const html = layout(subject, `
    <h2>Payment Confirmed</h2>
    <p>Hi ${schoolName} Admin,</p>
    <p>We've received your payment of <strong>${amount}</strong>. Your <strong>${plan}</strong> plan is now active.</p>
    <div class="highlight">
      <strong>Next billing date:</strong> ${periodEnd}
    </div>
    <a href="https://app.SuffaCampus.in/settings/subscription" class="cta">View Subscription</a>
    <p>Thank you for choosing SuffaCampus!</p>
  `);
  return { subject, html, text: stripHtml(html) };
}

export function paymentFailedEmail(schoolName: string, retryCount: number) {
  const subject = `WARNING: Payment failed â€” action required`;
  const html = layout(subject, `
    <h2>Payment Failed</h2>
    <p>Hi ${schoolName} Admin,</p>
    <p>We were unable to process your subscription payment. This is attempt <strong>#${retryCount}</strong>.</p>
    <div class="highlight">
      <strong>What happens next?</strong><br/>
      We'll retry automatically. If payment continues to fail, your subscription will be moved to past-due status after 3 attempts, and expired after 7 days.
    </div>
    <a href="https://app.SuffaCampus.in/settings/subscription" class="cta">Update Payment Method</a>
    <p>Need help? Reply to this email.</p>
  `);
  return { subject, html, text: stripHtml(html) };
}

export function planChangedEmail(
  schoolName: string,
  oldPlan: string,
  newPlan: string,
  isUpgrade: boolean,
  effectiveDate: string
) {
  const direction = isUpgrade ? "Upgraded" : "Downgraded";
  const subject = `ðŸ“‹ Plan ${direction.toLowerCase()} â€” ${oldPlan} â†’ ${newPlan}`;
  const html = layout(subject, `
    <h2>Plan ${direction}</h2>
    <p>Hi ${schoolName} Admin,</p>
    <p>Your plan has been ${direction.toLowerCase()} from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>.</p>
    <div class="highlight">
      <strong>Effective date:</strong> ${effectiveDate}<br/>
      ${isUpgrade ? "New features are available immediately." : "Current features will remain active until the effective date."}
    </div>
    <a href="https://app.SuffaCampus.in/settings/subscription" class="cta">View Details</a>
  `);
  return { subject, html, text: stripHtml(html) };
}

export function usageLimitWarningEmail(
  schoolName: string,
  resource: string,
  current: number,
  limit: number
) {
  const percentage = Math.round((current / limit) * 100);
  const subject = `WARNING: ${percentage}% of ${resource} limit used`;
  const html = layout(subject, `
    <h2>Usage Limit Warning</h2>
    <p>Hi ${schoolName} Admin,</p>
    <p>Your school has used <strong>${current}</strong> out of <strong>${limit}</strong> ${resource} (${percentage}%).</p>
    <div class="highlight">
      <strong>Running low on capacity.</strong> Consider upgrading your plan to increase limits.
    </div>
    <a href="https://app.SuffaCampus.in/pricing" class="cta">Upgrade Plan</a>
  `);
  return { subject, html, text: stripHtml(html) };
}

// ---------------------------------------------------------------------------
// Fee reminders
// ---------------------------------------------------------------------------

export function feeReminderEmail(
  parentEmail: string,
  studentName: string,
  schoolName: string,
  amountPaise: number,
  dueDate: string
) {
  const amount = `â‚¹${(amountPaise / 100).toFixed(2)}`;
  const subject = `ðŸ“„ Fee reminder for ${studentName} â€” ${amount} due ${dueDate}`;
  const html = layout(subject, `
    <h2>Fee Payment Reminder</h2>
    <p>Dear Parent/Guardian,</p>
    <p>This is a reminder that a fee of <strong>${amount}</strong> is due for <strong>${studentName}</strong> at <strong>${schoolName}</strong>.</p>
    <div class="highlight">
      <strong>Due date:</strong> ${dueDate}<br/>
      <strong>Amount:</strong> ${amount}
    </div>
    <p>Please ensure payment is made by the due date to avoid any late charges.</p>
    <p>Thank you,<br/>${schoolName}</p>
  `);
  return { subject, html, text: stripHtml(html) };
}

export function welcomeEmail(schoolName: string, adminName: string) {
  const subject = `ðŸŽ‰ Welcome to SuffaCampus!`;
  const html = layout(subject, `
    <h2>Welcome Aboard!</h2>
    <p>Hi ${adminName},</p>
    <p>Your school <strong>${schoolName}</strong> has been set up on SuffaCampus. You're all set to start managing your institution.</p>
    <div class="highlight">
      <strong>Quick start:</strong>
      <ul style="margin: 8px 0; padding-left: 20px;">
        <li>Add your teachers and students</li>
        <li>Configure classes and timetable</li>
        <li>Set up fee structures</li>
        <li>Customize your school branding</li>
      </ul>
    </div>
    <a href="https://app.SuffaCampus.in/dashboard" class="cta">Go to Dashboard</a>
    <p>Your 14-day free trial includes all features. Explore everything!</p>
  `);
  return { subject, html, text: stripHtml(html) };
}

