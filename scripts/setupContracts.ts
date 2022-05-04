import * as dotenv from 'dotenv';
import { ethers, getNamedAccounts } from 'hardhat';
import {StakingDistributor__factory, STheopetra__factory, TheopetraAuthority__factory, TheopetraStaking__factory, TheopetraTreasury, TheopetraTreasury__factory} from "../typechain-types";
dotenv.config();

// Some contracts need permissions enabled on them, or need initializing
// See `deploy/setup/setupIntegration.ts`
const connectContracts = async () => {
  // Connect to Ethereum test network using Alchemy as provider
  const provider = new ethers.providers.AlchemyProvider("rinkeby", process.env.ALCHEMY_API_KEY)

  // You can get the owner (same account) like this, as a signer:
  const [owner, bob] = await ethers.getSigners();
  // And/or get the address for the owner (named `deployer`) from getNamedAccounts
  const { deployer } = await getNamedAccounts();
  console.log('Owner/Deployer >>>>>', owner.address, bob.address, deployer);

  // TheopetraAuthority and TheopetraAccessControlled have modifiers / methods for access control (e.g. `onlyVault`)
  // E.g. Vault address has been pushed to Treasury as part of deployment
  const TheopetraAuthority = TheopetraAuthority__factory.connect("0xBcdF034cE6624A817c1BfEffBDE8691443e5fDbB", provider);
  const Treasury = TheopetraTreasury__factory.connect("0x6640C3FD53e4Cf446B4139f478A199147d663a44", provider);
  console.log("Vault address (Treasury) >>>>", await TheopetraAuthority.vault(), Treasury.address);

  // Other setup still needs to be done (see `deploy/setup/setupIntegration.ts`);
  // E.g. sTheo Initialized (sTHEO totalSupply transfered to Staking contract, in preparation for Stakers)
  const STheopetra = STheopetra__factory.connect("0xCD1a66F06eC36Db3F040C6065e5AAC0866FcD77A", provider);
  const TheopetraStaking = TheopetraStaking__factory.connect("0x79b4882B3121061C054EEFEBcB05B2b3fFcf59Dd", provider);
  console.log("Staking contract balance of sTHEO >>>>>", (await STheopetra.balanceOf(TheopetraStaking.address)).toNumber());

// E.g. Setup for `Treasury.mint`
// Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)
  const Distributor = StakingDistributor__factory.connect("0x0ee54Aa3fE9695Eff297582080Bd9766D09FBD9A", provider);
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
  await Treasury.connect(owner).enable(8, Distributor.address, addressZero);
  const isEnabled = await Treasury.permissions(8, Distributor.address);
  console.log("Distributor as Reward Manager >>>>>>", isEnabled);

  // Please check tests for other setup required for specific functionality
  // E.g. Setup for rebasing needs Staking contract set as as a recipient on the distributor (via `addRecipient`), along with starting rate, Drs and Dys
};

const setupContracts = async () => {
  try {
      await connectContracts();
  } catch (err) {
      console.log(err);
  }
};

setupContracts();
