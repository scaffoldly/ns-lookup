#!/usr/bin/env node

import { NsLookup, DEFAULT_DNS } from '../src';
import log from 'loglevel';

function usage() {
  // eslint-disable-next-line no-console
  console.error('Usage: soans [@1.1.1.1] [--verbose] [--debug] [--tcp] domain');
  process.exit(-1);
}

(async () => {
  try {
    const defaultDns = process.argv.find((arg) => arg.startsWith('@')) || `@${DEFAULT_DNS}`;
    const proto = process.argv.find((arg) => arg === '--tcp' || arg === '--udp') || '--udp';
    const verbose = process.argv.find((arg) => arg === '--verbose');
    const debug = process.argv.find((arg) => arg === '--debug');

    const domain = process.argv.slice(-1)[0];
    if (process.argv.length <= 2 || !domain || domain.startsWith('@') || domain.startsWith('--')) {
      usage();
      return;
    }

    if (debug) {
      log.setLevel('DEBUG');
    }

    const nameservers = await NsLookup(domain, {
      defaultDns: defaultDns.replace('@', ''),
      proto: proto === '--tcp' ? 'tcp' : 'udp',
    });

    if (!verbose) {
      nameservers.addresses.forEach((address) => {
        // eslint-disable-next-line no-console
        console.log(address);
      });
    } else {
      // eslint-disable-next-line no-console
      console.log(`Authority:\n\t${nameservers.authority}`);
      // eslint-disable-next-line no-console
      console.log(`Nameservers:`);
      nameservers.addresses.forEach((address) => {
        // eslint-disable-next-line no-console
        console.log(`\t${address}`);
      });
    }
  } catch (e) {
    if (e instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(`Lookup error: `, e.message);
      process.exit(-1);
    }
    throw e;
  }
  process.exit(0);
})();
