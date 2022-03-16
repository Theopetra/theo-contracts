import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { CONTRACTS, MOCKS } from '../utils/constants';
import { setupUsers } from './utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.authority, CONTRACTS.treasury]);
  const addressZero = '0x0000000000000000000000000000000000000000';
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    Treasury: await ethers.getContract(CONTRACTS.treasury),
    Theo: await ethers.getContract(CONTRACTS.theoToken),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  // set usdcTokenMock as a reserve token
  await contracts.Treasury.enable(2, contracts.UsdcTokenMock.address, addressZero);
  // set user[0] as reserve depositor
  await contracts.Treasury.enable(0, users[0].address, addressZero);
  // ensure the vault is correctly set on THEO (WILL NEED UPDATED)
  await contracts.Theo.setVault(contracts.Treasury.address);
  // Mint some of our mock token so we have a supply to work with
  await contracts.UsdcTokenMock.mint(users[0].address, 1000 * 100);

  return {
    ...contracts,
    owner,
    users,
    addressZero,
  };
});

describe('TheopetraTreasury', () => {
  describe('Deployment', () => {
    it('deploys as expected', async () => {
      await setup();
    });
  });

  describe('Deposit', () => {
    it('Succeeds when depositor is a RESERVEDEPOSITOR and token is a RESERVETOKEN', async () => {
      const { Treasury, UsdcTokenMock, users } = await setup();
      // approve the treasury to spend our token
      await users[0].UsdcTokenMock.approve(Treasury.address, 1000);
      // deposit the token into the treasury
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(users[0].Treasury.deposit(1000, UsdcTokenMock.address, 0)).to.not.be.reverted;
    });
  });

  describe('Mint', () => {
    it('should fail when not REWARDSMANAGER', async () => {
      const { users } = await setup();
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });

    it('should succeed when REWARDSMANAGER', async () => {
      const { Treasury, owner, users, UsdcTokenMock } = await setup();
      // enable the rewards manager
      await Treasury.enable(8, users[1].address, owner);
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.not.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });
  });

  describe('Access control', function () {
    it('reverts if a call to `enable` is made by an address that is not the Governor', async function () {
      const { users, owner, Treasury } = await setup();

      // enable the rewards manager
      await expect(users[1].Treasury.enable(8, users[1].address, users[0].address)).to.be.revertedWith('UNAUTHORIZED');
    });
  });
});
