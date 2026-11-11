/** RFC 7807-ish problem errors for privileged server paths. */

export class ProblemError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly code?: string | undefined;

  constructor(status: number, title: string, detail?: string, type = "about:blank", code?: string) {
    super(detail ?? title);
    this.name = "ProblemError";
    this.status = status;
    this.type = type;
    this.title = title;
    this.code = code;
  }

  toResponse(): Response {
    return Response.json(
      {
        type: this.type,
        title: this.title,
        status: this.status,
        detail: this.message,
        ...(this.code ? { code: this.code } : {}),
      },
      { status: this.status, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export function forbidden(detail = "You do not have permission for this studio action.") {
  return new ProblemError(403, "Forbidden", detail, "https://keystone.music/problems/forbidden");
}

export function mfaRequired(detail = "Two-step sign-in is required.") {
  return new ProblemError(
    403,
    "MFA required",
    detail,
    "https://keystone.music/problems/mfa-required",
    "mfa_required",
  );
}
