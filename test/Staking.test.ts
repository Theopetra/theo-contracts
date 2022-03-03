import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKSWITHARGS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.staking, CONTRACTS.authority]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    Staking: await ethers.getContract(CONTRACTS.staking),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe('Staking', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  });
});