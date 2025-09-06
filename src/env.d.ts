/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENERATE_SHIP_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Allow importing plain CSS files in TS modules (Vite handles bundling)
declare module "*.css" {
  const content: string;
  export default content;
}
