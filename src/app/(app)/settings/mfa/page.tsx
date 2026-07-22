import { MfaEnrollForm } from "./mfa-enroll-form";

export default function MfaSettingsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl rv:text-heading-md text-foreground">Two-factor authentication</h1>
        <p className="text-sm text-ink-2">
          Add an authenticator app for an extra layer of security on your account.
        </p>
      </div>
      <MfaEnrollForm />
    </div>
  );
}
