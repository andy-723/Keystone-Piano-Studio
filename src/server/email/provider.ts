export type SendEmailInput = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  tags?: { name: string; value: string }[];
};

export type SendEmailResult = { id: string };

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
