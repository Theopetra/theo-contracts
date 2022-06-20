import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import {
  TheopetraAuthority,
  TheopetraTreasury,
  TheopetraYieldReporter,
  TheopetraFounderVesting,
  STheopetra,
  TheopetraStaking,
  TheopetraBondDepository,
  WhitelistTheopetraBondDepository,
  PublicPreListBondDepository,
} from '../../typechain-types';
import { CONTRACTS } from '../../utils/constants';
import { waitFor } from '../../test/utils';
dotenv.config();

const setupIntegrationGroup2 = async () => {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
  const Treasury = <TheopetraTreasury>await ethers.getContract(CONTRACTS.treasury);
  const sTheo = <STheopetra>await ethers.getContract(CONTRACTS.sTheo);
  const Staking = <TheopetraStaking>await ethers.getContract(CONTRACTS.staking);
  const BondDepository = <TheopetraBondDepository>await ethers.getContract(CONTRACTS.bondDepo);
  const WhitelistBondDepository = <WhitelistTheopetraBondDepository>(
    await ethers.getContract(CONTRACTS.whitelistBondDepo)
  );
  const PublicPreListBondDepo = <PublicPreListBondDepository>await ethers.getContract(CONTRACTS.publicPreListBondDepo);

  await waitFor(sTheo.initialize(Staking.address, Treasury.address)); // Initialize sTHEO
  console.log('sTHEO initialzied, with Treasury address >>>>', await sTheo.treasury());

  // Set bond depos as reward managers in Treasury (to allow calls to mint from NoteKeeper when adding new note)
  await waitFor(Treasury.enable(8, BondDepository.address, addressZero)); //
  await waitFor(Treasury.enable(8, WhitelistBondDepository.address, addressZero));
  await waitFor(Treasury.enable(8, PublicPreListBondDepo.address, addressZero));
  console.log(
    'Bond Depos given permissions on Treasury >>>> ',
    await Treasury.permissions(8, BondDepository.address),
    await Treasury.permissions(8, WhitelistBondDepository.address),
    await Treasury.permissions(8, PublicPreListBondDepo.address)
  );

  const response  = await waitFor(Staking.setBondDepo(BondDepository.address, true)); // Set address of bond depo in staking, to allow bond depo to push claims to user when they redeem a note that has been autostaked
  console.log('Bond Depo set on Staking >>>>', response);

  /* ======== Setup for `Treasury.mint` (when `TheopetraBondDepository.deposit` is called) ======== */

  // await waitFor(pTheo.connect(owner).initialize(StakingLocked.address)); // Initialize pTHEO

  // /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
  // await waitFor(Treasury.connect(owner).enable(8, Distributor.address, addressZero)); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)

  // /* ======== Setup for `Treasury.mint` (when `mint` is called on Treasury from StakingDistributor) ======== */
  // await waitFor(Treasury.connect(owner).enable(8, Distributor.address, addressZero)); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)

  // /* ======== Distributor and Staking setup  ======== */
  // // Set Distributor on Staking (unlocked) and StakingLocked contracts
  // await waitFor(Staking.setContract(0, Distributor.address));
  // await waitFor(StakingLocked.setContract(0, Distributor.address));
  // // Set staking contracts on Distributor
  // await waitFor(Distributor.setStaking(Staking.address));
  // await waitFor(Distributor.setStaking(StakingLocked.address));

  console.log('Set-up for Group 2 done ✅');
};

const setupGroup2 = async () => {
  try {
    await setupIntegrationGroup2();
  } catch (err) {
    console.log(err);
  }
};

setupGroup2();
