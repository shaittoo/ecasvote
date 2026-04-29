// src/fabricClient.ts
import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Gateway, Identity, Signer, signers } from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

function envOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

const channelName = process.env.CHANNEL_NAME || 'mychannel';
const chaincodeName = process.env.CHAINCODE_NAME || 'ecasvote';
const mspId = process.env.MSP_ID || 'Org1MSP';

const cryptoBasePath = envOrDefault(
  'CRYPTO_BASE_PATH',
  path.resolve(__dirname, '../../..', 'fabric-network-ecasvote', 'organizations', 'peerOrganizations')
);

const cryptoPath = envOrDefault(
  'CRYPTO_PATH',
  `${cryptoBasePath}/org1.example.com`
);

const keyDirectoryPath = envOrDefault(
  'KEY_DIRECTORY_PATH',
  `${cryptoPath}/users/User1@org1.example.com/msp/keystore`
);

const certDirectoryPath = envOrDefault(
  'CERT_DIRECTORY_PATH',
  `${cryptoPath}/users/User1@org1.example.com/msp/signcerts`
);

const tlsCertPath = envOrDefault(
  'TLS_CERT_PATH',
  `${cryptoPath}/peers/peer0.org1.example.com/tls/ca.crt`
);

const peerEndpoint = process.env.PEER_ENDPOINT || 'localhost:7051';
const peerHostAlias = process.env.PEER_HOST_ALIAS || 'peer0.org1.example.com';

// Org2 peer config
const org2TlsCertPath = `${cryptoBasePath}/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt`;
const org2PeerEndpoint = process.env.PEER_ENDPOINT_ORG2 || 'localhost:9051';
const org2PeerHostAlias = 'peer0.org2.example.com';

// Org3 peer config
const org3TlsCertPath = `${cryptoBasePath}/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt`;
const org3PeerEndpoint = process.env.PEER_ENDPOINT_ORG3 || 'localhost:11051';
const org3PeerHostAlias = 'peer0.org3.example.com';

/** All endorsing org MSP IDs — used by the gateway peer's service discovery
 *  to collect endorsements from Org1, Org2 and Org3. */
export const ALL_ENDORSING_ORGS = ['Org1MSP', 'Org2MSP', 'Org3MSP'];

let gateway: Gateway | undefined;
let contract: Contract | undefined;
let network: any | undefined;
let grpcClients: grpc.Client[] = [];

export async function getContract(): Promise<Contract> {
  if (contract) return contract;

  // Create gRPC connections to all three peers.
  // The Fabric Gateway SDK routes through a single gateway peer (Org1) which
  // uses service discovery to collect endorsements from Org2 and Org3 peers.
  // We keep the additional connections alive so the gateway peer can reach them.
  const client = await newGrpcConnection(tlsCertPath, peerEndpoint, peerHostAlias);
  const client2 = await newGrpcConnection(org2TlsCertPath, org2PeerEndpoint, org2PeerHostAlias);
  const client3 = await newGrpcConnection(org3TlsCertPath, org3PeerEndpoint, org3PeerHostAlias);
  grpcClients = [client, client2, client3];

  gateway = connect({
    client,
    identity: await newIdentity(),
    signer: await newSigner(),
    evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15000 }),
    submitOptions: () => ({ deadline: Date.now() + 5000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
  });

  network = gateway.getNetwork(channelName);
  contract = network.getContract(chaincodeName);

  if (!contract) {
    throw new Error('Failed to get contract');
  }
  return contract;
}

export async function getNetwork() {
  if (!network) await getContract();
  if (!network) throw new Error('Failed to initialize network');
  return network;
}

async function newGrpcConnection(certPath: string, endpoint: string, hostAlias: string): Promise<grpc.Client> {
  const tlsRootCert = await fs.readFile(certPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(endpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': hostAlias,
  });
}

async function newIdentity(): Promise<Identity> {
  const certPath = await getFirstDirFileName(certDirectoryPath);
  const credentials = await fs.readFile(certPath);
  return { mspId, credentials };
}

async function newSigner(): Promise<Signer> {
  const keyPath = await getFirstDirFileName(keyDirectoryPath);
  const privateKeyPem = await fs.readFile(keyPath);
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

async function getFirstDirFileName(dirPath: string): Promise<string> {
  const files = await fs.readdir(dirPath);
  const file = files[0];
  if (!file) throw new Error(`No files in directory: ${dirPath}`);
  return path.join(dirPath, file);
}