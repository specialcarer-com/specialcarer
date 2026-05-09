/**
 * i18n types — lightweight, no external dependencies.
 */

export type Locale = "en" | "es" | "fr" | "zh" | "ar" | "hi";

export interface Messages {
  common: {
    ok: string;
    cancel: string;
    back: string;
    next: string;
    skip: string;
    continue: string;
    save: string;
    loading: string;
    error: string;
    retry: string;
    search: string;
  };
  nav: {
    home: string;
    jobs: string;
    bookings: string;
    schedule: string;
    profile: string;
    signIn: string;
    signUp: string;
    signOut: string;
  };
  login: {
    welcomeBack: string;
    subtitle: string;
    emailLabel: string;
    passwordLabel: string;
    forgot: string;
    signInCta: string;
    noAccount: string;
    signUpCta: string;
  };
  postJob: {
    title: string;
    vertical: string;
    when: string;
    duration: string;
    address: string;
    notes: string;
    postCta: string;
  };
  accessibility: {
    settings: string;
    language: string;
    largeText: string;
    largeTextHelp: string;
    reducedMotion: string;
    voiceBooking: string;
    voiceBookingHelp: string;
  };
  voice: {
    listening: string;
    idle: string;
    prompt: string;
    didntCatch: string;
    exampleHint: string;
    micPermission: string;
  };
}
