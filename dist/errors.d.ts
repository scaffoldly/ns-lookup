export declare class NoAuthoritiesError extends Error {
    readonly domain: string;
    constructor(domain: string);
}
export declare class NoNameserversError extends Error {
    readonly domain: string;
    readonly authorities: string[];
    constructor(domain: string, authorities: string[]);
}
//# sourceMappingURL=errors.d.ts.map