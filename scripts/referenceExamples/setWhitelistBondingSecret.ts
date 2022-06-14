import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import { WhitelistTheopetraBondDepository__factory, IERC20__factory } from '../../typechain-types';
import { waitFor } from '../../test/utils';
dotenv.config();

const setWhitelistSecret = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner] = await ethers.getSigners();

  // Connect to Bond Depo contract
  const WhitelistBondDepository = WhitelistTheopetraBondDepository__factory.connect(
    '0xbCF05b9993B5241C9F46F8a4C3459d423299D57D',
    provider
  );

  const response = await waitFor(WhitelistBondDepository.connect(owner).setSecret(`${process.env.WHITELIST_SECRET}`));
  console.log('Events from setting secret >>>>>>', response);
};

const whitelistSecret = async () => {
  try {
    await setWhitelistSecret();
  } catch (err) {
    console.log(err);
  }
};

whitelistSecret();
