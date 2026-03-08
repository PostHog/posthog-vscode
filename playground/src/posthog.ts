import posthog from 'posthog-js';

// ─── Configure these ───────────────────────────────────────
const POSTHOG_API_KEY = 'phc_KlrrtgilQg14z4Ydp3K8qjdwkGjvCqPdaiSEKAdQ3AP';
const POSTHOG_HOST = 'http://localhost:8010';
// ────────────────────────────────────────────────────────────

posthog.init(POSTHOG_API_KEY, {
  api_host: POSTHOG_HOST,
  autocapture: true,
  capture_exceptions: true,       // automatically capture unhandled errors
  disable_session_recording: true, // no web server running locally for /s/ endpoint
  advanced_disable_decide: true,   // skip /decide calls (avoids 502 from missing web server)
});

export default posthog;
