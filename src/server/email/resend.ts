import { Resend } from "resend";
import type { EmailProvider, SendEmailResult } from "./provider";
import { getServerEnv } from "../env";

export function createResendEmailProvider(): EmailProvider {
  return {
    async send(input) {
      const { resendApiKey } = getServerEnv();
      if (!resendApiKey) throw new Error("Missing required environment variable: RESEND_API_KEY");
      const resend = new Resend(resendApiKey);
      const result = await resend.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((attachment) => ({
                filename: attachment.filename,
                content:
                  typeof attachment.content === "string"
                    ? attachment.content
                    : Buffer.from(attachment.content),
                ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
              })),
            }
          : {}),
      });
      if (result.error) throw new Error(result.error.message);
      return { id: result.data?.id ?? crypto.randomUUID() } satisfies SendEmailResult;
    },
  };
}
