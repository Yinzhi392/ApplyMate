/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID?: string;
  readonly VITE_CLOUDBASE_REGION?: string;
  readonly VITE_API_FUNCTION_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
