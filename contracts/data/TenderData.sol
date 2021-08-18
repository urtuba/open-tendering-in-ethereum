//SPDX-licence-identifier = GNU 3.0
//Author = Samed Kahyaoglu
//GitHub = urtuba

pragma solidity >= 0.4.0 < 0.6.0;

import "../utils/TenderLib.sol";
import "../utils/TenderTimer.sol";

contract TenderData is TenderTimer, TenderLib {
    /* 
        The contract to match bid hashes to valid addresses.
        Keeps of which EOA started tender, who is owner.
            tenderHash is stored to verify tender is valid,
            bidHashes is stored to verify bids are valid,
    */
    address public owner;
    bytes32 public tenderHash;
    mapping (address => bytes32) public bidHashes;
    
    function _tenderIntializer (bytes32 _tenderHash) internal {
        tenderHash = _tenderHash;
        owner = msg.sender;
    }
    
    function _makeBid (bytes32 _bidHash) internal {
        _bidTimeCheck();
        bidHashes[msg.sender] = _bidHash;
    }
    
    function _isBidValid(uint _bidValue, string memory _randomStr) internal view returns (bool) {
        /* 
            If the bid exists and matches with the hash,
            the function stops in reqular way,
            otherwise function call is reverted.
        */
        require (bidHashes[msg.sender] != 0);               // bid exists
        _validationTimeCheck();                             // time is appropriate
        
        bytes memory str = abi.encodePacked(uint2str(_bidValue), _randomStr);
        require(keccak256(str) == bidHashes[msg.sender]);   // the hash matches with the bid
        
        return true;
    }
    
    function _isTenderValid(uint _min, uint _max, uint _est, string memory _randomStr) internal returns (bool) {
        require (msg.sender == owner);
        _endTimeCheck();
        
        bytes memory str = abi.encodePacked(uint2str(_est), "+", uint2str(_min), "+", uint2str(_max), _randomStr);
        require (keccak256(str) == tenderHash);
        
        return true;
    }
}