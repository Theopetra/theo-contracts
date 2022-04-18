// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { expect } from './chai-setup';
// import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

// import { setupUsers, waitFor, decodeLogs } from './utils';
// import { getContracts } from '../utils/helpers';
// import { CONTRACTS, TESTWITHMOCKS } from '../utils/constants';

// const setup = deployments.createFixture(async () => {
//   await deployments.fixture();
//   const { deployer: owner } = await getNamedAccounts();

//   const contracts = { ...(await getContracts(CONTRACTS.staking)) };

//   const users = await setupUsers(await getUnnamedAccounts(), contracts);

//   return {
//     ...contracts,
//     users,
//     owner,
//     addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
//     contracts
//   };
// });

// describe('Rebasing', function () {
//   const amountToStake = 1000;
//   const LARGE_APPROVAL = '100000000000000000000000000000000';

//   let Staking: any;
//   let sTheo: any;
//   let TheopetraAuthority: any;
//   let TheopetraERC20Token: any;
//   let Treasury: any;
//   let users: any;
//   let owner: any;
//   let addressZero: any;
//   let contracts: any;
//   let decodeTargets: any;

//   beforeEach(async function () {
//     ({ Staking, sTheo, TheopetraAuthority, TheopetraERC20Token, Treasury, users, owner, addressZero, contracts } = await setup());

//     const [, bob, carol] = users;
//     // Setup to mint initial amount of THEO
//     const [, treasurySigner] = await ethers.getSigners();
//     if (process.env.NODE_ENV !== TESTWITHMOCKS) {
//       await TheopetraAuthority.pushVault(treasurySigner.address, true); // Use a valid signer for Vault
//       await TheopetraERC20Token.connect(treasurySigner).mint(bob.address, '10000000000000000'); // 1e16 Set to be same as return value in Treasury Mock for baseSupply
//       await TheopetraAuthority.pushVault(Treasury.address, true); // Restore Treasury contract as Vault
//     } else {
//       await TheopetraERC20Token.mint(bob.address, '10000000000000');
//     }
//     await bob.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);
//     await carol.TheopetraERC20Token.approve(Staking.address, LARGE_APPROVAL);

//     if (process.env.NODE_ENV === TESTWITHMOCKS) {
//       // Mint enough to allow transfers when claiming staked THEO
//       // only call this if not performing full testing, as only mock sTheo has a mint function (sTheo itself uses `initialize` instead)
//       await sTheo.mint(Staking.address, '1000000000000000000000');
//     }

//     decodeTargets = Object.keys(contracts).map(k => contracts[k]);
//   });

//   describe('rewards', async function () {
//     it.only('allows the staker to claim sTHEO immediately if `_claim` is true and warmup is zero', async function () {
//       const [, bob] = users;
//       const claim = true;
//       // get epoch length from staking contract
//       const e = await Staking.epoch();
//       console.log(e);
//       expect(await sTheo.balanceOf(bob.address)).to.equal(0);

//       const { logs }: any = await waitFor(bob.Staking.stake(bob.address, amountToStake, claim));

//       const decoded = decodeLogs(logs, decodeTargets);
//       console.log(decoded);

//       // advance time to the end of rebase epoch
//       const latestBlock = await ethers.provider.getBlock('latest');
//       const newTimestampInSeconds = latestBlock.timestamp + timeToConclusion * 2;

//       expect(await sTheo.balanceOf(bob.address)).to.equal(amountToStake);
//       expect(await Staking.supplyInWarmup()).to.equal(0);
//     });
//   });
// });
