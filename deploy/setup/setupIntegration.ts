import {deployments, ethers} from 'hardhat';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { CONTRACTS, TESTWITHMOCKS } from '../../utils/constants';
import { getContracts } from '../../utils/helpers';


const func = async function (hre: HardhatRuntimeEnvironment) {
  try {

    if( process.env.NODE_ENV === TESTWITHMOCKS ) return;

    // await deployments.fixture([
    //   CONTRACTS.authority,
    //   CONTRACTS.yieldReporter,
    //   CONTRACTS.bondDepo,
    //   CONTRACTS.sTheo,
    //   CONTRACTS.staking,
    //   CONTRACTS.theoToken,
    //   CONTRACTS.treasury,
    //   CONTRACTS.distributor,
    // ]);

    const [owner, ] = await ethers.getSigners();
    const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
    const {TheopetraAuthority, sTheo, Staking, Treasury, YieldReporter, BondDepository, WhitelistBondDepository} = await getContracts();

/* ======== Setup for successfull call to `Treasury.mint` (called when `TheopetraBondDepository.deposit` is called) ======== */
    await TheopetraAuthority.pushVault(Treasury.address, true); // Push vault role to Treasury, to allow it to call THEO.mint
    await sTheo.connect(owner).initialize(Staking.address, Treasury.address); // Initialize sTHEO

    /* ======== Other setup to allow successful `TheopetraBondDepository.deposit()` ======== */
      // Enable Yield Reporter in Treasury
      await Treasury.connect(owner).enable(11, YieldReporter.address, addressZero);
      // Set Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)
      await Treasury.connect(owner).enable(8, BondDepository.address, addressZero);


      /* ======== Setup for Whitelist Bond Depository ======== */
      // Set Whitelist Bond Depo as reward manager in Treasury (to allow call to mint from NoteKeeper when adding new note)
      await Treasury.connect(owner).enable(8, WhitelistBondDepository.address, addressZero);


      /* ======== Setup for deposit into Treasury, to build excess reserves ======== */
      // const treasuryDepositAmount = '100000'; // 1e5 (this is greater than the amount to mint for THEO, to give excess reserves, and greater than the expected amount to mint when a deposit is made)
      // const treasuryDebtAmount = '1000000'; // 1e6
      // const sTheoAmountToTransfer = '100';
      // await UsdcTokenMock.mint(owner.address, treasuryDepositAmount); // Will use owner to deposit USDC
      // await TreasuryMock.enable(2, UsdcTokenMock.address, addressZero); // set USDC as a reserve token
      // await TreasuryMock.enable(0, owner.address, addressZero); // set owner as reserve depositor
      // await owner.UsdcTokenMock.approve(TreasuryMock.address, treasuryDepositAmount); // Give treasury permision to transfer token
      // await owner.TreasuryMock.deposit(treasuryDepositAmount, UsdcTokenMock.address, 0);
      // await TreasuryMock.enable(10, owner.address, addressZero); // Update permision for owner to be Theo-Debtor
      // await TreasuryMock.enable(9, sTheo.address, addressZero); // Update permission for sTheo on Treasury

      // await sTheo.transfer(owner.address, sTheoAmountToTransfer);
      // await owner.TreasuryMock.incurDebt(treasuryDebtAmount, TheopetraERC20Mock.address); // Incur debt to result in non-zero excess reserves
  } catch (error) {
    console.log(error);
  }
}

export default func;
func.tags = ['setupIntegration']
func.dependencies = [CONTRACTS.authority, CONTRACTS.treasury, CONTRACTS.theoToken, CONTRACTS.sTheo, CONTRACTS.staking, CONTRACTS.yieldReporter];
