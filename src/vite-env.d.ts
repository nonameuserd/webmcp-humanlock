/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VAULT_SEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
