// Cloudflare Workers 타입 정의
// apps/server/worker-configuration.d.ts의 Cloudflare.Env를 참조하기 위한 글로벌 타입

/// <reference path="./apps/server/worker-configuration.d.ts" />

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
