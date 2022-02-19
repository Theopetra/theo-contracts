import { expect } from './chai-setup';
import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
// import { TheopetraERC20Token } from '../../next-app/src/typechain';
import { setupUsers } from './utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('TheopetraERC20Token');
  const { deployer: owner } = await getNamedAccounts();
  const contracts = {
    TheopetraERC20Token: await ethers.getContract('TheopetraERC20Token'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    owner,
    addressZero: '0x0000000000000000000000000000000000000000',
  };
});

describe('TheopetraERC20', function () {
  it('can be deployed', async function () {
    await setup();
  });

  it('is deployed with a name of Theopetra', async function () {
    const { TheopetraERC20Token } = await setup();
    const contractName = await TheopetraERC20Token.name();

    expect(contractName).to.equal('Theopetra');
  });

  it('is deployed with a symbol THEO', async function () {
    const { TheopetraERC20Token } = await setup();
    const contractSymbol = await TheopetraERC20Token.symbol();

    expect(contractSymbol).to.equal('THEO');
  });

  it('has a function that returns the owner address, which is the contract deployer', async function () {
    const { TheopetraERC20Token, owner } = await setup();
    const response = await TheopetraERC20Token.owner();

    expect(response).to.equal(owner);
  });

  it('can mint an amount of tokens and assign them to an account', async function () {
    const { TheopetraERC20Token } = await setup();
    const [, vault, tokenBeneficiary] = await ethers.getSigners();
    const amountToMint = 5000;
    await TheopetraERC20Token.setVault(vault.address);
    await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);
    const beneficiaryBalance = await TheopetraERC20Token.balanceOf(tokenBeneficiary.address);

    expect(beneficiaryBalance).to.equal(ethers.BigNumber.from(amountToMint));
  });

  describe('Inherited from VaultOwned', async function () {
    it('has a function to return the vault address, which is initialized at address zero', async function () {
      const { TheopetraERC20Token, addressZero } = await setup();
      expect(await TheopetraERC20Token.vault()).to.equal(addressZero);
    });

    it('allows the owner to set a vault address', async function () {
      const { TheopetraERC20Token, users } = await setup();
      await TheopetraERC20Token.setVault(users[1].address);
      expect(await TheopetraERC20Token.vault()).to.equal(users[1].address);
    });

    it('should revert if a user other than the owner makes a call to set the vault address', async function () {
      const { TheopetraERC20Token, users, addressZero } = await setup();
      const [, addr1, { address: address2 }] = await ethers.getSigners();
      await expect(TheopetraERC20Token.connect(addr1).setVault(address2)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
      expect(await TheopetraERC20Token.vault()).to.equal(addressZero);
    });

    it('should revert if an address other than the vault owner makes a call to mint tokens', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault, tokenBeneficiary, address3] = await ethers.getSigners();
      const amountToMint = 5000;
      await TheopetraERC20Token.setVault(vault.address);

      await expect(
        TheopetraERC20Token.connect(address3).mint(tokenBeneficiary.address, amountToMint)
      ).to.be.revertedWith('VaultOwned: caller is not the Vault');

      const beneficiaryBalance = await TheopetraERC20Token.balanceOf(tokenBeneficiary.address);
      expect(beneficiaryBalance).to.equal(ethers.BigNumber.from(0));
    });
  });
});
