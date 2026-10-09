# Open Procedure Tendering in Ethereum

> ITU graduation project, 2021. Restored in 2026: tests, CI, working hash helper, digital edition of the thesis. Original code: tag `original-2021`.

- **[Digital edition of the thesis](https://urtuba.github.io/open-tendering-in-ethereum/)**: the 2021 report with the language mistakes fixed and short 2026 notes where a statement is outdated.
- **[Original thesis (PDF)](thesis.pdf)**: the document submitted to Istanbul Technical University in August 2021, unchanged.

## What it does

The project turns the open procedure of the Turkish Public Procurement Law into an Ethereum smart contract, written in Solidity (`>= 0.4.0 < 0.6.0`, compiled with 0.5.17). A tender has three phases:

1. **Bidding.** Bidders send a hash of their bid, not the bid. `makeBid` and `updateBid` work only in this phase.
2. **Evaluation.** Bidders reveal their bids with `validateBid`. The contract checks the hash and keeps the lowest revealed bid.
3. **Post-tendering.** The owner of the tender reveals the hidden values with `endTender`. After that, `getWinner` returns the winner.

The bids and the tender limits are commit-reveal hashes. A bid hash is `keccak256(<bid> + <random string>)`. The tender hash is `keccak256(<estimated> + "+" + <minimum> + "+" + <maximum> + <random string>)`. The numbers are written as plain decimal text. `create_hash.py` makes these hashes.

The owner starts a tender by deploying the contract with the tender hash and the length of the bidding and evaluation phases in days. The owner cannot bid. If the lowest revealed bid is between the minimum and the maximum, `getWinner` returns the address of that bidder. In every other case it reverts. All failed calls revert without an error message.

| Function | Who | When |
|---|---|---|
| `makeBid(hash)`, `updateBid(hash)` | bidders (not the owner) | bidding phase |
| `validateBid(value, secret)` | bidders | evaluation phase |
| `endTender(min, max, est, secret)` | owner | post-tendering phase |
| `getWinner()` | anyone | after `endTender` |

There are two files with the same contract: `contracts/Tender.sol` (with its parts in `contracts/utils` and `contracts/data`) and `contracts/TenderOneFile.sol` (everything in one file, made for Remix).

## Try it in Remix

**[Open TenderOneFile.sol in Remix with compiler 0.5.17](https://remix.ethereum.org/#url=https://raw.githubusercontent.com/urtuba/open-tendering-in-ethereum/main/contracts/TenderOneFile.sol&version=soljson-v0.5.17+commit.d19bba13.js)**

Then compile, and deploy `Tender` in the JavaScript/Remix VM. For a live network, choose "Injected Provider" and connect a wallet. The constructor takes `_tenderHash` (from `create_hash.py`), `_openDays` and `_validationDays`.

## Using `create_hash.py`

The script makes the hashes and the random strings. It needs Python 3 and web3.py:

```
pip install -r requirements.txt
```

A bidder makes a bid hash. The value is a whole number without leading zeros:

```
python3 create_hash.py bid 1500
```

The organizer makes the tender hash from the estimated, minimum and maximum value (in this order):

```
python3 create_hash.py tender 1000 500 1500
```

Without values on the command line, the script asks for them. It prints the values and the random string to keep safe, and the hash to use:

- The **bid hash** goes to `makeBid` / `updateBid`. In the evaluation phase, call `validateBid` with the bid and the random string.
- The **tender hash** goes to the constructor. After the evaluation phase, call `endTender` with the minimum, the maximum, the estimated value and the random string. Note that `endTender` takes the minimum first and the estimated value third.

The random string comes from Python's `secrets` module. It is at least 16 characters long. Keep it secret until the reveal.

## Running the tests

Node 22 is needed (the tests use Hardhat 3).

```
npm ci
npm test
```

The first run downloads the Solidity compiler 0.5.17. The same test suite runs against both `Tender.sol` and `TenderOneFile.sol`, so the two files stay equal. It covers the three phases and their time limits (with time travel), `makeBid` and `updateBid`, `validateBid` with right and wrong secrets, `endTender` by the owner only, `getWinner`, and the winner rules. The tests describe what the contracts do, also where that looks wrong (see Known limitations). They never change the contract code.

The hash helper has its own tests:

```
pip install -r requirements.txt
python3 -m unittest discover -s test -v
```

`test/vectors.json` holds a bid hash and a tender hash made by the helper. The Python tests check that the helper still makes them, and the Hardhat tests check that both contracts accept them. This shows that the helper and the contracts agree. CI runs both test suites.

## Example scenario (2021)

In 2021 the contract was tested on Ethereum Ropsten, Remix and BSC Testnet. The Ropsten test network was shut down in 2022. An example scenario with 4 accounts was deployed on BSC Testnet at [0x4f02b4d69ad451a040216ccd7f1022853c90dc28](https://testnet.bscscan.com/address/0x4f02b4d69ad451a040216ccd7f1022853c90dc28). The transactions and their results are in [example-scenario.csv](example-scenario.csv). The testnet may have been reset since then.

## Known limitations

The 2021 contracts were not changed in 2026. The tests below show what they do today. Each test is in `test/tender.test.js`, in the group "2021 behaviour: known limitations", unless noted.

- **Digits can move between a value and its secret.** The hash joins the value and the random string without a separator. A bidder who committed `500` with the secret `00abc` can also reveal `5` with the secret `0000abc` (or `50000` with `abc`). So a bid can be revealed as a lower or higher value than the one committed. Tests: "a bidder can reveal a lower value than the one committed (digits move into the secret)".
- **The organizer can change the maximum after the reveals.** The same problem exists at the end of the tender hash, where the maximum is followed by the secret. So the organizer can choose the maximum after seeing all revealed bids, and with it whether anyone wins. The minimum and the estimated value sit between `+` signs and cannot be moved. Tests: "the organizer can change the maximum after the bids are revealed (digits move into the secret)", "the minimum and the estimate cannot be changed with digits in the secret".
- **`endTender` can be called again.** After the tender has ended, the owner can call it again with values that match the hash. Because of the previous point, the stored maximum can still change. Test: "endTender can be called again after the tender has ended".
- **A bid hash can be copied.** The hash is not tied to the sender. Someone can send another bidder's hash as their own. Once the real bidder reveals the value and the secret, the copycat can send the same reveal first. On equal bids the first reveal wins. Test: "a copied bid hash can be revealed by the copycat, who wins the tie by revealing first".
- **A bid below the minimum blocks the tender.** The contract takes the lowest revealed bid, and only then compares it with the minimum and the maximum. If that bid is below the minimum, there is no winner, even when another bid is inside the range. Test: "a bid below the minimum leaves the tender without winner, even if another bid is in range".
- **Equal bids: the first reveal wins.** Test: "on equal bids the bidder who reveals first wins".
- **No winner looks the same as "not ended".** All reverts have no message, so `getWinner` fails in the same way before `endTender` and when nobody won. Tests in the groups "phase 3: post-tendering" and "winner".
- **A maximum of 2^256-1 gives the zero address.** With that maximum and no revealed bid, `getWinner` returns `0x0000...0000` as the winner instead of reverting. Test: "with max = 2^256-1 and no revealed bid, getWinner returns the zero address".
- **The durations are not checked.** With 0 bidding days nobody can bid, and with 0 evaluation days nobody can reveal. Tests: "a tender with 0 bidding days never accepts a bid", "a tender with 0 evaluation days never accepts a reveal".
- **The exact second `t1` or `t2` belongs to no phase.** The time checks use strict comparisons, so at the second where the block time equals `t1` neither bids nor reveals work, and at `t2` neither reveals nor `endTender`. Tests: "at exactly t1 a bid can no longer be updated", "at exactly t1 a reveal is rejected", "at exactly t2 neither a reveal nor endTender is accepted".
- **A zero hash counts as "no bid".** `makeBid` accepts `0x00...00`, but it can never be revealed, and the bidder can bid again. Test: "makeBid with a zero hash is accepted but the bidder can never reveal it".
- **Numbers must be plain decimal text.** A hash made from `007` can never be revealed as the number 7. `create_hash.py` rejects such values. Test: "a value with leading zeros in the committed text cannot be revealed as a number".
- **The two files are not identical.** `TenderOneFile.sol` emits a `Print(bytes)` debug event with the tender text in `endTender`. `Tender.sol` does not. The suite checks that everything else is the same. Test: "only the one-file version emits Print(bytes) in endTender" (group "Tender.sol and TenderOneFile.sol").

## License

MIT, see `LICENSE`.
