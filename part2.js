// transaction, mining reward, mint & gas fee

const crypto = require('crypto');
const EC = require('elliptic').ec;

const SHA256 = message =>
  crypto.createHash('sha256').update(message).digest('hex');
const ec = new EC('secp256k1');

// const keyPair = ec.genKeyPair();
// public key: keyPair.getPublic("hex")
// private key: keyPair.getPrivate("hex")

const MINT_KEY_PAIR = ec.genKeyPair();
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic('hex');

const holderKeyPair = ec.genKeyPair();

class Block {
  constructor(timestamp = '', data = []) {
    this.timestamp = timestamp;
    this.data = data;

    this.hash = this.getHash();
    this.prevHash = '';
    this.nonce = 0;
  }

  getHash() {
    return SHA256(
      JSON.stringify(this.data) + this.timestamp + this.prevHash + this.nonce
    );
  }

  mine(difficulty) {
    while (!this.hash.startsWith(Array(difficulty + 1).join('0'))) {
      this.nonce++;
      this.hash = this.getHash();
    }
  }

  hasValidTransactions(chain) {
    return this.data.every(transaction =>
      transaction.isValid(transaction, chain)
    );
  }
}

class Blockchain {
  constructor() {
    const initialCoinRelease = new Transaction(
      MINT_PUBLIC_ADDRESS,
      holderKeyPair.getPublic('hex'),
      100000
    );

    this.chain = [new Block(Date.now().toString(), [initialCoinRelease])];
    this.difficulty = 1;
    // estimated time for a block to be mined
    this.blockTime = 30000;
    this.transactions = [];
    this.reward = 297;
  }

  getLastBlock() {
    return this.chain[this.chain.length - 1];
  }

  getBalance(address) {
    let balance = 0;

    this.chain.forEach(block => {
      block.data.forEach(transaction => {
        if (transaction.senderPublicKey === address) {
          balance -= transaction.amount;
          balance -= transaction.gas;
        }
        if (transaction.receiverPublicKey === address) {
          balance += transaction.amount;
        }
      });
    });
    return balance;
  }

  addBlock(block) {
    block.prevHash = this.getLastBlock().hash;
    block.hash = block.getHash();

    block.mine(this.difficulty);

    this.chain.push(Object.freeze(block));
    // this.chain.push(block);

    this.difficulty +=
      Date.now() - parseInt(this.getLastBlock().timestamp) < this.blockTime
        ? 1
        : -1;
  }

  addTransaction(transaction) {
    if (transaction.isValid(transaction, this)) {
      this.transactions.push(transaction);
    }
  }

  mineTransactions(rewardAddress) {
    let gas = 0;

    this.transactions.forEach(transaction => {
      gas += transaction.gas;
    });

    const rewardTransaction = new Transaction(
      MINT_PUBLIC_ADDRESS,
      rewardAddress,
      this.reward + gas
    );
    rewardTransaction.sign(MINT_KEY_PAIR);

    // Prevent from minting coins and mine the minting transaction
    if (this.transactions.length !== 0)
      this.addBlock(
        new Block(Date.now().toString(), [
          rewardTransaction,
          ...this.transactions,
        ])
      );

    this.transactions = [];
  }

  isValid(blockchain = this) {
    for (let i = 1; i < blockchain.chain.length; i++) {
      const currentBlock = blockchain.chain[i];
      const prevBlock = blockchain.chain[i - 1];

      if (
        currentBlock.hash !== currentBlock.getHash() ||
        currentBlock.prevHash !== prevBlock.hash ||
        !currentBlock.hasValidTransactions(blockchain)
      ) {
        return false;
      }
    }
    return true;
  }
}

class Transaction {
  constructor(senderPublicKey, receiverPublicKey, amount, gas = 0) {
    this.senderPublicKey = senderPublicKey;
    this.receiverPublicKey = receiverPublicKey;
    this.amount = amount;
    this.gas = gas;
  }

  sign(keyPair) {
    if (keyPair.getPublic('hex') === this.senderPublicKey) {
      this.signature = keyPair
        .sign(
          SHA256(
            this.senderPublicKey +
              this.receiverPublicKey +
              this.amount +
              this.gas
          ),
          'base64'
        )
        .toDER('hex');
    }
  }

  isValid(tx, chain) {
    return (
      tx.senderPublicKey &&
      tx.receiverPublicKey &&
      tx.amount &&
      (chain.getBalance(tx.senderPublicKey) >= tx.amount + tx.gas ||
        (tx.senderPublicKey === MINT_PUBLIC_ADDRESS &&
          tx.amount === chain.reward)) &&
      ec
        .keyFromPublic(tx.senderPublicKey, 'hex')
        .verify(
          SHA256(
            tx.senderPublicKey + tx.receiverPublicKey + tx.amount + tx.gas
          ),
          tx.signature
        )
    );
  }
}

// Test
// original balance: 100000
const testChain = new Blockchain();

const testWallet = ec.genKeyPair();

const transaction = new Transaction(
  holderKeyPair.getPublic('hex'),
  testWallet.getPublic('hex'),
  333,
  10
);

transaction.sign(holderKeyPair);

testChain.addTransaction(transaction);

testChain.mineTransactions(testWallet.getPublic('hex'));

console.log(
  'Holder wallet balance: ',
  testChain.getBalance(holderKeyPair.getPublic('hex'))
);

console.log(
  'Test wallet balance: ',
  testChain.getBalance(testWallet.getPublic('hex'))
);

console.log(testChain.chain);
