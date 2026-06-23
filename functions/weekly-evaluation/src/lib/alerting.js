export async function sendAlert({ subject, body }) {
  // Option A: Appwrite email (via a messaging integration)
  // Option B: write to an `alerts` collection and poll from an ops dashboard
  // Option C: POST to a webhook (Slack, PagerDuty, etc.)

  // Implementation shown for webhook — swap for your alerting provider
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('ALERT_WEBHOOK_URL not set — alert not sent:', subject);
    console.error(`Body: \n${body}`);
    return;
  }

  await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${subject}*\n\`\`\`${body}\`\`\`` }),
  });
}
