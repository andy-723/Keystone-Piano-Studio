import {
  FAMILY_APP_TERMS_MARKDOWN,
  KEYSTONE_ENTITY,
  PRIVACY_NOTICE_MARKDOWN,
} from "@/mocks/keystone-app-terms";
import { KEYSTONE_STORAGE_STATEMENT, OVERSEAS_COUNTRIES_LABEL } from "@/mocks/keystone-suppliers";

function fill(markdown: string): string {
  return markdown
    .replaceAll("{{privacy.overseasCountriesLabel}}", OVERSEAS_COUNTRIES_LABEL)
    .replaceAll(
      "{{privacy.keystoneStorageStatement}}",
      KEYSTONE_STORAGE_STATEMENT.replace("[Keystone legal entity]", KEYSTONE_ENTITY),
    );
}

/** Same Keystone app terms families accept in the app, for the public /terms page. */
export const PUBLIC_TERMS_MARKDOWN = fill(FAMILY_APP_TERMS_MARKDOWN);

/** Keystone privacy notice (Part C of the app terms), for the public /privacy page. */
export const PUBLIC_PRIVACY_MARKDOWN = fill(PRIVACY_NOTICE_MARKDOWN).replace(
  "## Part C — Privacy notice",
  "",
);
