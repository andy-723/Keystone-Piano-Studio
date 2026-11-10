/**
 * Heavy modules loaded only when a screen actually sends an email or renders a PDF.
 * A static import would put pdf-lib, the Resend SDK and the React Email renderer
 * (with prettier) into the first page bundle for everyone, admin and help pages included.
 */
export async function emailProvider() {
  const { getEmailProvider } = await import("@/server/email");
  return getEmailProvider();
}

export async function renderInvoicePdf(
  ...args: Parameters<typeof import("@/lib/invoice-pdf").renderInvoicePdf>
) {
  const mod = await import("@/lib/invoice-pdf");
  return mod.renderInvoicePdf(...args);
}

/** Invite/reminder templates plus the React Email renderer, loaded together on first send. */
export async function loadInviteEmails() {
  const [invite, reminder, { render }] = await Promise.all([
    import("@/emails/InviteEmail"),
    import("@/emails/ReminderEmail"),
    import("@react-email/components"),
  ]);
  return {
    ...invite,
    ...reminder,
    renderEmailHtml: (element: import("react").ReactElement) => render(element),
  };
}
