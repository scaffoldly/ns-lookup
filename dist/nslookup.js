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
exports.NsLookup = void 0;
const dns_packet_1 = __importStar(require("dns-packet"));
const dgram_as_promised_1 = __importDefault(require("dgram-as-promised"));
const net_1 = __importDefault(require("net"));
const promise_socket_1 = require("promise-socket");
// TODO FOR TESTING:
// Nonexistant domain
// Nonexistent NS records at top domain
// Extra subdomains
// Top level domain
const sendAndReceive = async (host, port, buf, proto) => {
    if (proto === 'tcp') {
        try {
            console.log('Using TCP');
            const socket = new promise_socket_1.PromiseSocket(new net_1.default.Socket());
            socket.setTimeout(500);
            await socket.connect(port, host);
            await socket.write(buf);
            const read = await socket.readAll();
            if (!read || !(read instanceof Buffer)) {
                console.log('Unexpected non-buffer response', read);
                return await sendAndReceive(host, port, buf, 'udp');
            }
            socket.destroy();
            return read;
        }
        catch (e) {
            console.log(`Communication error`, e.message);
            return await sendAndReceive(host, port, buf, 'udp');
        }
    }
    try {
        console.log('Using UDP');
        const socket = dgram_as_promised_1.default.createSocket('udp4');
        await socket.send(buf, 0, buf.length, port, host);
        const read = await socket.recv();
        if (!read || !read.msg) {
            console.log('Missing response', read);
            return undefined;
        }
        console.log('!! rinfo', JSON.stringify(read.rinfo));
        socket.destroy();
        return read.msg;
    }
    catch (e) {
        console.log(`Communication error`, e.message);
        return undefined;
    }
};
const DEFAULT_DNS = 'one.one.one.one';
// const lookupA = async (domain: string): Promise<string[]> => {
//   console.log(`A-record lookup for domain ${domain} using ${DEFAULT_DNS}`);
//   const socket = dgram.createSocket('udp4');
//   const buf = dnsPacket.encode({
//     id: new Date().getTime() % 10000,
//     type: 'query',
//     flags: RECURSION_DESIRED,
//     questions: [
//       {
//         type: 'A',
//         name: domain,
//       },
//     ],
//   });
//   try {
//     await socket.send(buf, 0, buf.length, 53, DEFAULT_DNS);
//     const received = await socket.recv();
//     socket.destroy();
//     if (!received) {
//       console.log('No packet received');
//       return [];
//     }
//     const packet = dnsPacket.decode(received.msg);
//     console.log('A lookup packet', JSON.stringify(packet, null, 2));
//     if (!packet.answers || !packet.answers.length) {
//       console.log('No answers', packet);
//       return [];
//     }
//     return packet.answers.map((answer) => (answer as StringAnswer).data);
//   } catch (e: any) {
//     return [];
//   }
// };
const lookupNs = async (domain, authorities, type = 'NS', proto = 'udp') => {
    console.log(`NS-record lookup via ${type} for domain ${domain} using authorities`, authorities);
    if (authorities && authorities.length === 0) {
        return [];
    }
    let flags = dns_packet_1.default.CHECKING_DISABLED;
    let includeAuthorities = true;
    if (!authorities) {
        // eslint-disable-next-line no-bitwise
        flags |= dns_packet_1.default.RECURSION_DESIRED;
        // eslint-disable-next-line no-param-reassign
        authorities = [DEFAULT_DNS];
        includeAuthorities = false;
    }
    const authority = authorities[0];
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
        // const authorityIps = await lookupA(authority);
        // if (!authorityIps.length) {
        //   console.log(`Unable to find IPs for authority ${authority}`);
        //   return await lookupNs(domain, authorities.slice(1), 'NS', proto);
        // }
        // console.log(`IPs for authority ${authority}:`, authorityIps);
        // const authorityIp = authorityIps[0];
        const received = await sendAndReceive(authority, 53, buf, proto);
        if (!received) {
            console.log('Missing packet');
            return await lookupNs(domain, authorities.slice(1), 'NS', proto);
        }
        const packet = dns_packet_1.default.decode(received);
        console.log('NS lookup packet', JSON.stringify(packet, null, 2));
        const responses = includeAuthorities
            ? [...(packet.authorities || []), ...(packet.answers || [])]
            : packet.answers || [];
        if (!responses.length) {
            console.log(`No ${includeAuthorities ? 'authorities or answers' : 'answers'}`, packet);
            return await lookupNs(domain, authorities.slice(1), 'NS', proto);
        }
        const answers = new Set(responses.filter((a) => a.type === 'NS' && (a.name === domain || a.name === `${domain}.`)));
        if (!answers.size) {
            console.log(`No NS records on ${domain} from ${authority} using ${type} query`, packet);
            if (type === 'NS') {
                // Strange issue found on EC2 where `dig @{AUTHORITY} -t NS {DOMAIN}` returns different answers than mac
                // So, Fall back to SOA query, which does appear to give NS records in authority section
                return await lookupNs(domain, authorities, 'SOA', proto);
            }
            return await lookupNs(domain, authorities.slice(1), 'NS', proto);
        }
        return [...answers].map((answer) => answer.data);
    }
    catch (e) {
        console.warn(`Error looking up NS of ${domain} from ${authority}`, e.message);
        return await lookupNs(domain, authorities.slice(1), 'NS', proto);
    }
};
const lookupAuthorities = async (lookup, authorities = [], skip = 1) => {
    console.log(`SOA-record lookup for domain ${lookup} using ${DEFAULT_DNS}`);
    const parts = lookup.split('.').slice(skip);
    if (parts.length === 0) {
        return authorities;
    }
    if (parts.length === 1) {
        // In the event of a TLD query (.dev, .com, .net), lookup NS for the authority
        const nameservers = await lookupNs(lookup);
        return [...authorities, ...nameservers];
    }
    const socket = dgram_as_promised_1.default.createSocket('udp4');
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
        await socket.send(buf, 0, buf.length, 53, DEFAULT_DNS);
        const received = await socket.recv();
        socket.destroy();
        if (!received) {
            console.log('No packet received');
            return await lookupAuthorities(domain, authorities);
        }
        const packet = dns_packet_1.default.decode(received.msg);
        console.log('SOA lookup packet', JSON.stringify(packet, null, 2));
        if (!packet.answers || !packet.answers.length) {
            console.log('Missing answers', packet);
            return await lookupAuthorities(domain, authorities);
        }
        const [answer] = packet.answers;
        if (answer.type !== 'SOA') {
            console.log('Answer is not SOA', packet);
            return await lookupAuthorities(domain, authorities);
        }
        const authority = answer.data.mname;
        console.log(`Appending authority ${authority} to authorities`, authorities);
        return await lookupAuthorities(domain, [...authorities, authority]);
    }
    catch (e) {
        console.warn(`Error looking up SOA of ${domain} using ${DEFAULT_DNS}`, e.message);
        return await lookupAuthorities(domain, authorities);
    }
};
const NsLookup = async (domain) => {
    const authorities = await lookupAuthorities(domain);
    console.log(`Authorities for ${domain}`, authorities);
    if (!authorities || !authorities.length) {
        throw new Error(`No authorities found for ${domain}`);
    }
    const records = await lookupNs(domain, authorities);
    console.log(`NS records for ${domain}`, records);
    return records;
};
exports.NsLookup = NsLookup;
//# sourceMappingURL=nslookup.js.map