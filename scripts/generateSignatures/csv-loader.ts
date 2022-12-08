import hre from 'hardhat';
import { ethers } from 'hardhat';
import { SignerHelper__factory} from '../../typechain-types';
import { parse } from 'csv-parse';
import * as fs from 'fs';
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

let WL_ADDRESSES: string[] = [

((): any => {
  const csvFilePath = path.resolve(__dirname, 'TheopetraWhitelist.csv');

  const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

  parse(fileContent, {
    delimiter: ',',
  }, (error: any, WL_ADDRESSES: string[]) => {
    if (error) {
      console.error(error);
    }

    console.log("Result", WL_ADDRESSES);
  });
})(),
];

console.log("Final addresses: ", WL_ADDRESSES);

const SIGNING_SECRET = loadEnvVar('WHITELIST_SECRET');

// const WL_ADDRESSES: string[] = [
//   '0x474627714EC7cE9CF185c2a42d15D99c218555f1',
//   '0x06f3a31e675ddFEBafC87435686E63C156E2236C',
//   '0xEd75Eb99ffD5f1ca9Ada7315c4fDE8622504C7c9',
//   '0xb59A6603AB98aa6Aeb0a9657A44264a36ad0Ea77',
//   '0x62BE3ceeb91E55eE62D546E05d123C12341B7e76',
// ];

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
    const address: string = WL_ADDRESSES[i];

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
