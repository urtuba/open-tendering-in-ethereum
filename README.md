# Open Procedure Tendering in Ethereum
A blockchain based tendering study. Written in Solidity (0.4.0 &lt;=, >=0.6.0). Procedure is derived from open procedure in Turkish Public Procurement Law.

# Usage

## Tender.sol / TenderOneFile.sol

Contract have 3 phases:
1. Bidding phase
2. Evaluation phase
3. Post-tendering phase

Tender organizer starts tender as 'owner' of the contract. A hash value and durations for first 2 phases is required to deploy contract. (look create_hash.py) Once contract is deployed, participants are allowed to make bids. `makeBid` and `updateBid` functions are valid in this phase. In the evaluation, bidders must reveal their bids (they are previously commited as hash values, look create_hash.py). `validateBid` function is used to reveal bids in this phase. Third phase is post-tendering, which bidders can no longer take actions. Owner validates the tender using minimum using `endTender`, maximum and estimated values of the tender with pseudo-random string created before deployment. After bid is ended by `owner`, `getWinner` is now active. If the best (lowest) bid is below the maximum and above the minimum, `getWinner` returns a valid blockchain address of the participant.

For starters:
- Copy-paste TenderOneFile.sol into [Ethereum Remix](remix.ethereum.org) online IDE
- Compile using an appropriate version of compiler
- Deploy it to JS EVM or select Injected Web3 and connect Metamask wallet to deploy to a live blockchain
- (if deployed to live network) You can use Remix to interact with contract. In deployment section use deployed address to load functions in Remix.

## create_hash.py
This python script is provided as a guide to create hashes for tenders or bids. It takes necessary variable(s) then creates a pseudo-random string and a bytes32 hash value. Pseudo-random string creation procedure can be improved. It is only recommended for demo use, you can include special characters, upper cases etc.

The tender orginizer uses program with 'tender' argument:

```bash
$ python create_hash.py tender
```

The bidder uses program with 'bid' argument:
```bash
$ py create_hash.py bid
```

## Notes
* No error messages are returned, all transactions except valid ones reverts.
* Despite tests are not documented, all use cases are covered in different use-case scenarios. Ethereum Ropsten, Remix London and BSC Testnet are used in tests.
* An examplary test scenario, that is deployed in BSC Testnet, can be found at the address [0x4f..c28](https://testnet.bscscan.com/address/0x4f02b4d69ad451a040216ccd7f1022853c90dc28) results are organized in the [example-scenario.csv](https://github.com/urtuba/open-tendering-in-ethereum/blob/main/example-scenario.csv)
* For compilation, solidity version 0.5.17 is used.
* The project is created for Istanbul Technical University Computer Engineering major.

# Licence
Source code can be used for any purpose without warranty. Anyone who uses this code should mention the original copy, reveal source code and licence. For details: [GNU GPLv3](https://raw.githubusercontent.com/urtuba/open-tendering-in-ethereum/main/LICENSE). Contact to use commercially without revealing source code or licence.
