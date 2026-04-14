declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
}

declare module "node:url" {
  export function fileURLToPath(url: URL | string): string;
}
