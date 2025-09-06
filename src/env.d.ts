/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENERATE_SHIP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & {
    readonly PROD: boolean; // already provided by Vite types, redeclared for clarity
  };
}

// Allow importing plain CSS files in TS modules (Vite handles bundling)
declare module "*.css" {
  const content: string;
  export default content;
}
