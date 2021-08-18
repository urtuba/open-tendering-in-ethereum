//SPDX-licence-identifier = GNU 3.0
//Author = Samed Kahyaoglu
//GitHub = urtuba

pragma solidity >= 0.4.0 < 0.6.0;

import "./data/TenderData.sol";

contract Tender is TenderData {
    /* 
        Tender is actual contract to interact with.
        It delegates controls, functions and storing hashes to
        other contracts. It is responsible to determine the winner.
    */
    bool public finished = false;
    
    uint public estimated;
    uint public minimum;
    uint public maximum;
    
    mapping (address => uint) public bids;
    uint bestBid = 2**256 - 1;
    address winner;
    
    event NewBid(address bidder, bytes32 hash);
    event BidUpdate(address bidder, bytes32 hash);
    event BidValidation(address bidder, uint amount);
    event TenderEnded(uint min, uint max, uint est);
    
    constructor (bytes32 _tenderHash, uint _openDays, uint _validationDays) public {
        _tenderIntializer(_tenderHash);
        _timerInitializer(_openDays, _validationDays);
    }
    
    function makeBid (bytes32 _bidHash) public {
        require (msg.sender != owner);
        require (bidHashes[msg.sender] == 0);
        _makeBid(_bidHash);
        emit NewBid(msg.sender, _bidHash);
    }
    
    function updateBid (bytes32 _bidHash) public {
        require(bidHashes[msg.sender] != 0);
        _makeBid(_bidHash);
        emit BidUpdate(msg.sender, _bidHash);
    }
    
    function validateBid (uint _bidValue, string memory _randomStr) public returns (bool) {
        /* 
            Returns True if the bid is revealed without any error.
            Otherwise transaction is reverted.
        */
        _isBidValid(_bidValue, _randomStr);
        
        bids[msg.sender] = _bidValue;
        
        if(_bidValue < bestBid) {
            bestBid = _bidValue;
            winner = msg.sender;
        }
        
        emit BidValidation(msg.sender, _bidValue);
        return true;
    }
    
    function endTender (uint _min, uint _max, uint _est, string memory _randomStr) public returns (bool) {
        _isTenderValid(_min, _max, _est, _randomStr);
        
        finished    = true;
        minimum     = _min;
        maximum     = _max;
        estimated   = _est;
        
        emit TenderEnded(_min, _max, _est);
        return true;
    }
    
    function getWinner () public view returns (address) {
        require (finished);
        require ((bestBid <= maximum) && (bestBid >= minimum));
        return winner;
    }
}