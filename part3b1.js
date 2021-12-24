const crypto = require('crypto');
const EC = require('elliptic').ec;
const WS = require('ws');
const { Block, Blockchain, Transaction, testChain } = require('./part3a');

const SHA256 = message =>
  crypto.createHash('sha256').update(message).digest('hex');
const ec = new EC('secp256k1');

const MINT_PRIVATE_ADDRESS =
  'f10ce544f9fae5b8f088f0aaa688fe08db88017e69390f15ca634824946feaf9';
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, 'hex');
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic('hex');

const privateKey =
  '43b8756a00dc82b0334f54e5566a19b86a7f06d94a7a71392ec7379cec724ecc';
const keyPair = ec.keyFromPrivate(privateKey, 'hex');
const publicKey = keyPair.getPublic('hex');

const PORT = 3000;
const PEERS = [];
const MY_ADDRESS = `ws://localhost:3000`;
const server = new WS.Server({ port: PORT });

let opened = [];
let connected = [];
let check = [];
let checked = [];
let checking = false;
let tempChain = new Blockchain();

console.log('Listening on PORT ', PORT);

server.on('connection', async (socket, req) => {
  socket.on('message', message => {
    const _message = JSON.parse(message);

    switch (_message.type) {
      case 'TYPE_HANDSHAKE':
        const nodes = _message.data;

        nodes.forEach(node => connect(node));

      case 'TYPE_CREATE_TRANSACTION':
        const transaction = _message.data;

        testChain.addTransaction(transaction);

        break;

      case 'TYPE_REPLACE_CHAIN':
        const [newBlock, newDiff] = _message.data;

        const ourTx = [...testChain.transactions.map(tx => JSON.stringify(tx))];
        const theirTx = [
          ...newBlock.data
            .filter(tx => tx.from !== MINT_PUBLIC_ADDRESS)
            .map(tx => JSON.stringify(tx)),
        ];
        const n = theirTx.length;

        if (newBlock.prevHash !== testChain.getLastBlock().prevHash) {
          for (let i = 0; i < n; i++) {
            const index = ourTx.indexOf(theirTx[0]);

            if (index === -1) break;

            ourTx.splice(index, 1);
            theirTx.splice(0, 1);
          }
          if (
            theirTx.length === 0 &&
            SHA256(
              testChain.getLastBlock().hash +
                newBlock.timestamp +
                JSON.stringify(newBlock.data) +
                newBlock.nonce
            ) === newBlock.hash &&
            newBlock.hash.startsWith(
              Array(testChain.difficulty + 1).join('0')
            ) &&
            Block.hasValidTransactions(newBlock, testChain) &&
            (parseInt(newBlock.timestamp) >
              parseInt(testChain.getLastBlock().timestamp) ||
              testChain.getLastBlock().timestamp === '') &&
            parseInt(newBlock.timestamp) < Date.now() &&
            testChain.getLastBlock().hash === newBlock.prevHash &&
            (newDiff + 1 === testChain.difficulty ||
              newDiff - 1 === testChain.difficulty)
          ) {
            testChain.chain.push(newBlock);
            testChain.difficulty = newDiff;
            testChain.transactions = [...ourTx.map(tx => JSON.parse(tx))];
          }
        } else if (
          !checked.includes(
            JSON.stringify([
              testChain.getLastBlock().prevHash,
              testChain.chain[testChain.chain.length - 2].timestamp,
            ])
          )
        ) {
          checked.push(
            JSON.stringify([
              testChain.getLastBlock().prevHash,
              testChain.chain[testChain.chain.length - 2].timestamp,
            ])
          );

          const position = testChain.chain.length - 1;

          checking = true;

          sendMessage(produceMessage('TYPE_REQUEST_CHECK', MY_ADDRESS));

          setTimeout(() => {
            checking = false;

            let mostAppeared = check[0];

            check.forEach(group => {
              if (
                check.filter(_group => _group === group).length >
                check.filter(_group => _group === mostAppeared).length
              ) {
                mostAppeared = group;
              }
            });

            const group = JSON.parse(mostAppeared);

            testChain.chain[position] = group[0];
            testChain.transaction = [...group[1]];
            testChain.difficulty = group[2];

            check.splice(0, check.length);
          }, 5000);
        }

        break;

      case 'TYPE_REQUEST_CHECK':
        opened
          .filter(node => node.address === _message.data)[0]
          .socket.send(
            JSON.stringify(
              produceMessage(
                'TYPE_SEND_CHECK',
                JSON.stringify([
                  testChain.getLastBlock(),
                  testChain.transactions,
                  testChain.difficulty,
                ])
              )
            )
          );

        break;

      case 'TYPE_SEND_CHECK':
        if (checking) check.push(_message.data);

        break;

      case 'TYPE_REQUEST_CHAIN':
        const socket = opened.filter(node => node.address === _message.data)[0]
          .socket;

        for (let i = 0; i < testChain.chain.length; i++) {
          socket.send(
            JSON.stringify(
              produceMessage('TYPE_SEND_CHAIN', {
                block: testChain.chain[i],
                finished: i === testChain.chain.length,
              })
            )
          );
        }

        break;

      case 'TYPE_SEND_CHAIN':
        const { block, finished } = _message.data;

        if (!finished) {
          tempChain.chain.push(block);
        } else {
          if (Blockchain.isValid(tempChain)) {
            testChain.chain = tempChain.chain;
          }
          tempChain = new Blockchain();
        }

        break;

      case 'TYPE_REQUEST_INFO':
        opened
          .filter(node => node.address === _message.data)[0]
          .socket.send('TYPE_SEND_INFO', [
            testChain.difficulty,
            testChain.transactions,
          ]);

        break;

      case 'TYPE_SEND_INFO':
        [testChain.difficulty, testChain.transactions] = _message.data;
    }
  });
});

async function connect(address) {
  if (
    !connected.find(peerAddress => peerAddress === address) &&
    address !== MY_ADDRESS
  ) {
    const socket = new WS(address);

    socket.on('open', () => {
      socket.send(
        JSON.stringify(
          produceMessage('TYPE_HANDSHAKE', [MY_ADDRESS, ...connected])
        )
      );

      opened.forEach(node =>
        node.socket.send(
          JSON.stringify(produceMessage('TYPE_HANDSHAKE', [address]))
        )
      );

      if (
        !opened.find(peer => peer.address === address) &&
        address !== MY_ADDRESS
      ) {
        opened.push({ socket, address });
      }

      if (
        !connected.find(peerAddress => peerAddress === address) &&
        address !== MY_ADDRESS
      ) {
        connected.push(address);
      }
    });

    socket.on('close', () => {
      opened.splice(connected.indexOf(address), 1);
      connected.splice(connected.indexOf(address), 1);
    });
  }
}

function produceMessage(type, data) {
  return { type, data };
}

function sendMessage(message) {
  opened.forEach(node => {
    node.socket.send(JSON.stringify(message));
  });
}

process.on('uncaughtException', err => console.log(err));

PEERS.forEach(peer => connect(peer));

setTimeout(() => {
  const transaction = new Transaction(
    publicKey,
    '042ed18716eba4ecc1b2fe6d86e8803647d27b06f9d1aa3e6a5eb4c308c0140ea29a8fe8c32f26b390c23b33518449168003d0550cbb7f6e07a78bdcc6e8da0477',
    200,
    10
  );
  transaction.sign(keyPair);

  sendMessage(produceMessage('TYPE_CREATE_TRANSACTION', transaction));

  testChain.addTransaction(transaction);
}, 5000);

setTimeout(() => {
  console.log(opened);
  console.log(testChain);
}, 10000);
