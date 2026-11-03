import { queryOptions } from "@tanstack/react-query";
import { getLibrary } from "@/services/library";
import { getEnrolments, getParentIntakes } from "@/services/onboarding";
import type { ImportScope } from "@/mocks/roster-import";
export const libraryQuery = (scope: ImportScope = "demo") => queryOptions({ queryKey: ["library", scope], queryFn: () => getLibrary(scope) });
export const enrolmentsQuery = (scope: ImportScope = "demo") => queryOptions({ queryKey: ["enrolments", scope], queryFn: () => getEnrolments(scope) });
export const parentIntakesQuery = queryOptions({ queryKey: ["parent", "intakes"], queryFn: getParentIntakes });