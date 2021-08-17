//SPDX-licence-identifier = GNU 3.0
//Author = Samed Kahyaoglu
//GitHub = urtuba

pragma solidity >= 0.4.0 < 0.6.0;

contract TenderLib {
    /* 
        uint have to be converted to string for concatenation
    */
    function uint2str(uint _number) internal pure returns (string memory _str) {
        if (_number == 0) { return "0"; }
        
        uint j = _number;
        uint len;
        
        while (j != 0) {
            len++;
            j /= 10;
        }
        
        bytes memory bstr = new bytes(len);
        uint k = len - 1;
        while (_number != 0) {
            bstr[k--] = byte(uint8(48 + _number % 10));
            _number /= 10;
        }
        return string(bstr);
    }
}
