import { expect } from './chai-setup';
import { ethers, deployments, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { setupUsers } from './utils';
import { TwapGetter } from '../typechain-types';
import { getContracts } from '../utils/helpers';

const setup = deployments.createFixture(async function () {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = await getContracts();

  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Bonding Calculator (TWAP Getter)', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('is deployed with the correct constructor arguments', async function (){
      const { TwapGetter } = await setup();
      // Expected values to match deploy script
      const expectedFactoryAddress = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
      const expectedTheoAddress = "0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b";
      const expectedPerformanceTokenAddress = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
      const expectedSecondsAgo = 60;
      const expectedFee = 3000;

      expect((await TwapGetter.factory()).toString()).to.equal(expectedFactoryAddress);
      expect((await TwapGetter.theo()).toString()).to.equal(expectedTheoAddress);
      expect((await TwapGetter.performanceToken()).toString()).to.equal(expectedPerformanceTokenAddress);
      expect(Number(await TwapGetter.fee())).to.equal(expectedFee);
      expect(Number(await TwapGetter.secondsAgo())).to.equal(expectedSecondsAgo);

    })
  })
});
