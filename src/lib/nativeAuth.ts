// Native Google sign-in (Capacitor) — PREP ONLY, not yet wired up.
//
// Web sign-in (SignInPage.tsx) uses Supabase's redirect-based OAuth flow
// (`supabase.auth.signInWithOAuth`), which depends on a browser redirect
// round-trip. That doesn't work inside a native WebView once this app is
// wrapped with Capacitor — native platforms need a plugin-based flow
// instead: a native Google Sign-In SDK call that returns an ID token
// directly, which is then handed to Supabase.
//
// This file documents the eventual native flow so the branch point exists
// in the code now, without requiring Capacitor/Android/iOS project setup
// (which hasn't happened yet — see docs/TASKS.md T018 and
// docs/DECISIONS.md). Calling this function today always throws, since
// there is no native plugin installed yet to obtain a real ID token.
//
// Eventual implementation, once a native Google Sign-In plugin is chosen
// and the Capacitor Android/iOS projects exist:
//
//   1. Call the plugin's native sign-in method (e.g.
//      `GoogleAuth.signIn()` from `@codetrix-studio/capacitor-google-auth`,
//      or an equivalent) to get a Google ID token from the OS-level
//      Google Sign-In UI.
//   2. Exchange that ID token with Supabase via
//      `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`
//      instead of `signInWithOAuth` — no redirect involved.
//   3. Supabase validates the token against the configured Google OAuth
//      client and returns a session, same as the web flow does.
//
// Until that plugin is chosen and installed, this stub exists purely so
// `SignInPage.tsx` can branch on platform without that branch silently
// doing nothing.
export async function signInWithGoogleNative(): Promise<never> {
  throw new Error(
    'Native Google sign-in is not implemented yet — Capacitor and a native ' +
      'Google Sign-In plugin have not been set up in this project (see ' +
      'docs/TASKS.md T018). This stub only documents the eventual flow.',
  )
}
