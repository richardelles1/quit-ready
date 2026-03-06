// Imports from the pre-built server bundle produced by `npm run build`.
// Vercel runs buildCommand before deploying functions, so dist/handler.cjs exists.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require("../dist/handler.cjs");

let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = createApp();
  }
  const app = await appPromise;
  return app(req, res);
}
