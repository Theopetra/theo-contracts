import { ethers } from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CONTRACTS, TESTWITHMOCKS } from '../../utils/constants';
import { getContracts } from '../../utils/helpers';

const func = async function (hre: HardhatRuntimeEnvironment) {
  try {
    if (process.env.NODE_ENV === TESTWITHMOCKS) return;

    const [owner] = await ethers.getSigners();
    const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
    const {
      TheopetraAuthority,
      sTheo,
      Staking,
      Treasury,
      YieldReporter,
      BondDepository,
      WhitelistBondDepository,
      Distributor,
      pTheo,
      StakingLocked,
      FounderVesting,
    } = await getContracts();

    /* ======== Setup for `Treasury.mint` (when `TheopetraBondDepository.deposit` is called) ======== */
    await TheopetraAuthority.pushVault(Treasury.address, true); // Push vault role to Treasury, to allow it to call THEO.mint
    await sTheo.connect(owner).initialize(Staking.address, Treasury.address); // Initialize sTHEO
    await pTheo.connect(owner).initialize(StakingLocked.address); // Initialize pTHEO

    /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
    await Treasury.connect(owner).enable(8, Distributor.address, addressZero); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)

    /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
    await Treasury.connect(owner).enable(8, Distributor.address, addressZero); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)

    /* ======== Other setup for `TheopetraBondDepository.deposit()` ======== */
    await Treasury.connect(owner).enable(11, YieldReporter.address, addressZero); // Enable Yield Reporter in Treasury
    await Treasury.connect(owner).enable(8, BondDepository.address, addressZero); // Set Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)

    /* ======== Setup to allow Pushing Claim during `TheopetraBondDepository.redeem()` and `WhitelistTheopetraBondDepository.redeem()` ======== */
    // Set addresses of bond depos in staking, to allow bond depos to push claims to user when they redeem a note
    await Staking.setBondDepo(BondDepository.address, true);
    await Staking.setBondDepo(WhitelistBondDepository.address, true);

    /* ======== Setup for Whitelist Bond Depository ======== */
    await Treasury.connect(owner).enable(8, WhitelistBondDepository.address, addressZero); // Set Whitelist Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)

    /* ======== Setup for Founder Vesting ======== */
    await Treasury.connect(owner).enable(8, FounderVesting.address, addressZero); // Set Whitelist Founder Vesting as reward manager in Treasury (to allow call to mint)

    /* ======== Distributor and Staking setup  ======== */
    // Set Distributor on Staking (unlocked) and StakingLocked contracts
    await Staking.setContract(0, Distributor.address);
    await StakingLocked.setContract(0, Distributor.address);
    // Set staking contracts on Distributor
    await Distributor.setStaking(Staking.address);
    await Distributor.setStaking(StakingLocked.address);
  } catch (error) {
    console.log(error);
  }
};

export default func;
func.tags = ['setupIntegration'];
func.dependencies = [
  CONTRACTS.authority,
  CONTRACTS.treasury,
  CONTRACTS.theoToken,
  CONTRACTS.sTheo,
  CONTRACTS.staking,
  CONTRACTS.yieldReporter,
];
