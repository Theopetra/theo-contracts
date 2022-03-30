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

describe('TheopetraAuthority', function () {
  describe('Vault', function () {
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
      const { users } = await setup();
      const [, alice] = users;
      await expect(alice.TheopetraAuthority.pushVault(alice.address, true)).to.be.revertedWith('UNAUTHORIZED');
    });
  });

  describe('Whitelist Signer', function () {
    it('is deployed with a correctly-set whitelist signer address', async function () {
      const { TheopetraAuthority, owner } = await setup();

      expect(await TheopetraAuthority.whitelistSigner()).to.equal(owner);
    });

    it('allows the governor to set a new whitelist signer address', async function () {
      const { TheopetraAuthority, users } = await setup();
      const [, alice] = users;

      expect(await TheopetraAuthority.pushWhitelistSigner(alice.address, true));
      expect(await TheopetraAuthority.whitelistSigner()).to.equal(alice.address);
    });

    it('allows the governor to set a new whitelist signer address that can be pulled by the new signer', async function () {
      const { TheopetraAuthority, users, owner } = await setup();
      const [, alice] = users;
      expect(await TheopetraAuthority.pushWhitelistSigner(alice.address, false));
      expect(await TheopetraAuthority.whitelistSigner()).to.equal(owner);
      expect(await alice.TheopetraAuthority.pullWhitelistSigner());
      expect(await TheopetraAuthority.whitelistSigner()).to.equal(alice.address);
    });

    it('should revert if a user other than the governor makes a call to set the whitelist signer address', async function () {
      const { users } = await setup();
      const [, alice] = users;
      await expect(alice.TheopetraAuthority.pushWhitelistSigner(alice.address, true)).to.be.revertedWith(
        'UNAUTHORIZED'
      );
    });

    it('should revert if a user other than the new signer makes a call to pull the whitelist signer address', async function () {
      const { TheopetraAuthority, users, owner } = await setup();
      const [, alice, bob] = users;
      expect(await TheopetraAuthority.pushWhitelistSigner(alice.address, false));
      await expect(bob.TheopetraAuthority.pullWhitelistSigner()).to.be.revertedWith('!newWhitelistSigner');
      expect(await TheopetraAuthority.whitelistSigner()).to.equal(owner);
    });
  });
});
