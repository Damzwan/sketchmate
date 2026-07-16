declare module '*.md' {}
declare module '*.lottie' {
  // Vite serves .lottie assets as URLs (assetsInclude) — type them as such so
  // players' `src` fields accept the import directly.
  const src: string
  export default src
}
