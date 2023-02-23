import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { BigNumber } from 'ethers';

import { setupUsers, moveTimeForward, randomIntFromInterval, waitFor, decodeLogs } from './utils';
import { getContracts } from '../utils/helpers';
import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';
import { StakingDistributor, TheopetraAuthority, TheopetraStaking, TheopetraRebates } from '../typechain-types';

const setup = deployments.createFixture(async () => {
  await deployments.fixture();
  const { deployer: owner } = await getNamedAccounts();

  const contracts = { ...(await getContracts(CONTRACTS.staking)), ...(await getContracts(CONTRACTS.rebates)) };

  // Rename contracts to simplify updates to existing tests.
  // Updates as follows (new for old):
  // `StakingUnlocked` for unlocked tranche,
  // `Staking` for locked tranche
  // `sTheoUnlocked` for `sTheo`
  // `sTheo` for `pTheo`
  contracts['StakingUnlocked'] = contracts['Staking'];
  delete contracts['Staking'];
  contracts['Staking'] = contracts['StakingLocked'];
  delete contracts['StakingLocked'];
  contracts['sTheoUnlocked'] = contracts['sTheo'];
  delete contracts['sTheo'];
  contracts['sTheo'] = contracts['pTheo'];
  delete contracts['pTheo'];

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
    addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
    };
    });

    describe('Staking', function () {
    const amountToStake = 1_000_000_000_000;
    const LARGE_APPROVAL = '100000000000000000000000000000000';
    const epochLength = 8 * 60 * 60; // Same value as used in deployment script for Hardhat network deployment
    const firstEpochNumber = 1; // Same value as used in deployment script for Hardhat network deployment
    const unlockedStakingTerm = 0;
    const lockedStakingTerm = 31536000;

    let Staking: TheopetraStaking;
    let StakingUnlocked: TheopetraStaking;
    let Distributor: StakingDistributor;
    let Rebates: TheopetraRebates;
    let sTheo: any;
    let sTheoUnlocked: any;
    let TheopetraAuthority: TheopetraAuthority;
    let TheopetraERC20Token: any;
    let Treasury: any;
    let YieldReporter: any;
    let BondingCalculatorMock: any;
    let users: any;
    let owner: any;
    let addressZero: any;
    let recipients: any [];

    async function createClaim(amount: number = amountToStake, claim = false, isLockedTranche = true) {
        const [, bob] = users;

        isLockedTranche
        ? await bob.Staking.stake(bob.address, amount, claim)
        : await bob.StakingUnlocked.stake(bob.address, amount, claim);
    }

    async function setupForRebase() {
        const expectedStartRateLocked = 120_000_000; // 12%, rateDenominator for Distributor is 1_000_000_000;
        const expectedDrs = 10_000_000; // 1%
        const expectedDys = 20_000_000; // 2%
        const isLocked = false;

        // Setup for Distributor
        await Distributor.addRecipient(Staking.address, expectedStartRateLocked, expectedDrs, expectedDys, isLocked);
        await Distributor.addRecipient(
        StakingUnlocked.address,
        expectedStartRateLocked,
        expectedDrs,
        expectedDys,
        isLocked
        );
        // Report a couple of yields using the Yield Reporter (for use when calculating deltaTreasuryYield)
        const lastYield = 50_000_000_000;
        const currentYield = 150_000_000_000;
        await waitFor(YieldReporter.reportYield(lastYield));
        await waitFor(YieldReporter.reportYield(currentYield));

        // Move forward 8 hours to allow tokenPerformanceUpdate to update contract state
        // current token price will subsequently be updated, last token price will still be zero
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
        // Move forward in time again to update again, this time current token price becomes last token price
        await moveTimeForward(60 * 60 * 8);
        await Treasury.tokenPerformanceUpdate();
    }

    beforeEach(async function () {
        ({
        Staking, // Locked Tranche (renamed from `StakingLocked` during setup)
        StakingUnlocked, // Unlocked Tranche (renamed from `Staking` during setup)
        Distributor,
        sTheo, // pTheo (renamed during setup to simplify testing updates)
        sTheoUnlocked, // sTheo (renamed during setup from `sTheo`)
        TheopetraAuthority,
        TheopetraERC20Token,
        Treasury,
        YieldReporter,
        BondingCalculatorMock,
        users,
        owner,
        addressZero,
        Rebates,
        } = await setup());

        const [, bob, carol] = users;
        const [, treasurySigner] = await ethers.getSigners();
        if (process.env.NODE_ENV !== TESTWITHMOCKS) {
        // Setup to mint initial amount of THEO
        await TheopetraAuthority.pushVault(treasurySigner.address, true); // Use a valid signer for Vault
        await TheopetraERC20Token.connect(treasurySigner).mint(bob.address, '10000000000000000'); // 1e16 Set to be same as return value in Treasury Mock for baseSupply
        await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault

        // Additional setup for Distributor
        await Distributor.setStaking(Staking.address);
        } else {
        // Setup to mint initial amount of THEO when using mocks
        await TheopetraERC20Token.mint(bob.address, '10000000000000000');
        }
        await bob.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);
        await bob.TheopetraERC20Token.approve(StakingUnlocked.address, LARGE_APPROVAL);
        await carol.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);

        if (process.env.NODE_ENV === TESTWITHMOCKS) {
        // Mint enough to allow transfers when claiming staked THEO
        // only call this if not performing full testing, as only mock sTheo has a mint function (sTheo itself uses `initialize` instead)
        await sTheo.mint(Staking.address, '1000000000000000000000');
        await TheopetraERC20Token.mint(Staking.address, '1000000000000000000000');
        }

        // set the address of the mock bonding calculator
        await Treasury.setTheoBondingCalculator(BondingCalculatorMock.address);
    });

    /* ======== Start Rebate Tests ======== */

    describe('Rebates', function () {
        describe('Deployment', async function () {
        it('can be deployed', async function () {
            await setup();
        });

        it('is deployed with the correct constructor arguments', async function () {
            const latestBlock = await ethers.provider.getBlock('latest');
    
            const expectedFirstEpochTime =
              latestBlock.timestamp + (process.env.NODE_ENV === TESTWITHMOCKS ? 60 * 60 * 24 * 30 : epochLength); // Same values as used in deployment script
    
            const lowerBound = expectedFirstEpochTime * 0.999;
            const upperBound = expectedFirstEpochTime * 1.001;
            expect(await Staking.THEO()).to.equal(TheopetraERC20Token.address);
            expect(await Staking.sTHEO()).to.equal(sTheo.address);
    
            const epoch: any = await Staking.epoch();
    
            expect(epoch._length).to.equal(BigNumber.from(epochLength));
            expect(epoch.number).to.equal(BigNumber.from(firstEpochNumber));
            expect(Number(epoch.end)).to.be.greaterThan(lowerBound);
            expect(Number(epoch.end)).to.be.lessThan(upperBound);
            expect(Number(await Staking.stakingTerm())).to.equal(lockedStakingTerm);
            expect(await TheopetraAuthority.governor()).to.equal(owner);
            expect(Rebates.stakingContracts.to.equal(Staking.address, StakingUnlocked.address));
          });

        describe('addRecipients', function () {
            it('should reject addresses with 0 balance', async function () {
                const recipients = ['0x06f3a31e675ddFEBafC87435686E63C156E2236C', '0x86b3E1C305651364eE3a572Ff4a0e6E0794268cf', '0x474627714EC7cE9CF185c2a42d15D99c218555f1', '0xEd75Eb99ffD5f1ca9Ada7315c4fDE8622504C7c9' ];
                expect(await Rebates.addRecipients(recipients).to.equal(null));
            });

            it('should upload recipient addresses when users have staked balance', async function () {
                const [, bob] = users;
                const claim = false;
                const expectedGonsInWarmup = await sTheo.gonsForBalance(amountToStake);
                await bob.Staking.stake(bob.address, amountToStake, claim);

                const stakingInfo = await Staking.stakingInfo(bob.address, 0);

                expect(stakingInfo.deposit.toNumber()).to.equal(amountToStake);
                expect(stakingInfo.gonsInWarmup.toString()).to.equal(expectedGonsInWarmup.toString());


                expect(await Rebates.addRecipients(users).to.equal(true));
            });

            it('should reject duplicate addresses', async function () {
                

            });
        });

        describe('stakingBalance', function () {
            it('should calculate the correct staking balance for a given address', async function () {
                const [, bob] = users;
                await createClaim(amountToStake, false, false);
                expect(await Rebates.stakingBalance(bob).to.equal(amountToStake));
            });

            it('should calculate the correct staking balance across all staking contracts', async function () {
                const [, bob] = users;
                await createClaim(amountToStake, false, false);
                await createClaim(amountToStake, false, true);

                const gonsRemaining = await Rebates.stakingBalance(bob);
                expect(await sTheo.balanceForGons(gonsRemaining).to.equal(amountToStake + amountToStake));
            });
        });

        describe('totalGons', function () {
            it('should calculate the total staked balance of gons, across all staking contracts', async function () {
                
            })
        });



    });






    });
});