import { render } from "@react-email/components";
import { InviteEmail, invitePlainText, inviteSubject, type InviteEmailProps } from "./InviteEmail";
import {
  ReminderEmail,
  reminderPlainText,
  reminderSubject,
  type ReminderEmailProps,
} from "./ReminderEmail";

export async function renderInviteEmail(props: InviteEmailProps) {
  const html = await render(InviteEmail(props));
  return {
    subject: inviteSubject(props.language, props.teacherName, props.childNames),
    html,
    text: invitePlainText(props),
  };
}

export async function renderReminderEmail(props: ReminderEmailProps) {
  const html = await render(ReminderEmail(props));
  return {
    subject: reminderSubject(props.language, props.teacherName, props.childNames),
    html,
    text: reminderPlainText(props),
  };
}
