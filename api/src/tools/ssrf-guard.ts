import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Blocks requests to addresses that are not on the public internet.
 *
 * Two things feed URLs into the fetcher and neither is trustworthy: search
 * results, which anyone able to rank a page can influence, and the `sources`
 * array of an article, which the publish preflight re-fetches to check the links
 * are alive. That makes this a server-side request forgery surface. Without a
 * check, a source URL of "http://169.254.169.254/latest/meta-data/iam/
 * security-credentials/" is one the API would dutifully fetch and hand back
 * cloud credentials for.
 *
 * Validation happens against the *resolved* addresses, not the hostname, because
 * an attacker-controlled DNS record can point a public-looking name at 127.0.0.1.
 * Redirects are followed manually so each hop is re-checked — a permitted host
 * that 302s to a private address is the standard bypass.
 *
 * A time-of-check/time-of-use gap remains: Node resolves the name again when it
 * connects, and a DNS rebind could return a different address. Closing that
 * properly means pinning the connection to the validated IP with a custom agent.
 * For a single-operator tool whose URLs come from a research brief rather than
 * untrusted user input, the residual risk is small — but it is a real gap, not
 * an absent one.
 */

export class BlockedAddressError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`Refusing to fetch ${url}: ${reason}`);
    this.name = 'BlockedAddressError';
  }
}

function ipv4IsPrivate(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved

  return false;
}

function ipv6IsPrivate(address: string): boolean {
  const addr = address.toLowerCase().split('%')[0];

  if (addr === '::1' || addr === '::') return true;

  // IPv4-mapped (::ffff:127.0.0.1) — check the embedded v4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return ipv4IsPrivate(mapped[1]);

  const first = parseInt(addr.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

export function addressIsPrivate(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4IsPrivate(address);
  if (version === 6) return ipv6IsPrivate(address);
  return true; // unparseable — refuse
}

/**
 * Throws unless the URL is http(s) and every address its host resolves to is on
 * the public internet.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedAddressError(rawUrl, 'not a valid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedAddressError(rawUrl, `scheme "${url.protocol}" is not http(s)`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  // An IP literal needs no resolution.
  if (isIP(host)) {
    if (addressIsPrivate(host)) {
      throw new BlockedAddressError(rawUrl, `${host} is not a public address`);
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new BlockedAddressError(rawUrl, `could not resolve "${host}"`);
  }

  if (!addresses.length) {
    throw new BlockedAddressError(rawUrl, `"${host}" resolved to no addresses`);
  }

  // Every address must be public. One private answer is enough to refuse — a
  // host that resolves to both is a rebinding attempt.
  const blocked = addresses.filter((a) => addressIsPrivate(a.address));
  if (blocked.length) {
    throw new BlockedAddressError(
      rawUrl,
      `"${host}" resolves to a non-public address (${blocked.map((b) => b.address).join(', ')})`,
    );
  }

  return url;
}
