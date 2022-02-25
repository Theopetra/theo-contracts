import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

const setup = deployments.createFixture(async () => {
  await deployments.fixture(['TheopetraTreasury']);
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    Treasury: await deployments.get('Treasury'),
  };

  return {
    ...contracts,
    owner,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe('TheopetraTreasury', () => {
  describe('Deployment', () => {
    it('deploys as expected', async () => {
      await setup();
    });
  });
});
