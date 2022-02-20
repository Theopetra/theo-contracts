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
  describe('Deployment', function () {
    it('can be deployed', async function () {
      await setup();
    });

    it('should set the correct owner when deployed', async function () {
      const { TheopetraERC20Token, owner } = await setup();

      expect(await TheopetraERC20Token.owner()).to.equal(owner);
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
  });

  describe('Vault', function () {
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
      const { TheopetraERC20Token, addressZero } = await setup();
      const [, addr1, { address: address2 }] = await ethers.getSigners();
      await expect(TheopetraERC20Token.connect(addr1).setVault(address2)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
      expect(await TheopetraERC20Token.vault()).to.equal(addressZero);
    });
  });

  describe('Minting', function () {
    it('can mint an amount of tokens and assign them to an account', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault, tokenBeneficiary] = await ethers.getSigners();
      const amountToMint = 5000;
      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);
      const beneficiaryBalance = await TheopetraERC20Token.balanceOf(tokenBeneficiary.address);

      expect(beneficiaryBalance).to.equal(ethers.BigNumber.from(amountToMint));
    });

    it('should add to the total supply when minting', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault, tokenBeneficiary] = await ethers.getSigners();
      const amountToMint = 5;

      expect(await TheopetraERC20Token.totalSupply()).to.equal(0);

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);

      expect(await TheopetraERC20Token.totalSupply()).to.equal(amountToMint);
    });

    it('the first time called, should update the state of initial supply', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault] = await ethers.getSigners();
      const amountToMint = 5;

      expect(await TheopetraERC20Token.getInitialSupply()).to.equal(0);

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(vault.address, amountToMint);

      expect(await TheopetraERC20Token.getInitialSupply()).to.equal(amountToMint);
    });

    it('should not update the state of initial supply after first being called', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault] = await ethers.getSigners();
      const firstAmountToMint = 100;
      const secondAmountToMint = 4;

      expect(await TheopetraERC20Token.getInitialSupply()).to.equal(0);

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(vault.address, firstAmountToMint);
      expect(await TheopetraERC20Token.getInitialSupply()).to.equal(firstAmountToMint);

      await TheopetraERC20Token.connect(vault).mint(vault.address, secondAmountToMint);
      expect(await TheopetraERC20Token.getInitialSupply()).to.equal(firstAmountToMint);
      expect(await TheopetraERC20Token.totalSupply()).to.equal(firstAmountToMint + secondAmountToMint);
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

    it('should revert if a call is made to mint a negative number of tokens', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault] = await ethers.getSigners();
      const amountToMint = -100;
      await TheopetraERC20Token.setVault(vault.address);

      await expect(TheopetraERC20Token.connect(vault).mint(vault.address, amountToMint)).to.be.reverted;
    });

    it('if total supply is not zero, it should allow an amount of tokens to be minted within the inflation cap of 5% of total supply', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault] = await ethers.getSigners();
      const initialAmountToMint = 100;

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(vault.address, initialAmountToMint);
      const vaultBalance = await TheopetraERC20Token.balanceOf(vault.address);

      expect(vaultBalance).to.equal(ethers.BigNumber.from(100));

      await TheopetraERC20Token.connect(vault).mint(vault.address, 4);
      const newVaultBalance = await TheopetraERC20Token.balanceOf(vault.address);
      expect(newVaultBalance).to.equal(ethers.BigNumber.from(104));
    });

    it('if total supply is not zero, it should limit minting of new tokens to be at most 5% of total supply', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault] = await ethers.getSigners();
      const initialAmountToMint = 100;

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(vault.address, initialAmountToMint);
      const vaultBalance = await TheopetraERC20Token.balanceOf(vault.address);

      expect(vaultBalance).to.equal(ethers.BigNumber.from(100));
      await TheopetraERC20Token.connect(vault).mint(vault.address, 150);
      expect(await TheopetraERC20Token.totalSupply()).to.equal(105);

      await TheopetraERC20Token.connect(vault).mint(vault.address, 150);
      expect(await TheopetraERC20Token.totalSupply()).to.equal(110);
      const newVaultBalance = await TheopetraERC20Token.balanceOf(vault.address);
      expect(newVaultBalance).to.equal(ethers.BigNumber.from(110));
    });
  });

  describe('Token burning', function () {
    it('allows a user to burn their own tokens', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault, tokenBeneficiary] = await ethers.getSigners();
      const amountToMint = 15;

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);
      await TheopetraERC20Token.connect(tokenBeneficiary).burn(3);

      const beneficiaryBalance = await TheopetraERC20Token.balanceOf(tokenBeneficiary.address);
      expect(beneficiaryBalance).to.equal(ethers.BigNumber.from(12));
    });

    it('allows an approved user to burn tokens of another user, within an allowance limit', async function () {
      const { TheopetraERC20Token } = await setup();
      const [, vault, tokenBeneficiary, tokenBurner] = await ethers.getSigners();
      const amountToMint = 100;

      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);
      await TheopetraERC20Token.connect(tokenBeneficiary).approve(tokenBurner.address, 25);
      await TheopetraERC20Token.connect(tokenBurner).burnFrom(tokenBeneficiary.address, 20);

      const beneficiaryBalance = await TheopetraERC20Token.balanceOf(tokenBeneficiary.address);
      expect(beneficiaryBalance).to.equal(ethers.BigNumber.from(80));

      const allowanceRemaining = await TheopetraERC20Token.allowance(tokenBeneficiary.address, tokenBurner.address);
      expect(allowanceRemaining).to.equal(5);
    });

    it('it prevents a user burning tokens of another user if they are not approved to spend them', async function () {
      const { TheopetraERC20Token } = await setup();

      const [, vault, tokenBeneficiary, tokenBurner] = await ethers.getSigners();
      const amountToMint = 100;
      await TheopetraERC20Token.setVault(vault.address);
      await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);

      await expect(TheopetraERC20Token.connect(tokenBurner).burnFrom(tokenBeneficiary.address, 100)).to.be.revertedWith(
        'ERC20: burn amount exceeds allowance'
      );
    });

    it('reverts if the burn amount exceeds the allowance of a user', async function () {
      const { TheopetraERC20Token } = await setup();

      const [, vault, tokenBeneficiary, tokenBurner] = await ethers.getSigners();
      const amountToMint = 100;
      await TheopetraERC20Token.setVault(vault.address);

      await TheopetraERC20Token.connect(vault).mint(tokenBeneficiary.address, amountToMint);
      await TheopetraERC20Token.connect(tokenBeneficiary).approve(tokenBurner.address, 25);
      await expect(TheopetraERC20Token.connect(tokenBurner).burnFrom(tokenBeneficiary.address, 99)).to.be.revertedWith(
        'ERC20: burn amount exceeds allowance'
      );
    });
  });
});
