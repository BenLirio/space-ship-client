/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENERATE_SHIP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv & {
    readonly PROD: boolean; // already provided by Vite types, redeclared for clarity
  };
}
