import * as net from 'net';
import * as punycode from 'punycode';

import SERVERS from './servers.json';

interface LookupOptions {
  follow?: number;
  timeout?: number;
  verbose?: boolean;
  //	"bind": null     // bind the socket to a local IP address
}

interface ServerInfo {
  host: string;
  port: number;
  query: string;
}

const defaultOptions: LookupOptions = {
  follow: 2,
  timeout: 60000,
};

const defaultServer = {
  port: 43,
  query: "$addr\r\n",
}

function cleanParsingErrors(string: string): string {
  return string.replace(/^[:\s]+/, '').replace(/^https?[:\/]+/, '') || string;
};

function parseServerUri(serverUri: string): ServerInfo {
  const parts = cleanParsingErrors(serverUri).split(':');

  let port = Number.parseInt(parts[1])
  if (Number.isNaN(port))
    port = 43;

  return {
    ...defaultServer,
    host: parts[0],
    port: port,
  };
}

function getServer(addr: string) {
  let server: any;

  if (addr.includes('@'))
    throw new Error('lookup: email addresses not supported');
  else if (net.isIP(addr) !== 0)
    server = SERVERS['_'];
  else {
    let tld = punycode.toASCII(addr);
    while (true) {
      server = SERVERS[tld];
      if (!tld || server)
        break;
      tld = tld.replace(/^.+?(\.|$)/, '');
    }
  }

  if (!server)
    throw new Error('lookup: no whois server is known for this kind of object');

  if (typeof server === 'string')
    return parseServerUri(server);
  return {...defaultServer, ...server};
}


async function doLookup(addr: string, options: LookupOptions, server?: ServerInfo): Promise<string> {

  if (!server)
    server = getServer(addr);

  const sockOpts: net.NetConnectOpts = {
    host: server.host,
    port: server.port,
  };

  // if (options.bind) 
  //   sockOpts.localAddress = options.bind;

  const socket = net.connect(sockOpts);

  if (options.timeout)
    socket.setTimeout(options.timeout);

  return await new Promise((resolve, reject) => {
    let data = '';

    socket.write(server.query.replace('$addr', addr));
    socket.on('data', chunk => { data += chunk });
    socket.on('error', err => { reject({message: 'Network error', server, err}) });

    socket.on('timeout', function () {
      socket.destroy();
      reject(new Error('lookup: timeout'));
    });

    socket.on('close', async function (err) {
      if (err)
        reject(err);

      if (options.follow > 0) {
        const match = data.replace(/\r/gm, '').match(/(ReferralServer|Registrar Whois|Whois Server|WHOIS Server|Registrar WHOIS Server):[^\S\n]*((?:r?whois|https?):\/\/)?(.*)/);
        if ((match != null) && match[3] !== server.host) {
          options.follow = options.follow - 1;
          try {
            const lookupServer = parseServerUri(match[3].trim());
            data = await doLookup(addr, options, lookupServer);
          } catch (e) {
            reject(e)
          }
        }
      }

      if (options.verbose)
        console.log({ domain: addr, server: server.host.trim(), data: data });
      return resolve(data);
    });
  });;
}

export default async function lookup(addr: string, options?: LookupOptions): Promise<string> {
  const opts = { ...defaultOptions, ...options }
  return await doLookup(addr, opts);
}