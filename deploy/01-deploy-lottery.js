
const {network, ethers} = require("hardhat"); 
const {developmentChains, networkConfig} = require('../helper-hardhat-cofig')
const {verify} = require('../utils/verify')

const VRF_FUND_SUB_AMOUNT = ethers.utils.parseEther('12');

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId;
    let VRFCoordinatorV2address, subscriptionId;

    if(developmentChains.includes(network.name)){
        const vrfCoordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock');
        VRFCoordinatorV2address = vrfCoordinatorV2Mock.address;
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await transactionResponse.wait()
        subscriptionId = transactionReceipt.events[0].args.subId
        
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_FUND_SUB_AMOUNT);
    } else {
        VRFCoordinatorV2address = networkConfig[chainId]['vrfCoordinatorV2'];
        subscriptionId = networkConfig[chainId]['subscriptionId'];
    }
    

    const entranceFee = networkConfig[chainId]['entrenceFee'];
    const gasLane = networkConfig[chainId]['gasLane'];
    const callbackGasLimit = networkConfig[chainId]['callbackGasLimit'];
    const interval = networkConfig[chainId]['interval'];    
    const args = [ VRFCoordinatorV2address, entranceFee, gasLane, subscriptionId, callbackGasLimit, interval];
    const lottery = await deploy("Lottery", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if(!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY){
        log('Verifying.............');
        await verify(lottery.address, args);
    }

}

module.exports.tags = ['all', 'lottery'];