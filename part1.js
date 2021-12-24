// proof of work blockchain
// data must be immutable(will never change or cannot be changed) and un-hackable

const crypto = require('crypto');
const SHA256 = message =>
  crypto.createHash('SHA256').update(message).digest('hex');

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
}

class Blockchain {
  constructor() {
    this.chain = [new Block(Date.now().toString())];
    this.difficulty = 1;
    // estimated time for a block to be mined
    this.blockTime = 30000;
  }

  getLastBlock() {
    return this.chain[this.chain.length - 1];
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

  isValid(blockchain = this) {
    for (let i = 1; i < blockchain.chain.length; i++) {
      const currentBlock = blockchain.chain[i];
      const prevBlock = blockchain.chain[i - 1];

      if (
        currentBlock.hash !== currentBlock.getHash() ||
        currentBlock.prevHash !== prevBlock.hash
      ) {
        return false;
      }
    }
    return true;
  }
}

// Test difficulty:
const NewChain = new Blockchain();
NewChain.addBlock(new Block(Date.now().toString(), ['Hello', 'World!']));
NewChain.addBlock(new Block(Date.now().toString(), ['Hello', 'World1!']));
NewChain.addBlock(new Block(Date.now().toString(), ['Hello', 'World2!']));
NewChain.addBlock(new Block(Date.now().toString(), ['Hello', 'World3!']));
NewChain.addBlock(new Block(Date.now().toString(), ['Hello', 'World4!']));
NewChain.addBlock(new Block(Date.now().toString(), ['Hello', 'World5!']));
console.log(NewChain);

// Test isValid() method while this.chain.push(block):
// console.log(NewChain.chain);
// console.log(NewChain.isValid());
// NewChain.chain[1].data = ['modified data'];
// console.log(NewChain.chain);
// console.log(NewChain.isValid()); // false -> data has been changed
