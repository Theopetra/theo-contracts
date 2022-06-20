import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { TheopetraAuthority, TheopetraTreasury, TheopetraYieldReporter, TheopetraFounderVesting } from '../../typechain-types';
import { CONTRACTS } from '../../utils/constants';
import { waitFor } from '../../test/utils';
dotenv.config();

const setupIntegrationGroup1 = async () => {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');

  const TheopetraAuthority = <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority);
  const Treasury = <TheopetraTreasury>await ethers.getContract(CONTRACTS.treasury);
  const YieldReporter = <TheopetraYieldReporter>await ethers.getContract(CONTRACTS.yieldReporter);
  const FounderVesting = <TheopetraFounderVesting>await ethers.getContract(CONTRACTS.founderVesting);
  await waitFor(TheopetraAuthority.pushVault(Treasury.address, true)); // Push vault role to Treasury, to allow it to call THEO.mint
  console.log("Vault address >>>>", await TheopetraAuthority.vault());
  await waitFor(Treasury.enable(11, YieldReporter.address, addressZero)); // Enable Yield Reporter in Treasury
  // console.log("Yield Reporter permission on Treasury (Expect Reverted with Division By Zero, as no yields are yet reported) >>>>", await Treasury.deltaTreasuryYield())
  await waitFor(Treasury.enable(8, FounderVesting.address, addressZero)); // Set Whitelist Founder Vesting as reward manager in Treasury (to allow call to mint)
  console.log("Founder Vesting permission on Treasury >>>>", await Treasury.permissions(8, FounderVesting.address));

  console.log('Set-up for Group 1 done ✅');
};

const setupGroup1 = async () => {
  try {
    await setupIntegrationGroup1();
  } catch (err) {
    console.log(err);
  }
};

setupGroup1();
