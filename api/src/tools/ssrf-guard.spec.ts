import { addressIsPrivate, assertPublicUrl, BlockedAddressError } from './ssrf-guard';

describe('addressIsPrivate', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.53.1.9', 'loopback range'],
    ['10.0.0.1', 'RFC1918 /8'],
    ['172.16.0.1', 'RFC1918 /12 lower bound'],
    ['172.31.255.254', 'RFC1918 /12 upper bound'],
    ['192.168.1.1', 'RFC1918 /16'],
    ['169.254.169.254', 'cloud metadata endpoint'],
    ['0.0.0.0', 'this network'],
    ['100.64.0.1', 'CGNAT'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fc00::1', 'IPv6 unique local'],
    ['fd12:3456::1', 'IPv6 unique local'],
    ['fe80::1', 'IPv6 link-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata endpoint'],
    ['not-an-address', 'unparseable'],
  ])('blocks %s (%s)', (address) => {
    expect(addressIsPrivate(address)).toBe(true);
  });

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['172.15.0.1'], // just below the RFC1918 /12 range
    ['172.32.0.1'], // just above it
    ['192.167.0.1'], // just below 192.168/16
    ['2606:4700:4700::1111'],
  ])('allows %s', (address) => {
    expect(addressIsPrivate(address)).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it.each([
    ['file:///etc/passwd', 'file scheme'],
    ['ftp://example.com/x', 'ftp scheme'],
    ['gopher://example.com', 'gopher scheme'],
    ['not a url', 'unparseable'],
  ])('rejects %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it.each([
    ['http://127.0.0.1:3000/api/articles'],
    ['http://169.254.169.254/latest/meta-data/'],
    ['https://10.0.0.5/internal'],
    ['http://[::1]:5432/'],
  ])('rejects the IP literal %s without a DNS lookup', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('rejects a hostname that resolves to loopback', async () => {
    // localhost resolves to 127.0.0.1 and/or ::1 on every platform.
    await expect(assertPublicUrl('http://localhost:3000/')).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
  });

  it('names the reason it refused', async () => {
    await expect(assertPublicUrl('http://169.254.169.254/')).rejects.toMatchObject({
      reason: expect.stringContaining('not a public address'),
    });
  });
});
