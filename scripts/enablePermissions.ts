import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import {
  PTheopetra__factory,
  StakingDistributor__factory,
  STheopetra__factory,
  TheopetraAuthority__factory,
  TheopetraBondDepository__factory,
  TheopetraFounderVesting__factory,
  TheopetraStaking__factory,
  TheopetraTreasury,
  TheopetraTreasury__factory,
  TheopetraYieldReporter__factory,
  WhitelistTheopetraBondDepository__factory,
} from '../typechain-types';
dotenv.config();
import { waitFor } from '../test/utils';

// This script shows basic permissions (that will be commonly required by contracts), which have been enabled or set up
// This includes showing that sTHEO and pTHEO have been initialized (calls made to `initialize` on sTheo and pTheo)
// Commented out lines show code that was used to set up permissions/initialization, which is based off of `deploy/setup/setupIntegration.ts`
const connectContracts = async () => {
  // Connect to Ethereum test network using Alchemy as provider
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner] = await ethers.getSigners();
  const TheopetraAuthority = TheopetraAuthority__factory.connect(
    '0xBcdF034cE6624A817c1BfEffBDE8691443e5fDbB',
    provider
  );
  const Treasury = TheopetraTreasury__factory.connect('0x6640C3FD53e4Cf446B4139f478A199147d663a44', provider);
  const STheopetra = STheopetra__factory.connect('0xCD1a66F06eC36Db3F040C6065e5AAC0866FcD77A', provider);
  const TheopetraStaking = TheopetraStaking__factory.connect('0x79b4882B3121061C054EEFEBcB05B2b3fFcf59Dd', provider);
  const PTheopetra = PTheopetra__factory.connect('0x2152220456Ba96d24Ac9873B1A71ad414CA97e84', provider);
  const TheopetraStakingLocked = TheopetraStaking__factory.connect(
    '0x02fd7CFFaE593132036290Ed09894FA6DBf3B725',
    provider
  );
  const Distributor = StakingDistributor__factory.connect('0x0ee54Aa3fE9695Eff297582080Bd9766D09FBD9A', provider);
  const YieldReporter = TheopetraYieldReporter__factory.connect('0xe0EC926a2Cba5d5118Eb6d7A4BFE97c08Bd812C0', provider);
  const BondDepository = TheopetraBondDepository__factory.connect(
    '0x7130212e81e74db3BA13cE052B93a7E5F1Df00B3',
    provider
  );
  const WhitelistBondDepository = WhitelistTheopetraBondDepository__factory.connect(
    '0xbCF05b9993B5241C9F46F8a4C3459d423299D57D',
    provider
  );
  const FounderVesting = TheopetraFounderVesting__factory.connect(
    '0x9140dE89f6Ab27647B96773E818196AC242E890b',
    provider
  );
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');

  // Vault address has been pushed to Treasury as part of deployment
  console.log("Vault address (Treasury) >>>>", await TheopetraAuthority.vault());

  // sTHEO initialized, using Unlocked Staking contract
  // const {events} = await waitFor(STheopetra.connect(owner).initialize(TheopetraStaking.address, Treasury.address));
  console.log("Unlocked Staking contract balance of initialized sTHEO >>>>>", (await STheopetra.balanceOf(TheopetraStaking.address)).toString());

  // pTHEO initialized, using Locked Staking contract
  // const {events} = await waitFor(PTheopetra.connect(owner).initialize(TheopetraStakingLocked.address));
  console.log("Locked Staking contract balance of initialized pTHEO >>>>>", (await PTheopetra.balanceOf(TheopetraStakingLocked.address)).toString());

  /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
  // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)
  // await Treasury.connect(owner).enable(8, Distributor.address, addressZero);
  const isDistributorRewardManager = await Treasury.permissions(8, Distributor.address);
  console.log("Is Distributor enabled as Reward Manager? >>>>>>", isDistributorRewardManager);

  /* ======== Other setup for `TheopetraBondDepository.deposit()` ======== */
  // Enable Yield Reporter in Treasury
  // const {events} = await waitFor(Treasury.connect(owner).enable(11, YieldReporter.address, addressZero));
  // note: enabling the yield reporter updates the private variable on the Theopetra Treasury `yieldReporter`
  // Transaction hash for enabling the yield reporter: 0xed72805283dc0bbef12f82c195a715df225c35993c2f0e5e90490685a9cd548d

  // Set Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)
  // await waitFor(Treasury.connect(owner).enable(8, BondDepository.address, addressZero));
  const isBondDepoRewardManager = await Treasury.permissions(8, BondDepository.address);
  console.log("Is Bond Depo enabled as Reward manager? >>>>>", isBondDepoRewardManager);

  /* ======== Setup to allow Pushing Claim during `TheopetraBondDepository.redeem()` and `WhitelistTheopetraBondDepository.redeem()` ======== */
  // Set Bond Depo in Staking, to allow bond depo to push claims to user when they redeem a note
  // await waitFor(TheopetraStaking.connect(owner).setBondDepo(BondDepository.address, true));
  // note: Setting the Bond Depo on Staking updates the private variable `bondDepos`
  // Transaction hash: '0x31cd404960a1cf28549b5ea127dd6f56a202158e3ff66da3c68c8dd94da85765'

  // Set Whitelist Bond Depo in Staking
  // await waitFor(TheopetraStaking.connect(owner).setBondDepo(WhitelistBondDepository.address, true));
  // note: Setting the Whitelist Bond Depo on Staking updates the private variable `bondDepos`
  // Transaction hash '0xf0f9c4a57498e97b66597dcd1fcf2fe212479d615ab699cf59e5563818f971c0'

  /* ======== Setup for Whitelist Bond Depository ======== */
  // Set Whitelist Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)
  // await waitFor(Treasury.connect(owner).enable(8, WhitelistBondDepository.address, addressZero));
  const isWhitelistBondDepoRewardManager = await Treasury.permissions(8, WhitelistBondDepository.address);
  console.log('Is Whitelist Bond Depo enabled as Reward manager? >>>>>', isWhitelistBondDepoRewardManager);

  /* ======== Setup for Founder Vesting ======== */
  // await waitFor(Treasury.connect(owner).enable(8, FounderVesting.address, addressZero)); // Set Whitelist Founder Vesting as reward manager in Treasury (to allow call to mint)
  const isFounderVestingRewardManager = await Treasury.permissions(8, FounderVesting.address);
  console.log('Is Founder Vesting enabled as Reward manager? >>>>>', isFounderVestingRewardManager);

  /* ======== Distributor and Staking setup  ======== */
  // Set Distributor on Staking (unlocked) and StakingLocked contracts
  // await waitFor(TheopetraStaking.connect(owner).setContract(0, Distributor.address));
  console.log("Distributor Address set in Unlocked Staking >>>>", await TheopetraStaking.distributor());
  // await waitFor(TheopetraStakingLocked.connect(owner).setContract(0, Distributor.address));
  console.log("Distributor Address set in Locked Staking >>>>", await TheopetraStakingLocked.distributor());

  // Set staking contracts on Distributor
  // await waitFor(Distributor.connect(owner).setStaking(TheopetraStaking.address));
  // note: Setting the Unlocked Staking address on Distributor updates the private variable `staking` in Distributor
  // transaction hash:'0x23697086491dbef15f771580e811e5b9dbc7b5c566d8fd6a1b50e1d5e53aa1b0'
  // await waitFor(Distributor.connect(owner).setStaking(TheopetraStakingLocked.address));
  // note: Setting the Locked Staking address on Distributor updates the private variable `staking` in Distributor
  // transaction hash: '0xc7fd1e858c7dde044e51ebb50561148a2a890185cd500436fce1a1aea7cef619'
};

const setupContracts = async () => {
  try {
    await connectContracts();
  } catch (err) {
    console.log(err);
  }
};

setupContracts();
