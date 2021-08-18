//SPDX-licence-identifier = GNU 3.0
//Author = Samed Kahyaoglu
//GitHub = urtuba

pragma solidity >= 0.4.0 < 0.6.0;

contract TenderTimer {
    uint public t1;    // when tender ends, bid verification starts
    uint public t2;    // when verification ends
    
    function _timerInitializer (uint _period1, uint _period2) internal {
        /*
            _period1: period of accepting bids in days
            _period2: period of verifiying bids in days
        */
        uint secondsInDay = 86400;
        t1 = now + _period1 * secondsInDay;
        t2 = t1  + _period2 * secondsInDay;
    }
    
    function _bidTimeCheck () internal view returns (bool) {
        require (now < t1);
        return true;
    }
    
    function _validationTimeCheck () internal view returns (bool) {
        require ((t1 < now) && (now < t2));
        return true;
    }
    
    function _endTimeCheck () internal view returns (bool) {
        require (t2 < now);
        return true;
    }
}