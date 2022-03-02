import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
// import { TheopetraERC20Token } from '../../next-app/src/typechain';
import { setupUsers } from './utils';
import { CONTRACTS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.sTheo])
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    sTheopetra: await ethers.getContract(CONTRACTS.sTheo)
  }

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('sTheopetra', function () {
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });
  })
})