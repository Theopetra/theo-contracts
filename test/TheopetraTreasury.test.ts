import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';
import { setupUsers } from './utils';
import { Contract } from 'ethers';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.authority, CONTRACTS.treasury, MOCKS.theoTokenMock]);
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    Treasury: await ethers.getContract(CONTRACTS.treasury),
    Token: await ethers.getContract(MOCKS.theoTokenMock),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  // mint theo token for owner
  await contracts.Treasury.enable(2, contracts.Token.address, owner);
  await contracts.Treasury.enable(0, users[0].address, owner);
  await users[0].Token.mint(users[0].address, ethers.utils.parseEther('1000000'));
  // await users[0].Token.approve(contracts.Treasury.address, ethers.utils.parseEther('1000000'))

  // deposit in treasury
  await users[0].Treasury.deposit(1000, contracts.Token.address, 1);

  return {
    ...contracts,
    owner,
    users,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe.only('TheopetraTreasury', () => {
  describe('Deployment', () => {
    it('deploys as expected', async () => {
      await setup();
    });

    it('should fail to mint when not REWARDSMANAGER', async () => {
      const { Treasury, owner, users } = await setup();

      await users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'));
    });

    it('should mint when REWARDSMANAGER', async () => {
      const { Treasury, owner, users } = await setup();

      await Treasury.enable(8, users[1].address, owner);
      // await users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'));
    });
  });
});
