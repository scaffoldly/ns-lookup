"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoNameserversError = exports.NoAuthoritiesError = void 0;
class NoAuthoritiesError extends Error {
    domain;
    constructor(domain) {
        super(`No authorities found for ${domain}`);
        this.domain = domain;
    }
}
exports.NoAuthoritiesError = NoAuthoritiesError;
class NoNameserversError extends Error {
    domain;
    authorities;
    constructor(domain, authorities) {
        super(`No nameservers found for ${domain} using authorities ${authorities}`);
        this.domain = domain;
        this.authorities = authorities;
    }
}
exports.NoNameserversError = NoNameserversError;
//# sourceMappingURL=errors.js.map