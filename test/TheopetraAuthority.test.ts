import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { TheopetraAuthority } from '../typechain-types';
import { setupUsers } from './utils';
import { CONTRACTS } from '../utils/constants';

const setup = deployments.createFixture(async () => {
  await deployments.fixture([CONTRACTS.authority]);
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    TheopetraAuthority: <TheopetraAuthority>await ethers.getContract(CONTRACTS.authority),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
    addressZero: ethers.utils.getAddress('0x0000000000000000000000000000000000000000'),
  };
});

describe('TheopetraAuthority', function() {
  it('is deployed with a correctly-set vault address', async function () {
    const { TheopetraAuthority, owner } = await setup();

    expect(await TheopetraAuthority.vault()).to.equal(owner);
  });

  it('allows the governor to set a vault address', async function () {
    const { TheopetraAuthority, users } = await setup();
    const [, alice] = users;
    await TheopetraAuthority.pushVault(alice.address, true);

    expect(await TheopetraAuthority.vault()).to.equal(alice.address);
  });

  it('should revert if a user other than the governor makes a call to set the vault address', async function () {
    const { TheopetraAuthority, users } = await setup();
    const [, alice] = users;
    await expect(alice.TheopetraAuthority.pushVault(alice.address, true)).to.be.revertedWith(
      'UNAUTHORIZED'
    );
  });
});
