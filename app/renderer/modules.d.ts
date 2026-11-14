// Vite turns a stylesheet import into a side effect; TypeScript needs a module for it.
declare module "*.css";

// Vite turns an SVG import into the URL it serves the file at.
declare module "*.svg" {
  const url: string;
  export default url;
}
