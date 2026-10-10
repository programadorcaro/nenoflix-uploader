export const ALLOWED_EXTENSIONS = [".mkv", ".mp4", ".srt"];
// Backend runs on the same host as the page, port 8098, so the app works
// from LAN IP, Tailscale name or localhost without a rebuild.
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8098`
    : "http://localhost:8098");
