import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import {
  StakingDistributor__factory,
  StakingDistributor,
  STheoMock,
  TheopetraAuthority,
  TreasuryMock,
  TheopetraERC20Mock,
} from '../typechain-types';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';
import { Contract } from 'ethers';

interface TheoContracts {
  [key: string]: Contract
};

const getContracts = async (): Promise<TheoContracts> => {
  await deployments.fixture([
    CONTRACTS.distributor,
    CONTRACTS.authority,
    MOCKSWITHARGS.treasuryMock,
    MOCKSWITHARGS.stakingMock,
  ]);

  return {
    Distributor: <StakingDistributor>await ethers.getContract(CONTRACTS.distributor),
    StakingMock: <STheoMock>await ethers.getContract(MOCKSWITHARGS.stakingMock),
    TheopetraAuthority: <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority),
    TreasuryMock: <TreasuryMock>await ethers.getContract(MOCKSWITHARGS.treasuryMock),
    TheopetraERC20Mock: <TheopetraERC20Mock>await ethers.getContract(MOCKS.theoTokenMock),
  };
};

const setup = deployments.createFixture(async () => {
  const { deployer: owner } = await getNamedAccounts();
  const contracts = await getContracts();

  const users = await setupUsers(await getUnnamedAccounts(), contracts);

  return {
    ...contracts,
    users,
    owner,
  };
});

describe('Distributor', function () {
  const addressZero = ethers.utils.getAddress('0x0000000000000000000000000000000000000000');

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('will revert if address zero is used as the Treasury address', async function () {
      const [owner] = await ethers.getSigners();
      const { TheopetraERC20Mock, TheopetraAuthority, StakingMock } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          addressZero,
          TheopetraERC20Mock.address,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          StakingMock.address
        )
      ).to.be.revertedWith('Zero address: Treasury');
    });

    it('will revert if address zero is used as the theo token address', async function () {
      const [owner] = await ethers.getSigners();
      const { TreasuryMock, TheopetraAuthority, StakingMock } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          TreasuryMock.address,
          addressZero,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          StakingMock.address
        )
      ).to.be.revertedWith('Zero address: THEO');
    });

    it('will revert if address zero is used as the Staking address', async function () {
      const [owner] = await ethers.getSigners();
      const { TreasuryMock, TheopetraERC20Mock, TheopetraAuthority } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      await expect(
        new StakingDistributor__factory(owner).deploy(
          TreasuryMock.address,
          TheopetraERC20Mock.address,
          epochLength,
          nextEpochBlock,
          TheopetraAuthority.address,
          addressZero,
        )
      ).to.be.revertedWith('Zero address: Staking');
    });
  });

  describe('access control', function (){
    it('will revert if distribute is called from an account other than the staking contract', async function (){
      const {Distributor} : any = await setup();
      await expect(Distributor.distribute()).to.be.revertedWith('Only staking');
    });

    it('will revert if a call to retrieve bounty is made from an account other than the staking contract', async function (){
      const {Distributor} : any = await setup();
      await expect(Distributor.retrieveBounty()).to.be.revertedWith('Only staking');
    });


  })
});
