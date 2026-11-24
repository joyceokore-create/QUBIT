/**
 * Field error copy (docs/08 § Errors): sentence case, specific, ends with a full stop, and
 * restates any limit so the error can replace the hint. Client-safe; used by the shared form
 * schemas so the browser and the server say the same thing.
 */
export const formMessages = {
  /** "Enter a full name." — `what` includes its article. */
  enter: (what: string) => `Enter ${what}.`,
  /** "Choose a project." */
  choose: (what: string) => `Choose ${what}.`,
  email: () => "Enter an email address, like name@company.com.",
  workEmail: () => "Enter a work email, like name@company.com.",
  minLength: (what: string, n: number) => `${capitalise(what)} must be at least ${n} characters.`,
  maxLength: (what: string, n: number) => `${capitalise(what)} must be ${n} characters or fewer.`,
  range: (what: string, min: number, max: number) => `Choose ${what} between ${min} and ${max}.`,
};

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
