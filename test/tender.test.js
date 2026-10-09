// Tests for the 2021 contracts, exactly as they were written.
// The same suite runs against contracts/Tender.sol (modular) and
// contracts/TenderOneFile.sol (the Remix file), so the two stay equal.
//
// Tests marked "2021 behaviour:" show what the contract does today, even where
// that looks wrong. They are listed under "Known limitations" in the README.
// The contract logic is never changed to make them pass.

import { readFileSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";
import { DAY, VARIANTS, TENDER, TENDER_HASH, bidHash, tenderHash } from "./helpers.js";

const { ethers, provider } = await network.getOrCreate();
const [owner, alice, bob, carol, mallory] = await ethers.getSigners();

const MAX_UINT = 2n ** 256n - 1n;

// Hashes made with create_hash.py (checked on the Python side by test/test_create_hash.py).
const vectors = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));

// Move the chain to the given time (seconds) and mine a block there.
async function timeTo(ts) {
  await provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
  await provider.send("evm_mine", []);
}

// The next transaction is mined in a block with exactly this timestamp.
async function nextBlockAt(ts) {
  await provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
}

// Time travel with evm_increaseTime, then mine a block.
async function increaseTime(seconds) {
  await provider.send("evm_increaseTime", [Number(seconds)]);
  await provider.send("evm_mine", []);
}

