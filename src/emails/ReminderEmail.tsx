import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { Lang } from "@/mocks/types";

export type ReminderEmailProps = {
  language: Lang;
  teacherName: string;
  guardianFirstName: string;
  childNames: string;
  studioName: string;
  joinUrl: string;
  expiresLabel: string;
  day: 3 | 7;
  logoUrl?: string | null;
};

export function reminderSubject(language: Lang, teacherName: string, childNames: string) {
  return language === "zh-CN"
    ? `提醒：${teacherName} 邀请您为 ${childNames} 办理入学 · Keystone Music HQ`
    : `Reminder: ${teacherName} invited you to enrol ${childNames} · Keystone Music HQ`;
}

export function reminderPlainText(props: ReminderEmailProps) {
  const en = `Hi ${props.guardianFirstName}, just a reminder that ${props.teacherName} is waiting for ${props.childNames}'s enrolment for ${props.studioName}. It takes about 5 minutes.\n\nContinue: ${props.joinUrl}\nExpires: ${props.expiresLabel}`;
  const zh = `${props.guardianFirstName}您好，提醒您：${props.teacherName}仍在等待${props.childNames}完成${props.studioName}的入学登记。大约需要5分钟。\n\n继续: ${props.joinUrl}\n有效期至: ${props.expiresLabel}`;
  return props.language === "zh-CN" ? `${zh}\n\n---\n\n${en}` : `${en}\n\n---\n\n${zh}`;
}

export function ReminderEmail(props: ReminderEmailProps) {
  const primaryFirst = props.language === "zh-CN";
  const enBody = `Hi ${props.guardianFirstName}, just a reminder that ${props.teacherName} is waiting for ${props.childNames}'s enrolment for ${props.studioName}. It takes about 5 minutes.`;
  const zhBody = `${props.guardianFirstName}您好，提醒您：${props.teacherName}仍在等待${props.childNames}完成${props.studioName}的入学登记。大约需要5分钟。`;
  return (
    <Html>
      <Head />
      <Preview>{primaryFirst ? "入学登记提醒" : "Enrolment reminder"}</Preview>
      <Body style={{ backgroundColor: "#f7f3eb", fontFamily: "Georgia, serif", color: "#1c1917" }}>
        <Container style={{ margin: "0 auto", padding: "32px 20px", maxWidth: "560px" }}>
          {props.logoUrl ? (
            <img
              src={props.logoUrl}
              alt={props.studioName}
              width={120}
              style={{ marginBottom: 24 }}
            />
          ) : null}
          <Heading as="h1" style={{ fontSize: 24, margin: "0 0 16px" }}>
            {props.studioName}
          </Heading>
          <Text style={{ fontSize: 16, lineHeight: "1.5" }}>{primaryFirst ? zhBody : enBody}</Text>
          <Section style={{ margin: "28px 0" }}>
            <Button
              href={props.joinUrl}
              style={{
                backgroundColor: "#1c1917",
                color: "#fafaf9",
                padding: "14px 22px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 16,
              }}
            >
              {primaryFirst ? "开始入学登记" : "Start enrolment"}
            </Button>
          </Section>
          <Text style={{ fontSize: 14, color: "#57534e" }}>
            {primaryFirst ? `有效期至 ${props.expiresLabel}` : `Expires ${props.expiresLabel}`}
          </Text>
          <hr style={{ border: "none", borderTop: "1px solid #d6d3d1", margin: "28px 0" }} />
          <Text style={{ fontSize: 15, lineHeight: "1.5" }}>{primaryFirst ? enBody : zhBody}</Text>
          <Text style={{ fontSize: 12, color: "#78716c", marginTop: 32 }}>
            Powered by Keystone Music HQ
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
