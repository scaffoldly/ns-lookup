#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
const loglevel_1 = __importDefault(require("loglevel"));
function usage() {
    // eslint-disable-next-line no-console
    console.error('Usage: soans [@1.1.1.1] [--verbose] [--debug] [--tcp] domain');
    process.exit(-1);
}
(async () => {
    try {
        const defaultDns = process.argv.find((arg) => arg.startsWith('@')) || `@${src_1.DEFAULT_DNS}`;
        const proto = process.argv.find((arg) => arg === '--tcp' || arg === '--udp') || '--udp';
        const verbose = process.argv.find((arg) => arg === '--verbose');
        const debug = process.argv.find((arg) => arg === '--debug');
        const domain = process.argv.slice(-1)[0];
        if (!domain) {
            usage();
            return;
        }
        if (debug) {
            loglevel_1.default.setLevel('DEBUG');
        }
        const nameservers = await (0, src_1.NsLookup)(domain, {
            defaultDns: defaultDns.replace('@', ''),
            proto: proto === '--tcp' ? 'tcp' : 'udp',
        });
        if (!verbose) {
            nameservers.addresses.forEach((address) => {
                // eslint-disable-next-line no-console
                console.log(address);
            });
        }
        else {
            // eslint-disable-next-line no-console
            console.log(`Authority:\n\t${nameservers.authority}`);
            // eslint-disable-next-line no-console
            console.log(`Nameservers:`);
            nameservers.addresses.forEach((address) => {
                // eslint-disable-next-line no-console
                console.log(`\t${address}`);
            });
        }
    }
    catch (e) {
        if (e instanceof Error) {
            // eslint-disable-next-line no-console
            console.error(`Lookup error: `, e.message);
            process.exit(-1);
        }
        throw e;
    }
    process.exit(0);
})();
//# sourceMappingURL=index.js.map