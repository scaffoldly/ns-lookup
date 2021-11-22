#!/usr/bin/env node

import { NsLookup } from '../src';

function usage() {
  // eslint-disable-next-line no-console
  console.error('Usage: soans [domain]');
  process.exit(-1);
}

(async () => {
  try {
    const domain = process.argv.slice(2)[0];
    if (!domain) {
      usage();
      return;
    }
    const nameservers = await NsLookup(domain);
    nameservers.addresses.forEach((address) => {
      // eslint-disable-next-line no-console
      console.log(address);
    });
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
