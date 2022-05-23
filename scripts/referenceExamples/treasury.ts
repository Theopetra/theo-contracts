import * as dotenv from 'dotenv';
import { ethers, getUnnamedAccounts } from 'hardhat';
import { TheopetraTreasury__factory, NewBondingCalculatorMock__factory } from '../../typechain-types';
dotenv.config();

const treasurySetupAndInfo = async () => {
  const provider = new ethers.providers.AlchemyProvider('rinkeby', process.env.ALCHEMY_API_KEY);
  const [owner] = await ethers.getSigners();

  const Treasury =TheopetraTreasury__factory.connect(
    '0x6640C3FD53e4Cf446B4139f478A199147d663a44',
    provider
  );
  const NewBondingCalculatorMock = NewBondingCalculatorMock__factory.connect(
    '0x1f802CAa9fE1EF4364A54e39162Ab985395A35BE',
    provider
  );

  // await Treasury.connect(owner).setTheoBondingCalculator(NewBondingCalculatorMock.address);
  const bondingCalculatorSetInTreasury = await Treasury.getTheoBondingCalculator();
  console.log('Bonding calculator set in Treasury>>>>', bondingCalculatorSetInTreasury);
};

const getTreasurySetupAndInfo = async () => {
  try {
    await treasurySetupAndInfo();
  } catch (err) {
    console.log(err);
  }
};

getTreasurySetupAndInfo();
