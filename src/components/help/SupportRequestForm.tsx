import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileField } from "@/components/login/TurnstileField";
import { getAuthClient } from "@/lib/auth-client";
import { articleText, type HelpAudience, type HelpLang } from "@/lib/help/articles";
import { searchArticles } from "@/lib/help/search";
import {
  SUPPORT_LIMITS,
  categoriesFor,
  findCategory,
  validateSupportRequest,
} from "@/lib/help/support-request";
import { helpText, type HelpUiKey } from "@/lib/help/ui-text";
import { getSupportTurnstileSiteKeyFn, submitSupportRequestFn } from "@/server/support";
import { ArticleItem, AskStudioCallout } from "./HelpArticles";

export type SupportMode = "public" | "live" | "demo";

type Props = {
  audience: HelpAudience;
  lang: HelpLang;
  mode: SupportMode;
  onMessageTeacher?: ((prefill: string) => void) | undefined;
  /** What the person typed in the help search, used to prefill the subject. */
  searchQuery?: string | undefined;
  supportEmail?: string | undefined;
  /** Preselected category and subject, e.g. the public Contact page's "Request a studio". */
  initialCategory?: string | undefined;
  initialSubject?: string | undefined;
};

type ErrorCode =
  | "required"
  | "too_long"
  | "too_short"
  | "invalid"
  | "ask_studio"
  | "captcha"
  | "rate_limited"
  | "unauthorized"
  | "failed";

const selectClass =
  "min-h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * "Still need help?" form. Deflects first: matching articles appear while the person types,
 * and family questions the studio answers (lessons, fees, progress) open the teacher chat
 * instead of creating a Keystone ticket.
 */
