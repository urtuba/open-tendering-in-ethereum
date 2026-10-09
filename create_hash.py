# author: Samed Kahyaoglu
# github: urtuba
#
# Creates the hashes that the Tender contract checks.
#   bid hash    = keccak256(<bid> + <random string>)
#   tender hash = keccak256(<estimated> + "+" + <minimum> + "+" + <maximum> + <random string>)
# Numbers are written as plain decimal text, the way the contract's uint2str writes them.

from secrets import choice
from string import digits, ascii_lowercase
from sys import argv, stderr, exit

from web3 import Web3

BID_SECURITY = 32       # length of bid + random string
TENDER_SECURITY = 64    # length of estimated + minimum + maximum + random string
MIN_RANDOM = 16         # the random string is never shorter than this
ALPHABET = digits + ascii_lowercase
UINT_MAX = 2**256 - 1

USAGE = """usage:
  python create_hash.py bid [BID]
  python create_hash.py tender [ESTIMATED MINIMUM MAXIMUM]

Values that are not given on the command line are asked for."""


# Pseudo-random string for the commit-reveal secret. The secrets module is meant for secrets.
def random_string(length):
    return ''.join(choice(ALPHABET) for _ in range(length))


# The contract writes a number as decimal text without leading zeros ("0" for zero),
# so a number that is typed differently would never match its hash.
def check_number(text, name):
    if not (text.isascii() and text.isdigit()) or (len(text) > 1 and text[0] == '0') or int(text) > UINT_MAX:
        raise ValueError(f"{name} must be a whole number without sign, spaces or leading zeros, "
                         f"at most 2**256-1: {text!r}")
    return text


# Keccak256 hash of a text, as 0x-prefixed hex (same as keccak256 of the string in Solidity)
def keccak_hex(text):
    return Web3.to_hex(Web3.solidity_keccak(['string'], [text]))


def bid_hash(bid, rand_str):
    return keccak_hex(check_number(bid, 'bid') + rand_str)


def tender_hash(est, minimum, maximum, rand_str):
    return keccak_hex(check_number(est, 'estimated value') + '+' + check_number(minimum, 'minimum value')
                      + '+' + check_number(maximum, 'maximum value') + rand_str)


# function for bidders to create application hash for tenders
def create_bid_hash(bid=None):
    if bid is None:
        print('Value of the bid: ', end="")
        bid = input()
    check_number(bid, 'bid')

    # create random string to concatenate
    randStr = random_string(max(BID_SECURITY - len(bid), MIN_RANDOM))

    # create Keccak256 hash value for bid verification
    bidHash = bid_hash(bid, randStr)

    # print out the keys for bidder
    print("\nKEEP THESE SAFE")
    print('{:15s}'.format("BID:") + bid)
    print('{:15s}'.format("RANDOM STRING:") + randStr)
    print("\nAPPROACH TENDER USING")
    print('{:15s}'.format("HASH:") + bidHash)


# function for officials to create verification hash for tenders
def create_tender_hash(est=None, minimum=None, maximum=None):
    if est is None:
        print('{:15s}'.format("Estimated value")+' : ', end="")
        est = input()
        print('{:15s}'.format("Minimum value")+' : ', end="")
        minimum = input()
        print('{:15s}'.format("Maximum value")+' : ', end="")
        maximum = input()
    check_number(est, 'estimated value')
    check_number(minimum, 'minimum value')
    check_number(maximum, 'maximum value')

    # create random string
    randStr = random_string(max(TENDER_SECURITY - len(est + minimum + maximum), MIN_RANDOM))

    # create Keccak256 hash value for tender verification
    tenderHash = tender_hash(est, minimum, maximum, randStr)

    #print out the information of tender
    print("\nKEEP THESE SAFE")
    print('{:15s}'.format("ESTIMATED:") + est)
    print('{:15s}'.format("MINIMUM:") + minimum)
    print('{:15s}'.format("MAXIMUM:") + maximum)
    print('{:15s}'.format("RANDOM STRING:") + randStr)
    print("\nCREATE TENDER USING")
    print('{:15s}'.format("HASH:") + tenderHash)


# command line arguments to call functions
def main(args):
    try:
        if len(args) >= 1 and args[0] == 'tender' and len(args) in (1, 4):
            create_tender_hash(*args[1:])
        elif len(args) >= 1 and args[0] == 'bid' and len(args) in (1, 2):
            create_bid_hash(*args[1:])
        else:
            print(USAGE, file=stderr)
            return 2
    except ValueError as error:
        print('error: ' + str(error), file=stderr)
        return 1
    return 0


# if code is executed using origin file
if __name__ == "__main__":
    exit(main(argv[1:]))
