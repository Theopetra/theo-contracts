import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { TheopetraAuthority, TheopetraTreasury, TheopetraERC20Mock } from '../typechain-types';
import { CONTRACTS, MOCKS } from '../utils/constants';
import { setupUsers } from './utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.authority, CONTRACTS.treasury]);
  const addressZero = '0x0000000000000000000000000000000000000000';
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    UsdcTokenMock: await ethers.getContract(MOCKS.usdcTokenMock),
    Treasury: <TheopetraTreasury>await ethers.getContract(CONTRACTS.treasury),
    Theo: await ethers.getContract(CONTRACTS.theoToken),
    TheopetraAuthority: <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  // set usdcTokenMock as a reserve token
  await contracts.Treasury.enable(2, contracts.UsdcTokenMock.address, addressZero);
  // set user[0] as reserve depositor
  await contracts.Treasury.enable(0, users[0].address, addressZero);
  // ensure the vault is correctly set on THEO (WILL NEED UPDATED)
  await contracts.TheopetraAuthority.pushVault(contracts.Treasury.address, true);
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
      const { Treasury, owner, users } = await setup();
      // enable the rewards manager
      await Treasury.enable(8, users[1].address, owner);
      await expect(users[1].Treasury.mint(users[1].address, ethers.utils.parseEther('1'))).to.not.be.revertedWith(
        'Caller is not a Reward manager'
      );
    });
  });

  describe('Access control', function () {
    it('reverts if a call to `enable` is made by an address that is not the Governor', async function () {
      const { users } = await setup();

      // enable the rewards manager
      await expect(users[1].Treasury.enable(8, users[1].address, users[0].address)).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('Treasury yield', function () {
    it('should have a function (`getDeltaTreasuryYield`) to get the difference in treasury yield', async function () {
      const { Treasury } = await setup();
      await expect(Treasury.getDeltaTreasuryYield()).to.not.be.reverted;
      expect(await Treasury.getDeltaTreasuryYield()).to.equal(0); // Initial deltaTreasuryYield will be 0
    });

    it.skip('should correctly calculate the difference in treasury yield', async function () {
      // TODO, Depending on definition of deltaTreasuryYield
    });

    describe('treasuryPerformanceUpdate', function () {
      it('can be called by the policy holder', async function () {
        const { TheopetraAuthority, users } = await setup();
        const [, , bob] = users;

        // Make bob the policy holder
        await TheopetraAuthority.pushPolicy(bob.address, true);
        await expect(bob.Treasury.treasuryPerformanceUpdate(1_000_000_000)).to.not.be.reverted;
      });

      it('will revert if called by an address that is not the policy holder', async function () {
        const { TheopetraAuthority, users } = await setup();
        const [, alice, bob] = users;

        // Make bob the policy holder
        await TheopetraAuthority.pushPolicy(bob.address, true);

        await expect(alice.Treasury.treasuryPerformanceUpdate(1_000_000_000)).to.be.revertedWith('UNAUTHORIZED');
      });

      it.skip('updates the value of `deltaTreasuryYield`', async function () {});
    });
  });

  describe('Token price', function () {
    async function moveTimeForward(timeInSeconds: number) {
      const latestBlock = await ethers.provider.getBlock('latest');
      const newTimestampInSeconds = latestBlock.timestamp + timeInSeconds;
      await ethers.provider.send('evm_mine', [newTimestampInSeconds]);
    }

    function randomIntFromInterval(min: number, max: number) {
      return Math.floor(Math.random() * (max - min + 1) + min);
    }

    it('should have a function (`getDeltaTokenPrice`) to get the difference in token price', async function () {
      const { Treasury } = await setup();
      await expect(Treasury.getDeltaTokenPrice()).to.not.be.reverted;
      expect(await Treasury.getDeltaTokenPrice()).to.equal(0); // Initial deltaTokenPrice will be 0
    });

    describe('`tokenPerformanceUpdate`', function () {
      it(' can be first called 8 hours after the contract is created', async function () {
        const { Treasury } = await setup(); // When Treasury is created, the state variable `timeLastUpdated` is updated to be the block.timestamp

        await moveTimeForward(60 * 60 * 8);
        await expect(Treasury.tokenPerformanceUpdate()).to.not.be.reverted;
      });

      it('will revert if called immediately after contract creation', async function () {
        const { Treasury } = await setup(); // When Treasury is created, the state variable `timeLastUpdated` is updated to be the block.timestamp

        await expect(Treasury.tokenPerformanceUpdate()).to.be.revertedWith('Called too soon since last update');
      });

      it('can be called every 8 hours', async function () {
        const { Treasury } = await setup();

        for (let i = 0; i < 3; i++) {
          await moveTimeForward(60 * 60 * 8);
          await expect(Treasury.tokenPerformanceUpdate()).to.not.be.reverted;
        }
      });

      it('will revert if called within 8 hours of the last updated time', async function () {
        const { Treasury } = await setup();

        for (let i = 0; i < 2; i++) {
          await moveTimeForward(60 * 60 * 8);
          await expect(Treasury.tokenPerformanceUpdate()).to.not.be.reverted;
        }

        await moveTimeForward(randomIntFromInterval(0, 60 * 60 * 8 - 1));
        await expect(Treasury.tokenPerformanceUpdate()).to.be.revertedWith('Called too soon since last update');
      });

      it('will not revert if called at times beyond 8 hours since the last updated time', async function () {
        const { Treasury } = await setup();

        for (let i = 0; i < 3; i++) {
          await moveTimeForward(randomIntFromInterval(60*60*8, 60*60*100));
          await expect(Treasury.tokenPerformanceUpdate()).to.not.be.reverted;
        }
      });
    });
  });
});
