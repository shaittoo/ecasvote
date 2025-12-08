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

// Path to crypto materials (Org1)
const cryptoPath = envOrDefault(
    'CRYPTO_PATH',
    '/home/shaina/go/src/github.com/shaittoo/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com'
);

// Path to user private key directory.
const keyDirectoryPath = envOrDefault(
    'KEY_DIRECTORY_PATH',
    `${cryptoPath}/users/User1@org1.example.com/msp/keystore`
);

// Path to user certificate directory.
const certDirectoryPath = envOrDefault(
    'CERT_DIRECTORY_PATH',
    `${cryptoPath}/users/User1@org1.example.com/msp/signcerts`
);

// Path to peer tls certificate.
const tlsCertPath = envOrDefault(
    'TLS_CERT_PATH',
    `${cryptoPath}/peers/peer0.org1.example.com/tls/ca.crt`
);

const peerEndpoint = process.env.PEER_ENDPOINT || 'localhost:7051';
const peerHostAlias = process.env.PEER_HOST_ALIAS || 'peer0.org1.example.com';

let gateway: Gateway | undefined;
let contract: Contract | undefined;
let network: any | undefined;

export async function getContract(): Promise<Contract> {
  if (contract) return contract;

  const client = await newGrpcConnection();
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
  if (!network) {
    await getContract(); // This will initialize network
  }
  if (!network) {
    throw new Error('Failed to initialize network');
  }
  return network;
}

async function newGrpcConnection(): Promise<grpc.Client> {
  const tlsRootCert = await fs.readFile(tlsCertPath);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(peerEndpoint, tlsCredentials, {
    'grpc.ssl_target_name_override': peerHostAlias,
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
  if (!file) {
    throw new Error(`No files in directory: ${dirPath}`);
  }
  return path.join(dirPath, file);
}
