import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enrolmentYear, isAdultStudent } from "@/lib/enrolment";

export interface EnrolDetails { firstName: string; lastName: string; birthYear: number; guardianName: string; guardianEmail: string; guardianMobile: string; studentEmail: string; studentMobile: string; language: "en" | "zh-CN" }
const identityQuestions = [
  { key: "firstName", title: "What’s the student’s first name?", label: "Student first name", type: "text" },
  { key: "lastName", title: "And their last name?", label: "Student last name", type: "text" },
  { key: "birthYear", title: "What year were they born?", label: "Birth year", type: "number" },
] as const;
const guardianQuestions = [
  { key: "guardianName", title: "Who is their guardian?", label: "Guardian name", type: "text" },
  { key: "guardianEmail", title: "What’s the guardian’s email?", label: "Guardian email", type: "email" },
  { key: "guardianMobile", title: "What’s their mobile number?", label: "Guardian mobile (optional)", type: "tel" },
] as const;

export function EnrolQuestions({ value, onChange, onSubmit, pending }: { value: EnrolDetails; onChange: (value: EnrolDetails) => void; onSubmit: () => void; pending: boolean }) {
  const [step, setStep] = useState(0);
  const [addGuardian, setAddGuardian] = useState(false);
  const adult = isAdultStudent(value.birthYear);
  const questions = [
    ...identityQuestions,
    ...(adult ? [
      { key: "studentEmail", title: "What’s the student’s email?", label: "Student email", type: "email" },
      { key: "studentMobile", title: "What’s the student’s mobile number?", label: "Student mobile (optional)", type: "tel" },
      { key: "contact", title: "Would they like to add a guardian?", label: "Guardian preference", type: "contact" },
    ] as const : []),
    ...(!adult || addGuardian ? guardianQuestions : []),
    { key: "language", title: adult ? "Which language does the student prefer?" : "Which language does the family prefer?", label: "Preferred language", type: "language" },
  ] as const;
  const input = useRef<HTMLInputElement>(null);
  const question = questions[step];
  useEffect(() => { input.current?.focus(); }, [step]);
  const review = step === questions.length;
  return <div className="mt-7">
    <div className="flex items-center justify-between gap-3 text-base text-muted-foreground"><span>{review ? "Ready to send" : `Question ${step + 1} of ${questions.length}`}</span><span>{review ? "100" : Math.round(step / questions.length * 100)}%</span></div>
    <div className="mt-3 flex gap-1" aria-hidden>{questions.map((entry, index) => <span key={entry.key} className={`h-1.5 flex-1 ${index < step ? "bg-primary" : "bg-border"}`} />)}</div>
    <form className="flex min-h-[420px] flex-col justify-center py-10 sm:min-h-[460px]" onSubmit={event => { event.preventDefault(); if (review) onSubmit(); else setStep(step + 1); }}>
      <div key={step} className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
        {review ? <><h2 className="font-display text-3xl font-semibold">All ready for {value.firstName}.</h2><dl className="mt-6 divide-y divide-border">{questions.map((entry, index) => <div key={entry.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><dt className="text-base text-muted-foreground">{entry.label}</dt><dd className="mt-1 break-words font-semibold">{entry.key === "contact" ? addGuardian ? "Add a guardian" : "No guardian" : entry.key === "language" ? value.language === "en" ? "English" : "中文" : value[entry.key] || "Not provided"}</dd></div><Button type="button" variant="ghost" onClick={() => setStep(index)}>Edit<span className="sr-only"> {entry.label}</span></Button></div>)}</dl></> : question && <><label htmlFor="enrol-answer" className="block font-display text-3xl font-semibold">{question.title}</label><p className="sr-only" id="enrol-answer-label">{question.label}</p>{question.type === "contact" ? <div className="mt-7 flex flex-wrap gap-3" role="group" aria-label="Guardian preference">{[false, true].map(selected => <Button key={String(selected)} type="button" variant={addGuardian === selected ? "default" : "outline"} aria-pressed={addGuardian === selected} onClick={() => { setAddGuardian(selected); if (!selected) onChange({ ...value, guardianName: '', guardianEmail: '', guardianMobile: '' }); }}>{selected ? "Add a guardian" : "No guardian"}{addGuardian === selected && <Check aria-hidden />}</Button>)}</div> : question.type === "language" ? <div className="mt-7 flex flex-wrap gap-3" role="group" aria-label="Preferred language">{(["en", "zh-CN"] as const).map(language => <Button type="button" key={language} variant={value.language === language ? "default" : "outline"} aria-pressed={value.language === language} className="min-h-16 min-w-36 justify-between gap-5 text-xl" onClick={() => onChange({ ...value, language })}>{language === "en" ? "English" : "中文"}{value.language === language && <Check aria-hidden />}</Button>)}</div> : <Input ref={input} id="enrol-answer" aria-labelledby="enrol-answer-label" type={question.type} min={question.key === "birthYear" ? 1900 : undefined} max={question.key === "birthYear" ? enrolmentYear() : undefined} required={question.type !== "tel"} autoComplete={question.type === "email" ? "email" : question.type === "tel" ? "tel" : "off"} value={value[question.key]} onChange={event => onChange({ ...value, [question.key]: question.key === "birthYear" ? Number(event.target.value) : event.target.value })} className="mt-7 h-16 rounded-none border-0 border-b-2 border-primary bg-transparent px-0 text-2xl shadow-none focus-visible:ring-0 md:text-2xl" />}{question.type === "tel" && <p className="mt-3 text-base text-muted-foreground">Optional</p>}</>}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">{step > 0 && <Button type="button" variant="outline" disabled={pending} onClick={() => setStep(step - 1)}><ArrowLeft aria-hidden />Back</Button>}<Button type="submit" disabled={pending} className="min-h-14 px-6">{review ? <><Send aria-hidden />{pending ? "Sending…" : "Send intake form"}</> : <>Continue<ArrowRight aria-hidden /></>}</Button>{question?.type === "tel" && <Button type="button" variant="ghost" onClick={() => setStep(step + 1)}>Skip</Button>}</div>
    </form>
  </div>;
}