# author: Samed Kahyaoglu
# github: urtuba

from web3 import Web3
from random import choice
from string import digits, ascii_lowercase
from sys import argv

BID_SECURITY = 32
TENDER_SECURITY = 64

# function for bidders to create application hash for tenders
def create_bid_hash():
    print('Value of the bid: ', end="")
    bid = input()
    
    # create random string to concantenate
    randStrLen = BID_SECURITY - len(bid)
    randStr = ''.join(choice(digits+ascii_lowercase) for _ in range(randStrLen))

    # create Keccak256 hash value for bid verification
    bidStr = bid + randStr
    bidHash = Web3.toHex(Web3.solidityKeccak(['string'], [bidStr]))

    # print out the keys for bidder
    print("\nKEEP THESE SAFE")
    print('{:13s}'.format("BID:           ") + bid)
    print('{:13s}'.format("RANDOM STRING: ") + randStr)
    print("\nAPROACH TENDER USING")
    print('{:13s}'.format("HASH:          ") + bidHash)

# function for officials to create verification hash for tenders
def create_tender_hash():
    print('{:15s}'.format("Estimated value")+' : ', end="")
    est = input()
    print('{:15s}'.format("Minimum value")+' : ', end="")
    min = input()
    print('{:15s}'.format("Maximum value")+' : ', end="")
    max = input()

    # create random string
    randStrLen = TENDER_SECURITY - len(est+min+max)
    randStr = ''.join(choice(digits+ascii_lowercase) for _ in range(randStrLen))

    # create Keccak256 hash value for tender verification
    tenderStr = est + '+' + min + '+' + max + randStr
    tenderHash = Web3.toHex(Web3.solidityKeccak(['string'], [tenderStr]))

    #print out the information of tender
    print("\nKEEP THESE SAFE")
    print('{:15s}'.format("ESTIMATED:") + est)
    print('{:15s}'.format("MINIMUM:") + min)
    print('{:15s}'.format("MINIMUM:") + max)
    print('{:15s}'.format("RANDOM STRING:") + randStr)
    print("\nCREATE TENDER USING")
    print('{:15s}'.format("HASH:") + tenderHash)

# command line arguments to call functions
def main(arg):
    if(arg=='tender'):
        create_tender_hash()
    elif(arg=='bid'):
        create_bid_hash()
    else:
        return

# if code is executed using origin file
if __name__ == "__main__" and argv[1]:
    main(argv[1])
