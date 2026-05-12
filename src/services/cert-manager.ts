import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { db } from '../db/client';

function sanitiseArg(input: string): string {
  const sanitised = input.replace(/[^\w./~-]/g, '');

  if (!sanitised) {
    throw new Error('Argument sanitised to empty string');
  }

  return sanitised;
}

async function getCertDir(): Promise<string> {
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('cert_dir') as { value: string } | undefined;
  return setting?.value || `${process.env.HOME || process.env.USERPROFILE}/.localdns/certs`;
}

export async function generateCert(domain: string): Promise<{ certPath: string; keyPath: string }> {
  const certDir = await getCertDir();
  await fs.mkdir(certDir, { recursive: true });

  const sanitisedDomain = sanitiseArg(domain);
  const certPath = join(certDir, `${sanitisedDomain}.pem`);
  const keyPath = join(certDir, `${sanitisedDomain}-key.pem`);

  return new Promise((resolve, reject) => {
    const child = spawn('mkcert', [
      '-cert-file', certPath,
      '-key-file', keyPath,
      domain
    ]);

    let stderr = '';
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ certPath, keyPath });
      } else {
        reject(new Error(`mkcert failed: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

export async function deleteCert(domain: string): Promise<void> {
  const certDir = await getCertDir();
  const sanitisedDomain = sanitiseArg(domain);

  const certPath = join(certDir, `${sanitisedDomain}.pem`);
  const keyPath = join(certDir, `${sanitisedDomain}-key.pem`);

  try {
    await fs.unlink(certPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  try {
    await fs.unlink(keyPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
