import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import {
  TheopetraTreasury,
  TheopetraStaking,
  PTheopetra,
  StakingDistributor,
} from '../../typechain-types';
import { CONTRACTS } from '../../utils/constants';
import { waitFor } from '../../test/utils';
dotenv.config();

const setupIntegrationGroup3 = async () => {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');
  const Treasury = <TheopetraTreasury>await ethers.getContract(CONTRACTS.treasury);
  const Staking = <TheopetraStaking>await ethers.getContract(CONTRACTS.staking);

  const pTheo = <PTheopetra>await ethers.getContract(CONTRACTS.pTheo);
  const StakingLocked = <TheopetraStaking>await ethers.getContract(CONTRACTS.stakingLocked);
  await waitFor(pTheo.initialize(StakingLocked.address)); // Initialize pTHEO
  console.log('pTHEO initialzied, with Staking (Locked) address >>>>', await pTheo.stakingContract());

  const Distributor = <StakingDistributor>await ethers.getContract(CONTRACTS.distributor);
  await waitFor(Treasury.enable(8, Distributor.address, addressZero)); // Set Distributor as reward manager in Treasury (to allow call to mint from Distributor when Rebasing)
  console.log('Distributor given permissions on Treasury >>>> ', await Treasury.permissions(8, Distributor.address));

  // Set Distributor on Staking (unlocked) and StakingLocked contracts
  await waitFor(Staking.setContract(0, Distributor.address));
  console.log("Distributor Address on Staking (Unlocked) >>>>", await Staking.distributor());
  await waitFor(StakingLocked.setContract(0, Distributor.address));
  console.log("Distributor Address on Staking (Locked) >>>>", await StakingLocked.distributor());

  // Set staking contracts on Distributor
  await waitFor(Distributor.setStaking(Staking.address));
  await waitFor(Distributor.setStaking(StakingLocked.address));

   //Add unlocked staking contract
   await waitFor(Distributor.addRecipient(Staking.address, 50000, 100000, 100000, false));

   //Add locked staking contract
   await waitFor(Distributor.addRecipient(StakingLocked.address, 300000, 100000, 100000, false));

  console.log('Set-up for Group 3 done ✅');
};

const setupGroup3 = async () => {
  try {
    await setupIntegrationGroup3();
  } catch (err) {
    console.log(err);
  }
};

setupGroup3();