for (const variant of VARIANTS) {
  describe(variant.name, function () {
    let factory;

    before(async function () {
      factory = await ethers.getContractFactory(variant.fqn);
    });

    async function deploy({ openDays = 2, validationDays = 2, hash = TENDER_HASH, from = owner } = {}) {
      const contract = await factory.connect(from).deploy(hash, openDays, validationDays);
      await contract.waitForDeployment();
      return contract;
    }

    const toEvaluation = async (c) => timeTo((await c.t1()) + 1n);
    const toPostTendering = async (c) => timeTo((await c.t2()) + 1n);

    // Run a whole tender: bidding, evaluation (reveal) and end.
    // Each bid is { signer, value, secret, reveal = true }.
    async function runTender(bids, { tender = TENDER } = {}) {
      const c = await deploy({ hash: tenderHash(tender.est, tender.min, tender.max, tender.secret) });
      for (const b of bids) {
        await c.connect(b.signer).makeBid(bidHash(b.value, b.secret));
      }
      await toEvaluation(c);
      for (const b of bids) {
        if (b.reveal !== false) await c.connect(b.signer).validateBid(b.value, b.secret);
      }
      await toPostTendering(c);
      await c.connect(owner).endTender(tender.min, tender.max, tender.est, tender.secret);
      return c;
    }

    describe("deployment", function () {
      it("stores the owner, the tender hash and the phase times", async function () {
        const c = await deploy({ openDays: 3, validationDays: 4 });
        const block = await ethers.provider.getBlock((await c.deploymentTransaction().wait()).blockNumber);
        expect(await c.owner()).to.equal(owner.address);
        expect(await c.tenderHash()).to.equal(TENDER_HASH);
        expect(await c.t1()).to.equal(BigInt(block.timestamp) + 3n * BigInt(DAY));
        expect(await c.t2()).to.equal(BigInt(block.timestamp) + 7n * BigInt(DAY));
      });

      it("starts unfinished, without tender values", async function () {
        const c = await deploy();
        expect(await c.finished()).to.equal(false);
        expect(await c.estimated()).to.equal(0n);
        expect(await c.minimum()).to.equal(0n);
        expect(await c.maximum()).to.equal(0n);
      });

      it("takes the deployer as owner", async function () {
        const c = await deploy({ from: alice });
        expect(await c.owner()).to.equal(alice.address);
      });
    });

    describe("phase 1: bidding", function () {
      it("makeBid stores the hash and emits NewBid", async function () {
        const c = await deploy();
        const h = bidHash(900, "alice-secret");
        await expect(c.connect(alice).makeBid(h)).to.emit(c, "NewBid").withArgs(alice.address, h);
        expect(await c.bidHashes(alice.address)).to.equal(h);
      });

      it("the owner cannot bid", async function () {
        const c = await deploy();
        await expect(c.connect(owner).makeBid(bidHash(900, "x"))).to.be.revertedWithoutReason(ethers);
      });

      it("makeBid twice from one address reverts; updateBid is the way to change it", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "one"));
        await expect(c.connect(alice).makeBid(bidHash(800, "two"))).to.be.revertedWithoutReason(ethers);
        expect(await c.bidHashes(alice.address)).to.equal(bidHash(900, "one"));
      });

      it("updateBid replaces the hash and emits BidUpdate", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "one"));
        const h2 = bidHash(800, "two");
        await expect(c.connect(alice).updateBid(h2)).to.emit(c, "BidUpdate").withArgs(alice.address, h2);
        expect(await c.bidHashes(alice.address)).to.equal(h2);
      });

      it("updateBid without an earlier makeBid reverts", async function () {
        const c = await deploy();
        await expect(c.connect(alice).updateBid(bidHash(800, "two"))).to.be.revertedWithoutReason(ethers);
      });

      it("the owner cannot get a bid in through updateBid either", async function () {
        const c = await deploy();
        await expect(c.connect(owner).updateBid(bidHash(800, "two"))).to.be.revertedWithoutReason(ethers);
      });

      it("the updated hash is the one that is checked on reveal", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "one"));
        await c.connect(alice).updateBid(bidHash(800, "two"));
        await toEvaluation(c);
        await expect(c.connect(alice).validateBid(900, "one")).to.be.revertedWithoutReason(ethers);
        await c.connect(alice).validateBid(800, "two");
        expect(await c.bids(alice.address)).to.equal(800n);
      });

      it("two bidders each keep their own hash", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await c.connect(bob).makeBid(bidHash(700, "b"));
        expect(await c.bidHashes(alice.address)).to.equal(bidHash(900, "a"));
        expect(await c.bidHashes(bob.address)).to.equal(bidHash(700, "b"));
      });

      it("validateBid is not allowed in the bidding phase", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await expect(c.connect(alice).validateBid(900, "a")).to.be.revertedWithoutReason(ethers);
      });

      it("endTender is not allowed in the bidding phase, even for the owner with the right secret", async function () {
        const c = await deploy();
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
      });

      it("getWinner is not allowed before the tender has ended", async function () {
        const c = await deploy();
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      it("makeBid and updateBid revert after the bidding phase (time travel with evm_increaseTime)", async function () {
        const c = await deploy({ openDays: 2 });
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await increaseTime(2 * DAY + 10);
        await expect(c.connect(bob).makeBid(bidHash(700, "b"))).to.be.revertedWithoutReason(ethers);
        await expect(c.connect(alice).updateBid(bidHash(800, "a2"))).to.be.revertedWithoutReason(ethers);
        expect(await c.bidHashes(bob.address)).to.equal(ethers.ZeroHash);
        expect(await c.bidHashes(alice.address)).to.equal(bidHash(900, "a"));
      });

      it("the last second of the bidding phase still accepts bids", async function () {
        const c = await deploy();
        const t1 = await c.t1();
        await nextBlockAt(t1 - 1n);
        await c.connect(alice).makeBid(bidHash(900, "a"));
        expect(await c.bidHashes(alice.address)).to.equal(bidHash(900, "a"));
      });
    });

    describe("phase 2: evaluation (reveal)", function () {
      async function withBids() {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "alice-secret"));
        await c.connect(bob).makeBid(bidHash(700, "bob-secret"));
        await toEvaluation(c);
        return c;
      }

      it("validateBid with the right value and secret stores the bid, emits BidValidation and returns true", async function () {
        const c = await withBids();
        expect(await c.connect(alice).validateBid.staticCall(900, "alice-secret")).to.equal(true);
        await expect(c.connect(alice).validateBid(900, "alice-secret"))
          .to.emit(c, "BidValidation")
          .withArgs(alice.address, 900n);
        expect(await c.bids(alice.address)).to.equal(900n);
      });

      it("a wrong secret reverts", async function () {
        const c = await withBids();
        await expect(c.connect(alice).validateBid(900, "wrong")).to.be.revertedWithoutReason(ethers);
        expect(await c.bids(alice.address)).to.equal(0n);
      });

      it("a wrong value reverts", async function () {
        const c = await withBids();
        await expect(c.connect(alice).validateBid(901, "alice-secret")).to.be.revertedWithoutReason(ethers);
      });

      it("someone else's value and secret do not work for you", async function () {
        const c = await withBids();
        await expect(c.connect(alice).validateBid(700, "bob-secret")).to.be.revertedWithoutReason(ethers);
      });

      it("an address that never bid cannot reveal", async function () {
        const c = await withBids();
        await expect(c.connect(carol).validateBid(900, "alice-secret")).to.be.revertedWithoutReason(ethers);
      });

      it("makeBid and updateBid revert in the evaluation phase", async function () {
        const c = await withBids();
        await expect(c.connect(carol).makeBid(bidHash(1, "c"))).to.be.revertedWithoutReason(ethers);
        await expect(c.connect(alice).updateBid(bidHash(1, "c"))).to.be.revertedWithoutReason(ethers);
      });

      it("endTender reverts in the evaluation phase", async function () {
        const c = await withBids();
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
      });

      it("getWinner reverts in the evaluation phase", async function () {
        const c = await withBids();
        await c.connect(bob).validateBid(700, "bob-secret");
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      it("a bid of 0 is a valid bid (uint2str handles zero)", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(0, "zero-secret"));
        await toEvaluation(c);
        await c.connect(alice).validateBid(0, "zero-secret");
        expect(await c.bids(alice.address)).to.equal(0n);
      });

      it("a very large bid is a valid bid (uint2str handles 78 digits)", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(MAX_UINT, "big-secret"));
        await toEvaluation(c);
        await c.connect(alice).validateBid(MAX_UINT, "big-secret");
        expect(await c.bids(alice.address)).to.equal(MAX_UINT);
      });

      it("validateBid reverts once the evaluation phase is over", async function () {
        const c = await deploy({ validationDays: 2 });
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await toPostTendering(c);
        await expect(c.connect(alice).validateBid(900, "a")).to.be.revertedWithoutReason(ethers);
      });

      it("the last second of the evaluation phase still accepts reveals", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "a"));
        const t2 = await c.t2();
        await timeTo((await c.t1()) + 1n);
        await nextBlockAt(t2 - 1n);
        await c.connect(alice).validateBid(900, "a");
        expect(await c.bids(alice.address)).to.equal(900n);
      });

      it("revealing the same bid twice is accepted and changes nothing", async function () {
        const c = await withBids();
        await c.connect(alice).validateBid(900, "alice-secret");
        await c.connect(alice).validateBid(900, "alice-secret");
        expect(await c.bids(alice.address)).to.equal(900n);
      });
    });

    describe("phase 3: post-tendering", function () {
      async function afterEvaluation() {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "alice-secret"));
        await toEvaluation(c);
        await c.connect(alice).validateBid(900, "alice-secret");
        await toPostTendering(c);
        return c;
      }

      it("the owner ends the tender with the right values and secret", async function () {
        const c = await afterEvaluation();
        expect(await c.connect(owner).endTender.staticCall(TENDER.min, TENDER.max, TENDER.est, TENDER.secret)).to.equal(
          true,
        );
        await expect(c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret))
          .to.emit(c, "TenderEnded")
          .withArgs(TENDER.min, TENDER.max, TENDER.est);
        expect(await c.finished()).to.equal(true);
        expect(await c.minimum()).to.equal(TENDER.min);
        expect(await c.maximum()).to.equal(TENDER.max);
        expect(await c.estimated()).to.equal(TENDER.est);
      });

      it("only the owner can end the tender, even with the right secret", async function () {
        const c = await afterEvaluation();
        await expect(
          c.connect(alice).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
        expect(await c.finished()).to.equal(false);
      });

      it("a wrong tender secret reverts", async function () {
        const c = await afterEvaluation();
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, "wrong-secret"),
        ).to.be.revertedWithoutReason(ethers);
        expect(await c.finished()).to.equal(false);
      });

      it("wrong values revert, also when only the order is mixed up", async function () {
        const c = await afterEvaluation();
        // endTender takes (min, max, est); the hash is built as est+min+max.
        await expect(
          c.connect(owner).endTender(TENDER.max, TENDER.min, TENDER.est, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est + 1n, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.est, TENDER.max, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
      });

      it("the tender hash is keccak256(est + '+' + min + '+' + max + secret)", async function () {
        const c = await deploy();
        expect(await c.tenderHash()).to.equal(
          ethers.keccak256(ethers.toUtf8Bytes(`1000+500+1500${TENDER.secret}`)),
        );
      });

      it("makeBid, updateBid and validateBid revert in the post-tendering phase", async function () {
        const c = await afterEvaluation();
        await expect(c.connect(bob).makeBid(bidHash(1, "b"))).to.be.revertedWithoutReason(ethers);
        await expect(c.connect(alice).updateBid(bidHash(1, "b"))).to.be.revertedWithoutReason(ethers);
        await expect(c.connect(alice).validateBid(900, "alice-secret")).to.be.revertedWithoutReason(ethers);
      });

      it("getWinner reverts until the owner has ended the tender", async function () {
        const c = await afterEvaluation();
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
        await c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret);
        expect(await c.getWinner()).to.equal(alice.address);
      });

      it("endTender still reverts one second before the evaluation phase is over", async function () {
        const c = await deploy();
        await timeTo((await c.t2()) - 5n);
        await nextBlockAt((await c.t2()) - 1n);
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
      });
    });

    describe("winner", function () {
      it("the lowest valid bid within min and max wins", async function () {
        const c = await runTender([
          { signer: alice, value: 900, secret: "a" },
          { signer: bob, value: 700, secret: "b" },
          { signer: carol, value: 800, secret: "c" },
        ]);
        expect(await c.getWinner()).to.equal(bob.address);
      });

      it("the winner does not depend on the order of the reveals", async function () {
        const bids = [
          { signer: alice, value: 900, secret: "a" },
          { signer: bob, value: 700, secret: "b" },
          { signer: carol, value: 800, secret: "c" },
        ];
        const c = await runTender([...bids].reverse());
        expect(await c.getWinner()).to.equal(bob.address);
      });

      it("a bid equal to the minimum or to the maximum is within the range", async function () {
        const atMin = await runTender([{ signer: alice, value: 500, secret: "a" }]);
        expect(await atMin.getWinner()).to.equal(alice.address);
        const atMax = await runTender([{ signer: alice, value: 1500, secret: "a" }]);
        expect(await atMax.getWinner()).to.equal(alice.address);
      });

      it("a bid that was never revealed cannot win", async function () {
        const c = await runTender([
          { signer: alice, value: 900, secret: "a" },
          { signer: bob, value: 600, secret: "b", reveal: false },
        ]);
        expect(await c.getWinner()).to.equal(alice.address);
        expect(await c.bids(bob.address)).to.equal(0n);
      });

      it("there is no winner when all bids are above the maximum (getWinner reverts)", async function () {
        const c = await runTender([
          { signer: alice, value: 1501, secret: "a" },
          { signer: bob, value: 2000, secret: "b" },
        ]);
        expect(await c.finished()).to.equal(true);
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      it("there is no winner when all bids are below the minimum (getWinner reverts)", async function () {
        const c = await runTender([
          { signer: alice, value: 100, secret: "a" },
          { signer: bob, value: 499, secret: "b" },
        ]);
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      it("there is no winner when nobody revealed a bid", async function () {
        const c = await runTender([{ signer: alice, value: 900, secret: "a", reveal: false }]);
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      it("there is no winner when nobody bid", async function () {
        const c = await runTender([]);
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      it("anyone can read the winner once the tender has ended", async function () {
        const c = await runTender([{ signer: alice, value: 900, secret: "a" }]);
        expect(await c.connect(mallory).getWinner()).to.equal(alice.address);
      });
    });

    describe("hashes from create_hash.py", function () {
      const bid = vectors.bid;
      const tender = vectors.tender;

      it("the JavaScript hash functions give the same hashes as the Python helper", function () {
        expect(bidHash(bid.value, bid.secret)).to.equal(bid.hash);
        expect(tenderHash(tender.estimated, tender.minimum, tender.maximum, tender.secret)).to.equal(tender.hash);
      });

      it("validateBid accepts a bid hash made by the helper", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bid.hash);
        await toEvaluation(c);
        await c.connect(alice).validateBid(BigInt(bid.value), bid.secret);
        expect(await c.bids(alice.address)).to.equal(BigInt(bid.value));
        await expect(c.connect(alice).validateBid(BigInt(bid.value) + 1n, bid.secret)).to.be.revertedWithoutReason(ethers);
      });

      it("endTender accepts a tender hash made by the helper", async function () {
        const c = await deploy({ hash: tender.hash });
        await toPostTendering(c);
        const args = [BigInt(tender.minimum), BigInt(tender.maximum), BigInt(tender.estimated)];
        await expect(c.connect(owner).endTender(...args, "wrong-secret")).to.be.revertedWithoutReason(ethers);
        await c.connect(owner).endTender(...args, tender.secret);
        expect(await c.finished()).to.equal(true);
        expect(await c.minimum()).to.equal(BigInt(tender.minimum));
        expect(await c.maximum()).to.equal(BigInt(tender.maximum));
        expect(await c.estimated()).to.equal(BigInt(tender.estimated));
      });

      it("a whole tender with helper hashes ends with a winner", async function () {
        const c = await deploy({ hash: tender.hash });
        await c.connect(alice).makeBid(bid.hash);
        await toEvaluation(c);
        await c.connect(alice).validateBid(BigInt(bid.value), bid.secret);
        await toPostTendering(c);
        await c.connect(owner).endTender(BigInt(tender.minimum), BigInt(tender.maximum), BigInt(tender.estimated), tender.secret);
        expect(await c.getWinner()).to.equal(alice.address);
      });
    });

    describe("2021 behaviour: known limitations", function () {
      // 2021 behaviour: the lowest revealed bid decides, then it is compared to min and max.
      // A bid below the minimum blocks a higher bid that is inside the range.
      it("a bid below the minimum leaves the tender without winner, even if another bid is in range", async function () {
        const c = await runTender([
          { signer: alice, value: 100, secret: "a" }, // below the minimum of 500
          { signer: bob, value: 800, secret: "b" }, // inside [500, 1500]
        ]);
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      // 2021 behaviour: the comparison is strict (<), so on a tie the first reveal wins.
      it("on equal bids the bidder who reveals first wins", async function () {
        const first = await runTender([
          { signer: alice, value: 800, secret: "a" },
          { signer: bob, value: 800, secret: "b" },
        ]);
        expect(await first.getWinner()).to.equal(alice.address);
        const reversed = await runTender([
          { signer: bob, value: 800, secret: "b" },
          { signer: alice, value: 800, secret: "a" },
        ]);
        expect(await reversed.getWinner()).to.equal(bob.address);
      });

      // 2021 behaviour: the bid hash is keccak256(value + secret) with no separator, so the
      // bidder can move digits between the value and the secret after bidding.
      it("a bidder can reveal a lower value than the one committed (digits move into the secret)", async function () {
        const c = await deploy();
        // Committed: value 500, secret "00abc"  ->  text "50000abc"
        await c.connect(alice).makeBid(bidHash(500, "00abc"));
        await toEvaluation(c);
        // Revealed: value 5, secret "0000abc"   ->  the same text "50000abc"
        await c.connect(alice).validateBid(5, "0000abc");
        expect(await c.bids(alice.address)).to.equal(5n);
        // The same commitment also opens to a higher value.
        await c.connect(alice).validateBid(50000, "abc");
        expect(await c.bids(alice.address)).to.equal(50000n);
      });

      // 2021 behaviour: the same problem for the tender hash. The maximum is the last number
      // before the secret, so the organizer can change it after seeing the bids.
      it("the organizer can change the maximum after the bids are revealed (digits move into the secret)", async function () {
        // Committed: max 1500 and secret "0xyz"  ->  text "1000+500+15000xyz"
        const secret = "0xyz";
        const c = await runTender([{ signer: alice, value: 9000, secret: "a" }], {
          tender: { est: 1000n, min: 500n, max: 1500n, secret },
        });
        // The bid of 9000 is above the maximum of 1500: no winner.
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
        // The organizer ends the tender again with max 15000 and secret "xyz": the same text.
        await c.connect(owner).endTender(500, 15000, 1000, "xyz");
        expect(await c.maximum()).to.equal(15000n);
        expect(await c.getWinner()).to.equal(alice.address);
      });

      // 2021 behaviour: the minimum and the estimate sit between "+" signs, so they cannot be moved this way.
      it("the minimum and the estimate cannot be changed with digits in the secret", async function () {
        const c = await runTender([], { tender: { est: 1000n, min: 500n, max: 1500n, secret: "0xyz" } });
        await expect(c.connect(owner).endTender(5000, 1500, 1000, "xyz")).to.be.revertedWithoutReason(ethers);
        await expect(c.connect(owner).endTender(500, 1500, 10000, "xyz")).to.be.revertedWithoutReason(ethers);
      });

      // 2021 behaviour: the hash is not tied to the bidder's address. A copycat can send
      // someone else's hash and reveal it with the same value and secret, once it is public.
      it("a copied bid hash can be revealed by the copycat, who wins the tie by revealing first", async function () {
        const c = await deploy();
        const h = bidHash(700, "alice-secret");
        await c.connect(alice).makeBid(h);
        await c.connect(mallory).makeBid(h); // copies the hash, does not know the secret yet
        await toEvaluation(c);
        // The copycat sees alice's reveal transaction in the mempool and sends it first.
        await c.connect(mallory).validateBid(700, "alice-secret");
        await c.connect(alice).validateBid(700, "alice-secret");
        await toPostTendering(c);
        await c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret);
        expect(await c.getWinner()).to.equal(mallory.address);
      });

      // 2021 behaviour: the owner can call endTender again. The values must match the hash, so
      // nothing changes, but "finished" is not a one-way switch with a guard.
      it("endTender can be called again after the tender has ended", async function () {
        const c = await runTender([{ signer: alice, value: 900, secret: "a" }]);
        await c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret);
        expect(await c.getWinner()).to.equal(alice.address);
      });

      // 2021 behaviour: with the maximum at the largest uint and no bid, getWinner does not
      // revert and returns the zero address as "winner".
      it("with max = 2^256-1 and no revealed bid, getWinner returns the zero address", async function () {
        const c = await runTender([], { tender: { est: 1000n, min: 0n, max: MAX_UINT, secret: "s" } });
        expect(await c.getWinner()).to.equal(ethers.ZeroAddress);
      });

      // 2021 behaviour: no check on the durations. With 0 days the bidding phase is empty.
      it("a tender with 0 bidding days never accepts a bid", async function () {
        const c = await deploy({ openDays: 0, validationDays: 2 });
        await expect(c.connect(alice).makeBid(bidHash(900, "a"))).to.be.revertedWithoutReason(ethers);
      });

      // 2021 behaviour: with 0 evaluation days nobody can reveal, so no tender can have a winner.
      it("a tender with 0 evaluation days never accepts a reveal", async function () {
        const c = await deploy({ openDays: 1, validationDays: 0 });
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await timeTo((await c.t1()) + 1n);
        await expect(c.connect(alice).validateBid(900, "a")).to.be.revertedWithoutReason(ethers);
        await increaseTime(10);
        await c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret);
        await expect(c.getWinner()).to.be.revertedWithoutReason(ethers);
      });

      // 2021 behaviour: the phase checks use strict < and >. In the second where block.timestamp
      // equals t1 or t2, no phase is open.
      it("at exactly t1 a bid can no longer be updated", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await nextBlockAt(await c.t1());
        await expect(c.connect(alice).updateBid(bidHash(901, "a"))).to.be.revertedWithoutReason(ethers);
      });

      it("at exactly t1 a reveal is rejected", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await nextBlockAt(await c.t1());
        await expect(c.connect(alice).validateBid(900, "a")).to.be.revertedWithoutReason(ethers);
      });

      it("at exactly t2 neither a reveal nor endTender is accepted", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash(900, "a"));
        await timeTo((await c.t1()) + 1n);
        const t2 = await c.t2();
        await nextBlockAt(t2);
        await expect(c.connect(alice).validateBid(900, "a")).to.be.revertedWithoutReason(ethers);
        await nextBlockAt(t2);
        await expect(
          c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret),
        ).to.be.revertedWithoutReason(ethers);
      });

      // 2021 behaviour: a zero hash is accepted by makeBid but means "no bid", so it can be
      // replaced by makeBid again and can never be revealed.
      it("makeBid with a zero hash is accepted but the bidder can never reveal it", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(ethers.ZeroHash);
        await c.connect(alice).makeBid(bidHash(900, "a")); // allowed again: the zero hash counts as "no bid"
        await toEvaluation(c);
        await c.connect(alice).validateBid(900, "a");
        expect(await c.bids(alice.address)).to.equal(900n);
      });

      // 2021 behaviour: values are turned into text without leading zeros, so "007" can never match.
      it("a value with leading zeros in the committed text cannot be revealed as a number", async function () {
        const c = await deploy();
        await c.connect(alice).makeBid(bidHash("007", "a"));
        await toEvaluation(c);
        await expect(c.connect(alice).validateBid(7, "a")).to.be.revertedWithoutReason(ethers);
      });
    });
  });
}