export function SupportRequestForm({
  audience,
  lang,
  mode,
  onMessageTeacher,
  searchQuery,
  supportEmail,
  initialCategory,
  initialSubject,
}: Props) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [categoryId, setCategoryId] = useState(initialCategory ?? "");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [message, setMessage] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: ErrorCode; field?: string } | null>(null);
  const [sent, setSent] = useState<{ reference: string; urgent: boolean } | null>(null);

  const turnstile = useQuery({
    queryKey: ["support-turnstile"],
    queryFn: () => getSupportTurnstileSiteKeyFn(),
    enabled: mode === "public",
    staleTime: Infinity,
  });

  const categories = categoriesFor(audience);
  const category = findCategory(audience, categoryId);
  const typed = useDeferredValue(`${subject} ${message}`);
  const suggestions = useMemo(
    () => (typed.trim().length >= 4 ? searchArticles(typed, audience, { lang, limit: 3 }) : []),
    [typed, audience, lang],
  );
  const t = (key: HelpUiKey, values?: Record<string, string>) => helpText(lang, key, values);
  const fieldError = (field: string) =>
    error?.field === field ? (
      <p className="mt-1 text-sm text-destructive" role="alert">
        {t(`errors_${error.code}` as HelpUiKey, { email: supportEmail ?? "" })}
      </p>
    ) : null;

  function reset() {
    setCategoryId("");
    setSubject("");
    setMessage("");
    setCaptcha(null);
    setError(null);
    setSent(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const request = {
      audience,
      category: categoryId,
      subject,
      message,
      lang,
      contactName,
      contactEmail,
      pagePath: pathname,
      suggestedArticleIds: suggestions.map(({ article }) => article.id),
    };
    const local = validateSupportRequest(request, { signedIn: mode !== "public" });
    if (!local.ok) {
      setError({ code: local.code, field: local.field });
      return;
    }
    if (mode === "public" && !captcha) {
      setError({ code: "captcha", field: "captcha" });
      return;
    }
    setPending(true);
    setError(null);
    try {
      let accessToken: string | undefined;
      if (mode === "live") {
        const { data } = (await getAuthClient()?.auth.getSession()) ?? { data: { session: null } };
        accessToken = data.session?.access_token;
        if (!accessToken) {
          setError({ code: "unauthorized", field: "form" });
          return;
        }
      }
      const result = await submitSupportRequestFn({
        data: {
          request,
          accessToken,
          turnstileToken: captcha ?? undefined,
          demo: mode === "demo",
        },
      });
      if (result.ok) setSent({ reference: result.reference, urgent: result.urgent });
      else
        setError({
          code: result.code,
          field: result.field ?? (result.code === "captcha" ? "captcha" : "form"),
        });
    } catch {
      setError({ code: "failed", field: "form" });
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div
        className="mt-4 rounded-lg border border-border bg-secondary/60 p-4"
        role="status"
        data-testid="support-sent"
      >
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 aria-hidden className="size-5" />
          {t("sentTitle")}
        </p>
        <p className="mt-1 text-base">{t("sentBody", { reference: sent.reference })}</p>
        {sent.urgent && <p className="mt-1 text-base">{t("sentUrgent")}</p>}
        <Button variant="outline" className="mt-3 min-h-11" onClick={reset}>
          {t("another")}
        </Button>
      </div>
    );
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)} noValidate>
      <div>
        <label htmlFor={`support-category-${audience}`} className="block font-semibold">
          {t("category")}
        </label>
        <select
          id={`support-category-${audience}`}
          className={`${selectClass} mt-2`}
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setError(null);
            if (!subject && searchQuery?.trim())
              setSubject(searchQuery.trim().slice(0, SUPPORT_LIMITS.subjectMax));
          }}
        >
          <option value="">{t("categoryPlaceholder")}</option>
          {categories.map((option) => (
            <option key={option.id} value={option.id}>
              {articleText(option.label, lang)}
            </option>
          ))}
        </select>
        {fieldError("category")}
      </div>

      {category?.answeredBy === "studio" ? (
        <AskStudioCallout
          lang={lang}
          title={articleText(category.label, lang)}
          onMessageTeacher={onMessageTeacher}
        />
      ) : (
        <>
          {category?.urgent && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-base">
              <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
              {t("urgentNote")}
            </p>
          )}
          <div>
            <label htmlFor={`support-subject-${audience}`} className="block font-semibold">
              {t("subject")}
            </label>
            <Input
              id={`support-subject-${audience}`}
              className="mt-2 min-h-12 text-base"
              value={subject}
              maxLength={SUPPORT_LIMITS.subjectMax}
              onChange={(event) => setSubject(event.target.value)}
            />
            {fieldError("subject")}
          </div>
          <div>
            <label htmlFor={`support-message-${audience}`} className="block font-semibold">
              {categoryId === "new_studio" ? "Tell us about your studio" : t("message")}
            </label>
            <p className="text-sm text-muted-foreground">
              {categoryId === "new_studio"
                ? "Roughly how many students and teachers, where you teach, and anything you'd like to know."
                : t("messageHint")}
            </p>
            <Textarea
              id={`support-message-${audience}`}
              className="mt-2 min-h-32 text-base"
              value={message}
              maxLength={SUPPORT_LIMITS.messageMax}
              onChange={(event) => setMessage(event.target.value)}
            />
            {fieldError("message")}
            <p className="mt-2 text-sm text-muted-foreground">{t("privacyNote")}</p>
          </div>

          {suggestions.length > 0 && (
            <div
              className="rounded-lg border border-border bg-secondary/40 p-4"
              aria-live="polite"
              data-testid="support-suggestions"
            >
              <p className="font-semibold">{t("suggestionsTitle")}</p>
              <div className="mt-1" data-no-translate>
                {suggestions.map(({ article }) => (
                  <ArticleItem
                    key={article.id}
                    article={article}
                    lang={lang}
                    onMessageTeacher={onMessageTeacher}
                  />
                ))}
              </div>
            </div>
          )}

          {mode === "public" && (
            <>
              <div>
                <label htmlFor={`support-name-${audience}`} className="block font-semibold">
                  {t("name")}
                </label>
                <Input
                  id={`support-name-${audience}`}
                  className="mt-2 min-h-12 text-base"
                  value={contactName}
                  maxLength={SUPPORT_LIMITS.nameMax}
                  autoComplete="name"
                  onChange={(event) => setContactName(event.target.value)}
                />
                {fieldError("contactName")}
              </div>
              <div>
                <label htmlFor={`support-email-${audience}`} className="block font-semibold">
                  {t("email")}
                </label>
                <p className="text-sm text-muted-foreground">{t("emailHint")}</p>
                <Input
                  id={`support-email-${audience}`}
                  type="email"
                  className="mt-2 min-h-12 text-base"
                  value={contactEmail}
                  maxLength={SUPPORT_LIMITS.emailMax}
                  autoComplete="email"
                  onChange={(event) => setContactEmail(event.target.value)}
                />
                {fieldError("contactEmail")}
              </div>
              <div>
                <TurnstileField
                  siteKey={turnstile.data?.siteKey ?? ""}
                  mock={turnstile.data?.mock ?? !turnstile.data?.siteKey}
                  onToken={setCaptcha}
                />
                {fieldError("captcha")}
              </div>
            </>
          )}

          {fieldError("form")}
          <Button type="submit" className="min-h-12" disabled={pending || !categoryId}>
            {pending ? t("sending") : t("send")}
          </Button>
        </>
      )}
    </form>
  );
}
