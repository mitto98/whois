import {lookup} from './src';

async function resolveDomain(domain: string) {
  console.log(domain);
  try {
    const response = await lookup(domain);
    console.log(response);
  } catch (e) {
    console.log(e);
  }
}

async function main() {
  const domains = [
    'systa.it',
    'github.com',
    // 'microsoft.com',
    // 'google.eu',
  ];

  for (const domain of domains) {
    await resolveDomain(domain);
  }
}

main();