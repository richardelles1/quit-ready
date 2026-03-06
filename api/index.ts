import type { Request, Response } from "express";

// dist/handler.cjs is produced by `npm run build` before Vercel deploys functions.
// CJS modules can be statically imported from ESM context in Node.js.
let appPromise: Promise<any> | null = null;

export default async function handler(req: Request, res: Response) {
  if (!appPromise) {
    const mod = await import("../dist/handler.cjs");
    const createApp = mod.createApp ?? mod.default?.createApp;
    appPromise = createApp();
  }
  const app = await appPromise;
  return app(req, res);
}
