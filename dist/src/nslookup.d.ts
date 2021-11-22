export declare type Protocol = 'udp' | 'tcp';
export declare type RecordType = 'NS' | 'SOA';
/**
 * NS Lookup Options
 */
export declare type NsLookupOptions = {
    /**
     * DNS to use for SOA records, defaults to `one.one.one.one`
     */
    defaultDns?: string;
    /**
     * Protocol to use for DNS queries, either `tcp` or `udp`, defaults to `udp`.
     */
    proto?: Protocol;
};
export declare type Address = string;
export declare type AddressList = Address[];
export declare type Nameservers = {
    addresses: AddressList;
    authority: Address | null;
};
export declare type Authorities = {
    addresses: AddressList;
};
export declare class NoAuthoritiesError extends Error {
    constructor(domain: string);
}
export declare class NoNameserversError extends Error {
    constructor(domain: string, authorities: Authorities);
}
export declare const DEFAULT_DNS = "one.one.one.one";
/**
 * Perform an nslookup for a given domain
 * @param domain The domain for which to lookup NS records
 * @param options An optional map of options
 * @returns An object containing the list of NS addresses for a given domain at it's authority
 */
export declare const NsLookup: (domain: string, options?: NsLookupOptions) => Promise<Nameservers>;
//# sourceMappingURL=nslookup.d.ts.map