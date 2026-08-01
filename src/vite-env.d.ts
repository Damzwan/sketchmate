/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_DRAW_TESTING?: "si";
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
