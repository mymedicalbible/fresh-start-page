/**
 * Stubs for Deno + std/http so the workspace TypeScript server can typecheck Edge Functions
 * without the Deno VS Code extension. Runtime is still Deno on Supabase.
 */
declare const Deno: {
  env: {
    get (key: string): string | undefined
  }
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve (
    handler: (request: Request) => Response | Promise<Response>,
  ): void
}
