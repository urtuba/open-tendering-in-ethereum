import { keccak256, toUtf8Bytes } from "ethers";

export const DAY = 86400;

// The two contract files that must behave the same.
export const VARIANTS = [
  { name: "Tender.sol (modular)", fqn: "contracts/Tender.sol:Tender" },
  { name: "TenderOneFile.sol (Remix file)", fqn: "contracts/TenderOneFile.sol:Tender" },
];

// Hash of a bid, as the contract checks it: keccak256(<value as decimal text> + <secret>).
// This is what create_hash.py computes for a bidder.
export function bidHash(value, secret) {
  return keccak256(toUtf8Bytes(`${value}${secret}`));
}

// Hash of a tender, as the contract checks it:
// keccak256(<est> + "+" + <min> + "+" + <max> + <secret>).
// This is what create_hash.py computes for the organizer.
export function tenderHash(est, min, max, secret) {
  return keccak256(toUtf8Bytes(`${est}+${min}+${max}${secret}`));
}

// The tender used by most tests.
export const TENDER = { est: 1000n, min: 500n, max: 1500n, secret: "tender-secret-0001" };
export const TENDER_HASH = tenderHash(TENDER.est, TENDER.min, TENDER.max, TENDER.secret);
