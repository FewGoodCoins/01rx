import { Keypair } from '@solana/web3.js';
import base58Module from 'bs58';

const base58 = base58Module.default || base58Module;
const keypair = Keypair.generate();

process.stderr.write(
  'Store the signing key only in the Trivium server environment. Never commit it or expose it through VITE_*.\n',
);
process.stdout.write(
  `O1RX_ATTRIBUTION_PUBLIC_KEY=${keypair.publicKey.toBase58()}\n`,
);
process.stdout.write(
  `O1RX_ATTRIBUTION_SIGNING_KEY=${base58.encode(keypair.secretKey)}\n`,
);
