/** RFC 7807-ish problem errors for privileged server paths. */

export class ProblemError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;

  constructor(status: number, title: string, detail?: string, type = "about:blank") {
    super(detail ?? title);
    this.name = "ProblemError";
    this.status = status;
    this.type = type;
    this.title = title;
  }

  toResponse(): Response {
    return Response.json(
      { type: this.type, title: this.title, status: this.status, detail: this.message },
      { status: this.status, headers: { "Content-Type": "application/problem+json" } },
    );
  }
}

export function forbidden(detail = "You do not have permission for this studio action.") {
  return new ProblemError(403, "Forbidden", detail, "https://keystone.music/problems/forbidden");
}
