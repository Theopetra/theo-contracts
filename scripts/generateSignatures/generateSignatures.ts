import hre from 'hardhat';
import { ethers } from 'hardhat';
import { SignerHelper__factory} from '../../typechain-types';
import fs from 'fs';
import * as path from 'path';

const loadEnvVar = (s: string): string => {
  const v = process.env[s] ? process.env[s] : '';
  if (!v) throw new Error(`${s} not found in process.env`);
  return v;
};

async function waitFor<T>(p: Promise<{ wait: () => Promise<T> }>): Promise<T> {
  const tx = await p;
  return tx.wait();
}

const SIGNING_SECRET = loadEnvVar('WHITELIST_SECRET');

const WL_ADDRESSES: string[] = [
  "0x474627714EC7cE9CF185c2a42d15D99c218555f1",
  "0x06f3a31e675ddFEBafC87435686E63C156E2236C",
  "0xEd75Eb99ffD5f1ca9Ada7315c4fDE8622504C7c9",
  "0xAd72dEd03A5110c1807E68022D25c75E79B50eC5",
  "0x2C9a73387726496623428e91EC4F3be5BE3F0001",
  "0x66d8519A8070e76f3D33BdF4f36C9DbcF3bF4723",
  "0x9E18357549D4727d5bE5ac2De9C84c9E75d03C00",
  "0xC15fd409E50d512AEB979a4965852Ff232806282",
  "0x2a000fc65c2563A48ff155632C6A8261D8f73092",
  "0xF875eE97fbD4D248F1EcC037966329AF71dFBB06",
  "0x9093Fe9006eA968334D7302aF8255aa6C7Ba7869",
  "0x38fEF205B860125aF8E96E3b73A23b414074f103",
  "0xA8133947C84379D29A6deBb7a7Dc5bf9C6653F8d",
  "0x1dd0c4579Ed72636cfE12e017E97Eb748daaA654",
  "0xb59A6603AB98aa6Aeb0a9657A44264a36ad0Ea77",
];

async function generateSignatures() {
  const networkName = hre.network.name;
  const WL_CONTRACT_ADDRESS = loadEnvVar('WL_CONTRACT_ADDRESS');
  const WETH_HELPER_CONTRACT_ADDRESS = loadEnvVar('WETH_HELPER_CONTRACT_ADDRESS');

  if (!WL_CONTRACT_ADDRESS) throw Error('Must provide whitelist bond depo contract address');
  if (!WETH_HELPER_CONTRACT_ADDRESS) throw Error('Must provide weth helper contract address');

  const WLSIGNED = [];
  const WETHHELPERSIGNED = [];

  const [deployer] = await ethers.getSigners();
  const SignerHelper = new SignerHelper__factory(deployer);
  const signerHelper = await SignerHelper.deploy();

  for (let i = 0; i < WL_ADDRESSES.length; i++) {
    const address = WL_ADDRESSES[i];

    // Create Hash for Whitelist Bond Depo
    const wlDepoHash = await signerHelper.createHash('', address, WL_CONTRACT_ADDRESS, SIGNING_SECRET);
    const wlDepoMessageHashBinary = ethers.utils.arrayify(wlDepoHash);
    const wlDepoSignature = await deployer.signMessage(wlDepoMessageHashBinary);
    WLSIGNED.push({ address, wlDepoSignature });

    // Create Hash for WethHelper
    const wethHelperHash = await signerHelper.createHash('', address, WETH_HELPER_CONTRACT_ADDRESS, SIGNING_SECRET);
    const wethHelperMessageHashBinary = ethers.utils.arrayify(wethHelperHash);
    const wethHelperSignature = await deployer.signMessage(wethHelperMessageHashBinary);
    WETHHELPERSIGNED.push({ address, wethHelperSignature });
  }
  if (WLSIGNED.length > 0)
    fs.writeFileSync(path.resolve(__dirname, `./wl-bonddepo-signed-messages-${networkName}.json`), JSON.stringify(WLSIGNED));

  if (WETHHELPERSIGNED.length > 0)
    fs.writeFileSync(path.resolve(__dirname, `./weth-helper-signed-messages-${networkName}.json`), JSON.stringify(WETHHELPERSIGNED));
}

generateSignatures()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
