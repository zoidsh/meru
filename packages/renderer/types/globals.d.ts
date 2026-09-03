/// <reference types="vite/client" />

declare module "*.wav" {
  const soundUrl: string;
  export default soundUrl;
}
