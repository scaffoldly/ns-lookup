# ns-lookup

Find NS records in the DNS Hierarchy by discovering and directly querying SOA
records.

This library will take a given domain and walk through each of the subdomains
finding `SOA` records ("authorities") then check each authority for the
existence of an `NS` record.

## Installation

yarn:

```sh
yarn add ns-lookup
```

npm:

```sh
npm install --save ns-lookup
```

## Usage

```typescript
import { NsLookup } from 'ns-lookup';

(await NsLookup('facebook.com')).addresses;
// ["a.ns.facebook.com","b.ns.facebook.com","d.ns.facebook.com","c.ns.facebook.com"]

(await NsLookup('asdf.facebook.com')).addresses;
// Throws NoNameserversError

(await NsLookup('doesnotexist.doesnotexist')).addresses;
// Throws NoAuthoritiesError

(await NsLookup('facebook.com', { proto: 'tcp', defaultDns: '8.8.8.8' })).addresses;
// ["a.ns.facebook.com","b.ns.facebook.com","d.ns.facebook.com","c.ns.facebook.com"]
```

## Options

### **`proto`**:

Set the default protocol, either `tcp` or `udp`. If `tcp` fails, fall back to `udp`.

_Default_: `udp`

### **`defaultDns`**:

Set the default DNS to use for authoratitive lookups.

_Default_: `one.one.one.one`

## Issues

Create an issue in GitHub issues for this repostiory.

## Authors

[Christian Nuss](https://github.com/cnuss)

## Sponsored By

[Scaffoldly](https://scaffold.ly)