describe("Tender.sol and TenderOneFile.sol", function () {
  it("have the same functions and the same events, except the Print event of the one-file version", async function () {
    const modular = await ethers.getContractFactory(VARIANTS[0].fqn);
    const oneFile = await ethers.getContractFactory(VARIANTS[1].fqn);
    const describeAbi = (factory) =>
      factory.interface.fragments
        .filter((f) => f.type !== "event" || f.name !== "Print")
        .map((f) => f.format("full"))
        .sort();
    expect(describeAbi(oneFile)).to.deep.equal(describeAbi(modular));
  });

  // 2021 behaviour: the one-file version emits a Print event with the revealed tender text
  // in endTender (a debugging leftover). The modular version does not.
  it("only the one-file version emits Print(bytes) in endTender", async function () {
    for (const [i, variant] of VARIANTS.entries()) {
      const factory = await ethers.getContractFactory(variant.fqn);
      const c = await factory.connect(owner).deploy(TENDER_HASH, 1, 1);
      await c.waitForDeployment();
      await timeTo((await c.t2()) + 1n);
      const receipt = await (
        await c.connect(owner).endTender(TENDER.min, TENDER.max, TENDER.est, TENDER.secret)
      ).wait();
      const hasPrint = c.interface.getEvent("Print") !== null;
      expect(hasPrint).to.equal(i === 1);
      if (i === 1) {
        const text = `${TENDER.est}+${TENDER.min}+${TENDER.max}${TENDER.secret}`;
        const logs = receipt.logs.map((l) => c.interface.parseLog(l)).filter((l) => l && l.name === "Print");
        expect(logs).to.have.length(1);
        expect(ethers.toUtf8String(logs[0].args[0])).to.equal(text);
      }
    }
  });
});
