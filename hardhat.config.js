import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

// The 2021 contracts were compiled with solc 0.5.17 (pragma >=0.4.0 <0.6.0).
export default {
  plugins: [hardhatToolboxMochaEthers],
  solidity: {
    version: "0.5.17",
  },
};
