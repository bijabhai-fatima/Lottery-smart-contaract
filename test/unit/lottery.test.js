const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-cofig")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery", async function () {
          let lottery, vrfCoordinatorV2Mock, deployer
          const chainId = network.config.chainId
          let LotteryEntrenceFee, interval

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              lottery = await ethers.getContract("lottery", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  deployer
              )

              LotteryEntrenceFee = await lottery.getEntrenceFee()
              interval = await lottery.getInterval()
          })

          describe("constructor", function () {
              it("Should initialize satate of the lottery correctly", async function () {
                  const lotteryState = await lottery.getLotteryState()
                  assert.equal(lotteryState.toString(), "0")
              })
              it("Should initialize intreval correctly", async function () {
                  const interval = await lottery.getInterval()
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["interval"]
                  )
              })
              it("Should initialize entrence fee correctly", async function () {
                  expect(await lottery.getEntrenceFee()).to.be.equal(
                      networkConfig[chainId]["entrenceFee"] ||
                          ethers.utils.parseEther("0.01")
                  )
              })
          })

          describe("Enter lottery", function () {
              it("Should revert if player does not pay enugh", async function () {
                  await expect(lottery.enterLottery()).to.be.revertedWith(
                      "Lottery__NotEnoughEthSent"
                  )
              })
              it("should record player when they enter lottery", async function () {
                  await lottery.enterLottery({ value: LotteryEntrenceFee })
                  const playerFromContract = await lottery.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })
              it("Should emit event whan entred lottery", async function () {
                  await expect(
                      lottery.enterLottery({ value: LotteryEntrenceFee })
                  )
                      .to.emit(lottery, "lotteryEnter")
                      .withArgs(deployer)
              })
              it("Shold not allow entrance when lottrey is calculating", async function () {
                  await lottery.enterLottery({ value: LotteryEntrenceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep([])
                  await expect(
                      lottery.enterLottery({ value: LotteryEntrenceFee })
                  ).to.be.revertedWith("Lottery__NotOPEN")
              })
          })

          describe("checkUpKeep", async function () {
              it("returns false if peaple have not send any eth", async function () {
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(
                      []
                  )
                  console.log("upKeepNeeded:", upkeepNeeded)

                  assert(!upkeepNeeded)
              })
              it("returns false if lottery is not open", async function () {
                  await lottery.enterLottery({ value: LotteryEntrenceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep([])
                  const lotteryState = await lottery.getLotteryState()
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep(
                      []
                  )
                  assert.equal(lotteryState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
          })
          describe("performUpKeep", function () {
              it("Should only run if checkUpKeep is true", async function () {
                  await lottery.enterLottery({ value: LotteryEntrenceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const tx = await lottery.performUpkeep([])
                  assert(tx)
              })
              it("Should revert is CheckUpKeep is false", async function () {
                  await expect(lottery.performUpkeep([])).to.be.revertedWith(
                      "Lottery_UpKeepNotNeeded"
                  )
              })
              it("Should change the lottery state, emit an event", async function () {
                  await lottery.enterLottery({ value: LotteryEntrenceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
                  const response = await lottery.performUpkeep([])
                  const receipt = await response.wait(1)
                  const requestId = receipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
                  const state = await lottery.getLotteryState()
                  assert(state.toString() == "1")
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await lottery.enterLottery({ value: LotteryEntrenceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.send("evm_mine", [])
              })
              it("Should revert if called before performUpKeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(
                          0,
                          lottery.address
                      )
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(
                          1,
                          lottery.address
                      )
                  ).to.be.revertedWith("nonexistent request")
              })
              it("picks a winner, reset the lottery and send the eth", async function () {
                  const additionalEntrances = 3
                  const startingIndexAccount = 1
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingIndexAccount;
                      i < startingIndexAccount + additionalEntrances;
                      i++
                  ) {
                      await lottery
                          .connect(accounts[i])
                          .enterLottery({ value: LotteryEntrenceFee })
                  }
                  const startingTimeStamp = await lottery.getLatestTimeStamps()
                  let winnerStartingBalance, winnerEndBalace
                  //intialize a listner
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          try {
                              const recentWinner =
                                  await lottery.getRecentWinner()
                              const state = await lottery.getLotteryState()
                              const numPlayers =
                                  await lottery.getNumberOfPlayers()
                              const endTimeStamp =
                                  await lottery.getLatestTimeStamps()
                              winnerEndBalace = await accounts[1].getBalance()
                              console.log("WINNER: ", recentWinner)
                              assert.equal(state.toString(), "0")
                              assert.equal(numPlayers.toString(), "0")
                              assert(endTimeStamp > startingTimeStamp)
                              assert(
                                  winnerEndBalace.toString() ==
                                      winnerStartingBalance.add(
                                          LotteryEntrenceFee.mul(
                                              additionalEntrances
                                          )
                                              .add(LotteryEntrenceFee)
                                              .toString()
                                      )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      const response = await lottery.performUpkeep([])
                      const receipt = await response.wait(1)
                      winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          receipt.events[1].args.requestId,
                          lottery.address
                      )
                  })
              })
          })
      })
