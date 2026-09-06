function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailTemplateInput {
  eventType: string;
  title: string;
  body: string;
  link?: string | null;
  appUrl?: string;
}

export function renderEmailHtml(input: EmailTemplateInput): string {
  const title = escapeHtml(input.title);
  const body = escapeHtml(input.body);
  const link = input.link ? `${input.appUrl ?? ''}${input.link}` : undefined;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 24px;">
      <tr>
        <td>
          <h2 style="margin-top: 0; color: #111827;">${title}</h2>
          <p style="white-space: pre-wrap;">${body}</p>
          ${link ? `<p><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 16px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 6px;">View in Teamspace</a></p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #6b7280;">You received this email because of your notification preferences.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
