/**
 * Everything the legal pages need that is specific to whoever runs this
 * deployment, in one place.
 *
 * ⚠️ FILL THESE IN BEFORE LAUNCH. The policies reference them by name, so a
 * placeholder left here shows up verbatim on a public page.
 *
 * The policy text itself was written against the actual schema — every
 * category of data it lists is a real column in supabase/migrations. If you
 * add a table that stores something about a member, update
 * `src/routes/privacy.tsx` at the same time.
 *
 * This is a starting point written by a developer, not by a lawyer. Have it
 * reviewed before you rely on it, particularly the retention periods and the
 * legal bases.
 */

/** The person or company that operates the service and is the data controller. */
export const OPERATOR_NAME = "[Your legal name or company]";

/** Registered address. Required on a privacy notice. */
export const OPERATOR_ADDRESS = "[Street, city, Albania]";

/** Where members send privacy requests and complaints. */
export const CONTACT_EMAIL = "[privacy@your-domain.com]";

/** Shown at the top of each policy. Bump when you change the text. */
export const POLICY_LAST_UPDATED = "18 September 2026";

/** True once the placeholders above have been replaced. */
export function legalDetailsConfigured(): boolean {
  return ![OPERATOR_NAME, OPERATOR_ADDRESS, CONTACT_EMAIL].some((value) =>
    value.startsWith("["),
  );
}
