// Vite inlines an asset imported with ?inline as a data URL, so the icons travel inside the main bundle.
declare module "*.png?inline" {
  const url: string;
  export default url;
}
