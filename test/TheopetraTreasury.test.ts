import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';
import { setupUsers } from './utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.authority, CONTRACTS.treasury, MOCKS.theoTokenMock]);
  const addressZero = '0x0000000000000000000000000000000000000000';
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    Treasury: await ethers.getContract(CONTRACTS.treasury),
    Theo: await ethers.getContract(CONTRACTS.theoToken),
    Token: await ethers.getContract(MOCKS.usdcTokenMock)
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  // set usdcTokenMock as a reserve token
  await contracts.Treasury.enable(2, contracts.Token.address, addressZero);
  // set user[0] as reserve depositor
  await contracts.Treasury.enable(0, users[0].address, addressZero);
  // ensure the vault is correctly set on THEO (WILL NEED UPDATED)
  await contracts.Theo.setVault(contracts.Treasury.address);
  // Mint some of our mock token so we have a supply to work with
  await contracts.Token.mint(users[0].address, 1000*100);

  return {
    ...contracts,
    owner,
    users,
    addressZero,
  };
});

describe.only('TheopetraTreasury', () => {
  describe('Deployment', () => {
    it('deploys as expected', async () => {
      await setup();
    });
  });

  describe('Deposit', () => {
    it('Succeeds when depositor is a RESERVEDEPOSITOR and token is a RESERVETOKEN', async () => {
      const { Treasury, Token, users } = await setup();
      // approve the treasury to spend our token
      await users[0].Token.approve(Treasury.address, 1000);
      // deposit the token into the treasury
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(users[0].Treasury.deposit(1000, Token.address, 0)).to.not.be.reverted;
    });
  });

  describe('Mint', () => {
    it('should fail when not REWARDSMANAGER', async () => {
      const { users } = await setup();
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.be.revertedWith("Caller is not a Reward manager");
    });
  });
});
