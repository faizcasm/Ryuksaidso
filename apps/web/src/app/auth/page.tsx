import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Sign in — RYUKSAIDSO",
  description: "Create your RYUKSAIDSO account or sign in to the agent control plane.",
};

export default function AuthPage() {
  // AppShell renders the sign-in / register screen when there is no session,
  // and redirects to /dashboard once the user is authenticated.
  return <AppShell />;
}
