import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { setupUsers } from './utils';
import { CONTRACTS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.distributor, CONTRACTS.authority]);
  const { deployer: owner } = await getNamedAccounts();

  const contracts = {
    Distributor: await ethers.getContract(CONTRACTS.distributor),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
  };
});

describe('Distributor', function () {
  describe('Deployment', function () {
    it ('can be deployed', async function () {
      await setup();
    })
  })
})
