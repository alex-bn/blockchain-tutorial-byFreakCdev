const crypto = require('crypto');
const SHA256 = message =>
  crypto.createHash('sha256').update(message).digest('hex');

const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

const MINT_PRIVATE_ADDRESS =
  'f10ce544f9fae5b8f088f0aaa688fe08db88017e69390f15ca634824946feaf9';
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, 'hex');
const MINT_PUBLIC_KEY = MINT_KEY_PAIR.getPublic('hex');

class Block {
  constructor(timestamp = '', data = []) {
    this.timestamp = timestamp;
    this.data = data;

    this.hash = Block.getHash(this);
    this.prevHash = '';
    this.nonce = 0;
  }

  static getHash(block) {
    return SHA256(
      JSON.stringify(block.data) +
        block.timestamp +
        block.prevHash +
        block.nonce
    );
  }

  mine(difficulty) {
    while (!this.hash.startsWith(Array(difficulty + 1).join('0'))) {
      this.nonce++;
      this.hash = Block.getHash(this);
    }
  }

  static hasValidTransactions(block, chain) {
    let gas = 0;
    let reward = 0;

    block.data.forEach(transaction => {
      if (transaction.senderPublicKey !== MINT_PUBLIC_ADDRESS) {
        gas += transaction.gas;
      } else {
        reward = transaction.amount;
      }
    });

    return (
      reward - gas === chain.reward &&
      block.data.every(transaction =>
        Transaction.isValid(transaction, chain)
      ) &&
      block.data.filter(transaction => transaction.from === MINT_PUBLIC_ADDRESS)
        .length === 1
    );
  }
}

class Blockchain {
  constructor() {
    const initialCoinRelease = new Transaction(
      MINT_PUBLIC_KEY,
      '045bcb7aa4dc8ea8673f1052e7d96598b80cc30861b13ccefda930afd17146dbe91b3560733ed50bce24996c38422ae7f5f508ee103e0b0def7e81a7577098278f',
      100000
    );

    this.chain = [new Block('', [initialCoinRelease])];
    this.difficulty = 1;
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
    block.hash = Block.getHash(this);

    block.mine(this.difficulty);

    this.chain.push(Object.freeze(block));

    this.difficulty +=
      Date.now() - parseInt(this.getLastBlock().timestamp) < this.blockTime
        ? 1
        : -1;
  }

  addTransaction(transaction) {
    if (Transaction.isValid(transaction, this)) {
      this.transactions.push(transaction);
    }
  }

  mineTransactions(rewardAddress) {
    let gas = 0;

    this.transactions.forEach(transaction => {
      gas += transaction.gas;
    });

    const rewardTransaction = new Transaction(
      MINT_PUBLIC_KEY,
      rewardAddress,
      this.reward + gas
    );
    rewardTransaction.sign(MINT_KEY_PAIR);

    if (this.transactions.length !== 0)
      this.addBlock(
        new Block(Date.now().toString(), [
          rewardTransaction,
          ...this.transactions,
        ])
      );

    this.transactions = [];
  }

  static isValid(blockchain) {
    for (let i = 1; i < blockchain.chain.length; i++) {
      const currentBlock = blockchain.chain[i];
      const prevBlock = blockchain.chain[i - 1];

      if (
        currentBlock.hash !== Block.getHash(currentBlock) ||
        currentBlock.prevHash !== prevBlock.hash ||
        !Block.hasValidTransactions(currentBlock, blockchain)
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

  static isValid(tx, chain) {
    return (
      tx.senderPublicKey &&
      tx.receiverPublicKey &&
      tx.amount &&
      (chain.getBalance(tx.senderPublicKey) >= tx.amount + tx.gas ||
        tx.senderPublicKey === MINT_PUBLIC_KEY) &&
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
const testChain = new Blockchain();
module.exports = { Block, Blockchain, Transaction, testChain };
