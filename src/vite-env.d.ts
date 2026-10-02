/// <reference types="vite/client" />
declare const __BUILD_INFO__: { version: string; sha: string };

declare module '*.css' {
  const content: string;
  export default content;
}
