// Client-safe password rules (no bcrypt here — this file is imported by the set-password forms).
// UX fidelity D-F8: minimum 12 characters for new and changed passwords.
export const PASSWORD_MIN_LENGTH = 12;

/** The live checklist on the set-password screens (client-safe: pure string checks). Only
 * `length` is enforced; the others are shown as ways to make it stronger. */
export function passwordChecks(password: string): { key: string; label: string; met: boolean; required: boolean }[] {
  return [
    { key: "length", label: `${PASSWORD_MIN_LENGTH} or more characters`, met: password.length >= PASSWORD_MIN_LENGTH, required: true },
    { key: "number", label: "A number", met: /\d/.test(password), required: false },
    { key: "upper", label: "An upper-case letter", met: /[A-Z]/.test(password), required: false },
    { key: "symbol", label: "A symbol", met: /[^A-Za-z0-9]/.test(password), required: false },
  ];
}

