import dnsPacket, { RECURSION_DESIRED, SoaAnswer, StringAnswer } from 'dns-packet';
import dgram from 'dgram-as-promised';
import net from 'net';
import { PromiseSocket } from 'promise-socket';
import log from 'loglevel';

export type Protocol = 'udp' | 'tcp';

export type RecordType = 'NS' | 'SOA';

/**
 * NS Lookup Options
 */
export type NsLookupOptions = {
  /**
   * DNS to use for SOA records, defaults to `one.one.one.one`
   */
  defaultDns?: string;
  /**
   * Protocol to use for DNS queries, either `tcp` or `udp`, defaults to `udp`.
   */
  proto?: Protocol;
};

export type Address = string;

export type AddressList = Address[];

export type Nameservers = {
  addresses: AddressList;
  authority: Address | null;
};

export type Authorities = {
  addresses: AddressList;
};

export class NoAuthoritiesError extends Error {
  constructor(domain: string) {
    super(`No authorities found for ${domain}`);
  }
}

export class NoNameserversError extends Error {
  constructor(domain: string, authorities: Authorities) {
    super(
      `No nameservers found for ${domain} from authorities ${JSON.stringify(
        authorities.addresses,
      )}`,
    );
  }
}

export const DEFAULT_DNS = 'one.one.one.one';

const sendAndReceive = async (
  host: string,
  port: number,
  buf: Buffer,
  proto: 'tcp' | 'udp',
): Promise<Buffer | undefined> => {
  log.trace(`Performing ${proto} request to ${host}:${port}`);
  if (proto === 'tcp') {
    try {
      const socket = new PromiseSocket(new net.Socket());
      socket.setTimeout(500);
      await socket.connect(port, host);
      await socket.write(buf);
      const read = await socket.readAll();
      if (!read || !(read instanceof Buffer)) {
        throw new Error('Unexpected non-buffer response');
      }
      socket.destroy();
      return read;
    } catch (e) {
      if (e instanceof Error) {
        log.warn(`Communication error, falling back to UDP:`, e.message);
        return await sendAndReceive(host, port, buf, 'udp');
      } else {
        throw e;
      }
    }
  }

  try {
    const socket = dgram.createSocket('udp4');
    await socket.send(buf, 0, buf.length, port, host);
    const read = await socket.recv();
    if (!read || !read.msg) {
      throw new Error(`No response from ${host}:${port}`);
    }
    socket.destroy();
    return read.msg;
  } catch (e) {
    if (e instanceof Error) {
      log.warn(`Communication error`, e.message);
      return undefined;
    } else {
      throw e;
    }
  }
};

const lookupNs = async (
  domain: string,
  authorities?: Authorities,
  type: RecordType = 'NS',
  proto: Protocol = 'udp',
  defaultDns = DEFAULT_DNS,
): Promise<Nameservers> => {
  log.trace(`NS-record lookup via ${type} for domain ${domain} using authorities`, authorities);

  if (authorities && authorities.addresses.length === 0) {
    log.debug(`No authorities left to try`);
    return { addresses: [], authority: null };
  }

  let flags = dnsPacket.CHECKING_DISABLED;
  let includeAuthorities = true;
  if (!authorities) {
    log.debug(`No authorities provided, executing a recursive lookup using ${defaultDns}`);
    // eslint-disable-next-line no-bitwise
    flags |= dnsPacket.RECURSION_DESIRED;
    // eslint-disable-next-line no-param-reassign
    authorities = { addresses: [defaultDns] };
    includeAuthorities = false;
  }

  const authority = authorities.addresses[0];

  const buf = dnsPacket.encode({
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
      log.warn(`No data received from ${authority} for ${type} record on ${domain}`);
      return await lookupNs(
        domain,
        { addresses: authorities.addresses.slice(1) },
        'NS',
        proto,
        defaultDns,
      );
    }

    const packet = dnsPacket.decode(received);
    log.debug(`Decoded packet from ${authority}:`, JSON.stringify(packet));

    const responses = includeAuthorities
      ? [...(packet.authorities || []), ...(packet.answers || [])]
      : packet.answers || [];

    if (!responses.length) {
      log.warn(`No ${includeAuthorities ? 'authorities or answers' : 'answers'} in response`);
      return await lookupNs(
        domain,
        { addresses: authorities.addresses.slice(1) },
        'NS',
        proto,
        defaultDns,
      );
    }

    const answers = new Set(
      responses.filter((a) => a.type === 'NS' && (a.name === domain || a.name === `${domain}.`)),
    );
    if (!answers.size) {
      log.warn(`No NS records on ${domain} from ${authority} using ${type} query`);
      if (type === 'NS') {
        log.debug(`Checking SOA record of ${domain} for NS records`);
        return await lookupNs(domain, authorities, 'SOA', proto, defaultDns);
      }
      return await lookupNs(
        domain,
        { addresses: authorities.addresses.slice(1) },
        'NS',
        proto,
        defaultDns,
      );
    }

    const addresses = [...answers].map((answer) => (answer as StringAnswer).data);
    return { addresses, authority };
  } catch (e) {
    if (e instanceof Error) {
      log.warn(`Error looking up NS of ${domain} from ${authority}`, e.message);
      return await lookupNs(
        domain,
        { addresses: authorities.addresses.slice(1) },
        'NS',
        proto,
        defaultDns,
      );
    } else {
      throw e;
    }
  }
};

