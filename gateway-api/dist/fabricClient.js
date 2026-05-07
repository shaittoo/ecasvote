"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_ENDORSING_ORGS = void 0;
exports.getContract = getContract;
exports.getNetwork = getNetwork;
// src/fabricClient.ts
const grpc = __importStar(require("@grpc/grpc-js"));
const fabric_gateway_1 = require("@hyperledger/fabric-gateway");
const crypto = __importStar(require("crypto"));
const fs_1 = require("fs");
const path = __importStar(require("path"));
function envOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}
const channelName = process.env.CHANNEL_NAME || 'mychannel';
const chaincodeName = process.env.CHAINCODE_NAME || 'ecasvote';
const mspId = process.env.MSP_ID || 'Org1MSP';
const cryptoBasePath = envOrDefault('CRYPTO_BASE_PATH', path.resolve(__dirname, '../../..', 'fabric-network-ecasvote', 'organizations', 'peerOrganizations'));
const cryptoPath = envOrDefault('CRYPTO_PATH', `${cryptoBasePath}/org1.example.com`);
const keyDirectoryPath = envOrDefault('KEY_DIRECTORY_PATH', `${cryptoPath}/users/User1@org1.example.com/msp/keystore`);
const certDirectoryPath = envOrDefault('CERT_DIRECTORY_PATH', `${cryptoPath}/users/User1@org1.example.com/msp/signcerts`);
const tlsCertPath = envOrDefault('TLS_CERT_PATH', `${cryptoPath}/peers/peer0.org1.example.com/tls/ca.crt`);
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
exports.ALL_ENDORSING_ORGS = ['Org1MSP', 'Org2MSP', 'Org3MSP'];
let gateway;
let contract;
let network;
let grpcClients = [];
async function getContract() {
    if (contract)
        return contract;
    // Create gRPC connections to all three peers.
    // The Fabric Gateway SDK routes through a single gateway peer (Org1) which
    // uses service discovery to collect endorsements from Org2 and Org3 peers.
    // We keep the additional connections alive so the gateway peer can reach them.
    const client = await newGrpcConnection(tlsCertPath, peerEndpoint, peerHostAlias);
    const client2 = await newGrpcConnection(org2TlsCertPath, org2PeerEndpoint, org2PeerHostAlias);
    const client3 = await newGrpcConnection(org3TlsCertPath, org3PeerEndpoint, org3PeerHostAlias);
    grpcClients = [client, client2, client3];
    gateway = (0, fabric_gateway_1.connect)({
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
async function getNetwork() {
    if (!network)
        await getContract();
    if (!network)
        throw new Error('Failed to initialize network');
    return network;
}
async function newGrpcConnection(certPath, endpoint, hostAlias) {
    const tlsRootCert = await fs_1.promises.readFile(certPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(endpoint, tlsCredentials, {
        'grpc.ssl_target_name_override': hostAlias,
    });
}
async function newIdentity() {
    const certPath = await getFirstDirFileName(certDirectoryPath);
    const credentials = await fs_1.promises.readFile(certPath);
    return { mspId, credentials };
}
async function newSigner() {
    const keyPath = await getFirstDirFileName(keyDirectoryPath);
    const privateKeyPem = await fs_1.promises.readFile(keyPath);
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return fabric_gateway_1.signers.newPrivateKeySigner(privateKey);
}
async function getFirstDirFileName(dirPath) {
    const files = await fs_1.promises.readdir(dirPath);
    const file = files[0];
    if (!file)
        throw new Error(`No files in directory: ${dirPath}`);
    return path.join(dirPath, file);
}
