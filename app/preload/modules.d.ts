// Vite hands a file imported with `?raw` over as its text, which is how a test reads a fixture.
declare module "*.html?raw" {
  const text: string;
  export default text;
}
