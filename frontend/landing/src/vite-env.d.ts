/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CHRONICLE_NITROPAY_SITE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
