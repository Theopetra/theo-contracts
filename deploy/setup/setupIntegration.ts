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
    } = await getContracts();

    /* ======== Setup for `Treasury.mint` (when `TheopetraBondDepository.deposit` is called) ======== */
    await TheopetraAuthority.pushVault(Treasury.address, true); // Push vault role to Treasury, to allow it to call THEO.mint
    await sTheo.connect(owner).initialize(Staking.address, Treasury.address); // Initialize sTHEO

    /* ======== Other setup for `TheopetraBondDepository.deposit()` ======== */
    await Treasury.connect(owner).enable(11, YieldReporter.address, addressZero); // Enable Yield Reporter in Treasury
    await Treasury.connect(owner).enable(8, BondDepository.address, addressZero); // Set Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)

    /* ======== Setup for Whitelist Bond Depository ======== */
    await Treasury.connect(owner).enable(8, WhitelistBondDepository.address, addressZero); // Set Whitelist Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)

    await Staking.setContract(0, Distributor.address); // set Distributor on Staking
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
