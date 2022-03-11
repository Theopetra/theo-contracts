import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { StakingDistributor__factory } from '../../next-app/src/typechain';

import { setupUsers } from './utils';
import { CONTRACTS, MOCKS, MOCKSWITHARGS } from '../utils/constants';
import { Contract } from 'ethers';

const getContracts = async (): Promise<{ [key: string]: Contract }> => {
  await deployments.fixture([CONTRACTS.distributor, CONTRACTS.authority, MOCKSWITHARGS.treasuryMock]);

  return {
    Distributor: await ethers.getContract(CONTRACTS.distributor),
    TheopetraAuthority: await ethers.getContract(CONTRACTS.authority),
    TreasuryMock: await ethers.getContract(MOCKSWITHARGS.treasuryMock),
    TheopetraERC20Mock: await ethers.getContract(MOCKS.theoTokenMock),
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
    addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
  };
});

describe.only('Distributor', function () {
  let TreasuryMock: any;

  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('does not accept address zero as the treasury address', async function () {
      const [owner] = await ethers.getSigners();
      const { TreasuryMock, TheopetraERC20Mock, TheopetraAuthority } = await getContracts();
      const epochLength = 2000;
      const nextEpochBlock = 10;

      const distributor = await new StakingDistributor__factory(owner).deploy(
        TreasuryMock.address,
        TheopetraERC20Mock.address,
        epochLength,
        nextEpochBlock,
        TheopetraAuthority.address
      );
    });
  });
});
