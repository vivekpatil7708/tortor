export function renderResetEmail({ resetLink, businessName }: { resetLink: string; businessName: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;border:1px solid rgba(255,255,255,0.6);padding:40px;">
      <tr><td style="text-align:center;padding-bottom:8px;">
        <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMzAiIGhlaWdodD0iMzYiIHZpZXdCb3g9IjAgMCAxMzAgMzYiPjx0ZXh0IHg9IjAiIHk9IjI2IiBmb250LWZhbWlseT0iLWFwcGxlLXN5c3RlbSxCbGlua01hY1N5c3RlbUZvbnQsU2Vnb2UgVUksc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZm9udC13ZWlnaHQ9IjgwMCIgbGV0dGVyLXNwYWNpbmc9Ii0wLjAzZW0iIGZpbGw9IiMyYzJjMmMiPlRvcm88dHNwYW4gZmlsbD0iIzdiYjg2YyI+UGF5PC90c3Bhbj48L3RleHQ+PC9zdmc+" width="130" height="36" alt="ToroPay" style="display:block;margin:0 auto;" />
      </td></tr>
      <tr><td style="padding-bottom:24px;text-align:center;">
        <h1 style="font-size:20px;font-weight:700;color:#2c2c2c;margin:0;">Reset your password</h1>
      </td></tr>
      <tr><td style="padding-bottom:16px;color:#6b7280;font-size:14px;line-height:1.6;">
        Hi${businessName ? ` ${businessName}` : ''},
      </td></tr>
      <tr><td style="padding-bottom:16px;color:#6b7280;font-size:14px;line-height:1.6;">
        We received a request to reset your ToroPay account password. Click the button below to set a new password. This link expires in 1 hour.
      </td></tr>
      <tr><td style="padding:16px 0 24px;text-align:center;">
        <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#2c2c2c;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Reset password</a>
      </td></tr>
      <tr><td style="padding-bottom:16px;color:#9ca3af;font-size:12px;line-height:1.5;">
        If you didn't request this, you can safely ignore this email. Your password won't change unless you click the link above.
      </td></tr>
      <tr><td style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:12px;text-align:center;">
        ToroPay — Built for Indian businesses
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`
}