const lookupAuthorities = async (
  lookup: string,
  proto: Protocol = 'udp',
  defaultDns = DEFAULT_DNS,
  authorities: Authorities = { addresses: [] },
): Promise<Authorities> => {
  log.trace(`SOA-record lookup for domain ${lookup} using ${defaultDns}`);

  const parts = lookup.split('.').slice(1);

  if (parts.length === 0) {
    return authorities;
  }

  if (parts.length === 1) {
    log.debug(`Looking up NS records for TLD ${lookup}`);
    // In the event of a TLD query (.dev, .com, .net), lookup NS for the authority
    const nameservers = await lookupNs(lookup, undefined, 'NS', proto, defaultDns);
    return {
      addresses: [...authorities.addresses, ...nameservers.addresses],
    };
  }

  const domain = parts.join('.');

  const buf = dnsPacket.encode({
    id: new Date().getTime() % 1000,
    type: 'query',
    flags: RECURSION_DESIRED,
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
      log.warn(`No data received from ${defaultDns} for SOA record on ${domain}`);
      return await lookupAuthorities(domain, proto, defaultDns, authorities);
    }
    const packet = dnsPacket.decode(received);
    log.debug('Decoded SOA packet', JSON.stringify(packet));

    if (!packet.answers || !packet.answers.length) {
      log.warn('Missing answers. Slicing domain...');
      return await lookupAuthorities(domain, proto, defaultDns, authorities);
    }
    const [answer] = packet.answers;
    if (answer.type !== 'SOA') {
      log.warn('Received non-SOA answer');
      return await lookupAuthorities(domain, proto, defaultDns, authorities);
    }
    const authority = (answer as SoaAnswer).data.mname;
    log.debug(`Appending authority ${authority} to authorities`, authorities);

    return await lookupAuthorities(domain, proto, defaultDns, {
      addresses: [...authorities.addresses, authority],
    });
  } catch (e) {
    if (e instanceof Error) {
      log.warn(`Error looking up SOA of ${domain} using ${defaultDns}`, e.message);
      return await lookupAuthorities(domain, proto, defaultDns, authorities);
    } else {
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
export const NsLookup = async (
  domain: string,
  options: NsLookupOptions = { defaultDns: DEFAULT_DNS, proto: 'udp' },
): Promise<Nameservers> => {
  const authorities = await lookupAuthorities(domain, options.proto, options.defaultDns);
  log.info(`Authorities for ${domain}`, authorities.addresses);
  if (!authorities.addresses.length) {
    throw new NoAuthoritiesError(domain);
  }
  const nameservers = await lookupNs(domain, authorities, 'NS', options.proto, options.defaultDns);
  log.info(`Nameserver records for ${domain}`, nameservers.addresses);
  if (!nameservers.addresses.length) {
    throw new NoNameserversError(domain, authorities);
  }
  return nameservers;
};
