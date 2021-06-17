# open-tendering-in-ethereum
A blockchain based tendering study. Written in Solidity (0.4.0 &lt;=, >=0.6.0). Procedure is originated from Turkish Public Procurement Law.

## create_hash.py
This program is exemplary procedure for creating hashes. Production of random string and length of final string may be changed by user. Order of concatenation and hashing function (Keccak256) is unchangeable.

The tender orginizer uses program with 'tender' argument:
<br>
<code>
    $ py create_hash.py tender
</code>

The bidder uses program with 'bid' argument:
<br>
<code>
    $ py create_hash.py bid
</code>