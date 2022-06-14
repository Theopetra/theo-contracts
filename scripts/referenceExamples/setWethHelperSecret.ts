import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { WhitelistTheopetraBondDepository__factory, WethHelper__factory } from '../../typechain-types';
import { waitFor } from '../../test/utils';
dotenv.config();

const setWethHelperSecret = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner] = await ethers.getSigners();

  // Connect to Bond Depo contract
  const WethHelper = WethHelper__factory.connect(
    '0x2E48f1E6C53ace80BA34F4f138d9b4A7488ca9E9',
    provider
  );

  await waitFor(WethHelper.connect(owner).setSecret(`${process.env.WHITELIST_SECRET}`));
};

const wethHelperSecret = async () => {
  try {
    await setWethHelperSecret();
  } catch (err) {
    console.log(err);
  }
};

wethHelperSecret();
