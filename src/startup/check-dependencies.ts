import * as technitium from '../services/technitium';
import * as caddy from '../services/caddy';

function printBlock(message: string): void {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(message);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

export async function checkDependencies(): Promise<void> {
  try {
    const technitiumReady = await technitium.healthCheck();

    if (!technitiumReady) {
      printBlock(`  Technitium DNS Server is not running.
  LocalDNS requires Technitium to manage DNS records.

  Install instructions:
  macOS / Linux:
    curl -sSL https://download.technitium.com/dns/install.sh | sudo bash

  Windows:
    Download from https://technitium.com/dns/
    Run the installer, it registers as a Windows service automatically.

  After installing, open http://localhost:5380 in your browser,
  complete the setup wizard, then run this server again.`);
      process.exit(1);
    }

    console.log('✓ Technitium DNS  reachable at http://localhost:5380');
  } catch {
    printBlock(`  Technitium DNS Server is not running.
  LocalDNS requires Technitium to manage DNS records.

  Install instructions:
  macOS / Linux:
    curl -sSL https://download.technitium.com/dns/install.sh | sudo bash

  Windows:
    Download from https://technitium.com/dns/
    Run the installer, it registers as a Windows service automatically.

  After installing, open http://localhost:5380 in your browser,
  complete the setup wizard, then run this server again.`);
    process.exit(1);
  }

  try {
    const caddyReady = await caddy.healthCheck();

    if (!caddyReady) {
      printBlock(`  Caddy is not running.
  LocalDNS requires Caddy to route domains to local ports.

  Install instructions:
  macOS:
    brew install caddy && brew services start caddy

  Linux:
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update && sudo apt install caddy

  Windows:
    winget install Caddy.Caddy

  After installing, ensure the Caddy admin API is enabled on port 2019
  (this is the default — no config change needed).
  Then run this server again.`);
      process.exit(1);
    }

    console.log('✓ Caddy           reachable at http://localhost:2019');
  } catch {
    printBlock(`  Caddy is not running.
  LocalDNS requires Caddy to route domains to local ports.

  Install instructions:
  macOS:
    brew install caddy && brew services start caddy

  Linux:
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update && sudo apt install caddy

  Windows:
    winget install Caddy.Caddy

  After installing, ensure the Caddy admin API is enabled on port 2019
  (this is the default — no config change needed).
  Then run this server again.`);
    process.exit(1);
  }
}
