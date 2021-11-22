"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NsLookup = exports.DEFAULT_DNS = exports.NoNameserversError = exports.NoAuthoritiesError = void 0;
const dns_packet_1 = __importStar(require("dns-packet"));
const dgram_as_promised_1 = __importDefault(require("dgram-as-promised"));
const net_1 = __importDefault(require("net"));
const promise_socket_1 = require("promise-socket");
const loglevel_1 = __importDefault(require("loglevel"));
class NoAuthoritiesError extends Error {
    constructor(domain) {
        super(`No authorities found for ${domain}`);
    }
}
exports.NoAuthoritiesError = NoAuthoritiesError;
class NoNameserversError extends Error {
    constructor(domain, authorities) {
        super(`No nameservers found for ${domain} from authorities ${JSON.stringify(authorities.addresses)}`);
    }
}
exports.NoNameserversError = NoNameserversError;
exports.DEFAULT_DNS = 'one.one.one.one';
const sendAndReceive = async (host, port, buf, proto) => {
    loglevel_1.default.trace(`Performing ${proto} request to ${host}:${port}`);
    if (proto === 'tcp') {
        try {
            const socket = new promise_socket_1.PromiseSocket(new net_1.default.Socket());
            socket.setTimeout(500);
            await socket.connect(port, host);
            await socket.write(buf);
            const read = await socket.readAll();
            if (!read || !(read instanceof Buffer)) {
                throw new Error('Unexpected non-buffer response');
            }
            socket.destroy();
            return read;
        }
        catch (e) {
            if (e instanceof Error) {
                loglevel_1.default.warn(`Communication error, falling back to UDP:`, e.message);
                return await sendAndReceive(host, port, buf, 'udp');
            }
            else {
                throw e;
            }
        }
    }
    try {
        const socket = dgram_as_promised_1.default.createSocket('udp4');
        await socket.send(buf, 0, buf.length, port, host);
        const read = await socket.recv();
        if (!read || !read.msg) {
            throw new Error(`No response from ${host}:${port}`);
        }
        socket.destroy();
        return read.msg;
    }
    catch (e) {
        if (e instanceof Error) {
            loglevel_1.default.warn(`Communication error`, e.message);
            return undefined;
        }
        else {
            throw e;
        }
    }
};
const lookupNs = async (domain, authorities, type = 'NS', proto = 'udp', defaultDns = exports.DEFAULT_DNS) => {
    loglevel_1.default.trace(`NS-record lookup via ${type} for domain ${domain} using authorities`, authorities);
    if (authorities && authorities.addresses.length === 0) {
        loglevel_1.default.debug(`No authorities left to try`);
        return { addresses: [], authority: null };
    }
    let flags = dns_packet_1.default.CHECKING_DISABLED;
    let includeAuthorities = true;
    if (!authorities) {
        loglevel_1.default.debug(`No authorities provided, executing a recursive lookup using ${defaultDns}`);
        // eslint-disable-next-line no-bitwise
        flags |= dns_packet_1.default.RECURSION_DESIRED;
        // eslint-disable-next-line no-param-reassign
        authorities = { addresses: [defaultDns] };
        includeAuthorities = false;
    }
    const authority = authorities.addresses[0];
    const buf = dns_packet_1.default.encode({
        id: new Date().getTime() % 10000,
        type: 'query',
        flags,
        questions: [
            {
                type,
                name: domain,
            },
        ],
    });
    try {
        const received = await sendAndReceive(authority, 53, buf, proto);
        if (!received) {
            loglevel_1.default.warn(`No data received from ${authority} for ${type} record on ${domain}`);
            return await lookupNs(domain, { addresses: authorities.addresses.slice(1) }, 'NS', proto, defaultDns);
        }
        const packet = dns_packet_1.default.decode(received);
        loglevel_1.default.debug(`Decoded packet from ${authority}:`, JSON.stringify(packet));
        const responses = includeAuthorities
            ? [...(packet.authorities || []), ...(packet.answers || [])]
            : packet.answers || [];
        if (!responses.length) {
            loglevel_1.default.warn(`No ${includeAuthorities ? 'authorities or answers' : 'answers'} in response`);
            return await lookupNs(domain, { addresses: authorities.addresses.slice(1) }, 'NS', proto, defaultDns);
        }
        const answers = new Set(responses.filter((a) => a.type === 'NS' && (a.name === domain || a.name === `${domain}.`)));
        if (!answers.size) {
            loglevel_1.default.warn(`No NS records on ${domain} from ${authority} using ${type} query`);
            if (type === 'NS') {
                loglevel_1.default.debug(`Checking SOA record of ${domain} for NS records`);
                return await lookupNs(domain, authorities, 'SOA', proto, defaultDns);
            }
            return await lookupNs(domain, { addresses: authorities.addresses.slice(1) }, 'NS', proto, defaultDns);
        }
        const addresses = [...answers].map((answer) => answer.data);
        return { addresses, authority };
    }
    catch (e) {
        if (e instanceof Error) {
            loglevel_1.default.warn(`Error looking up NS of ${domain} from ${authority}`, e.message);
            return await lookupNs(domain, { addresses: authorities.addresses.slice(1) }, 'NS', proto, defaultDns);
        }
        else {
            throw e;
        }
    }
};
const lookupAuthorities = async (lookup, proto = 'udp', defaultDns = exports.DEFAULT_DNS, authorities = { addresses: [] }) => {
    loglevel_1.default.trace(`SOA-record lookup for domain ${lookup} using ${defaultDns}`);
    const parts = lookup.split('.').slice(1);
    if (parts.length === 0) {
        return authorities;
    }
    if (parts.length === 1) {
        loglevel_1.default.debug(`Looking up NS records for TLD .${lookup}`);
        // In the event of a TLD query (.dev, .com, .net), lookup NS for the authority
        const nameservers = await lookupNs(lookup, undefined, 'NS', proto, defaultDns);
        return {
            addresses: [...authorities.addresses, ...nameservers.addresses],
        };
    }
    const domain = parts.join('.');
    const buf = dns_packet_1.default.encode({
        id: new Date().getTime() % 1000,
        type: 'query',
        flags: dns_packet_1.RECURSION_DESIRED,
        questions: [
            {
                type: 'SOA',
                name: domain,
            },
        ],
    });
    try {
        const received = await sendAndReceive(defaultDns, 53, buf, proto);
        if (!received) {
            loglevel_1.default.warn(`No data received from ${defaultDns} for SOA record on ${domain}`);
            return await lookupAuthorities(domain, proto, defaultDns, authorities);
        }
        const packet = dns_packet_1.default.decode(received);
        loglevel_1.default.debug('Decoded SOA packet', JSON.stringify(packet));
        if (!packet.answers || !packet.answers.length) {
            loglevel_1.default.warn('Missing answers. Slicing domain...');
            return await lookupAuthorities(domain, proto, defaultDns, authorities);
        }
        const [answer] = packet.answers;
        if (answer.type !== 'SOA') {
            loglevel_1.default.warn('Received non-SOA answer');
            return await lookupAuthorities(domain, proto, defaultDns, authorities);
        }
        const authority = answer.data.mname;
        loglevel_1.default.debug(`Appending authority ${authority} to authorities`, authorities);
        return await lookupAuthorities(domain, proto, defaultDns, {
            addresses: [...authorities.addresses, authority],
        });
    }
    catch (e) {
        if (e instanceof Error) {
            loglevel_1.default.warn(`Error looking up SOA of ${domain} using ${defaultDns}`, e.message);
            return await lookupAuthorities(domain, proto, defaultDns, authorities);
        }
        else {
            throw e;
        }
    }
};
/**
 * Perform an nslookup for a given domain
 * @param domain The domain for which to lookup NS records
 * @param options An optional map of options
 * @returns An object containing the list of NS addresses for a given domain at it's authority
 */
const NsLookup = async (domain, options = { defaultDns: exports.DEFAULT_DNS, proto: 'udp' }) => {
    const authorities = await lookupAuthorities(domain, options.proto, options.defaultDns);
    loglevel_1.default.info(`Authorities for ${domain}`, authorities.addresses);
    if (!authorities.addresses.length) {
        throw new NoAuthoritiesError(domain);
    }
    const nameservers = await lookupNs(domain, authorities, 'NS', options.proto, options.defaultDns);
    loglevel_1.default.info(`Nameserver records for ${domain}`, nameservers.addresses);
    if (!nameservers.addresses.length) {
        throw new NoNameserversError(domain, authorities);
    }
    return nameservers;
};
exports.NsLookup = NsLookup;
//# sourceMappingURL=nslookup.js.map