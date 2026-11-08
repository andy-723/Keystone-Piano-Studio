export type EmailAttachment = {
  filename: string;
  /** Raw bytes or base64 string. */
  content: Uint8Array | string;
  contentType?: string;
};

export type SendEmailInput = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  tags?: { name: string; value: string }[];
  attachments?: EmailAttachment[];
};

export type SendEmailResult = { id: string };

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
