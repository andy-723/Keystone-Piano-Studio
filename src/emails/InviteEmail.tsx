import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { Lang } from "@/mocks/types";

export type InviteEmailProps = {
  language: Lang;
  teacherName: string;
  guardianFirstName: string;
  childNames: string;
  studioName: string;
  joinUrl: string;
  expiresLabel: string;
  logoUrl?: string | null;
};

export function inviteSubject(language: Lang, teacherName: string, childNames: string) {
  return language === "zh-CN"
    ? `${teacherName} 邀请您为 ${childNames} 办理入学 · Keystone Music HQ`
    : `${teacherName} has invited you to enrol ${childNames} · Keystone Music HQ`;
}

export function invitePlainText(props: InviteEmailProps) {
  const en = `Hi ${props.guardianFirstName}, ${props.teacherName} would love to welcome ${props.childNames} to ${props.studioName}. Please complete a short enrolment: a few questions about piano experience, your instrument at home and practice goals, plus the studio's terms. It takes about 5 minutes and you can stop and come back any time.\n\nStart enrolment: ${props.joinUrl}\nExpires: ${props.expiresLabel}`;
  const zh = `${props.guardianFirstName}您好，${props.teacherName}诚邀${props.childNames}加入${props.studioName}。请完成简短的入学登记：包括钢琴学习经历、家中乐器、练习目标，以及工作室条款。大约需要5分钟，您可以随时暂停，稍后继续。\n\n开始入学登记: ${props.joinUrl}\n有效期至: ${props.expiresLabel}`;
  return props.language === "zh-CN" ? `${zh}\n\n---\n\n${en}` : `${en}\n\n---\n\n${zh}`;
}

export function InviteEmail(props: InviteEmailProps) {
  const primaryFirst = props.language === "zh-CN";
  const enBody = `Hi ${props.guardianFirstName}, ${props.teacherName} would love to welcome ${props.childNames} to ${props.studioName}. Please complete a short enrolment: a few questions about piano experience, your instrument at home and practice goals, plus the studio's terms. It takes about 5 minutes and you can stop and come back any time.`;
  const zhBody = `${props.guardianFirstName}您好，${props.teacherName}诚邀${props.childNames}加入${props.studioName}。请完成简短的入学登记：包括钢琴学习经历、家中乐器、练习目标，以及工作室条款。大约需要5分钟，您可以随时暂停，稍后继续。`;
  const button = primaryFirst ? "开始入学登记" : "Start enrolment";
  const preview = primaryFirst
    ? `${props.teacherName} 邀请您办理入学`
    : `${props.teacherName} has invited you to enrol`;
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f7f3eb", fontFamily: "Georgia, serif", color: "#1c1917" }}>
        <Container style={{ margin: "0 auto", padding: "32px 20px", maxWidth: "560px" }}>
          {props.logoUrl ? (
            <Img
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
          <Text style={{ fontSize: 14, color: "#57534e" }}>
            {primaryFirst ? "大约需要5分钟" : "Takes about 5 minutes"}
          </Text>
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
              {button}
            </Button>
          </Section>
          <Text style={{ fontSize: 14, color: "#57534e" }}>
            {primaryFirst ? `有效期至 ${props.expiresLabel}` : `Expires ${props.expiresLabel}`}
          </Text>
          <hr style={{ border: "none", borderTop: "1px solid #d6d3d1", margin: "28px 0" }} />
          <Text style={{ fontSize: 15, lineHeight: "1.5" }}>{primaryFirst ? enBody : zhBody}</Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={props.joinUrl}
              style={{
                backgroundColor: "#44403c",
                color: "#fafaf9",
                padding: "12px 20px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 15,
              }}
            >
              {primaryFirst ? "Start enrolment" : "开始入学登记"}
            </Button>
          </Section>
          <Text style={{ fontSize: 12, color: "#78716c", marginTop: 32 }}>
            Powered by Keystone Music HQ. You received this because {props.teacherName} invited{" "}
            {props.childNames} to enrol at {props.studioName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
