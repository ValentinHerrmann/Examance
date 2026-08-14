// Vite's `?url` imports have no types for bare package specifiers.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}
