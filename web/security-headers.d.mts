export type HeaderOpts = { agentUrl?: string; authDomain?: string; dev?: boolean };
export function buildCsp(opts?: HeaderOpts): string;
export function securityHeaders(opts?: HeaderOpts): { key: string; value: string }[];
