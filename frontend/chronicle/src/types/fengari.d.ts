/* eslint-disable @typescript-eslint/no-explicit-any -- Fengari 0.1.5 does not publish TypeScript declarations. */
declare module "fengari" {
  export const lua: Record<string, any>;
  export const lauxlib: Record<string, any>;
  export const lualib: Record<string, any>;
  export function to_luastring(value: string): Uint8Array;
  export function to_jsstring(value: Uint8Array): string;
}
