/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  readonly VITE_CLOUDBASE_REGION?: string;
  readonly VITE_API_FUNCTION_NAME?: string;
  readonly VITE_JD_IMAGE_PROFILE?: "720-q80" | "1080-q78" | "1440-q75";
  readonly VITE_PUBLIC_LAUNCH_AT?: string;
  readonly VITE_AI_CLOSES_AT?: string;
  readonly VITE_DATA_ACCESS_ENDS_AT?: string;
  readonly VITE_E2E_MODE?: "true";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
